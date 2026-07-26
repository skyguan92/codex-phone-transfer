import { spawn } from "node:child_process";

import { CommandError, CptError } from "./errors.js";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export async function runCommand(
  command,
  args = [],
  {
    env = process.env,
    inherit = false,
    timeoutMs = 0,
    rejectOnError = true,
  } = {},
) {
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;

    const child = spawn(command, args, {
      env,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : null;

    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return next.length > MAX_CAPTURE_BYTES
        ? next.slice(next.length - MAX_CAPTURE_BYTES)
        : next;
    };

    child.stdout?.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });

    child.once("error", (error) => {
      if (timer) clearTimeout(timer);
      finished = true;
      if (error.code === "ENOENT") {
        reject(new CptError(`Command not found: ${command}`, { cause: error }));
        return;
      }
      reject(error);
    });

    child.once("close", (code, signal) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      const result = {
        code: code ?? 1,
        signal,
        stdout,
        stderr,
      };
      if (timedOut) {
        reject(
          new CptError(
            `${command} timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
          ),
        );
        return;
      }
      if (result.code !== 0 && rejectOnError) {
        reject(new CommandError([command, ...args].join(" "), result));
        return;
      }
      resolve(result);
    });
  });
}

export async function commandAvailable(command, env = process.env) {
  try {
    const result = await runCommand(command, ["--version"], {
      env,
      timeoutMs: 10_000,
      rejectOnError: false,
    });
    return result.code === 0;
  } catch {
    return false;
  }
}
