#!/usr/bin/env node
// Render the editable identity board after updating its outlined logo artwork.
// Requires the site's development dependencies and a local Chrome installation.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../site/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const directory = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1241, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(directory, 'pinwhy-identity.svg')).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(directory, 'pinwhy-identity.png'), type: 'png' });
} finally {
  await browser.close();
}
