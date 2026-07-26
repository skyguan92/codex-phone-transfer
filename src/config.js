import fs from "node:fs/promises";
import path from "node:path";

import { CONFIG_VERSION } from "./constants.js";
import { CptError } from "./errors.js";
import { configDirectory, configPath } from "./paths.js";

export async function readConfig(env = process.env) {
  try {
    const raw = await fs.readFile(configPath(env), "utf8");
    const config = JSON.parse(raw);
    if (
      config?.version !== CONFIG_VERSION ||
      typeof config.accountId !== "string" ||
      typeof config.target !== "string"
    ) {
      throw new CptError(
        `Invalid config file at ${configPath(env)}. Run "cpt pair" again.`,
      );
    }
    return config;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof CptError) throw error;
    throw new CptError(`Cannot read ${configPath(env)}: ${error.message}`, {
      cause: error,
    });
  }
}

export async function writeConfig(destination, env = process.env) {
  const directory = configDirectory(env);
  const outputPath = configPath(env);
  const temporaryPath = path.join(
    directory,
    `.config-${process.pid}-${Date.now()}.tmp`,
  );
  const config = {
    version: CONFIG_VERSION,
    accountId: destination.accountId,
    target: destination.target,
  };

  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(config, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.rename(temporaryPath, outputPath);
  await fs.chmod(outputPath, 0o600);
  return config;
}
