import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));

export function packageRoot() {
  return path.dirname(sourceDirectory);
}

export function homeDirectory(env = process.env) {
  return env.HOME || os.homedir();
}

export function configDirectory(env = process.env) {
  return (
    env.CPT_CONFIG_DIR ||
    path.join(homeDirectory(env), ".config", "codex-phone-transfer")
  );
}

export function configPath(env = process.env) {
  return path.join(configDirectory(env), "config.json");
}

export function openClawStateDirectory(env = process.env) {
  return (
    env.CPT_OPENCLAW_STATE_DIR ||
    env.OPENCLAW_STATE_DIR ||
    path.join(homeDirectory(env), ".openclaw")
  );
}

export function contextTokenDirectory(env = process.env) {
  return path.join(openClawStateDirectory(env), "openclaw-weixin", "accounts");
}

export function stagingRoot(env = process.env) {
  return path.join(
    openClawStateDirectory(env),
    "media",
    "codex-phone-transfer",
  );
}

export function skillSourceDirectory() {
  return path.join(packageRoot(), ".agents", "skills", "send-to-wechat");
}

export function skillsDirectory(env = process.env) {
  return (
    env.CPT_SKILLS_DIR ||
    path.join(homeDirectory(env), ".agents", "skills")
  );
}
