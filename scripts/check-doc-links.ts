import {readdir, readFile, stat} from "node:fs/promises";
import {dirname, extname, relative, resolve, sep} from "node:path";

const ROOT_DOCUMENTS = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md"];
const root = resolve(import.meta.dir, "..");
const markdownFiles = [
  ...ROOT_DOCUMENTS.map((path) => resolve(root, path)),
  ...(await findMarkdownFiles(resolve(root, "docs"))),
].sort();
const anchorCache = new Map<string, Set<string>>();
const errors: string[] = [];
let localLinkCount = 0;
let externalLinkCount = 0;

for (const file of markdownFiles) {
  const content = await readFile(file, "utf8");
  for (const link of extractLinks(content)) {
    const location = `${relative(root, file).replaceAll("\\", "/")}:${lineAt(content, link.index)}`;
    const target = decodeHtmlEntities(link.target.trim());

    if (!target) {
      errors.push(`${location} has an empty link target.`);
      continue;
    }
    if (isExternalTarget(target)) {
      externalLinkCount += 1;
      if (!isValidExternalTarget(target)) {
        errors.push(`${location} has an invalid external URL: ${target}`);
      }
      continue;
    }

    localLinkCount += 1;
    await validateLocalTarget(file, target, location);
  }
}

if (errors.length > 0) {
  console.error(`Documentation link check failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Documentation links OK (${markdownFiles.length} files, ${localLinkCount} local links, ${externalLinkCount} external URLs).`
  );
}

interface DocumentationLink {
  index: number;
  target: string;
}

async function findMarkdownFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(path)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(path);
    }
  }

  return files;
}

function extractLinks(content: string): DocumentationLink[] {
  const searchable = maskCode(content);
  const links: DocumentationLink[] = [];
  const markdownLink =
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
  const htmlLink = /\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

  for (const match of searchable.matchAll(markdownLink)) {
    const target = match[1] ?? match[2];
    if (target !== undefined && match.index !== undefined) {
      links.push({index: match.index, target});
    }
  }
  for (const match of searchable.matchAll(htmlLink)) {
    const target = match[1] ?? match[2];
    if (target !== undefined && match.index !== undefined) {
      links.push({index: match.index, target});
    }
  }

  return links.sort((left, right) => left.index - right.index);
}

function maskCode(content: string): string {
  return content
    .replace(/^( {0,3})(`{3,}|~{3,}).*?^\1\2\s*$/gms, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(`+)[^`\n]*\1/g, (code) => code.replace(/[^\n]/g, " "));
}

async function validateLocalTarget(
  sourceFile: string,
  target: string,
  location: string
): Promise<void> {
  const hashIndex = target.indexOf("#");
  const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const rawAnchor = hashIndex === -1 ? null : target.slice(hashIndex + 1);
  const queryIndex = rawPath.indexOf("?");
  const pathPart = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);
  const decodedPath = safeDecode(pathPart, location, "path");
  const decodedAnchor = rawAnchor === null ? null : safeDecode(rawAnchor, location, "anchor");
  if (decodedPath === null || (rawAnchor !== null && decodedAnchor === null)) {
    return;
  }

  const resolvedTarget = decodedPath ? resolve(dirname(sourceFile), decodedPath) : sourceFile;
  if (!(await existsWithExactCase(resolvedTarget))) {
    errors.push(`${location} points to a missing local target: ${target}`);
    return;
  }

  if (decodedAnchor !== null) {
    if (decodedAnchor === "") {
      errors.push(`${location} has an empty heading anchor: ${target}`);
      return;
    }
    if (extname(resolvedTarget).toLowerCase() !== ".md") {
      errors.push(`${location} uses an anchor on a non-Markdown target: ${target}`);
      return;
    }

    const anchors = await anchorsFor(resolvedTarget);
    if (!anchors.has(decodedAnchor.toLowerCase())) {
      errors.push(`${location} points to a missing heading anchor: ${target}`);
    }
  }
}

async function existsWithExactCase(path: string): Promise<boolean> {
  const relativePath = relative(root, path);
  if (relativePath === "") {
    return true;
  }
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    return false;
  }

  let current = root;
  for (const part of relativePath.split(sep)) {
    let entries;
    try {
      entries = await readdir(current, {withFileTypes: true});
    } catch {
      return false;
    }
    if (!entries.some((entry) => entry.name === part)) {
      return false;
    }
    current = resolve(current, part);
  }

  try {
    await stat(current);
    return true;
  } catch {
    return false;
  }
}

async function anchorsFor(file: string): Promise<Set<string>> {
  const cached = anchorCache.get(file);
  if (cached) {
    return cached;
  }

  const content = await readFile(file, "utf8");
  const anchors = new Set<string>();
  const slugCounts = new Map<string, number>();
  const heading = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm;
  const explicitAnchor = /\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

  for (const match of content.matchAll(heading)) {
    const text = match[1];
    if (!text) {
      continue;
    }
    const baseSlug = githubHeadingSlug(text);
    const duplicateCount = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, duplicateCount + 1);
    anchors.add(duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount}`);
  }
  for (const match of content.matchAll(explicitAnchor)) {
    const anchor = match[1] ?? match[2];
    if (anchor) {
      anchors.add(anchor.toLowerCase());
    }
  }

  anchorCache.set(file, anchors);
  return anchors;
}

function githubHeadingSlug(heading: string): string {
  return heading
    .replace(/<[^>]*>/g, "")
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//");
}

function isValidExternalTarget(target: string): boolean {
  if (target.startsWith("//")) {
    try {
      new URL(`https:${target}`);
      return true;
    } catch {
      return false;
    }
  }

  const scheme = target.slice(0, target.indexOf(":")).toLowerCase();
  if (scheme === "mailto") {
    return /^mailto:[^@\s]+@[^@\s]+$/i.test(target);
  }
  if (scheme !== "http" && scheme !== "https") {
    return true;
  }

  try {
    const url = new URL(target);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

function safeDecode(value: string, location: string, part: "anchor" | "path"): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    errors.push(`${location} has an invalid encoded ${part}: ${value}`);
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value.replaceAll("&amp;", "&");
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}
