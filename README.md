# AI 求职助手 / AI Job Search Assistant

本项目是在 [career-ops](https://github.com/career-ops-hq/career-ops) 基础上的本地定制源码，保留中文求职工作台、岗位搜索与筛选、简历资料管理、投递跟踪以及 BOSS 浏览器辅助模块。此发布快照已移除真实简历、个人档案、招聘对话、投递记录、登录状态与本机配置。

A local customization of [career-ops](https://github.com/career-ops-hq/career-ops), with a Chinese job-search workbench, job discovery, CV management, application tracking, and BOSS browser-assistance modules. This source snapshot excludes personal resumes, profiles, recruiter conversations, application records, browser sessions, and machine-specific settings.

## 安装与启动 / Setup

需要 Node.js 22.13 或更新的兼容版本。安装依赖后，仅在本机启动工作台：

```sh
npm ci
cd web
npm ci
npm run dev
```

终端会显示本地访问地址。Windows 用户参阅 [windows/README.md](windows/README.md)。功能与架构说明见 [上游说明](README.upstream.md)。开发测试：根目录 `npm run lint`，Web 目录 `npm test` 与 `npm run typecheck`。

Install dependencies in both the repository root and `web/`, then run `npm run dev` from `web/`. The terminal prints the local URL. See the upstream README for the full CLI workflow and supported integrations.

## 首次配置与隐私 / First-run configuration

- 从 `config/profile.example.yml` 复制为本地 `config/profile.yml`，填写自己的资料；创建自己的 `cv.md`。示例资料不代表发布者的真实履历。
- 如使用 BOSS 辅助模块，从 `config/boss-agent.example.json` 复制为 `config/boss-agent.json`，自行设置身份和浏览器连接。默认禁用后台处理，没有附带可复用的登录态。
- `.env.example` 只提供空值键名。API 凭据、简历、联系方式、个人配置、聊天与生成结果应始终留在本机；提交前复查 Git 暂存区。
- 浏览器辅助模块依赖相应浏览器连接和平台登录。本发布过程没有执行真实投递或招聘消息发送，也不代表所有外部集成都已在新设备验证。

Copy the example profile and BOSS configuration locally, provide your own CV, and configure any required credentials. Background processing is disabled by default. Browser integrations require their own connection and login; publication checks do not send real applications or recruiter messages.

## 项目来源 / Attribution

Upstream: career-ops-hq/career-ops. The original authorship and MIT license are preserved in [LICENSE](LICENSE), the source files, and [README.upstream.md](README.upstream.md). Local Chinese UI and browser-assistance modifications are included as a source snapshot, without the original checkout’s Git history. See [SANITIZATION.md](SANITIZATION.md) for the publication scope.
