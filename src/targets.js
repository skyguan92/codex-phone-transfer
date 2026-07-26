import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CptError } from "./errors.js";
import { contextTokenDirectory } from "./paths.js";

const TOKEN_FILE_SUFFIX = ".context-tokens.json";

export function isWeChatTarget(value) {
  return typeof value === "string" && value.endsWith("@im.wechat");
}

export async function discoverTargetState(env = process.env) {
  const directory = contextTokenDirectory(env);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new CptError(`Cannot inspect WeChat sessions in ${directory}.`, {
      cause: error,
    });
  }

  const destinations = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(TOKEN_FILE_SUFFIX)) continue;
    const accountId = entry.name.slice(0, -TOKEN_FILE_SUFFIX.length);
    try {
      const raw = await fs.readFile(path.join(directory, entry.name), "utf8");
      const tokens = JSON.parse(raw);
      for (const [target, token] of Object.entries(tokens)) {
        if (!isWeChatTarget(target) || typeof token !== "string" || !token) {
          continue;
        }
        destinations.push({
          accountId,
          target,
          fingerprint: crypto
            .createHash("sha256")
            .update(token)
            .digest("hex"),
        });
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new CptError(`Cannot read WeChat session file ${entry.name}.`, {
        cause: error,
      });
    }
  }

  return destinations.sort(
    (left, right) =>
      left.accountId.localeCompare(right.accountId) ||
      left.target.localeCompare(right.target),
  );
}

export async function discoverTargets(env = process.env) {
  return (await discoverTargetState(env)).map(({ accountId, target }) => ({
    accountId,
    target,
  }));
}

export function destinationKey(destination) {
  return `${destination.accountId}\u0000${destination.target}`;
}

export function resolveDestination({
  explicitTarget,
  explicitAccount,
  config,
  discovered,
}) {
  let target = explicitTarget || config?.target;
  let accountId = explicitAccount || config?.accountId;

  if (!target && discovered.length === 1) {
    ({ target, accountId } = discovered[0]);
  }
  if (!target) {
    throw new CptError(
      'No WeChat destination selected. Send the bot a message, then run "cpt pair".',
    );
  }
  if (!isWeChatTarget(target)) {
    throw new CptError(`Invalid WeChat target: ${target}`);
  }

  if (!accountId) {
    const matches = discovered.filter((item) => item.target === target);
    if (matches.length === 1) {
      accountId = matches[0].accountId;
    } else if (matches.length > 1) {
      throw new CptError(
        `Target ${target} is active on multiple accounts; pass --account.`,
      );
    }
  }
  if (!accountId) {
    throw new CptError(
      'No WeChat account selected. Run "cpt targets" and pass --account.',
    );
  }

  const destination = { accountId, target };
  const hasActiveContext = discovered.some(
    (item) =>
      item.accountId === destination.accountId &&
      item.target === destination.target,
  );
  if (!hasActiveContext) {
    throw new CptError(
      `No active WeChat context for ${target}. Send the bot a message, ` +
        'then run "cpt pair".',
    );
  }

  return destination;
}
