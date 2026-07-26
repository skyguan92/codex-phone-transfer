import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { commandSend } from "../src/commands.js";
import { writeConfig } from "../src/config.js";
import { buildSendParameters } from "../src/openclaw.js";
import { inspectFile, removeStagedFile, stageFile } from "../src/staging.js";

test("builds the supported Gateway send RPC payload", () => {
  assert.deepEqual(
    buildSendParameters({
      destination: {
        accountId: "account-a",
        target: "user-1@im.wechat",
      },
      mediaUrl: "/tmp/report.pdf",
      message: "report",
      idempotencyKey: "request-1",
    }),
    {
      to: "user-1@im.wechat",
      message: "report",
      mediaUrl: "/tmp/report.pdf",
      channel: "openclaw-weixin",
      accountId: "account-a",
      idempotencyKey: "request-1",
    },
  );
});

test("stages under the OpenClaw media root and preserves the filename", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpt-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "weekly report.txt");
  await fs.writeFile(source, "hello");
  const env = {
    ...process.env,
    CPT_OPENCLAW_STATE_DIR: path.join(root, "openclaw"),
  };

  const file = await inspectFile(source);
  const staged = await stageFile(file, env);
  assert.equal(path.basename(staged.stagedPath), "weekly report.txt");
  assert.equal(
    staged.stagedPath.startsWith(
      path.join(env.CPT_OPENCLAW_STATE_DIR, "media", "codex-phone-transfer"),
    ),
    true,
  );
  assert.equal(await fs.readFile(staged.stagedPath, "utf8"), "hello");

  await removeStagedFile(staged);
  await assert.rejects(fs.stat(staged.stagedPath), { code: "ENOENT" });
});

test("sends through Gateway RPC and removes the staged copy", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpt-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  t.mock.method(console, "log", () => {});

  const source = path.join(root, "result.pdf");
  const fakeOpenClaw = path.join(root, "fake-openclaw");
  const capturePath = path.join(root, "rpc-args.json");
  await fs.writeFile(source, "test result");
  await fs.writeFile(
    fakeOpenClaw,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      "fs.writeFileSync(process.env.CPT_CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));",
      'console.log(JSON.stringify({ ok: true, channel: "openclaw-weixin" }));',
      "",
    ].join("\n"),
  );
  await fs.chmod(fakeOpenClaw, 0o755);

  const env = {
    ...process.env,
    CPT_CAPTURE_PATH: capturePath,
    CPT_CONFIG_DIR: path.join(root, "config"),
    CPT_OPENCLAW_BIN: fakeOpenClaw,
    CPT_OPENCLAW_STATE_DIR: path.join(root, "openclaw"),
  };
  await writeConfig(
    { accountId: "account-a", target: "user-1@im.wechat" },
    env,
  );
  const contextDirectory = path.join(
    env.CPT_OPENCLAW_STATE_DIR,
    "openclaw-weixin",
    "accounts",
  );
  await fs.mkdir(contextDirectory, { recursive: true });
  await fs.writeFile(
    path.join(contextDirectory, "account-a.context-tokens.json"),
    JSON.stringify({ "user-1@im.wechat": "test-context" }),
  );

  const result = await commandSend([source, "--json"], env);
  assert.equal(result.ok, true);
  assert.equal(result.sent.length, 1);

  const args = JSON.parse(await fs.readFile(capturePath, "utf8"));
  assert.deepEqual(args.slice(0, 4), ["gateway", "call", "send", "--params"]);
  assert.deepEqual(args.slice(5), ["--json", "--timeout", "300000"]);
  const params = JSON.parse(args[4]);
  assert.equal(params.to, "user-1@im.wechat");
  assert.equal(params.accountId, "account-a");
  assert.equal(params.channel, "openclaw-weixin");
  assert.equal(path.basename(params.mediaUrl), "result.pdf");
  assert.equal(params.mediaUrl.includes("codex-phone-transfer"), true);
  await assert.rejects(fs.stat(params.mediaUrl), { code: "ENOENT" });
});
