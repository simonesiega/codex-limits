import {Box, Text} from "ink";
import type {ReactNode, ReactElement} from "react";
import {theme} from "@/package/tui/theme";

export interface PanelProps {
  title: string;
  width: number;
  dense?: boolean;
  children: ReactNode;
}

/** Renders the shared bordered dashboard section. */
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
