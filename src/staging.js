import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { MAX_FILE_BYTES } from "./constants.js";
import { CptError } from "./errors.js";
import { stagingRoot } from "./paths.js";

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

export async function inspectFile(inputPath, { allowLarge = false } = {}) {
  const absolutePath = path.resolve(inputPath);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch (error) {
    throw new CptError(`Cannot read file: ${absolutePath}`, { cause: error });
  }
  if (!stats.isFile()) {
    throw new CptError(`Not a regular file: ${absolutePath}`);
  }
  if (!allowLarge && stats.size > MAX_FILE_BYTES) {
    throw new CptError(
      `${absolutePath} is ${formatBytes(stats.size)}. The default limit is ` +
        `${formatBytes(MAX_FILE_BYTES)}; pass --allow-large to override it.`,
    );
  }
  return {
    inputPath,
    absolutePath,
    basename: path.basename(absolutePath),
    size: stats.size,
  };
}

export async function stageFile(file, env = process.env) {
  const directory = path.join(stagingRoot(env), crypto.randomUUID());
  const stagedPath = path.join(directory, file.basename);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await fs.copyFile(file.absolutePath, stagedPath);
    await fs.chmod(stagedPath, 0o600);
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw new CptError(`Cannot stage ${file.absolutePath} for OpenClaw.`, {
      cause: error,
    });
  }
  return { directory, stagedPath };
}

export async function removeStagedFile(staged) {
  if (!staged?.directory) return;
  await fs.rm(staged.directory, { recursive: true, force: true });
}
