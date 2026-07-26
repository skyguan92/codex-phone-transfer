# codex-phone-transfer

一个很小的 Codex skill：把 Mac 上的本地文件直接发送到手机微信。

日常使用只有一个入口，直接对 Codex 说：

> 把刚生成的报告传到我手机微信。

Codex 会调用 `send-to-wechat` skill 完成发送。微信桌面端和浏览器都不
需要常驻。

## 边界

```text
Codex -> send-to-wechat skill -> cpt -> 微信传输通道 -> 手机微信
```

默认安装只启用上面的单向文件发送；`cpt` 是 skill 内部使用的本机传输
脚本。可信的个人微信私聊也可以选择绑定到现有 Codex launcher，让同一
对话成为 Mac 上 Codex 的任务入口。

当前微信官方插件以 OpenClaw Gateway 作为运行宿主，因此一次性安装时会
配置该后台组件；它只负责维持腾讯微信通道和投递文件，不参与生成内容或
处理用户任务。`cpt` 不实现或复刻微信私有协议。

## 要求

- macOS
- Node.js 24.15.0 至 24.x
- 一部已登录微信、可扫码的手机

## 安装

```bash
npm install --global github:skyguan92/codex-phone-transfer
cpt setup
```

`cpt setup` 会：

1. 安装或复用 OpenClaw。
2. 创建基础配置并安装 macOS Gateway 后台服务。
3. 调用腾讯官方安装器，安装微信插件并显示扫码登录。
4. 把已启用插件合并进 OpenClaw 的 `plugins.allow` 明确许可列表。
5. 安装 Codex 的 `send-to-wechat` skill。
6. 等待手机向新连接的 OpenClaw 对话发送一条消息，并记录发送目标。

首次连接后，微信桌面端和浏览器可以全部关闭。Gateway 由 `launchd`
常驻，插件的账号 token、会话 context token 和同步游标保存在本机
`~/.openclaw` 中，并可在 Gateway 重启后恢复。

## 直接使用

安装完成后，优先直接让 Codex 发送。下面的命令主要用于测试和故障恢复：

```bash
# 发送一个文件
cpt send ~/Downloads/report.pdf

# 带说明发送多个文件
cpt send -m "本周结果" report.pdf chart.png

# 检查服务、插件和会话
cpt doctor

# 列出或切换已发现的微信目标
cpt targets
cpt use '<target>@im.wechat' --account '<account-id>'
```

## 可选：从微信调用 Codex

这不是 `cpt setup` 的默认行为。启用后，发到指定微信私聊的消息会在 Mac
上启动或继续 Codex 任务，结果仍回复到该私聊。

推荐复用已有的 Codex launcher 和账号目录，不复制认证文件。例如已有
`codex-e` 时：

```bash
openclaw plugins install npm:@openclaw/codex

openclaw config set plugins.entries.codex.config \
  '{"appServer":{"transport":"stdio","homeScope":"user","command":"'"$HOME"'/.local/bin/codex-e","args":["app-server","--listen","stdio://"]}}' \
  --strict-json
```

然后创建一个专用 agent，并按 `channel + accountId + direct peer id` 精确
绑定微信私聊。模型和推理强度应在该 agent 上明确设置；当前验证过的配置
为 `codex/gpt-5.6-sol` 和 `thinkingDefault: "max"`。不要只做
channel-wide 绑定，否则同一微信通道里的其他用户也可能触发 Codex。

绑定后可在微信里发送 `/status` 检查当前会话，或直接发送普通任务。

## 登录与会话恢复

微信插件采用长轮询，不依赖微信桌面端。微信如果判定账号 token 失效，
仍可能需要重新扫码：

```bash
cpt login
cpt pair --wait
```

微信要求每次主动发送都带上最近一条入站消息的 context token。因此，
首次扫码后需要在手机里先给该微信传输对话发一条消息。以后插件会在
本机维护和恢复这个上下文；若发送提示缺少上下文，再发一条消息并运行
`cpt pair --wait`。

## 安全边界

- 本项目只读取目标 ID 和账号 ID，不输出或保存微信 context token。
- 选中的目标保存在 `~/.config/codex-phone-transfer/config.json`，权限
  为 `0600`。
- 待发送文件会复制到
  `~/.openclaw/media/codex-phone-transfer/<随机目录>/`，权限为 `0600`，
  Gateway 调用结束后删除。
- 默认拒绝大于 100 MiB 的文件，因为插件上传时会把文件读入内存。确需
  发送可加 `--allow-large`。
- 超时后不会自动重试，以免微信已收到文件却产生重复发送。
- 微信入站 Codex 是远程执行入口。只应精确绑定自己的私聊，并清楚了解
  所复用 Codex launcher 的审批和沙箱策略。

## 开发

```bash
npm test
npm run check
npm link
cpt send --dry-run ./README.md
```

官方文档：

- [OpenClaw 微信渠道](https://docs.openclaw.ai/zh-CN/channels/wechat)
- [OpenClaw Gateway CLI](https://docs.openclaw.ai/cli/gateway)
- [腾讯微信插件源码](https://github.com/Tencent/openclaw-weixin)

## 限制

- 腾讯插件目前声明支持微信私聊和媒体发送，不以群聊为目标。
- 微信凭据不是永久凭据，被服务端判定失效时需要再次扫码。
- 发送端 Mac 需要联网，OpenClaw Gateway 服务需要保持运行。

## License

MIT
