import { ChakraProvider } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { system } from "@/lib/ui/system";

export function renderWithProviders(element: React.ReactElement): string {
  return renderToStaticMarkup(<ChakraProvider value={system}>{element}</ChakraProvider>);
}
