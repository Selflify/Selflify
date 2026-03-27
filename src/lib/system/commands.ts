import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

export class CommandExecutionError extends Error {
  command: string;
  args: string[];
  stderr: string;
  stdout: string;
  exitCode: number | null;

  constructor(options: {
    command: string;
    args: string[];
    stderr: string;
    stdout: string;
    exitCode: number | null;
    cause?: unknown;
  }) {
    const renderedCommand = [options.command, ...options.args].join(" ");
    const details = options.stderr || options.stdout || "No command output captured.";

    super(`Command failed: ${renderedCommand}. ${details}`, {
      cause: options.cause,
    });
    this.name = "CommandExecutionError";
    this.command = options.command;
    this.args = options.args;
    this.stderr = options.stderr;
    this.stdout = options.stdout;
    this.exitCode = options.exitCode;
  }
}

function getCommandTimeoutMs(): number {
  const raw = Number(process.env.SELFLIFY_COMMAND_TIMEOUT_MS ?? DEFAULT_COMMAND_TIMEOUT_MS);

  if (!Number.isFinite(raw) || raw < 1_000) {
    return DEFAULT_COMMAND_TIMEOUT_MS;
  }

  return Math.floor(raw);
}

export async function runCommand(
  command: string,
  args: string[],
  cwd = process.cwd(),
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
      timeout: getCommandTimeoutMs(),
    });

    return stdout.trim();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };

    if (nodeError.code === "ENOENT") {
      throw error;
    }

    throw new CommandExecutionError({
      command,
      args,
      stderr: typeof nodeError.stderr === "string" ? nodeError.stderr.trim() : "",
      stdout: typeof nodeError.stdout === "string" ? nodeError.stdout.trim() : "",
      exitCode: typeof nodeError.code === "number" ? nodeError.code : null,
      cause: error,
    });
  }
}
