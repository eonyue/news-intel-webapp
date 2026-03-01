#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const BASE = process.env.WEBAPP_BASE_URL || 'https://newsintel.noetex.ai';
const OUT = process.env.HOME_DIGEST_OUT || path.join(__dirname, '..', 'data', 'home-latest.json');

const CATEGORY_IDS = ['media', 'research', 'trends'];
const TOPICS = ['ai', 'neuro', 'life'];
const FIXED_PER_CATEGORY = 6;
const FIXED_PER_TOPIC = 2;

const WHITELIST_DOMAINS = [
  'wired.com', 'technologyreview.com', 'aeon.co', 'psyche.co', 'quantamagazine.org',
  'theatlantic.com', 'nautil.us', 'thetransmitter.org', 'spectrum.ieee.org', 'sciencefocus.com',
  'theconversation.com', 'vox.com', 'popsci.com', 'scientificamerican.com', 'statnews.com',
  'popularmechanics.com', 'newscientist.com', 'the-scientist.com', 'futurism.com', 'techcrunch.com',
  'engadget.com', 'newatlas.com', 'cnet.com', 'inverse.com', 'theguardian.com', 'qz.com', 'eurekalert.org'
];

const US_POLITICS_KEYWORDS = [
  'trump','biden','white house','senate','congress','republican','democrat','election','campaign',
  'capitol hill','washington dc','u.s. politics','us politics','pentagon','supreme court'
];

function clean(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function hasChinese(text = '') {
  return /[\u4e00-\u9fa5]/.test(text);
}

function readableSummary(s = '') {
  const t = clean(s);
  if (!t || !hasChinese(t)) return false;
  if (/[�]/.test(t)) return false;
  if (/^#+\s*/.test(t)) return false;
  if (t.length < 28 || t.length > 320) return false;
  return true;
}

function toDomain(link = '') {
  try {
    return new URL(link).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isWhitelistSource(item = {}) {
  const d = toDomain(item.link || '');
  return WHITELIST_DOMAINS.some((w) => d === w || d.endsWith(`.${w}`));
}

function isUSPolitics(item = {}) {
  const text = `${item.titleZh || ''} ${item.title || ''} ${item.summary || ''} ${item.rawSummary || ''}`.toLowerCase();
  return US_POLITICS_KEYWORDS.some((k) => text.includes(k));
}

function polishTitleZh(title = '') {
  return clean(title)
    .replace(/\s*[-|–—]\s*[^\u4e00-\u9fa5]*$/g, '')
    .replace(/\(\s*[A-Z]{2,10}\s*\)/g, '')
    .replace(/\bAI\b/gi, '人工智能')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeSummaryTo23Sentences(summary = '') {
  const t = clean(summary);
  if (!t) return t;
  const parts = t.split(/(?<=[。！？!?])/).map((x) => clean(x)).filter(Boolean);
  if (parts.length <= 3) return t;
  return clean(parts.slice(0, 3).join(' '));
}

function dedupeItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.link || ''}::${clean(item.titleZh || item.title || '')}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isIndiaRelated(item = {}) {
  const text = `${item.titleZh || ''} ${item.title || ''} ${item.source || ''} ${item.link || ''} ${item.rawSummary || ''} ${item.summary || ''}`.toLowerCase();
  return /(\bindia\b|\bindian\b|印度)/.test(text);
}

function classifyTopic(item = {}) {
  const text = `${item.titleZh || ''} ${item.title || ''} ${(item.tags || []).join(' ')} ${item.summary || ''}`.toLowerCase();

  const ai = /(人工智能|大模型|模型|智能体|ai|llm|agent|inference|transformer|copilot|openai|anthropic|nvidia)/.test(text);
  const neuro = /(神经|脑|脑电|神经科学|杏仁核|eeg|brain|neuro|neural|cortex|synapse|bci)/.test(text);
  const life = /(生命科学|生物|基因|蛋白|细胞|组学|biolog|genom|gene|protein|cell|biotech|drug discovery)/.test(text);

  if (ai && !neuro && !life) return 'ai';
  if (neuro && !ai && !life) return 'neuro';
  if (life && !ai && !neuro) return 'life';

  // multi-topic fallback priority for balance
  if (neuro) return 'neuro';
  if (life) return 'life';
  return 'ai';
}

function rebalanceByTopic(items = [], target = FIXED_PER_CATEGORY) {
  if (!items.length) return items;

  const buckets = {
    ai: [],
    neuro: [],
    life: [],
  };

  const sorted = [...items].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  for (const item of sorted) {
    const topic = classifyTopic(item);
    buckets[topic].push(item);
  }

  const selected = [];
  const selectedKey = new Set();

  // hard quota: 2 per topic
  for (const t of TOPICS) {
    for (const item of buckets[t].slice(0, FIXED_PER_TOPIC)) {
      const key = `${item.link || ''}::${clean(item.titleZh || item.title || '')}`.toLowerCase();
      if (selectedKey.has(key)) continue;
      selected.push(item);
      selectedKey.add(key);
    }
  }

  // fallback fill only if some topic lacks enough candidates
  if (selected.length < target) {
    for (const item of sorted) {
      const key = `${item.link || ''}::${clean(item.titleZh || item.title || '')}`.toLowerCase();
      if (selectedKey.has(key)) continue;
      selected.push(item);
      selectedKey.add(key);
      if (selected.length >= target) break;
    }
  }

  return selected.slice(0, target);
}

async function fetchCategory(id) {
  const url = `${BASE}/api/category/${id}?refresh=1`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`${id}: HTTP ${resp.status}`);
  return resp.json();
}

async function main() {
  const categories = [];

  for (const id of CATEGORY_IDS) {
    const data = await fetchCategory(id);
    let filteredItems = (data.items || [])
      .filter((x) => readableSummary(x.summary || ''))
      .filter((x) => !isIndiaRelated(x))
      .filter((x) => !isUSPolitics(x))
      .map((x) => ({
        ...x,
        titleZh: polishTitleZh(x.titleZh || x.title || ''),
        summary: normalizeSummaryTo23Sentences(x.summary || ''),
      }));

    // 媒体头条：严格白名单来源
    if (id === 'media') {
      filteredItems = filteredItems.filter((x) => isWhitelistSource(x));
    }

    const deduped = dedupeItems(filteredItems);
    const prioritized = deduped.sort((a, b) => Number(isWhitelistSource(b)) - Number(isWhitelistSource(a)));
    const balanced = rebalanceByTopic(prioritized, FIXED_PER_CATEGORY);

    categories.push({
      ...data,
      items: balanced,
      updatedAt: Date.now(),
    });
  }

  // cross-category dedupe by link+title
  const globalSeen = new Set();
  for (const cat of categories) {
    cat.items = cat.items.filter((item) => {
      const key = `${item.link || ''}::${clean(item.titleZh || item.title || '')}`.toLowerCase();
      if (globalSeen.has(key)) return false;
      globalSeen.add(key);
      return true;
    });
    cat.items = rebalanceByTopic(cat.items, FIXED_PER_CATEGORY);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    categories,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Saved ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
