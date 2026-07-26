import fs from "node:fs/promises";
import path from "node:path";

import { CptError } from "./errors.js";
import { skillSourceDirectory, skillsDirectory } from "./paths.js";

export async function installCodexSkill(env = process.env) {
  const source = skillSourceDirectory();
  const destinationRoot = skillsDirectory(env);
  const destination = path.join(destinationRoot, "send-to-wechat");

  await fs.mkdir(destinationRoot, { recursive: true });
  try {
    const stats = await fs.lstat(destination);
    if (!stats.isSymbolicLink()) {
      throw new CptError(
        `${destination} already exists and is not a symlink; remove or move it first.`,
      );
    }
    const currentTarget = await fs.readlink(destination);
    if (path.resolve(destinationRoot, currentTarget) === path.resolve(source)) {
      return { destination, installed: false };
    }
    throw new CptError(
      `${destination} points elsewhere; remove or move it first.`,
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await fs.symlink(source, destination, "dir");
  return { destination, installed: true };
}
