import crypto from "node:crypto";

import {
  CHANNEL_ID,
  DEFAULT_SEND_TIMEOUT_MS,
  TENCENT_INSTALLER,
} from "./constants.js";
import { CptError } from "./errors.js";
import { commandAvailable, runCommand } from "./process.js";

export function openClawBinary(env = process.env) {
  return env.CPT_OPENCLAW_BIN || "openclaw";
}

export async function openClawAvailable(env = process.env) {
  return await commandAvailable(openClawBinary(env), env);
}

export async function installOpenClaw(env = process.env) {
  const npm = env.CPT_NPM_BIN || "npm";
  await runCommand(npm, ["install", "--global", "openclaw@latest"], {
    env,
    inherit: true,
  });
}

export async function createOpenClawBaseline(env = process.env) {
  await runCommand(openClawBinary(env), ["setup", "--baseline"], {
    env,
    inherit: true,
  });
}

export async function installGatewayService(env = process.env) {
  await runCommand(openClawBinary(env), ["gateway", "install"], {
    env,
    inherit: true,
  });
}

export async function installWeChatPlugin(env = process.env) {
  const npx = env.CPT_NPX_BIN || "npx";
  await runCommand(npx, ["-y", TENCENT_INSTALLER, "install"], {
    env,
    inherit: true,
  });
}

async function readOpenClawConfigValue(configPath, env) {
  const result = await runCommand(
    openClawBinary(env),
    ["config", "get", configPath, "--json"],
    {
      env,
      timeoutMs: 10_000,
      rejectOnError: false,
    },
  );
  if (result.code !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new CptError(`OpenClaw returned invalid JSON for ${configPath}.`, {
      cause: error,
    });
  }
}

export async function trustConfiguredPlugins(env = process.env) {
  const [configuredAllow, entries] = await Promise.all([
    readOpenClawConfigValue("plugins.allow", env),
    readOpenClawConfigValue("plugins.entries", env),
  ]);
  const allowed = new Set(
    Array.isArray(configuredAllow)
      ? configuredAllow.filter((item) => typeof item === "string")
      : [],
  );
  if (entries && typeof entries === "object" && !Array.isArray(entries)) {
    for (const [pluginId, settings] of Object.entries(entries)) {
      if (settings?.enabled !== false) allowed.add(pluginId);
    }
  }
  allowed.add(CHANNEL_ID);
  const next = [...allowed].sort();
  if (
    Array.isArray(configuredAllow) &&
    JSON.stringify([...configuredAllow].sort()) === JSON.stringify(next)
  ) {
    return false;
  }
  await runCommand(
    openClawBinary(env),
    [
      "config",
      "set",
      "plugins.allow",
      JSON.stringify(next),
      "--strict-json",
    ],
    { env, inherit: true },
  );
  return true;
}

export async function restartGateway(env = process.env) {
  await runCommand(openClawBinary(env), ["gateway", "restart"], {
    env,
    inherit: true,
  });
}

export async function loginWeChat(env = process.env) {
  await runCommand(
    openClawBinary(env),
    ["channels", "login", "--channel", CHANNEL_ID],
    { env, inherit: true },
  );
  await restartGateway(env);
}

export async function gatewayStatus(env = process.env) {
  return await runCommand(
    openClawBinary(env),
    [
      "gateway",
      "status",
      "--require-rpc",
      "--json",
      "--timeout",
      "10000",
    ],
    { env, timeoutMs: 15_000 },
  );
}

export async function channelStatus(env = process.env) {
  return await runCommand(
    openClawBinary(env),
    [
      "channels",
      "status",
      "--channel",
      CHANNEL_ID,
      "--json",
      "--timeout",
      "10000",
    ],
    { env, timeoutMs: 15_000 },
  );
}

export function buildSendParameters({
  destination,
  mediaUrl,
  message = "",
  idempotencyKey = crypto.randomUUID(),
}) {
  return {
    to: destination.target,
    message,
    mediaUrl,
    channel: CHANNEL_ID,
    accountId: destination.accountId,
    idempotencyKey,
  };
}

export async function sendThroughGateway(
  parameters,
  { env = process.env, timeoutMs = DEFAULT_SEND_TIMEOUT_MS } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) {
    throw new CptError("--timeout must be an integer of at least 1000 ms.");
  }
  return await runCommand(
    openClawBinary(env),
    [
      "gateway",
      "call",
      "send",
      "--params",
      JSON.stringify(parameters),
      "--json",
      "--timeout",
      String(timeoutMs),
    ],
    { env, timeoutMs: timeoutMs + 5_000 },
  );
}
