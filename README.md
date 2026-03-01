# News Intel WebApp

新闻聚合 + 意识研究简报的轻量 WebApp。

## 当前页面

- `/` 主页面（3栏）
  - 媒体头条
  - 研究速递（含 arXiv）
  - 技术趋势
- `/consciousness` 意识研究简报页面（每日同步）

## 本地运行

```bash
cd news-intel-webapp
npm install
npm run dev
```

打开：`http://localhost:4321`

## 环境变量（可选）

- `PORT`（默认 `4321`）
- `TAVILY_API_KEY` / `TAVILY_KEY`
- `TAVILY_ENDPOINT`
- `MINIMAX_API_KEY`（有值时优先使用 MiniMax 做标题翻译/摘要润色）
- `MINIMAX_MODEL`（默认 `MiniMax-Text-01`）
- `MINIMAX_ENDPOINT`（默认 `https://api.minimax.chat/v1/text/chatcompletion_v2`）
- `OPENAI_API_KEY`（MiniMax 不可用时回退）
- `OPENAI_MODEL`（默认 `gpt-5.3-codex`）
- `OPENAI_ENDPOINT`

## API

- `GET /api/category/:id` 单栏目 JSON（若存在 `data/home-latest.json`，优先返回本地产物）
- `GET /api/consciousness` 意识简报 JSON
- `POST /api/admin/publish-home` 上传本地筛选后的首页 JSON（需 `x-admin-token`，Vercel 上可能超时，不建议作为主链路）
- `GET /health` 健康检查

## 意识简报同步机制

`/consciousness` 页面读取：

- `data/consciousness-latest.json`

建议由每日 12:00 的意识 cron 在产出简报后，同步覆盖该 JSON 文件（并 push 到 main 触发 Vercel 更新）。

## 本地筛选 + 发布（推荐主链路）

先在本地生成首页产物：

```bash
cd news-intel-webapp
npm run build:digest
```

会生成：`data/home-latest.json`（首页与 `/api/category/:id` 会优先读取它）。

推荐发布方式（稳定）：提交到 GitHub 触发 Vercel 自动部署。

```bash
# 本地一键：构建 + 提交 + 推送
npm run sync:digest:git
```

## GitHub Actions 自动同步（推荐）

已提供工作流：`.github/workflows/sync-home-digest.yml`

工作流做的事情：

1. 定时执行 `npm run build:digest`
2. 自动提交 `data/home-latest.json`
3. 自动 push 到 `main`
4. 由 Vercel 自动部署上线

需要在 GitHub 仓库 Secrets 配置：

- `WEBAPP_BASE_URL`（如 `https://newsintel.noetex.ai`）

工作流支持：

- 手动触发（workflow_dispatch）
- 每天 3 次自动同步（北京时间 08:00 / 12:00 / 20:00）

## Vercel

```bash
cd news-intel-webapp
npx vercel --prod
```
