/** Removes HTML tags and angle brackets from Markdown heading text. */
export function stripHtmlTags(value: string): string {
  let result = "";
  let insideTag = false;

  for (const character of value) {
    if (character === "<") {
      insideTag = true;
    } else if (character === ">") {
      insideTag = false;
    } else if (!insideTag) {
      result += character;
    }
  }

  return result;
}
