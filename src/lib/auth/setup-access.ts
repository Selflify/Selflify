import crypto from "node:crypto";

import { cookies } from "next/headers";

const SETUP_ACCESS_COOKIE = "__selflify_setup_access";
const SETUP_ACCESS_MAX_AGE_SECONDS = 15 * 60;

function createSetupAccessDigest(token: string): string {
  return crypto.createHash("sha256").update(`selflify-setup:${token}`).digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isSetupTokenEnforced(): boolean {
  return process.env.NODE_ENV === "production";
}

export function readConfiguredSetupToken(): string {
  return process.env.SELFLIFY_SETUP_TOKEN?.trim() ?? "";
}

export function getSetupAccessMessage(): string {
  if (!readConfiguredSetupToken()) {
    return "First-launch setup is locked until SELFLIFY_SETUP_TOKEN is configured in the runtime environment.";
  }

  return "Enter the setup token from the server environment to continue.";
}

export async function hasSetupAccess(): Promise<boolean> {
  if (!isSetupTokenEnforced()) {
    return true;
  }

  const configuredToken = readConfiguredSetupToken();

  if (!configuredToken) {
    return false;
  }

  const cookieStore = await cookies();
  const accessCookie = cookieStore.get(SETUP_ACCESS_COOKIE)?.value;

  if (!accessCookie) {
    return false;
  }

  return constantTimeEqual(accessCookie, createSetupAccessDigest(configuredToken));
}

export async function assertSetupAccessGranted(): Promise<void> {
  if (await hasSetupAccess()) {
    return;
  }

  throw new Error(getSetupAccessMessage());
}

export async function grantSetupAccess(candidateToken: string): Promise<void> {
  if (!isSetupTokenEnforced()) {
    return;
  }

  const configuredToken = readConfiguredSetupToken();

  if (!configuredToken) {
    throw new Error(getSetupAccessMessage());
  }

  if (!constantTimeEqual(candidateToken.trim(), configuredToken)) {
    throw new Error("Setup token is invalid.");
  }

  const cookieStore = await cookies();

  cookieStore.set(SETUP_ACCESS_COOKIE, createSetupAccessDigest(configuredToken), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: SETUP_ACCESS_MAX_AGE_SECONDS,
  });
}

export async function clearSetupAccess(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SETUP_ACCESS_COOKIE);
}
