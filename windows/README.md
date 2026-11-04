# AI直聘 Windows 适配版

适用于 Windows 10/11。此包为源码安装版，不是免安装 EXE。请解压到本地目录（例如 C:\AI-Zhipin），不要在压缩包内运行。

1. 安装 Node.js 22 LTS、Microsoft Edge，以及用于生成回复的 Codex CLI，并自行登录 Codex。安装依赖和首次构建需要联网。
2. 双击 windows\install.cmd，等待依赖安装和构建完成。
3. 双击 windows\start.cmd，保持终端打开，在浏览器打开 http://127.0.0.1:3037 。
4. 重新导入自己的简历、设置杭州等求职偏好及授权岗位。包内没有原使用者的简历、聊天、招聘者列表、浏览器登录、凭证或个人配置。
5. 默认使用专用 Edge（Playwright 的 msedge 通道），从常驻助手页面打开并扫码。遇到安全验证，在可见窗口手动完成。只有主动点击启用后才自动回复。使用 WebBridge 时需自行安装并连接其 Windows 服务与 Edge 扩展；此包不捆绑扩展或登录会话。
6. 停止：在启动窗口 Ctrl+C，或双击 windows\stop.cmd（停止此目录启动器及其子进程）。不安装开机启动项或系统计划任务。

## 可选工具与边界

- PDF 文本导入：安装 Poppler，将 pdftotext.exe 所在目录加入 PATH。扫描 PDF 仍需 OCR；识别不足会提示，避免编造。
- Word 导入：按页面提示使用支持的格式；若当前工具不可用，另存为文本 PDF 或 TXT/Markdown 后导入。
- 录音转录：安装 Python、FFmpeg 和 openai-whisper，将 whisper.exe 与 ffmpeg.exe 加入 PATH；也可设置 CAREER_OPS_WHISPER_PATH 指向可执行文件。首次模型下载需联网。可手动填写转录文本后分析。
- Apple Calendar 为 macOS 专属，Windows 版不连接苹果日历，也不会自动创建其提醒。面试队列和手动可用时段仍可使用。Hermes 需自行配置。
- macOS Vision 薪资图片 OCR 在 Windows 不可用，可能缺少图片形式的薪资，不能把缺失当作零薪资。
- 当前交付完成静态兼容检查和本机测试，尚未在真实 Windows 电脑执行安装、扫码、发送或录音转录验证。

关闭软件后不会继续自动回复。网页服务仅绑定本机地址。
