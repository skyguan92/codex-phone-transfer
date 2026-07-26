import { parseArgs } from "node:util";

import {
  DEFAULT_PAIR_TIMEOUT_SECONDS,
  DEFAULT_SEND_TIMEOUT_MS,
} from "./constants.js";
import { readConfig, writeConfig } from "./config.js";
import { CptError } from "./errors.js";
import {
  buildSendParameters,
  channelStatus,
  createOpenClawBaseline,
  gatewayStatus,
  installGatewayService,
  installOpenClaw,
  installWeChatPlugin,
  loginWeChat,
  openClawAvailable,
  openClawBinary,
  restartGateway,
  sendThroughGateway,
  trustConfiguredPlugins,
} from "./openclaw.js";
import { runCommand } from "./process.js";
import { installCodexSkill } from "./skill.js";
import {
  formatBytes,
  inspectFile,
  removeStagedFile,
  stageFile,
} from "./staging.js";
import {
  destinationKey,
  discoverTargets,
  discoverTargetState,
  resolveDestination,
} from "./targets.js";

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function parsePositiveInteger(raw, flag) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CptError(`${flag} must be a positive integer.`);
  }
  return value;
}

function optionParser(args, options) {
  try {
    return parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw new CptError(error.message, { cause: error });
  }
}

export async function pairDestination(
  {
    timeoutSeconds = DEFAULT_PAIR_TIMEOUT_SECONDS,
    forceWait = false,
  } = {},
  env = process.env,
) {
  const initial = await discoverTargetState(env);
  if (!forceWait && initial.length === 1) {
    const selected = await writeConfig(initial[0], env);
    return { selected, discoveredNow: false };
  }

  const baseline = new Map(
    initial.map((item) => [destinationKey(item), item.fingerprint]),
  );
  console.log(
    "请在手机微信里打开刚扫码连接的 OpenClaw 对话，并发送任意一条消息。",
  );
  console.log(`等待新会话，最多 ${timeoutSeconds} 秒...`);

  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(1000);
    const current = await discoverTargetState(env);
    const changed = current.filter(
      (item) => baseline.get(destinationKey(item)) !== item.fingerprint,
    );
    if (changed.length === 1) {
      const selected = await writeConfig(changed[0], env);
      return { selected, discoveredNow: true };
    }
  }

  throw new CptError(
    `No new WeChat message arrived within ${timeoutSeconds} seconds. ` +
      'Send the bot a message and run "cpt pair" again.',
  );
}

export async function commandSetup(args, env = process.env) {
  const { values, positionals } = optionParser(args, {
    "pair-timeout": { type: "string" },
    "skip-pair": { type: "boolean", default: false },
  });
  if (positionals.length > 0) {
    throw new CptError(`Unexpected argument: ${positionals[0]}`);
  }

  const skill = await installCodexSkill(env);
  console.log(
    `${skill.installed ? "Installed" : "Found"} Codex skill: ${skill.destination}`,
  );

  if (!(await openClawAvailable(env))) {
    console.log("Installing OpenClaw...");
    await installOpenClaw(env);
  }
  console.log("Creating the OpenClaw baseline configuration...");
  await createOpenClawBaseline(env);
  console.log("Installing the macOS Gateway service...");
  await installGatewayService(env);
  console.log("Installing Tencent's WeChat plugin and starting QR login...");
  await installWeChatPlugin(env);
  if (await trustConfiguredPlugins(env)) {
    console.log("Pinned configured plugins in the OpenClaw allowlist.");
    await restartGateway(env);
  }

  if (!values["skip-pair"]) {
    const timeoutSeconds = values["pair-timeout"]
      ? parsePositiveInteger(values["pair-timeout"], "--pair-timeout")
      : DEFAULT_PAIR_TIMEOUT_SECONDS;
    const result = await pairDestination({ timeoutSeconds }, env);
    console.log(
      `Selected WeChat target ${result.selected.target} on account ` +
        `${result.selected.accountId}.`,
    );
  }
  console.log('Setup complete. Send a file with: cpt send "/path/to/file"');
}

export async function commandLogin(args, env = process.env) {
  const { positionals } = optionParser(args, {});
  if (positionals.length > 0) {
    throw new CptError(`Unexpected argument: ${positionals[0]}`);
  }
  await loginWeChat(env);
  console.log('WeChat login updated. Send the bot a message, then run "cpt pair".');
}

export async function commandPair(args, env = process.env) {
  const { values, positionals } = optionParser(args, {
    timeout: { type: "string", short: "t" },
    wait: { type: "boolean", default: false },
  });
  if (positionals.length > 0) {
    throw new CptError(`Unexpected argument: ${positionals[0]}`);
  }
  const timeoutSeconds = values.timeout
    ? parsePositiveInteger(values.timeout, "--timeout")
    : DEFAULT_PAIR_TIMEOUT_SECONDS;
  const result = await pairDestination(
    { timeoutSeconds, forceWait: values.wait },
    env,
  );
  console.log(
    `Selected WeChat target ${result.selected.target} on account ` +
      `${result.selected.accountId}.`,
  );
}

export async function commandTargets(args, env = process.env) {
  const { positionals } = optionParser(args, {});
  if (positionals.length > 0) {
    throw new CptError(`Unexpected argument: ${positionals[0]}`);
  }
  const [selected, discovered] = await Promise.all([
    readConfig(env),
    discoverTargets(env),
  ]);
  if (discovered.length === 0) {
    console.log('No active WeChat targets. Send the bot a message, then run "cpt pair".');
    return;
  }
  for (const destination of discovered) {
    const marker =
      selected?.accountId === destination.accountId &&
      selected?.target === destination.target
        ? "*"
        : " ";
    console.log(
      `${marker} ${destination.target}  account=${destination.accountId}`,
    );
  }
}

export async function commandUse(args, env = process.env) {
  const { values, positionals } = optionParser(args, {
    account: { type: "string" },
  });
  if (positionals.length !== 1) {
    throw new CptError("Usage: cpt use <target> [--account <account-id>]");
  }
  const discovered = await discoverTargets(env);
  const selected = resolveDestination({
    explicitTarget: positionals[0],
    explicitAccount: values.account,
    config: null,
    discovered,
  });
  await writeConfig(selected, env);
  console.log(
    `Selected WeChat target ${selected.target} on account ${selected.accountId}.`,
  );
}

export async function commandSend(args, env = process.env) {
  const { values, positionals } = optionParser(args, {
    message: { type: "string", short: "m" },
    target: { type: "string" },
    account: { type: "string" },
    timeout: { type: "string" },
    json: { type: "boolean", default: false },
    "allow-large": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  });
  if (positionals.length === 0) {
    throw new CptError("Usage: cpt send <file...> [-m <caption>]");
  }

  const [config, discovered] = await Promise.all([
    readConfig(env),
    discoverTargets(env),
  ]);
  const destination = resolveDestination({
    explicitTarget: values.target,
    explicitAccount: values.account,
    config,
    discovered,
  });
  const timeoutMs = values.timeout
    ? parsePositiveInteger(values.timeout, "--timeout")
    : DEFAULT_SEND_TIMEOUT_MS;
  if (timeoutMs < 1000) {
    throw new CptError("--timeout must be at least 1000 ms.");
  }

  const files = [];
  for (const inputPath of positionals) {
    files.push(
      await inspectFile(inputPath, { allowLarge: values["allow-large"] }),
    );
  }

  if (values["dry-run"]) {
    const result = {
      ok: true,
      dryRun: true,
      destination,
      files: files.map(({ absolutePath, basename, size }) => ({
        path: absolutePath,
        name: basename,
        size,
      })),
    };
    console.log(
      values.json ? JSON.stringify(result) : JSON.stringify(result, null, 2),
    );
    return result;
  }

  const sent = [];
  for (const [index, file] of files.entries()) {
    const staged = await stageFile(file, env);
    try {
      const parameters = buildSendParameters({
        destination,
        mediaUrl: staged.stagedPath,
        message: index === 0 ? values.message || "" : "",
      });
      const response = await sendThroughGateway(parameters, { env, timeoutMs });
      sent.push({
        path: file.absolutePath,
        name: file.basename,
        size: file.size,
        gateway: response.stdout.trim(),
      });
      if (!values.json) {
        console.log(
          `Sent ${file.basename} (${formatBytes(file.size)}) to WeChat.`,
        );
      }
    } finally {
      await removeStagedFile(staged);
    }
  }

  const result = { ok: true, destination, sent };
  if (values.json) console.log(JSON.stringify(result));
  return result;
}

export async function commandDoctor(args, env = process.env) {
  const { positionals } = optionParser(args, {});
  if (positionals.length > 0) {
    throw new CptError(`Unexpected argument: ${positionals[0]}`);
  }

  let healthy = true;
  const print = (status, label, detail = "") => {
    console.log(`${status.padEnd(4)} ${label}${detail ? `: ${detail}` : ""}`);
    if (status === "FAIL") healthy = false;
  };

  print("OK", "Node.js", process.version);
  if (!(await openClawAvailable(env))) {
    print("FAIL", "OpenClaw", `${openClawBinary(env)} is not installed`);
  } else {
    const version = await runCommand(openClawBinary(env), ["--version"], {
      env,
      rejectOnError: false,
      timeoutMs: 10_000,
    });
    print(
      version.code === 0 ? "OK" : "FAIL",
      "OpenClaw",
      version.stdout.trim() || version.stderr.trim(),
    );
    try {
      await gatewayStatus(env);
      print("OK", "Gateway", "RPC reachable");
    } catch (error) {
      print("FAIL", "Gateway", error.message.split("\n")[0]);
    }
    try {
      await channelStatus(env);
      print("OK", "WeChat channel", "registered with Gateway");
    } catch (error) {
      print("FAIL", "WeChat channel", error.message.split("\n")[0]);
    }
  }

  const [config, targets] = await Promise.all([
    readConfig(env),
    discoverTargets(env),
  ]);
  print(
    targets.length > 0 ? "OK" : "FAIL",
    "WeChat sessions",
    `${targets.length} active target(s)`,
  );
  const selectedIsActive =
    config &&
    targets.some(
      (target) =>
        target.accountId === config.accountId && target.target === config.target,
    );
  print(
    selectedIsActive ? "OK" : "FAIL",
    "Selected target",
    config
      ? `${config.target} account=${config.accountId}` +
          (selectedIsActive ? "" : " (no active context)")
      : "run cpt pair",
  );

  if (!healthy) {
    throw new CptError("Doctor found one or more blocking issues.");
  }
}

export async function commandInstallSkill(args, env = process.env) {
  const { positionals } = optionParser(args, {});
  if (positionals.length > 0) {
    throw new CptError(`Unexpected argument: ${positionals[0]}`);
  }
  const result = await installCodexSkill(env);
  console.log(
    `${result.installed ? "Installed" : "Found"} Codex skill: ${result.destination}`,
  );
}
