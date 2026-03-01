#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const BASE = process.env.WEBAPP_BASE_URL || 'https://newsintel.noetex.ai';
const OUT = process.env.HOME_DIGEST_OUT || path.join(__dirname, '..', 'data', 'home-latest.json');

const CATEGORY_IDS = ['media', 'research', 'trends'];
const TOPICS = ['ai', 'neuro', 'life'];
const FIXED_PER_CATEGORY = 6;
const FIXED_PER_TOPIC = 2;

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
  if (t.length < 28 || t.length > 260) return false;
  return true;
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
    const filteredItems = (data.items || [])
      .filter((x) => readableSummary(x.summary || ''))
      .filter((x) => !isIndiaRelated(x))
      .map((x) => ({ ...x, summary: clean(x.summary || '') }));

    const deduped = dedupeItems(filteredItems);
    const balanced = rebalanceByTopic(deduped, FIXED_PER_CATEGORY);

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
