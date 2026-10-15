# 忙鱼（MangYu）

忙鱼是一个本地运行的二手商品行情整理、比价、利润测算和风险评估工具。前端使用 React + Vite + TypeScript，后端使用 Node.js 内置 HTTP 与 SQLite；业务数据默认只保存在本机。

> 当前版本没有闲鱼官方授权 API，也不把未知行情或少量样本包装成确定结论。浏览器采集只读取用户已登录页面公开展示的内容，遇到登录、验证码或风控会停止。

## Windows 一键安装

支持 Windows 10/11 x64、arm64，安装器会在当前用户目录准备固定版本的 Node.js、pnpm、依赖和 Playwright Chromium，不要求预装 Git、Docker、Node.js、pnpm 或 SQLite，也不会修改系统 PATH。

一件部署指令：

```powershell
irm https://raw.githubusercontent.com/ChaoFan-c/mangyu/v0.1.0/scripts/install.ps1 | iex
```

更安全的方式是先下载并检查脚本：

```powershell
$url = 'https://raw.githubusercontent.com/ChaoFan-c/mangyu/v0.1.0/scripts/install.ps1'
irm $url -OutFile .\install-mangyu.ps1
notepad .\install-mangyu.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-mangyu.ps1
```

安装器只为当前进程放宽执行策略，不会修改全局执行策略。它会验证 GitHub 发布包 SHA-256，并用 Node.js 官方 `SHASUMS256.txt` 验证运行时。

2026-10-15 在当前 Windows 环境对等价组件实测：Node 运行时 98.2 MiB、项目依赖 191.1 MiB、Playwright 1.64 的 Chromium/Headless Shell/FFmpeg 717.6 MiB、生产前端 0.5 MiB，合计约 1007.4 MiB。安装器仍要求至少 2 GB 可用空间以容纳下载包、构建中间文件和更新回滚副本；完整全新 Windows 安装尚未实测。

## 使用

安装完成后会启动服务、等待健康检查通过并打开浏览器。默认地址从 `http://127.0.0.1:3210` 起自动选择空闲端口，只监听本机回环地址。

```powershell
# 启动
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\MangYu\app\scripts\start.ps1"

# 停止（只停止状态文件记录的忙鱼专属 Node 进程）
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\MangYu\app\scripts\stop.ps1"

# 检查稳定版更新；显示版本并要求确认
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\MangYu\app\scripts\update.ps1"

# 卸载程序，默认保留数据库和配置
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\MangYu\app\scripts\uninstall.ps1"
```

彻底删除用户数据必须显式执行 `uninstall.ps1 -DeleteUserData`，并再次输入确认词。

## 数据与备份

- 程序、专属运行时、浏览器二进制、日志和运行状态：`%LOCALAPPDATA%\MangYu\`
- SQLite 数据库：`%APPDATA%\MangYu\data\mangyu.sqlite`
- 专用浏览器登录状态：`%APPDATA%\MangYu\config\browser-profile\`

更新不会覆盖用户数据库。备份时先停止忙鱼，再复制整个 `%APPDATA%\MangYu\`。卸载默认保留该目录。浏览器 Profile 可能包含登录状态，禁止分享或提交到 GitHub。

## 本机浏览器采集

在“本机采集”页启动专用浏览器并自行登录。程序优先使用本机 Chrome，缺失时使用安装器准备的 Chromium；登录态仅保存在上面的本机配置目录。程序不导出 Cookie、不绕过验证码或平台访问控制，不开放公网调试接口，并保留数量上限和停止按钮。

平台页面和风控策略可能变化。正式分发环境的实际登录与采集兼容性目前标记为**未验证**。

## 开发

```powershell
pnpm install --frozen-lockfile
$env:MANGYU_SEED_DEMO='1'; pnpm dev:api
pnpm dev:web
```

生产构建与验证：

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm release:package
```

生产模式由同一 Node 服务提供 `/api/v1/*` 和 `frontend/dist`，不依赖 Vite 开发服务器。Node.js 固定验证版本为 24.14.1，pnpm 为 11.25.0。

## 常见问题

- **GitHub 或 Node.js 下载失败**：确认能通过 HTTPS 访问 `github.com` 和 `nodejs.org`，安装器只有限重试，不会关闭代理、防火墙或杀毒软件。
- **pnpm 安装失败**：查看 `%LOCALAPPDATA%\MangYu\logs`，确认磁盘至少有 2 GB 可用空间后重试。
- **浏览器无法启动**：先确认安装阶段 Chromium 下载成功；企业网络可能拦截 Playwright 下载源。
- **端口占用**：启动器会从 3210 起检查 81 个本机端口；全部占用时会明确报错。
- **SQLite 初始化失败**：确认 `%APPDATA%\MangYu\data` 可写。安装和更新不会主动删除旧数据库。
- **执行策略阻止脚本**：使用文档中的 `-ExecutionPolicy Bypass`，它只影响该次 PowerShell 进程。

## 安全与开源状态

- 服务默认绑定 `127.0.0.1`，不修改防火墙、不创建公网隧道。
- 不收集或上传数据库、Cookie、Token、浏览器 Profile。
- 发布包和 Node.js 运行时均执行 SHA-256 校验。
- 首次提交前已检查暂存内容，不包含真实凭据、数据库或浏览器 Profile。
- 项目采用 [MIT License](./LICENSE)。
