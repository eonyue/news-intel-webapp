# News Intel WebApp (MVP)

A lightweight dashboard that aggregates five sections:

1. Scour Feeds
2. Arxiv Digest
3. Media Headlines
4. Research Alert
5. Tech Trends

Each item shows:
- 标题
- 中文摘要（优先；英文内容自动转中文风格摘要）
- 来源
- 链接

## Quick start

```bash
cd news-intel-webapp
npm install
npm run dev
```

Open: `http://localhost:4321`

## Optional env

- `PORT` (default `4321`)
- `SCOUR_RSS` (default `https://scour.ing/@yuesean/rss.xml`)

## APIs

- `GET /` dashboard
- `GET /?refresh=1` force refresh all categories
- `GET /api/category/:id` get one category as JSON
- `GET /health` health check

## Deploy to Vercel

This project is ready for Vercel (Express via `@vercel/node`).

```bash
cd news-intel-webapp
npx vercel
```

Production deploy:

```bash
npx vercel --prod
```

Optional environment variable in Vercel:
- `SCOUR_RSS` (default `https://scour.ing/@yuesean/rss.xml`)

## Notes

- Fetch is RSS-first for stability.
- Scour redirect links are auto-resolved to original source URLs.
- Basic in-memory cache: 15 minutes TTL.
