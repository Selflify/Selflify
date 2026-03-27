import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import RootLayout, { metadata } from "@/app/layout";

vi.mock("next/font/google", () => ({
  Manrope: () => ({ variable: "font-manrope" }),
  Space_Grotesk: () => ({ variable: "font-space-grotesk" }),
}));

vi.mock("@/components/providers", () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("root layout", () => {
  it("exports the expected metadata", () => {
    expect(metadata).toEqual({
      title: "Selflify",
      description: "Self-hosted preview control panel for static SPA deployments.",
    });
  });

  it("renders html, body and wrapped children", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>ROOT_CHILD</div>
      </RootLayout>,
    );

    expect(html).toContain('lang="en"');
    expect(html).toContain("font-space-grotesk");
    expect(html).toContain("font-manrope");
    expect(html).toContain("ROOT_CHILD");
  });
});
