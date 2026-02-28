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
    limit: 3,
    feeds: [{ url: process.env.SCOUR_RSS || 'https://scour.ing/@yuesean/rss.xml', source: 'scour.ing' }],
  },
  {
    id: 'arxiv',
    name: 'Arxiv Digest',
    zhName: 'Arxiv 论文速览',
    description: 'Fresh papers from AI / neuroscience-related categories',
    zhDescription: '聚合 AI 与神经科学相关新论文',
    limit: 3,
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
    limit: 3,
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
    limit: 3,
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
    limit: 3,
    feeds: [
      { url: 'https://hnrss.org/newest?q=AI', source: 'Hacker News' },
      { url: 'https://lobste.rs/t/ai.rss', source: 'Lobsters' },
      { url: 'https://www.worksinprogress.news/feed', source: 'Works in Progress' },
    ],
  },
];

const SOURCE_WEIGHT = {
  'nature.com': 10,
  'science.org': 10,
  'cell.com': 10,
  'nejm.org': 9,
  'thelancet.com': 9,
  'jamanetwork.com': 9,
  'arxiv.org': 8,
  'medicalxpress.com': 7,
  'neurosciencenews.com': 7,
  'sciencedaily.com': 7,
  'technologyreview.com': 7,
  'venturebeat.com': 6,
  'theverge.com': 6,
  'news.ycombinator.com': 5,
  'lobste.rs': 5,
};

const cache = new Map();
const titleTranslateCache = new Map();

app.set('view engine', 'ejs');
app.set('views', `${__dirname}/views`);
app.use(express.static(`${__dirname}/public`));

const clean = (txt = '') =>
  String(txt)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasChinese = (txt = '') => /[\u4e00-\u9fa5]/.test(txt);

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
  ['Benchmark', '基准'],
  ['Dataset', '数据集'],
  ['Model', '模型'],
  ['Memory', '记忆'],
  ['Therapy', '治疗'],
];

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

function sourceKey(item) {
  return clean(item.source || domain(item.link || '') || 'unknown').toLowerCase();
}

const US_POLITICS_KEYWORDS = [
  'trump',
  'biden',
  'white house',
  'senate',
  'congress',
  'republican',
  'democrat',
  'election',
  'campaign',
  'capitol hill',
  'washington dc',
  'u.s. politics',
  'us politics',
  'pentagon',
  'supreme court',
  'federal agencies',
  'department of state',
  'homeland security',
];

const US_POLITICS_DOMAINS = [
  'politico.com',
  'foxnews.com',
  'cnn.com',
  'nytimes.com',
  'washingtonpost.com',
  'thehill.com',
];

function isUSPolitics(item) {
  const d = domain(item.link || '');
  const text = `${item.title || ''} ${item.rawSummary || ''} ${item.link || ''}`.toLowerCase();

  if (US_POLITICS_DOMAINS.some((x) => d.includes(x))) return true;
  return US_POLITICS_KEYWORDS.some((kw) => text.includes(kw));
}

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

  return translated
    .replace(/\s+-\s+/g, '：')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function needsBetterChineseTitle(title = '') {
  const zhCount = (title.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinCount = (title.match(/[A-Za-z]/g) || []).length;
  return zhCount < 2 || latinCount > 10;
}

async function translateTitleOnline(title = '') {
  const source = clean(title);
  if (!source) return '未命名内容';
  if (hasChinese(source)) return source;
  if (titleTranslateCache.has(source)) return titleTranslateCache.get(source);

  const local = toChineseTitle(source);
  if (!needsBetterChineseTitle(local)) {
    titleTranslateCache.set(source, local);
    return local;
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(source)}`;
    const text = await fetchTextWithTimeout(url, 8000);
    const data = JSON.parse(text);
    const translated = clean((data?.[0] || []).map((x) => (x && x[0]) || '').join(''));
    const out = translated || local || source;
    titleTranslateCache.set(source, out);
    return out;
  } catch {
    titleTranslateCache.set(source, local || source);
    return local || source;
  }
}

function inferTopic(text = '') {
  const t = text.toLowerCase();
  if (/(llm|large language|agent|ai|model|transformer)/.test(t)) return 'AI 模型与智能体';
  if (/(brain|neuro|neural|hippocamp|eeg|bci)/.test(t)) return '神经科学与脑机接口';
  if (/(health|therapy|clinical|disease|alzheimer|drug|medical)/.test(t)) return '健康与临床应用';
  if (/(robot|humanoid|automation)/.test(t)) return '机器人与自动化';
  if (/(policy|governance|law|rights|ethic|safety)/.test(t)) return '治理、伦理与安全';
  return '前沿科技趋势';
}

function toChineseSummary(raw = '', title = '') {
  const text = clean(raw);
  if (!text) return `围绕「${inferTopic(title)}」的最新内容，建议阅读全文获取完整细节。`;
  if (hasChinese(text)) return text.slice(0, 220);

  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const compact = clean(firstSentence).slice(0, 180);
  return `围绕「${inferTopic(`${title} ${text}`)}」：${compact}。`.slice(0, 220);
}

async function fetchTextWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsIntelBot/1.0)',
        Accept: '*/*',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractAbstractOrDescription(htmlText) {
  const html = String(htmlText || '');

  // arXiv abstract
  const arxiv = html.match(/<blockquote class="abstract[^>]*">([\s\S]*?)<\/blockquote>/i);
  if (arxiv) return clean(arxiv[1].replace(/^\s*Abstract:\s*/i, ''));

  // og description / meta description
  const og = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (og) return clean(og[1]);

  const md = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (md) return clean(md[1]);

  // first meaningful paragraph
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => clean(m[1]))
    .filter((p) => p && p.length > 80);
  if (paragraphs.length) return paragraphs[0];

  return '';
}

function importanceScore(item, categoryId) {
  const d = domain(item.link || '');
  let score = SOURCE_WEIGHT[d] || 3;

  const t = (item.title || '').toLowerCase();
  if (/(benchmark|breakthrough|trial|clinical|dataset|review|policy|update)/.test(t)) score += 2;
  if (/(alzheimer|brain|neuro|llm|agent|safety|governance)/.test(t)) score += 2;

  const now = Date.now();
  if (item.ts) {
    const hours = Math.max(0, (now - item.ts) / 3600000);
    score += Math.max(0, 72 - hours) / 12;
  }

  if (categoryId === 'arxiv' && d === 'arxiv.org') score += 2;
  if (categoryId === 'research' && /(nature|science|medicalxpress|neurosciencenews|sciencedaily)/.test(d)) score += 2;
  if (categoryId === 'trends' && /(news.ycombinator|lobste.rs)/.test(d)) score += 1;

  return score;
}

function normalizeItem(item, feedSource, feedTitle) {
  const link = resolveScourLink(item.link || item.guid || '');
  const title = clean(item.title || 'Untitled');
  const pub = item.isoDate || item.pubDate || '';
  const inferredSource = domain(link);
  const source = /scour\.ing/i.test(feedSource || '') ? inferredSource : (feedSource || clean(feedTitle) || inferredSource);
  const rawSummary = clean(item.contentSnippet || item.content || item.summary || '');

  return {
    title,
    titleZh: toChineseTitle(title),
    source,
    link,
    rawSummary,
    publishedAt: pub,
    ts: pub ? new Date(pub).getTime() : 0,
  };
}

async function enrichSummary(item) {
  let text = item.rawSummary || '';
  const generic = /Scour interesting reads from noisy feeds/i.test(text);

  if (!text || text.length < 80 || generic) {
    try {
      const html = await fetchTextWithTimeout(item.link, 10000);
      const extracted = extractAbstractOrDescription(html);
      if (extracted) text = extracted;
    } catch {
      // keep fallback
    }
  }

  const titleZh = await translateTitleOnline(item.title);

  return {
    ...item,
    titleZh,
    summary: toChineseSummary(text, titleZh || item.title),
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
          rawSummary: '',
          summary: `无法获取 ${feedConfig.url}（${error.message}）`,
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

  const filtered = deduped.filter((it) => !isUSPolitics(it));

  const sorted = filtered
    .map((it) => ({ ...it, score: importanceScore(it, category.id) }))
    .sort((a, b) => (b.score - a.score) || ((b.ts || 0) - (a.ts || 0)));

  const topUnique = [];
  const seenSource = new Set();
  for (const item of sorted) {
    const sk = sourceKey(item);
    if (seenSource.has(sk)) continue;
    seenSource.add(sk);
    topUnique.push(item);
    if (topUnique.length >= category.limit) break;
  }

  const enriched = await Promise.all(topUnique.map(enrichSummary));

  if (enriched.length) return enriched;

  // 若全部抓取失败，返回去政治过滤后的错误项占位
  const fallback = deduped.filter((x) => x.error).slice(0, category.limit);
  return fallback;
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
