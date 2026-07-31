import {Box, Text} from "ink";
import type {ReactElement} from "react";
import {theme} from "@/package/tui/theme";
import {truncateText} from "@/package/tui/text";

const BLOCK_TITLE = [
  " ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗    ██╗     ██╗███╗   ███╗██╗████████╗███████╗ ",
  "██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝    ██║     ██║████╗ ████║██║╚══██╔══╝██╔════╝ ",
  "██║     ██║   ██║██║  ██║█████╗   ╚███╔╝     ██║     ██║██╔████╔██║██║   ██║   ███████╗ ",
  "██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗     ██║     ██║██║╚██╔╝██║██║   ██║   ╚════██║ ",
  "╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗    ███████╗██║██║ ╚═╝ ██║██║   ██║   ███████║ ",
  " ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝    ╚══════╝╚═╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚══════╝ ",
] as const;

const COMPACT_BLOCK_TITLE = [
  "  ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗ ",
  " ██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝ ",
  " ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝  ",
  " ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗  ",
  " ╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗ ",
  "  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ",
  "  ██╗     ██╗███╗   ███╗██╗████████╗███████╗ ",
  "  ██║     ██║████╗ ████║██║╚══██╔══╝██╔════╝ ",
  "  ██║     ██║██╔████╔██║██║   ██║   ███████╗ ",
  "  ██║     ██║██║╚██╔╝██║██║   ██║   ╚════██║ ",
  "  ███████╗██║██║ ╚═╝ ██║██║   ██║   ███████║ ",
  "  ╚══════╝╚═╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚══════╝ ",
] as const;

export interface TitleProps {
  width: number;
  showLarge: boolean;
  showStyled: boolean;
}

/** Selects the largest static title that fits the chosen layout. */
export function Title({width, showLarge, showStyled}: TitleProps): ReactElement {
  if (showLarge && width >= BLOCK_TITLE[0].length) {
    return <BlockTitle lines={BLOCK_TITLE} width={width} />;
  }

  if (showStyled && width >= COMPACT_BLOCK_TITLE[0].length) {
    return <BlockTitle lines={COMPACT_BLOCK_TITLE} width={width} />;
  }

  return (
    <Box flexDirection="column" marginBottom={1} width={width}>
      <Box justifyContent="center" width={width}>
        <Text bold color={theme.title}>
          {truncateText("CODEX LIMITS", width)}
        </Text>
      </Box>
      <Box justifyContent="center" marginTop={0} width={width}>
        <Text color={theme.muted}>
          {truncateText("Codex usage windows and reset credits", width)}
        </Text>
      </Box>
    </Box>
  );
}

interface BlockTitleProps {
  lines: readonly string[];
  width: number;
}

function BlockTitle({lines, width}: BlockTitleProps): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1} width={width}>
      {lines.map((line, index) => (
        <Box key={`${index}-${line}`} justifyContent="center" width={width}>
          <Text bold color={theme.title}>
            {line}
          </Text>
        </Box>
      ))}
      <Box justifyContent="center" marginTop={0} width={width}>
        <Text color={theme.muted}>Codex usage windows and reset credits</Text>
      </Box>
    </Box>
  );
}
