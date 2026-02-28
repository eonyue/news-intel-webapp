const express = require('express');
const Parser = require('rss-parser');

const app = express();
const parser = new Parser({ timeout: 15000 });
const PORT = process.env.PORT || 4321;
const CACHE_TTL_MS = 15 * 60 * 1000;

const CATEGORIES = [
  {
    id: 'scour',
    name: 'Scour Feeds',
    zhName: 'Scour 信息流',
    description: 'Your personal Scour stream and recommended links',
    zhDescription: '你的 Scour 个性化信息流与推荐源',
    limit: 12,
    feeds: [{ url: process.env.SCOUR_RSS || 'https://scour.ing/@yuesean/rss.xml', source: 'scour.ing' }],
  },
  {
    id: 'arxiv',
    name: 'Arxiv Digest',
    zhName: 'Arxiv 论文速览',
    description: 'Fresh papers from AI / neuroscience-related categories',
    zhDescription: '聚合 AI 与神经科学相关新论文',
    limit: 15,
    feeds: [
      { url: 'https://export.arxiv.org/rss/cs.AI', source: 'arXiv cs.AI' },
      { url: 'https://export.arxiv.org/rss/cs.CL', source: 'arXiv cs.CL' },
      { url: 'https://export.arxiv.org/rss/q-bio.NC', source: 'arXiv q-bio.NC' },
    ],
  },
  {
    id: 'media',
    name: 'Media Headlines',
    zhName: '媒体头条',
    description: 'Top media coverage around AI and tech',
    zhDescription: 'AI 与科技领域的媒体重点报道',
    limit: 15,
    feeds: [
      { url: 'https://venturebeat.com/category/ai/feed/', source: 'VentureBeat' },
      { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', source: 'The Verge' },
      { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', source: 'MIT Technology Review' },
    ],
  },
  {
    id: 'research',
    name: 'Research Alert',
    zhName: '研究快讯',
    description: 'Research-heavy news and scientific updates',
    zhDescription: '科研导向的新闻与学术更新',
    limit: 15,
    feeds: [
      { url: 'https://neurosciencenews.com/feed/', source: 'Neuroscience News' },
      { url: 'https://medicalxpress.com/rss-feed/', source: 'Medical Xpress' },
      { url: 'https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml', source: 'ScienceDaily' },
    ],
  },
  {
    id: 'trends',
    name: 'Tech Trends',
    zhName: '技术趋势',
    description: 'High-signal discussions and trend posts',
    zhDescription: '高信号讨论与趋势型内容',
    limit: 15,
    feeds: [
      { url: 'https://hnrss.org/newest?q=AI', source: 'Hacker News' },
      { url: 'https://lobste.rs/t/ai.rss', source: 'Lobsters' },
      { url: 'https://www.worksinprogress.news/feed', source: 'Works in Progress' },
    ],
  },
];

const cache = new Map();

app.set('view engine', 'ejs');
app.set('views', `${__dirname}/views`);
app.use(express.static(`${__dirname}/public`));

const clean = (txt = '') =>
  String(txt)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasChinese = (txt = '') => /[\u4e00-\u9fa5]/.test(txt);

function resolveScourLink(link = '') {
  if (link.includes('/redirect/')) {
    const after = link.split('/redirect/')[1] || '';
    const target = decodeURIComponent(after.split('?')[0] || '');
    return target || link;
  }
  return link;
}

function domain(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function inferTopic(title = '') {
  const t = title.toLowerCase();
  if (/(llm|large language|agent|ai|model|transformer)/.test(t)) return 'AI 模型与智能体能力';
  if (/(brain|neuro|neural|hippocamp|eeg|bci)/.test(t)) return '神经科学与脑机接口';
  if (/(health|therapy|clinical|disease|alzheimer|drug|medical)/.test(t)) return '健康与临床应用';
  if (/(robot|humanoid|automation)/.test(t)) return '机器人与自动化';
  if (/(policy|governance|law|rights|ethic|safety)/.test(t)) return '治理、伦理与安全';
  return '前沿趋势与方法探索';
}

function englishSnippetToChinese(raw = '', title = '') {
  const text = clean(raw);

  if (!text || /Scour interesting reads from noisy feeds/i.test(text)) {
    if (/\(Scour Feed Recommendation\)/i.test(title) || /^📰/.test(title)) {
      return '该条为 Scour 推荐订阅源，建议加入长期跟踪列表，持续观察后续高质量更新。';
    }
    return `该内容围绕“${title}”展开，建议阅读全文获取完整细节。`;
  }

  const topic = inferTopic(title);
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const compact = firstSentence.replace(/\.$/, '').slice(0, 140);

  return `围绕「${topic}」的最新进展：${compact}。建议结合原文进一步核查关键细节。`;
}

function toChineseSummary(rawSummary = '', title = '') {
  if (hasChinese(rawSummary)) return clean(rawSummary).slice(0, 220);
  return englishSnippetToChinese(rawSummary, title).slice(0, 220);
}

function normalizeItem(item, feedSource, feedTitle) {
  const link = resolveScourLink(item.link || item.guid || '');
  const title = clean(item.title || 'Untitled');
  const rawSummary = clean(item.contentSnippet || item.content || item.summary || '');
  const pub = item.isoDate || item.pubDate || '';
  const source = feedSource || clean(feedTitle) || domain(link);

  return {
    title,
    summary: toChineseSummary(rawSummary, title),
    source,
    link,
    publishedAt: pub,
    ts: pub ? new Date(pub).getTime() : 0,
  };
}

async function fetchCategory(category) {
  const tasks = category.feeds.map(async (feedConfig) => {
    try {
      const feed = await parser.parseURL(feedConfig.url);
      return (feed.items || []).map((it) => normalizeItem(it, feedConfig.source, feed.title));
    } catch (error) {
      return [
        {
          title: `抓取失败：${feedConfig.source}`,
          summary: `无法获取 ${feedConfig.url}（${error.message}）`,
          source: feedConfig.source,
          link: feedConfig.url,
          publishedAt: '',
          ts: 0,
          error: true,
        },
      ];
    }
  });

  const nested = await Promise.all(tasks);
  const merged = nested.flat();

  const seen = new Set();
  const deduped = [];
  for (const item of merged) {
    const key = `${item.link}::${item.title}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  deduped.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return deduped.slice(0, category.limit);
}

async function getCategoryData(category, force = false) {
  const current = cache.get(category.id);
  const fresh = current && Date.now() - current.updatedAt < CACHE_TTL_MS;
  if (!force && fresh) return current;

  const items = await fetchCategory(category);
  const payload = {
    id: category.id,
    name: category.name,
    zhName: category.zhName,
    description: category.description,
    zhDescription: category.zhDescription,
    updatedAt: Date.now(),
    items,
  };
  cache.set(category.id, payload);
  return payload;
}

app.get('/', async (req, res) => {
  const force = req.query.refresh === '1';
  const data = await Promise.all(CATEGORIES.map((c) => getCategoryData(c, force)));
  res.render('index', {
    categories: data,
    generatedAt: new Date(),
  });
});

app.get('/api/category/:id', async (req, res) => {
  const category = CATEGORIES.find((c) => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: 'category_not_found' });

  const force = req.query.refresh === '1';
  const data = await getCategoryData(category, force);
  res.json(data);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'news-intel-webapp', now: new Date().toISOString() });
});

if (process.env.VERCEL !== '1' && process.env.VERCEL !== 'true') {
  app.listen(PORT, () => {
    console.log(`news-intel-webapp listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
