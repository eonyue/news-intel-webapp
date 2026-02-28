const express = require('express');
const Parser = require('rss-parser');

const app = express();
const parser = new Parser({ timeout: 15000 });
const PORT = process.env.PORT || 4321;
const CACHE_TTL_MS = 15 * 60 * 1000;
const ITEMS_PER_SOURCE = 4;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || process.env.TAVILY_KEY || '';
const TAVILY_ENDPOINT = process.env.TAVILY_ENDPOINT || 'https://api.tavily.com/search';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.3-codex';
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/responses';

const CATEGORIES = [
  {
    id: 'scour',
    name: 'Scour Feeds',
    zhName: 'Scour 信息流',
    description: 'Curated mixed feed with strong AI / science relevance',
    zhDescription: 'Scour 混合精选流（AI / 科学优先）',
    tavilyQuery:
      'latest high-signal stories on artificial intelligence neuroscience life science health technology from trusted sources',
    feeds: [{ url: process.env.SCOUR_RSS || 'https://scour.ing/@yuesean/rss.xml', source: 'scour.ing' }],
  },
  {
    id: 'arxiv',
    name: 'Arxiv Digest',
    zhName: 'Arxiv 论文速览',
    description: 'Latest AI / neuroscience / life-science preprints',
    zhDescription: 'AI / 神经科学 / 生命科学最新预印本',
    tavilyQuery:
      'site:arxiv.org latest papers on AI large language models neuroscience brain science life science computational biology health tech',
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
    description: 'Broad-reach media coverage around AI, tech and health',
    zhDescription: 'AI / 科技 / 健康主流媒体报道',
    tavilyQuery:
      'top media analysis and headlines on AI technology health neuroscience from MIT Technology Review VentureBeat The Verge',
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
    description: 'Research-heavy updates from scientific outlets',
    zhDescription: '科研导向更新（神经科学 / 生命科学 / 健康）',
    tavilyQuery:
      'latest research news on neuroscience life science health from Nature Medical Xpress Neuroscience News ScienceDaily',
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
    description: 'Developer and ecosystem trend signals',
    zhDescription: '开发者生态与技术趋势信号',
    tavilyQuery:
      'latest trends on AI agents software engineering chips developer tools health technology discussions',
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
  'openai.com': 6,
  'anthropic.com': 6,
  'news.ycombinator.com': 5,
  'lobste.rs': 5,
};

const REACH_WEIGHT = {
  'technologyreview.com': 9,
  'theverge.com': 9,
  'venturebeat.com': 8,
  'news.ycombinator.com': 8,
  'openai.com': 8,
  'arxiv.org': 7,
  'medicalxpress.com': 7,
  'neurosciencenews.com': 7,
  'sciencedaily.com': 7,
  'lobste.rs': 6,
};

const TOPIC_TAGS = [
  ['人工智能', ['ai', 'artificial intelligence', 'llm', 'agent', 'transformer', '大模型', '人工智能', '智能体']],
  ['神经科学', ['neuro', 'neuroscience', 'brain', 'hippocamp', 'eeg', 'bci', '神经', '脑科学']],
  ['生命科学', ['life science', 'biology', 'biotech', 'gene', 'genome', 'dna', 'rna', 'protein', 'cell', '生命科学', '基因', '生物']],
  ['健康', ['health', 'clinical', 'medical', 'therapy', 'disease', 'diagnosis', 'drug', 'trial', '健康', '医学', '临床', '疗法']],
  ['技术', ['technology', 'tech', 'software', 'chip', 'semiconductor', 'tooling', 'engineering', '技术', '软件', '芯片']],
];

const IN_SCOPE_KEYWORDS = TOPIC_TAGS.flatMap((x) => x[1]);

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

const cache = new Map();
const titleTranslateCache = new Map();
const llmTranslateCache = new Map();

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
  ['LLMs', '大模型'],
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

function keywordMatch(text, kw) {
  const hasCJK = /[\u4e00-\u9fa5]/.test(kw);
  if (hasCJK) return text.includes(kw.toLowerCase());

  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return re.test(text);
}

function isUSPolitics(item) {
  const d = domain(item.link || '');
  const text = `${item.title || ''} ${item.rawSummary || ''} ${item.link || ''}`.toLowerCase();

  if (US_POLITICS_DOMAINS.some((x) => d.includes(x))) return true;
  return US_POLITICS_KEYWORDS.some((kw) => text.includes(kw));
}

function isInScopeTopic(item) {
  const text = `${item.title || ''} ${item.rawSummary || ''} ${item.link || ''}`.toLowerCase();
  return IN_SCOPE_KEYWORDS.some((kw) => keywordMatch(text, kw));
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

  return normalizeLLMTerm(translated)
    .replace(/\s+-\s+/g, '：')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeLLMTerm(text = '') {
  return String(text)
    .replace(/法学硕士/gi, '大模型')
    .replace(/\bLLMs?\b/gi, '大模型');
}

function needsBetterChineseTitle(title = '') {
  const zhCount = (title.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinCount = (title.match(/[A-Za-z]/g) || []).length;
  return zhCount < 2 || latinCount > 10;
}

async function fetchTextWithTimeout(url, timeoutMs = 12000, init = {}) {
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
      ...init,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

async function translateWithCodex(sourceText = '') {
  const source = clean(sourceText);
  if (!source) return '';
  if (!OPENAI_API_KEY) return '';
  if (llmTranslateCache.has(source)) return llmTranslateCache.get(source);

  try {
    const body = {
      model: OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content:
            'You translate English news titles into concise, natural Chinese for tech/research dashboards. Keep proper nouns accurate. NEVER translate LLM as 法学硕士; always use 大模型. Return only one short Chinese title without quotes.',
        },
        {
          role: 'user',
          content: source,
        },
      ],
      max_output_tokens: 60,
      temperature: 0.2,
    };

    const text = await fetchTextWithTimeout(
      OPENAI_ENDPOINT,
      12000,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    const data = JSON.parse(text);
    const outputText = clean(
      data?.output_text ||
      data?.output?.map((x) => x?.content?.map((c) => c?.text || '').join(' ') || '').join(' ') ||
      ''
    );

    const out = normalizeLLMTerm(outputText);
    llmTranslateCache.set(source, out);
    return out;
  } catch {
    return '';
  }
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

  const codex = await translateWithCodex(source);
  if (codex) {
    const out = normalizeLLMTerm(codex || local || source);
    titleTranslateCache.set(source, out);
    return out;
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(source)}`;
    const text = await fetchTextWithTimeout(url, 8000);
    const data = JSON.parse(text);
    const translatedRaw = clean((data?.[0] || []).map((x) => (x && x[0]) || '').join(''));
    const translated = normalizeLLMTerm(translatedRaw);
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
  if (/(life science|biology|biotech|gene|genome|dna|rna|protein|cell)/.test(t)) return '生命科学';
  if (/(robot|automation|software|chip|semiconductor|technology|tech)/.test(t)) return '技术与工程';
  return '前沿科技趋势';
}

function toChineseSummary(raw = '', title = '') {
  const text = clean(raw);
  if (!text) return `围绕「${inferTopic(title)}」的关键更新，建议查看原文获取完整细节。`;
  if (hasChinese(text)) return text.slice(0, 220);

  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const compact = clean(firstSentence).slice(0, 180);
  return `围绕「${inferTopic(`${title} ${text}`)}」：${compact}。`.slice(0, 220);
}

function extractAbstractOrDescription(htmlText) {
  const html = String(htmlText || '');

  const arxiv = html.match(/<blockquote class="abstract[^>]*">([\s\S]*?)<\/blockquote>/i);
  if (arxiv) return clean(arxiv[1].replace(/^\s*Abstract:\s*/i, ''));

  const og = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (og) return clean(og[1]);

  const md = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (md) return clean(md[1]);

  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => clean(m[1]))
    .filter((p) => p && p.length > 80);
  if (paragraphs.length) return paragraphs[0];

  return '';
}

function scoreJudgement(item) {
  const t = `${item.title || ''} ${item.rawSummary || ''}`.toLowerCase();
  const d = domain(item.link || '');

  let frontier = 4;
  if (/(breakthrough|novel|first|sota|state-of-the-art|new|首次|突破|前沿)/.test(t)) frontier += 3;
  if (/(arxiv|nature|science|cell|clinical trial|doi)/.test(t)) frontier += 2;

  let depth = 3;
  if ((item.rawSummary || '').length > 180) depth += 3;
  if (SOURCE_WEIGHT[d]) depth += Math.min(3, Math.floor(SOURCE_WEIGHT[d] / 3));
  if (/(analysis|review|framework|benchmark|dataset|白皮书|综述|基准)/.test(t)) depth += 2;

  let reach = REACH_WEIGHT[d] || 3;
  if (/(hacker news|lobsters|reddit)/.test(t)) reach += 1;

  frontier = Math.min(10, frontier);
  depth = Math.min(10, depth);
  reach = Math.min(10, reach);

  return {
    frontier,
    depth,
    reach,
    total: frontier * 0.42 + depth * 0.33 + reach * 0.25 + (item.tavilyScore || 0),
  };
}

function buildTags(item) {
  const text = `${item.title || ''} ${item.rawSummary || ''}`.toLowerCase();
  const tags = [];

  for (const [tag, kws] of TOPIC_TAGS) {
    if (kws.some((kw) => keywordMatch(text, kw))) tags.push(tag);
  }

  // 兜底标签，确保只有学科/领域维度
  if (!tags.length) tags.push('技术');

  return [...new Set(tags)].slice(0, 4);
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

async function fetchFromRSS(category) {
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
  return nested.flat();
}

async function fetchFromTavily(category) {
  if (!TAVILY_API_KEY) return [];

  try {
    const resp = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: category.tavilyQuery,
        topic: 'news',
        search_depth: 'advanced',
        max_results: 30,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    const results = Array.isArray(data.results) ? data.results : [];

    return results.map((r) => {
      const link = resolveScourLink(r.url || '');
      const title = clean(r.title || 'Untitled');
      const rawSummary = clean(r.content || r.snippet || '');
      const source = domain(link);
      const publishedAt = r.published_date || r.date || '';
      const tavilyScore = Number(r.score || 0) * 1.6;
      return {
        title,
        titleZh: toChineseTitle(title),
        source,
        link,
        rawSummary,
        publishedAt,
        ts: publishedAt ? new Date(publishedAt).getTime() : 0,
        tavilyScore,
      };
    });
  } catch {
    return [];
  }
}

async function enrichItem(item) {
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
  const rawSummary = text || item.rawSummary || '';
  const judgement = scoreJudgement({ ...item, rawSummary, title: titleZh || item.title });
  const tags = buildTags({ ...item, rawSummary, title: titleZh || item.title });

  return {
    ...item,
    titleZh,
    rawSummary,
    summary: toChineseSummary(rawSummary, titleZh || item.title),
    judgement,
    tags,
    score: judgement.total,
  };
}

async function fetchCategory(category) {
  const fromTavily = await fetchFromTavily(category);
  const fromRss = await fetchFromRSS(category);

  const merged = [...fromTavily, ...fromRss];

  const seen = new Set();
  const deduped = [];
  for (const item of merged) {
    const key = `${item.link}::${item.title}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  const filtered = deduped.filter((it) => !it.error && !isUSPolitics(it) && isInScopeTopic(it));
  const enriched = await Promise.all(filtered.map(enrichItem));

  const sorted = enriched.sort((a, b) => (b.score || 0) - (a.score || 0));

  const bySourceCount = new Map();
  const selected = [];
  for (const item of sorted) {
    const sk = sourceKey(item);
    const n = bySourceCount.get(sk) || 0;
    if (n >= ITEMS_PER_SOURCE) continue;
    bySourceCount.set(sk, n + 1);
    selected.push(item);
  }

  if (selected.length) return selected;

  return deduped
    .filter((x) => x.error)
    .slice(0, ITEMS_PER_SOURCE)
    .map((x) => ({ ...x, tags: ['抓取异常'] }));
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
  res.json({
    ok: true,
    service: 'news-intel-webapp',
    now: new Date().toISOString(),
    tavilyEnabled: !!TAVILY_API_KEY,
    codexEnabled: !!OPENAI_API_KEY,
    codexModel: OPENAI_MODEL,
    itemsPerSource: ITEMS_PER_SOURCE,
  });
});

if (process.env.VERCEL !== '1' && process.env.VERCEL !== 'true') {
  app.listen(PORT, () => {
    console.log(`news-intel-webapp listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
