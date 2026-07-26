# codex-phone-transfer

把 Mac 上由 Codex 生成的文件直接发送到手机微信。微信桌面端和浏览器都
不需要常驻；真正的鉴权和上传由 OpenClaw Gateway 及腾讯微信团队维护的
`@tencent-weixin/openclaw-weixin` 插件完成。

## 工作方式

```text
Codex -> cpt -> OpenClaw Gateway -> 腾讯微信插件 -> 手机微信
                  |
                  +-- macOS launchd 自动启动
```

`cpt` 不实现或复刻微信私有协议。发送时，它把文件临时复制到 OpenClaw
允许读取的媒体目录，调用 Gateway 的 `send` RPC，成功或失败后都会清理
临时副本。

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

## 使用

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

安装 skill 后，也可以直接对 Codex 说：

> 把刚生成的报告传到我手机微信。

## 登录与会话恢复

微信插件采用长轮询，不依赖微信桌面端。微信如果判定账号 token 失效，
仍可能需要重新扫码：

```bash
cpt login
cpt pair --wait
```

微信要求每次主动发送都带上最近一条入站消息的 context token。因此，
首次扫码后需要在手机里先给该 OpenClaw 对话发一条消息。以后插件会在
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
