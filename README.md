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

- `GET /api/category/:id` 单栏目 JSON
- `GET /api/consciousness` 意识简报 JSON
- `GET /health` 健康检查

## 意识简报同步机制

`/consciousness` 页面读取：

- `data/consciousness-latest.json`

建议由每日 12:00 的意识 cron 在产出简报后，同步覆盖该 JSON 文件（并 push 到 main 触发 Vercel 更新）。

## Vercel

```bash
cd news-intel-webapp
npx vercel --prod
```
