#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const BASE = process.env.WEBAPP_BASE_URL || 'https://newsintel.noetex.ai';
const TOKEN = process.env.ADMIN_PUBLISH_TOKEN || '';
const FILE = process.env.HOME_DIGEST_FILE || path.join(__dirname, '..', 'data', 'home-latest.json');

async function main() {
  if (!TOKEN) throw new Error('Missing ADMIN_PUBLISH_TOKEN');

  const raw = await fs.readFile(FILE, 'utf8');
  const payload = JSON.parse(raw);

  const resp = await fetch(`${BASE}/api/admin/publish-home`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': TOKEN,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Publish failed: HTTP ${resp.status} ${text}`);
  }

  console.log(text);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
