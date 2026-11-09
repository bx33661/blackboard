#!/usr/bin/env node
// Renders the 1200×630 social preview images (public/og-zh.png, public/og-en.png) with the local Chrome.
//   node site/scripts/og.mjs        (needs the stage stills from capture.mjs)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const nm = (p) => pathToFileURL(path.join(SITE, 'node_modules', p)).href;
const pub = (p) => pathToFileURL(path.join(SITE, 'public', p)).href;

const COPY = {
  zh: { tag: 'Agent 的外置记忆与可视化工作台', sub: '上下文压缩、断线或换会话之后，从同一份现场接着做。', meta: ['零运行时依赖', 'MIT 开源', '数据留在本机'] },
  en: { tag: 'External memory for AI agents, made visible', sub: 'After compaction, a dropped connection or a new session — pick up right where you left off.', meta: ['Zero dependencies', 'MIT licensed', 'Data stays local'] },
};

const html = (lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face { font-family: Serif; src: url(${nm('@fontsource-variable/source-serif-4/files/source-serif-4-latin-opsz-normal.woff2')}) format('woff2'); font-weight: 200 900; }
@font-face { font-family: Sans; src: url(${nm('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #fbfaf6; color: #2c2f2b; font-family: Sans, "PingFang SC", sans-serif; position: relative; }
.grid { position: absolute; inset: 0; background-image: radial-gradient(rgba(44,47,43,.14) 1px, transparent 1px); background-size: 24px 24px;
  -webkit-mask-image: radial-gradient(ellipse 60% 70% at 20% 30%, #000 20%, transparent 75%); }
.glow { position: absolute; right: -120px; bottom: -160px; width: 760px; height: 560px; background: radial-gradient(closest-side, rgba(20,116,83,.22), transparent); filter: blur(20px); }
.copy { position: absolute; left: 72px; top: 76px; width: 640px; }
.brand { display: flex; align-items: center; gap: 12px; font: 600 22px Serif; color: #2c2f2b; }
.brand img { width: 34px; height: 34px; }
h1 { margin-top: 60px; display: flex; align-items: baseline; gap: 12px; white-space: nowrap; font: 600 92px/1 Serif, "Songti SC", serif; letter-spacing: -4px; font-variation-settings: "opsz" 60; }
h1 .dot { flex: none; width: 13px; height: 13px; border-radius: 50%; background: #147453; transform: translateY(-56px); box-shadow: 0 0 0 7px rgba(20,116,83,.12); }
h1 .cjk { font-family: "Songti SC", "Noto Serif SC", serif; font-weight: 900; letter-spacing: 0; }
.tag { margin-top: 28px; font: 600 28px/1.35 Serif, "Songti SC", serif; color: #2c2f2b; }
.sub { margin-top: 14px; font: 400 21px/1.55 Sans, "PingFang SC", sans-serif; color: #61645c; max-width: 600px; }
.meta { position: absolute; left: 72px; bottom: 56px; display: flex; gap: 10px; }
.meta span { font: 500 16px Sans, "PingFang SC", sans-serif; color: #147453; padding: 7px 14px; border-radius: 999px; background: rgba(20,116,83,.08); border: 1px solid rgba(20,116,83,.18); }
.shot { position: absolute; left: 740px; top: 92px; width: 760px; border-radius: 16px; overflow: hidden; border: 1px solid rgba(44,47,43,.14);
  box-shadow: 0 30px 80px -20px rgba(30,40,30,.35), 0 0 0 8px rgba(255,255,255,.6); transform: perspective(1600px) rotateY(-14deg) rotateX(4deg); transform-origin: left center; }
.bar { height: 30px; background: #f3f1ea; border-bottom: 1px solid rgba(44,47,43,.1); display: flex; align-items: center; gap: 7px; padding-left: 14px; }
.bar i { width: 10px; height: 10px; border-radius: 50%; background: #ec6a5e; } .bar i:nth-child(2) { background: #f4bf4f; } .bar i:nth-child(3) { background: #61c554; }
.shot img { display: block; width: 100%; }
</style></head><body>
<div class="grid"></div><div class="glow"></div>
<div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="${pub(`shots/stage-context-${lang}-light.webp`)}"></div>
<div class="copy">
  <div class="brand"><img src="${pub('mark.svg')}">blackboard</div>
  <h1><span>blackboard</span><span class="dot"></span>${lang === 'zh' ? '<span class="cjk">黑板</span>' : ''}</h1>
  <p class="tag">${COPY[lang].tag}</p>
  <p class="sub">${COPY[lang].sub}</p>
</div>
<div class="meta">${COPY[lang].meta.map((m) => `<span>${m}</span>`).join('')}</div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
for (const lang of ['zh', 'en']) {
  const file = path.join(HERE, `.og-${lang}.html`);
  fs.writeFileSync(file, html(lang));
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(SITE, 'public', `og-${lang}.png`), type: 'png' });
  fs.rmSync(file);
  await page.close();
  console.log(`saved public/og-${lang}.png`);
}
await browser.close();
