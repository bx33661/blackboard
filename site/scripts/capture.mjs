#!/usr/bin/env node
// Captures real workspace UI from the exported demo board for the feature section.
//   1. node site/scripts/make-demo.mjs        (exports site/public/demo/board.html)
//   2. npm --prefix site run dev               (serves it on :5180)
//   3. node site/scripts/capture.mjs [baseUrl]
// Uses the locally installed Chrome; every image is the actual product, light and dark.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'public', 'shots');
const BASE = process.argv[2] || 'http://localhost:5180';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--lang=zh-CN', '--hide-scrollbars'] });

const LABEL = {
  zh: { inspector: '节点详情', history: '节点历史', fit: '适应画布', agent: 'Agent 视角', digest: '现场摘要', layout: '正在排版' },
  en: { inspector: 'Node details', history: 'Node history', fit: 'Fit to screen', agent: 'Agent view', digest: 'Context digest', layout: 'Laying out' },
};

async function open(lang, theme, query) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((t, l) => {
    localStorage.setItem('blackboard-theme-v3', t);
    localStorage.setItem('blackboard-pref-locale', JSON.stringify(l));
  }, theme, lang === 'zh' ? 'zh-CN' : 'en');
  await page.goto(`${BASE}/demo/board-${lang}.html?${query}`, { waitUntil: 'networkidle0' });
  // Wait for the layout worker to finish and entrance animations to settle.
  await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout: 15000 }, LABEL[lang].layout);
  await sleep(1200);
  return page;
}

const clipOf = (page, selector, pad = 0) => page.$eval(selector, (el, p) => {
  const r = el.getBoundingClientRect();
  return { x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 };
}, pad);

async function save(page, name, clip) {
  await page.screenshot({ path: path.join(OUT, `${name}.webp`), type: 'webp', quality: 90, clip, captureBeyondViewport: false });
  console.log('saved', name);
}

for (const lang of ['zh', 'en']) for (const theme of ['light', 'dark']) {
  const L = LABEL[lang];
  const name = (n) => `${n}-${lang}-${theme}`;
  // Inspector: independent fields and explicit relations of one finding (offline snapshots carry no history).
  {
    const page = await open(lang, theme, 'view=context&node=fd1');
    const box = await clipOf(page, `aside[aria-label="${L.inspector}"]`);
    const stop = await page.$eval(`section[aria-label="${L.history}"]`, (el) => el.getBoundingClientRect().top);
    await save(page, name('inspector'), { ...box, height: stop - box.y - 4 });
    await page.close();
  }
  // Agent perspectives: the research Agent's own cursor and the perspective menu.
  {
    const page = await open(lang, theme, 'view=context&agent=agent:research');
    await page.click(`button[aria-label="${L.fit}"]`);
    await sleep(900);
    await page.click(`button[aria-label="${L.agent}"]`);
    await sleep(500);
    await save(page, name('agents'), { x: 256, y: 0, width: 1024, height: 680 });
    await page.close();
  }
  // Digest: what a resumed session reads back.
  {
    const page = await open(lang, theme, 'view=context');
    await page.click(`button[aria-label="${L.digest}"]`);
    await page.waitForSelector('[role="dialog"]');
    await sleep(700);
    await save(page, name('digest'), await clipOf(page, '[role="dialog"]'));
    await page.close();
  }
  // Stage stills: what the workspace window shows before the reader opens the live one.
  for (const [view, query] of [['context', 'view=context'], ['logic', 'view=logic'], ['all', 'view=all'], ['notes', 'page=notes']]) {
    const page = await open(lang, theme, query);
    if (view !== 'notes') { await page.click(`button[aria-label="${L.fit}"]`); await sleep(900); }
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, `stage-${view}-${lang}-${theme}.webp`), type: 'webp', quality: 86 });
    console.log('saved', `stage-${view}-${lang}-${theme}`);
    await page.close();
  }
  // Field notes: the readable, exportable notebook.
  {
    const page = await open(lang, theme, 'page=notes');
    await save(page, name('notes'), { x: 0, y: 48, width: 1280, height: 640 });
    await page.close();
  }
}
await browser.close();
