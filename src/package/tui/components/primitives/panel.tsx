import {Box, Text} from "ink";
import type {ReactNode, ReactElement} from "react";
import {theme} from "../../theme";

/** Props for the shared TUI panel component. */
export interface PanelProps {
  /** Panel title. */
  title: string;
  /** Panel body content. */
  children: ReactNode;
}

/**
 * Renders a bordered panel with a bold title.
 *
 * @param props - Panel title and children.
 * @returns Ink panel element.
 */
export function Panel({title, children}: PanelProps): ReactElement {
  const displayTitle = title.toUpperCase();

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      flexDirection="column"
      marginBottom={1}
      paddingX={1}
      paddingY={0}
    >
      <Text bold inverse color={theme.accent}>{`  ${displayTitle}  `}</Text>
      <Box flexDirection="column" marginBottom={1} marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}
