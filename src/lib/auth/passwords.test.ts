import { describe, expect, it } from "vitest";

import { hashAdminPassword, verifyAdminPassword } from "@/lib/auth/passwords";

describe("admin passwords", () => {
  it("hashes passwords into a different value", async () => {
    const hash = await hashAdminPassword("super-secret");

    expect(hash).not.toBe("super-secret");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("verifies a valid password against its hash", async () => {
    const hash = await hashAdminPassword("super-secret");

    await expect(verifyAdminPassword("super-secret", hash)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong-secret", hash)).resolves.toBe(false);
  });
});
