import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readConfig, writeConfig } from "../src/config.js";
import {
  discoverTargetState,
  discoverTargets,
  resolveDestination,
} from "../src/targets.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpt-test-"));
  const env = {
    ...process.env,
    CPT_CONFIG_DIR: path.join(root, "config"),
    CPT_OPENCLAW_STATE_DIR: path.join(root, "openclaw"),
  };
  return { root, env };
}

test("discovers target ids without returning context tokens", async (t) => {
  const { root, env } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(
    env.CPT_OPENCLAW_STATE_DIR,
    "openclaw-weixin",
    "accounts",
  );
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "account-a.context-tokens.json"),
    JSON.stringify({
      "user-1@im.wechat": "secret-context-token",
      ignored: "not-a-target",
    }),
  );

  assert.deepEqual(await discoverTargets(env), [
    { accountId: "account-a", target: "user-1@im.wechat" },
  ]);
  const state = await discoverTargetState(env);
  assert.equal(state.length, 1);
  assert.equal("token" in state[0], false);
  assert.notEqual(state[0].fingerprint, "secret-context-token");
});

test("writes private selection config and reads it back", async (t) => {
  const { root, env } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const destination = {
    accountId: "account-a",
    target: "user-1@im.wechat",
  };

  await writeConfig(destination, env);
  assert.deepEqual(await readConfig(env), { version: 1, ...destination });
  const mode = (await fs.stat(path.join(env.CPT_CONFIG_DIR, "config.json"))).mode;
  assert.equal(mode & 0o777, 0o600);
});

test("resolves a unique discovered destination", () => {
  assert.deepEqual(
    resolveDestination({
      explicitTarget: null,
      explicitAccount: null,
      config: null,
      discovered: [
        { accountId: "account-a", target: "user-1@im.wechat" },
      ],
    }),
    { accountId: "account-a", target: "user-1@im.wechat" },
  );
});

test("rejects a selected destination without an active context", () => {
  assert.throws(
    () =>
      resolveDestination({
        explicitTarget: null,
        explicitAccount: null,
        config: {
          accountId: "account-a",
          target: "user-1@im.wechat",
        },
        discovered: [],
      }),
    /No active WeChat context/,
  );
});
