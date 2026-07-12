import {Box, Text} from "ink";
import type {ReactNode, ReactElement} from "react";
import {theme} from "../../theme";

/** Props for the shared TUI panel component. */
export interface PanelProps {
  /** Panel title. */
  title: string;
  /** Panel width constrained to the initial terminal width. */
  width: number;
  /** Whether to reduce vertical spacing. */
  dense?: boolean;
  /** Panel body content. */
  children: ReactNode;
}

/**
 * Renders a bordered panel with a bold title.
 * @param props - Panel title and children.
 * @returns - Ink panel element.
 */
export function Panel({title, width, dense = false, children}: PanelProps): ReactElement {
  const displayTitle = title.toUpperCase();

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      flexDirection="column"
      marginBottom={dense ? 0 : 1}
      paddingX={1}
      paddingY={0}
      width={width}
    >
      <Text bold inverse color={theme.accent}>{`  ${displayTitle}  `}</Text>
      <Box flexDirection="column" marginBottom={dense ? 0 : 1} marginTop={dense ? 0 : 1}>
        {children}
      </Box>
    </Box>
  );
}
