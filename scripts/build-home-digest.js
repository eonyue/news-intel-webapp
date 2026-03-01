#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const BASE = process.env.WEBAPP_BASE_URL || 'https://newsintel.noetex.ai';
const OUT = process.env.HOME_DIGEST_OUT || path.join(__dirname, '..', 'data', 'home-latest.json');

const CATEGORY_IDS = ['media', 'research', 'trends'];

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
      .map((x) => ({ ...x, summary: clean(x.summary || '') }));

    categories.push({
      ...data,
      items: dedupeItems(filteredItems),
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
