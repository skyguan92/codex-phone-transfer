---
name: send-to-wechat
description: Send one or more local files from the Mac to the user's phone through their configured OpenClaw WeChat channel. Use when the user asks to send, transfer, push, or share a generated file, report, image, video, archive, or other artifact to WeChat or their phone, including Chinese requests such as "传到微信", "发到手机", or "微信发给我".
---

# Send to WeChat

Use the installed `cpt` CLI. It delegates authentication and delivery to the
official Tencent WeChat plugin running in the OpenClaw Gateway.

## Send Files

1. Resolve every requested file to an existing local path.
2. Run `cpt send -- "<absolute-path>"`. Put `--` before paths so names beginning
   with a hyphen cannot be parsed as options.
3. For multiple files, pass all paths in one invocation. Add `-m "<caption>"`
   only when the user requested a caption.
4. Report success only when `cpt` exits with code 0. Include the filenames sent.

Examples:

```bash
cpt send -- "/absolute/path/report.pdf"
cpt send -m "本周报告" -- "/absolute/path/report.pdf" "/absolute/path/chart.png"
```

## Recover

If sending fails:

1. Run `cpt doctor`.
2. If no target is selected, ask the user to send the OpenClaw bot one WeChat
   message, then run `cpt pair`.
3. If login is stale, run `cpt login`, wait for the user to scan the QR code,
   then run `cpt pair --wait`.
4. Retry `cpt send` only after the prior command definitively failed. Do not
   retry an ambiguous timeout automatically because that can duplicate a file.

## Safety

- Never print, read aloud, or include OpenClaw bot tokens or WeChat context
  tokens in responses.
- Do not bypass `cpt` by invoking private WeChat endpoints.
- Do not claim that a dry run delivered a file.
