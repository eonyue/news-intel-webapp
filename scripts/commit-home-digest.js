#!/usr/bin/env node

const { execSync } = require('child_process');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

try {
  run('git add data/home-latest.json');
  try {
    execSync('git diff --cached --quiet', { stdio: 'ignore' });
    console.log('No digest changes to commit.');
    process.exit(0);
  } catch {
    // has changes
  }

  run('git config user.name "news-intel-bot"');
  run('git config user.email "news-intel-bot@users.noreply.github.com"');
  run('git commit -m "chore: auto update home digest"');
  run('git push origin main');
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
