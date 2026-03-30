import { expect, type Page } from "@playwright/test";

type RuntimeErrorTracker = {
  assertClean: () => Promise<void>;
};

function shouldIgnoreConsoleError(message: string): boolean {
  return message.includes("favicon.ico");
}

export function attachRuntimeErrorTracker(page: Page): RuntimeErrorTracker {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();

    if (shouldIgnoreConsoleError(text)) {
      return;
    }

    consoleErrors.push(text);
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  async function assertClean(): Promise<void> {
    await expect(page.getByText("Build Error")).toHaveCount(0);
    await expect(page.getByText("Console Error")).toHaveCount(0);
    await expect(page.getByText("Recoverable Error")).toHaveCount(0);
    expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join("\n")}`).toEqual([]);
  }

  return {
    assertClean,
  };
}
