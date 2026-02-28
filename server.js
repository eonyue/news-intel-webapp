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

const TITLE_TRANSLATION_MAP = [
  ['Artificial Intelligence', '人工智能'],
  ['Machine Learning', '机器学习'],
  ['Large Language Models', '大语言模型'],
  ['Large Language Model', '大语言模型'],
  ['LLM', '大模型'],
  ['Agent', '智能体'],
  ['Agents', '智能体'],
  ['Neural Network', '神经网络'],
  ['Neural', '神经'],
  ['Neuroscience', '神经科学'],
  ['Brain', '大脑'],
  ['Hippocampal', '海马体'],
  ['EEG', '脑电'],
  ['BCI', '脑机接口'],
  ['Robotics', '机器人'],
  ['Robotic', '机器人'],
  ['Robot', '机器人'],
  ['Automation', '自动化'],
  ['Health', '健康'],
  ['Mental Health', '心理健康'],
  ['Medical', '医学'],
  ['Clinical', '临床'],
  ['Research', '研究'],
  ['Paper', '论文'],
  ['Update', '更新'],
  ['Guide', '指南'],
  ['Trends', '趋势'],
  ['News', '新闻'],
  ['Theory', '理论'],
  ['Safety', '安全'],
  ['Governance', '治理'],
  ['Policy', '政策'],
];

function toChineseTitle(title = '') {
  const source = clean(title);
  if (!source) return '未命名内容';
  if (hasChinese(source)) return source;

  let translated = source;
  for (const [en, zh] of TITLE_TRANSLATION_MAP.sort((a, b) => b[0].length - a[0].length)) {
    const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    translated = translated.replace(pattern, zh);
  }

  // 清理残余英文连词和标点格式
  translated = translated
    .replace(/\s+-\s+/g, '：')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 若仍以英文为主，退化成中文标题包装，保证界面中文化
  const zhCount = (translated.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinCount = (translated.match(/[A-Za-z]/g) || []).length;
  if (zhCount < 2 || latinCount > 8) return `关于「${source}」的更新`;

  return translated;
}

function normalizeItem(item, feedSource, feedTitle) {
  const link = resolveScourLink(item.link || item.guid || '');
  const title = clean(item.title || 'Untitled');
  const pub = item.isoDate || item.pubDate || '';
  const source = feedSource || clean(feedTitle) || domain(link);

  return {
    title,
    titleZh: toChineseTitle(title),
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
          titleZh: `抓取失败：${feedConfig.source}`,
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
