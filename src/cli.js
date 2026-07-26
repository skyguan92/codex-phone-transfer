import fs from "node:fs/promises";
import path from "node:path";

import {
  commandDoctor,
  commandInstallSkill,
  commandLogin,
  commandPair,
  commandSend,
  commandSetup,
  commandTargets,
  commandUse,
} from "./commands.js";
import { packageRoot } from "./paths.js";

const HELP = `codex-phone-transfer

Send files from this Mac to a phone through OpenClaw and WeChat.

Usage:
  cpt setup [--pair-timeout <seconds>] [--skip-pair]
  cpt login
  cpt pair [--timeout <seconds>] [--wait]
  cpt targets
  cpt use <target> [--account <account-id>]
  cpt send <file...> [-m <caption>] [--target <id>] [--account <id>]
           [--timeout <milliseconds>] [--allow-large] [--dry-run] [--json]
  cpt doctor
  cpt install-skill
  cpt help

Environment overrides:
  CPT_OPENCLAW_BIN, CPT_OPENCLAW_STATE_DIR, CPT_CONFIG_DIR, CPT_SKILLS_DIR
`;

const commands = {
  setup: commandSetup,
  login: commandLogin,
  pair: commandPair,
  targets: commandTargets,
  use: commandUse,
  send: commandSend,
  doctor: commandDoctor,
  "install-skill": commandInstallSkill,
};

async function readVersion() {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(packageRoot(), "package.json"), "utf8"),
  );
  return packageJson.version;
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const [command = "help", ...args] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command === "--version" || command === "-V" || command === "version") {
    console.log(await readVersion());
    return;
  }
  const handler = commands[command];
  if (!handler) {
    console.error(HELP);
    throw new Error(`Unknown command: ${command}`);
  }
  return await handler(args, env);
}
