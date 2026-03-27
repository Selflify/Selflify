import { describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/(admin)/dashboard/page";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("dashboard page", () => {
  it("redirects straight to sites", () => {
    expect(() => DashboardPage()).toThrow("REDIRECT:/sites");
    expect(redirectMock).toHaveBeenCalledWith("/sites");
  });
});
