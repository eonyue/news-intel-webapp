const express = require('express');
const Parser = require('rss-parser');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const parser = new Parser({ timeout: 15000 });
const PORT = process.env.PORT || 4321;
const CACHE_TTL_MS = 15 * 60 * 1000;
const ITEMS_PER_SOURCE = 2;

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || process.env.TAVILY_KEY || '';
const TAVILY_ENDPOINT = process.env.TAVILY_ENDPOINT || 'https://api.tavily.com/search';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.3-codex';
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/responses';

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-Text-01';
const MINIMAX_ENDPOINT = process.env.MINIMAX_ENDPOINT || 'https://api.minimax.chat/v1/text/chatcompletion_v2';

const CONSCIOUSNESS_DATA_FILE = path.join(__dirname, 'data', 'consciousness-latest.json');
const HOME_DATA_FILE = path.join(__dirname, 'data', 'home-latest.json');

const CATEGORIES = [
  {
    id: 'media',
    name: 'Media Headlines',
    zhName: '媒体头条',
    description: 'Broad-reach media coverage around AI, neuroscience, life science and technology',
    zhDescription: 'AI / 神经科学 / 生命科学 / 技术主流媒体报道',
    limit: 18,
    tavilyQuery:
      'best in-depth media coverage today on AI large language models neuroscience life science technology',
    feeds: [
      { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', source: 'MIT Technology Review' },
      { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch AI' },
      { url: 'https://techcrunch.com/category/startups/feed/', source: 'TechCrunch Startups' },
      { url: 'https://www.theguardian.com/science/rss', source: 'The Guardian Science' },
      { url: 'https://www.newscientist.com/subject/technology/feed/', source: 'New Scientist Tech' },
      { url: 'https://www.scientificamerican.com/feed/', source: 'Scientific American' },
      { url: 'https://theconversation.com/global/topics/artificial-intelligence-21/articles.atom', source: 'The Conversation AI' },
      { url: 'https://www.statnews.com/feed/', source: 'STAT' },
    ],
  },
  {
    id: 'research',
    name: 'Research Alert',
    zhName: '研究速递',
    description: 'Research-heavy updates from journals, labs, and arXiv',
    zhDescription: '科研导向更新（含 arXiv）',
    limit: 18,
    tavilyQuery:
      'latest research from top journals and conferences in AI neuroscience and life science: Nature Science Cell Neuron Nature Neuroscience Nature Communications NeurIPS ICML ICLR CVPR ACL',
    feeds: [
      { url: 'https://www.nature.com/nature.rss', source: 'Nature' },
      { url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science', source: 'Science' },
      { url: 'https://www.cell.com/cell/current.rss', source: 'Cell' },
      { url: 'https://www.nature.com/neuro.rss', source: 'Nature Neuroscience' },
      { url: 'https://www.nature.com/ncomms.rss', source: 'Nature Communications' },
      { url: 'https://www.cell.com/neuron/current.rss', source: 'Neuron' },
      { url: 'https://export.arxiv.org/rss/cs.AI', source: 'arXiv cs.AI' },
      { url: 'https://export.arxiv.org/rss/cs.CL', source: 'arXiv cs.CL' },
      { url: 'https://export.arxiv.org/rss/cs.LG', source: 'arXiv cs.LG' },
      { url: 'https://export.arxiv.org/rss/q-bio.NC', source: 'arXiv q-bio.NC' },
      { url: 'https://export.arxiv.org/rss/q-bio.BM', source: 'arXiv q-bio.BM' },
      { url: 'https://export.arxiv.org/rss/q-bio.GN', source: 'arXiv q-bio.GN' },
      { url: 'https://neurips.cc/virtual/2025/papers.rss', source: 'NeurIPS' },
      { url: 'https://openreview.net/group?id=ICLR.cc/2025/Conference.rss', source: 'ICLR' },
      { url: 'https://aclanthology.org/events/acl-2025/feed.xml', source: 'ACL Anthology' },
      { url: 'https://neurosciencenews.com/feed/', source: 'Neuroscience News' },
      { url: 'https://medicalxpress.com/rss-feed/', source: 'Medical Xpress' },
      { url: 'https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml', source: 'ScienceDaily AI' },
      { url: 'https://www.sciencedaily.com/rss/health_medicine/neuroscience.xml', source: 'ScienceDaily Neuroscience' },
      { url: 'https://www.sciencedaily.com/rss/plants_animals/biology.xml', source: 'ScienceDaily Biology' },
    ],
  },
  {
    id: 'trends',
    name: 'Tech Trends',
    zhName: '技术趋势',
    description: 'Tech & biotech company moves, market changes and funding trends',
    zhDescription: '科技/生物医疗公司动向、市场变化与投融资趋势',
    limit: 18,
    tavilyQuery:
      'latest trends in technology and biotech companies, market movements, fundraising, venture capital, M&A, earnings, AI and healthcare industry',
    feeds: [
      { url: 'https://techcrunch.com/category/startups/feed/', source: 'TechCrunch Startups' },
      { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch AI' },
      { url: 'https://www.statnews.com/feed/', source: 'STAT' },
      { url: 'https://qz.com/rss', source: 'Quartz' },
      { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', source: 'MIT Technology Review' },
      { url: 'https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml', source: 'ScienceDaily AI' },
      { url: 'https://www.sciencedaily.com/rss/health_medicine/medical_technology.xml', source: 'ScienceDaily MedTech' },
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
  'medicalxpress.com': 8,
  'neurosciencenews.com': 8,
  'sciencedaily.com': 7,
  'technologyreview.com': 8,
  'venturebeat.com': 7,
  'theverge.com': 6,
  'openai.com': 7,
  'anthropic.com': 7,
  'news.ycombinator.com': 6,
  'lobste.rs': 6,
};

const REACH_WEIGHT = {
  'technologyreview.com': 9,
  'theverge.com': 8,
  'venturebeat.com': 8,
  'news.ycombinator.com': 9,
  'openai.com': 8,
  'arxiv.org': 7,
  'medicalxpress.com': 7,
  'neurosciencenews.com': 7,
  'sciencedaily.com': 7,
  'lobste.rs': 6,
};

const TOPIC_TAGS = [
  ['人工智能', ['ai', 'artificial intelligence', 'machine learning', 'deep learning', '大模型', '人工智能']],
  ['大模型', ['llm', 'large language model', 'foundation model', 'gpt', 'transformer']],
  ['智能体', ['agent', 'agentic', 'tool use', 'autonomous agent']],
  ['AI安全', ['ai safety', 'alignment', 'governance', 'policy', 'risk', '安全']],
  ['神经科学', ['neuro', 'neuroscience', 'brain', 'cortex', 'synapse', '神经', '脑科学']],
  ['神经影像', ['fmri', 'pet', 'imaging', 'brain imaging', '神经影像']],
  ['脑机接口', ['bci', 'brain-computer interface', 'eeg', 'electrode', '脑机接口']],
  ['生命科学', ['life science', 'biology', 'biological', '生命科学', '生物']],
  ['生物技术', ['biotech', 'drug discovery', 'biopharma', '生物技术']],
  ['基因组学', ['gene', 'genome', 'genomic', 'crispr', '基因', '基因组']],
  ['蛋白质科学', ['protein', 'proteomics', '蛋白质']],

  ['技术', ['technology', 'tech', 'software', 'chip', 'semiconductor', 'infrastructure', '技术', '软件', '芯片']],
];

const IN_SCOPE_KEYWORDS = TOPIC_TAGS.flatMap((x) => x[1]);

const US_POLITICS_KEYWORDS = [
  'trump', 'biden', 'white house', 'senate', 'congress', 'republican', 'democrat', 'election', 'campaign',
  'capitol hill', 'washington dc', 'u.s. politics', 'us politics', 'pentagon', 'supreme court',
  'federal agencies', 'department of state', 'homeland security',
];

const US_POLITICS_DOMAINS = [
  'politico.com', 'foxnews.com', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'thehill.com',
];

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
  ['Neuroscience', '神经科学'],
  ['Brain', '大脑'],
  ['EEG', '脑电'],
  ['BCI', '脑机接口'],
  ['Health', '健康'],
  ['Medical', '医学'],
  ['Clinical', '临床'],
  ['Research', '研究'],
  ['Paper', '论文'],
  ['Benchmark', '基准'],
  ['Dataset', '数据集'],
  ['Model', '模型'],
  ['Therapy', '治疗'],
  ['Policy', '政策'],
];

const cache = new Map();
const titleTranslateCache = new Map();
const llmTranslateCache = new Map();
const llmSummaryCache = new Map();
const llmTitlePolishCache = new Map();

function chinaDate(ts = Date.now()) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function emptyConsciousnessDigest() {
  return {
    title: '【“意识研究”简报】',
    curatedBy: 'OpenClaw',
    date: chinaDate(),
    updatedAt: new Date().toISOString(),
    trendObservation: '暂无趋势观察。',
    items: [],
  };
}

async function getConsciousnessDigest() {
  try {
    const raw = await fs.readFile(CONSCIOUSNESS_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...emptyConsciousnessDigest(),
      ...parsed,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return emptyConsciousnessDigest();
  }
}

async function getHomeDigest() {
  try {
    const raw = await fs.readFile(HOME_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
    return {
      ok: true,
      generatedAt: parsed.generatedAt || new Date().toISOString(),
      categories,
    };
  } catch {
    return { ok: false, generatedAt: '', categories: [] };
  }
}

app.set('view engine', 'ejs');
app.set('views', `${__dirname}/views`);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(`${__dirname}/public`));

const clean = (txt = '') =>
  String(txt)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasChinese = (txt = '') => /[\u4e00-\u9fa5]/.test(txt);

function chineseRatio(text = '') {
  const s = String(text || '');
  const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  return s.length ? zh / s.length : 0;
}

function isReadableChineseSummary(text = '') {
  const s = clean(text);
  if (!s) return false;
  if (!hasChinese(s)) return false;
  if (/[�]/.test(s)) return false;
  if (/(undefined|null|\[object Object\]|lorem ipsum)/i.test(s)) return false;
  if (/^#+\s*/.test(s)) return false;
  if (/^\W+$/.test(s)) return false;
  if (/^[（(【\[]?.{0,10}[）)】\]]?[。.!?]?$/.test(s)) return false;
  if (/授予号|doi|arxiv|版权所有|all rights reserved/i.test(s)) return false;
  if (s.length < 28) return false;
  if (s.length > 260) return false;
  if (chineseRatio(s) < 0.35) return false;
  const sentenceCount = s.split(/[。！？!?]/).filter(Boolean).length;
  if (sentenceCount < 1 || sentenceCount > 5) return false;
  return true;
}

function forceTitleChineseStyle(text = '') {
  return clean(text)
    .replace(/\s*[-|–—]\s*[^\u4e00-\u9fa5]*$/g, '')
    .replace(/\bAI\b/gi, '人工智能')
    .replace(/\bAGI\b/gi, '通用人工智能')
    .replace(/\bLLMs?\b/gi, '大模型')
    .replace(/\(\s*[A-Z]{2,10}\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizeSummaryText(text = '') {
  return clean(text)
    .replace(/^#+\s*/g, '')
    .replace(/\b(doi|arxiv)\s*[:：]?\s*\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[（(]\s*[）)]/g, '')
    .replace(/^[：:;，,。.]+/, '')
    .trim();
}

function tokenizeForRelevance(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length >= 3)
    .slice(0, 40);
}

function isSummaryRelevantToTitle(summary = '', title = '') {
  const s = clean(summary);
  const t = clean(title);
  if (!s || !t) return true;

  const titleTokens = tokenizeForRelevance(t);
  if (!titleTokens.length) return true;

  const summaryLower = s.toLowerCase();
  let hit = 0;
  for (const tk of titleTokens.slice(0, 12)) {
    if (summaryLower.includes(tk)) hit += 1;
  }

  const titleZh = (t.match(/[\u4e00-\u9fa5]/g) || []).slice(0, 6).join('');
  const zhHit = titleZh && s.includes(titleZh.slice(0, 2));

  return hit >= 1 || !!zhHit;
}

async function polishChineseTitle(title = '') {
  const source = clean(title);
  if (!source) return '';
  if (llmTitlePolishCache.has(source)) return llmTitlePolishCache.get(source);

  const polished = await callLLM({
    systemPrompt:
      '你是中文科技媒体编辑。请把输入标题润色成自然、顺口、专业的中文标题。不要夸张，不要改变事实，不要口语化。只输出一行标题。',
    userPrompt: source,
    maxOutputTokens: 70,
    temperature: 0.15,
  });

  const out = forceTitleChineseStyle(polished || source);
  llmTitlePolishCache.set(source, out);
  return out;
}

function dedupeAcrossCategories(categoryData = []) {
  const seen = new Set();
  return categoryData.map((cat) => {
    const items = [];
    for (const item of cat.items || []) {
      const key = `${resolveScourLink(item.link || '')}::${clean(item.titleZh || item.title || '')}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    return {
      ...cat,
      items,
    };
  });
}

function normalizeLLMTerm(text = '') {
  return String(text)
    .replace(/法学硕士/gi, '大模型')
    .replace(/\bLLMs?\b/gi, '大模型');
}

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
        'User-Agent': 'Mozilla/5.0 (compatible; NewsIntelBot/2.0)',
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

async function callOpenAI({ systemPrompt, userPrompt, maxOutputTokens = 180, temperature = 0.2 }) {
  if (!OPENAI_API_KEY) return '';

  try {
    const body = {
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_output_tokens: maxOutputTokens,
      temperature,
    };

    const text = await fetchTextWithTimeout(
      OPENAI_ENDPOINT,
      14000,
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

    return normalizeLLMTerm(outputText);
  } catch {
    return '';
  }
}

async function callMiniMax({ systemPrompt, userPrompt, maxOutputTokens = 180, temperature = 0.2 }) {
  if (!MINIMAX_API_KEY) return '';

  try {
    const body = {
      model: MINIMAX_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxOutputTokens,
    };

    const text = await fetchTextWithTimeout(
      MINIMAX_ENDPOINT,
      14000,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MINIMAX_API_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    const data = JSON.parse(text);
    const outputText = clean(
      data?.choices?.[0]?.message?.content ||
      data?.reply ||
      data?.output_text ||
      ''
    );

    return normalizeLLMTerm(outputText);
  } catch {
    return '';
  }
}

async function callLLM(params) {
  if (MINIMAX_API_KEY) {
    const out = await callMiniMax(params);
    if (out) return out;
  }

  return callOpenAI(params);
}

async function translateTitleOnline(title = '') {
  const source = clean(title);
  if (!source) return '未命名内容';
  if (hasChinese(source) && chineseRatio(source) > 0.35) return forceTitleChineseStyle(source);
  if (titleTranslateCache.has(source)) return titleTranslateCache.get(source);

  const local = forceTitleChineseStyle(toChineseTitle(source));
  const cacheKey = `title:${source}`;
  if (llmTranslateCache.has(cacheKey)) {
    const out = forceTitleChineseStyle(llmTranslateCache.get(cacheKey));
    titleTranslateCache.set(source, out);
    return out;
  }

  const llmTitle = await callLLM({
    systemPrompt:
      '将英文新闻标题翻译为自然、简洁、准确的中文标题。保留必要专有名词（如人名、公司名），其余尽量中文化。禁止输出英文整句。LLM统一译为“大模型”。只输出一行中文标题。',
    userPrompt: source,
    maxOutputTokens: 90,
    temperature: 0.1,
  });

  const candidate = forceTitleChineseStyle(llmTitle || local || source);
  const latinCount = (candidate.match(/[A-Za-z]/g) || []).length;
  let out = (hasChinese(candidate) && latinCount <= 10) ? candidate : local;

  let outLatinCount = (out.match(/[A-Za-z]/g) || []).length;
  if (!hasChinese(out) || outLatinCount > 10) {
    const translated = await callLLM({
      systemPrompt: '请将标题翻译为自然中文，除品牌/人名外尽量不要保留英文词。只输出一行中文标题。',
      userPrompt: source,
      maxOutputTokens: 90,
      temperature: 0.1,
    });
    if (translated) out = forceTitleChineseStyle(translated);
  }

  outLatinCount = (out.match(/[A-Za-z]/g) || []).length;
  if (!hasChinese(out) || outLatinCount > 10) {
    const translated = await translateTextToChinese(source);
    if (translated) out = forceTitleChineseStyle(translated);
  }

  const polished = await polishChineseTitle(out);
  const finalTitle = forceTitleChineseStyle(polished || out);

  llmTranslateCache.set(cacheKey, finalTitle);
  titleTranslateCache.set(source, finalTitle);
  return finalTitle;
}

function inferTopic(text = '') {
  const t = text.toLowerCase();
  if (/(llm|large language|agent|ai|model|transformer)/.test(t)) return '人工智能';
  if (/(brain|neuro|neural|hippocamp|eeg|bci)/.test(t)) return '神经科学';
  if (/(life science|biology|biotech|gene|genome|dna|rna|protein|cell)/.test(t)) return '生命科学';
  return '技术';
}

async function translateTextToChinese(text = '') {
  const source = clean(text);
  if (!source) return '';
  if (hasChinese(source)) return source;

  const llmOut = await callLLM({
    systemPrompt:
      '将输入英文内容翻译为自然、准确、简洁的中文新闻表达。保留专有名词。LLM统一译为“大模型”。只输出中文正文。',
    userPrompt: source,
    maxOutputTokens: 220,
    temperature: 0.1,
  });

  if (llmOut && hasChinese(llmOut)) return llmOut;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(source)}`;
    const textResp = await fetchTextWithTimeout(url, 8000);
    const data = JSON.parse(textResp);
    const translatedRaw = clean((data?.[0] || []).map((x) => (x && x[0]) || '').join(''));
    return normalizeLLMTerm(translatedRaw || source);
  } catch {
    return source;
  }
}

async function summarizeArticleInChinese(raw = '', titleZh = '') {
  const source = clean(raw);
  if (!source) return '';

  const cacheKey = `${titleZh}::${source}`;
  if (llmSummaryCache.has(cacheKey)) return llmSummaryCache.get(cacheKey);

  const chunks = chunkByLength(source, 1500);
  const partials = [];

  for (const part of chunks.slice(0, 4)) {
    const chunkSummary = await callLLM({
      systemPrompt:
        '你是科技新闻编辑。请将输入内容总结为中文要点，1-2句，信息密度高、客观准确，不编造。LLM统一译为“大模型”。只输出中文摘要正文。',
      userPrompt: `标题：${titleZh}\n内容片段：${part}`,
      maxOutputTokens: 140,
      temperature: 0.2,
    });

    const cleanedChunk = sanitizeSummaryText(chunkSummary);
    if (isReadableChineseSummary(cleanedChunk)) partials.push(cleanedChunk);
  }

  const mergedInput = partials.length ? partials.join('\n') : source.slice(0, 2500);
  const finalSummaryRaw = await callLLM({
    systemPrompt:
      '你是科技新闻编辑。请根据输入内容输出“文章总结”，用中文2-3句，讲清核心发现/事件、关键意义和潜在影响。风格客观、简洁，不要空话，不编造。LLM统一译为“大模型”。只输出总结正文。',
    userPrompt: `标题：${titleZh}\n素材：${mergedInput}`,
    maxOutputTokens: 220,
    temperature: 0.2,
  });

  const finalSummary = sanitizeSummaryText(finalSummaryRaw);
  if (isReadableChineseSummary(finalSummary) && isSummaryRelevantToTitle(finalSummary, titleZh)) {
    const polishedRaw = await callLLM({
      systemPrompt: '请将输入总结润色为更自然的中文新闻摘要，保持事实不变，2-3句。只输出正文。',
      userPrompt: finalSummary,
      maxOutputTokens: 220,
      temperature: 0.1,
    });
    const polishedSummary = sanitizeSummaryText(polishedRaw);
    const out = (isReadableChineseSummary(polishedSummary) && isSummaryRelevantToTitle(polishedSummary, titleZh))
      ? polishedSummary
      : finalSummary;
    llmSummaryCache.set(cacheKey, out);
    return out;
  }

  // retry once with stricter prompt
  const retrySummaryRaw = await callLLM({
    systemPrompt:
      '请输出高可读中文文章总结：2-3句，逻辑完整，避免术语堆砌，不要乱码或中英夹杂，不编造事实。禁止输出markdown标记。只输出中文总结正文。',
    userPrompt: `标题：${titleZh}\n素材：${mergedInput}`,
    maxOutputTokens: 220,
    temperature: 0.1,
  });

  const retrySummary = sanitizeSummaryText(retrySummaryRaw);
  if (isReadableChineseSummary(retrySummary) && isSummaryRelevantToTitle(retrySummary, titleZh)) {
    llmSummaryCache.set(cacheKey, retrySummary);
    return retrySummary;
  }

  // fallback: translate + compact
  const firstSentence = source.split(/(?<=[.!?])\s+/)[0] || source;
  const compact = clean(firstSentence).slice(0, 220);
  const translated = await translateTextToChinese(compact);
  const plain = sanitizeSummaryText(translated.endsWith('。') ? translated : `${translated}。`);
  llmSummaryCache.set(cacheKey, plain);
  return plain;
}

function extractAbstractOrDescription(htmlText) {
  const html = String(htmlText || '');

  const arxiv = html.match(/<blockquote class="abstract[^>]*">([\s\S]*?)<\/blockquote>/i);
  if (arxiv) return clean(arxiv[1].replace(/^\s*Abstract:\s*/i, ''));

  const og = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (og) return clean(og[1]);

  const md = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (md) return clean(md[1]);

  return '';
}

function extractMainArticleText(htmlText) {
  const html = String(htmlText || '');
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => clean(m[1]))
    .filter((p) => p && p.length > 60)
    .filter((p) => !/cookie|subscribe|newsletter|all rights reserved|sign up|privacy policy/i.test(p));

  if (!paragraphs.length) return '';

  const joined = paragraphs.slice(0, 10).join(' ');
  return clean(joined).slice(0, 5000);
}

function chunkByLength(text = '', maxLen = 1600) {
  const t = clean(text);
  if (!t) return [];
  if (t.length <= maxLen) return [t];

  const chunks = [];
  let rest = t;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(' ', maxLen);
    if (cut < Math.floor(maxLen * 0.6)) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function scoreJudgement(item) {
  const t = `${item.title || ''} ${item.rawSummary || ''}`.toLowerCase();
  const d = domain(item.link || '');

  let frontier = 4;
  if (/(breakthrough|novel|first|sota|state-of-the-art|new|首次|突破|前沿)/.test(t)) frontier += 3;
  if (/(arxiv|nature|science|cell|clinical trial|doi|peer-reviewed)/.test(t)) frontier += 2;

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

  if (!tags.length) tags.push('技术');
  return [...new Set(tags)].slice(0, 6);
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
          tags: ['抓取异常'],
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
        max_results: 40,
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

  if (!text || text.length < 160 || generic) {
    try {
      const html = await fetchTextWithTimeout(item.link, 10000);
      const fullText = extractMainArticleText(html);
      const abstractText = extractAbstractOrDescription(html);
      text = fullText || abstractText || text;
    } catch {
      // keep fallback
    }
  }

  const titleZh = await translateTitleOnline(item.title);
  const rawSummary = text || item.rawSummary || '';
  const summary = await summarizeArticleInChinese(rawSummary, titleZh || item.title);
  const judgement = scoreJudgement({ ...item, rawSummary, title: titleZh || item.title });
  const tags = buildTags({ ...item, rawSummary, title: titleZh || item.title });

  return {
    ...item,
    titleZh,
    rawSummary,
    summary,
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
    if (selected.length >= category.limit) break;
  }

  if (selected.length) return selected;

  return deduped
    .filter((x) => x.error)
    .slice(0, category.limit)
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
  const useLive = req.query.live === '1' || force;

  if (force) {
    titleTranslateCache.clear();
    llmTranslateCache.clear();
    llmSummaryCache.clear();
    llmTitlePolishCache.clear();
  }

  const homeDigest = useLive ? { ok: false, categories: [] } : await getHomeDigest();
  const liveData = homeDigest.ok
    ? homeDigest.categories
    : dedupeAcrossCategories(await Promise.all(CATEGORIES.map((c) => getCategoryData(c, force))));

  const consciousness = await getConsciousnessDigest();
  res.render('index', {
    categories: liveData,
    consciousness,
    generatedAt: new Date(),
  });
});

app.get('/api/category/:id', async (req, res) => {
  const category = CATEGORIES.find((c) => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: 'category_not_found' });

  const force = req.query.refresh === '1';
  if (!force) {
    const homeDigest = await getHomeDigest();
    if (homeDigest.ok) {
      const hit = homeDigest.categories.find((x) => x.id === req.params.id);
      if (hit) return res.json(hit);
    }
  }

  if (force) {
    titleTranslateCache.clear();
    llmTranslateCache.clear();
    llmSummaryCache.clear();
    llmTitlePolishCache.clear();
  }
  const data = await getCategoryData(category, force);
  res.json(data);
});

app.get('/consciousness', async (_req, res) => {
  const digest = await getConsciousnessDigest();
  res.render('consciousness', { digest });
});

app.get('/api/consciousness', async (_req, res) => {
  const digest = await getConsciousnessDigest();
  res.json(digest);
});

app.post('/api/admin/publish-home', async (req, res) => {
  const token = req.get('x-admin-token') || '';
  const expected = process.env.ADMIN_PUBLISH_TOKEN || '';
  if (!expected || token !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const payload = req.body || {};
  const categories = Array.isArray(payload.categories) ? payload.categories : [];
  if (!categories.length) {
    return res.status(400).json({ ok: false, error: 'invalid_payload' });
  }

  const data = {
    generatedAt: payload.generatedAt || new Date().toISOString(),
    categories,
  };

  await fs.mkdir(path.dirname(HOME_DATA_FILE), { recursive: true });
  await fs.writeFile(HOME_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  res.json({ ok: true, saved: HOME_DATA_FILE, categoryCount: categories.length });
});

app.get('/health', async (_req, res) => {
  const homeDigest = await getHomeDigest();
  res.json({
    ok: true,
    service: 'news-intel-webapp',
    now: new Date().toISOString(),
    tavilyEnabled: !!TAVILY_API_KEY,
    minimaxEnabled: !!MINIMAX_API_KEY,
    minimaxModel: MINIMAX_MODEL,
    codexEnabled: !!OPENAI_API_KEY,
    codexModel: OPENAI_MODEL,
    llmProvider: MINIMAX_API_KEY ? 'minimax' : (OPENAI_API_KEY ? 'openai' : 'none'),
    itemsPerSource: ITEMS_PER_SOURCE,
    consciousnessDataFile: CONSCIOUSNESS_DATA_FILE,
    homeDataFile: HOME_DATA_FILE,
    homeDigestEnabled: homeDigest.ok,
  });
});

if (process.env.VERCEL !== '1' && process.env.VERCEL !== 'true') {
  app.listen(PORT, () => {
    console.log(`news-intel-webapp listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
