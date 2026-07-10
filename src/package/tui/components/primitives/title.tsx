import {Box, Text} from "ink";
import type {ReactElement} from "react";
import {theme} from "../../theme";

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

/** Props for the TUI title component. */
export interface TitleProps {
  /** Terminal width used to center the title. */
  width: number;
  /** Whether the large ASCII logo fits and should be rendered. */
  showLarge: boolean;
  /** Whether the compact ASCII logo fits and should be rendered. */
  showStyled: boolean;
}

/**
 * Renders the centered static CODEX LIMITS title.
 *
 * @param props - Title layout props.
 * @returns Ink title element.
 */
export function Title({width, showLarge, showStyled}: TitleProps): ReactElement {
  if (showLarge && width >= BLOCK_TITLE[0].length) {
    return (
      <Box flexDirection="column" marginBottom={1} width={width}>
        {BLOCK_TITLE.map((line, index) => (
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

  if (showStyled && width >= COMPACT_BLOCK_TITLE[0].length) {
    return (
      <Box flexDirection="column" marginBottom={1} width={width}>
        {COMPACT_BLOCK_TITLE.map((line, index) => (
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

function truncateText(value: string, width: number): string {
  if (value.length <= width) {
    return value;
  }

  if (width <= 1) {
    return value.slice(0, Math.max(width, 0));
  }

  return `${value.slice(0, width - 1)}…`;
}
