#!/usr/bin/env node
// Copyright (c) 2026 Enrique Rocha (@soyenriquerocha)
// SPDX-License-Identifier: MIT
// id: er-67c88ab3
/**
 * Renders the README hero banner to 4 PNGs.
 *
 *   npm run hero              # render all four
 *   npm run hero -- --chrome  # force system Chrome
 *
 * Deterministic by construction:
 *   - exact-pinned Tailwind + font URLs
 *   - integer deviceScaleFactor (fractional makes 1px hairlines platform-dependent)
 *   - srgb color profile, hinting off, subpixel positioning off
 *   - the screenshot is gated on Tailwind flush AND webfont load, never on a timeout
 *   - layout overflow is asserted, so a too-long Spanish string fails loudly
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT  = path.resolve(HERE, '..');            // docs/assets
const W = 1280, H = 640, DSF = 2;
const BUDGET_WARN = 400_000, BUDGET_FAIL = 600_000;

const VARIANTS = [
  { lang: 'en', theme: 'light', file: 'hero-en-light.png' },
  { lang: 'en', theme: 'dark',  file: 'hero-en-dark.png'  },
  { lang: 'es', theme: 'light', file: 'hero-es-light.png' },
  { lang: 'es', theme: 'dark',  file: 'hero-es-dark.png'  },
];

// Every face we actually paint. If one is missing at shot time we throw.
const FACES = [
  '700 106px Fraunces', '600 106px Fraunces',
  '800 24px Archivo', '600 12px Archivo',
  '400 11px "JetBrains Mono"', '500 12px "JetBrains Mono"',
];
// Passed to document.fonts.load() so the right unicode-range subset is fetched.
// Google serves latin / latin-ext as separate @font-face with unicode-range; a
// subset is only downloaded once a matching codepoint is painted.
const GLYPHS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;$&/-·¿?©’›áéíóúñÁÉÍÓÚÑ';

/* ---------- static server (no deps, avoids a file:// origin) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
               '.png': 'image/png', '.svg': 'image/svg+xml' };
async function serve(root) {
  const srv = createServer(async (req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = path.normalize(path.join(root, p === '/' ? '/hero.html' : p));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const buf = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
                           'cache-control': 'no-store' });
      res.end(buf);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, port: srv.address().port };
}

/* ---------- playwright resolution ladder ----------
   playwright-core ships as CJS, so an ESM import can land the real API on
   `.default` instead of the top level. normalize() unwraps that. */
function normalize(m) {
  if (m?.chromium?.launch) return m;
  if (m?.default?.chromium?.launch) return m.default;
  return null;
}
async function loadPw() {
  const tried = [];
  for (const id of ['playwright', 'playwright-core']) {
    try { const n = normalize(await import(id)); if (n) return n; tried.push(`${id} (no chromium export)`); }
    catch { tried.push(`${id} (not resolvable)`); }
  }
  try {
    const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
    for (const rel of ['@playwright/cli/node_modules/playwright/index.js',
                       '@playwright/cli/node_modules/playwright-core/index.js']) {
      try {
        const n = normalize(await import('file://' + path.join(g, rel)));
        if (n) return n;
      } catch { tried.push(`global ${rel}`); }
    }
  } catch {}
  console.error(
    'Playwright not found. Tried: ' + tried.join(', ') + '\n' +
    '  npm i -D playwright && npx playwright install chromium\n' +
    'or install @playwright/cli globally, or re-run with --chrome to use system Chrome.');
  process.exit(1);
}

const ARGS = [
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--disable-font-subpixel-positioning',
  '--disable-lcd-text',
  '--hide-scrollbars',
];

/* ---------- the gate: this is the whole ballgame ---------- */
async function waitPainted(page) {
  // (1) Tailwind's browser JIT has flushed: a utility no UA stylesheet produces.
  await page.waitForFunction(() => {
    const s = document.getElementById('tw-sentinel');
    return !!s && getComputedStyle(s).paddingLeft === '37px';
  }, null, { timeout: 30_000 });

  // (2) Force every face to load WITH the glyphs we paint, then let the set settle.
  await page.evaluate(async ({ faces, glyphs }) => {
    await Promise.all(faces.map(f => document.fonts.load(f, glyphs).catch(() => {})));
    await document.fonts.ready;
  }, { faces: FACES, glyphs: GLYPHS });

  // (3) Assert. Never ship a Georgia-fallback hero silently.
  const missing = await page.evaluate(f => f.filter(x => !document.fonts.check(x)), FACES);
  if (missing.length) throw new Error(`webfonts not loaded: ${missing.join(' | ')}`);

  // (4) Layout assertions — catches a too-long Spanish string before it ships.
  const bad = await page.evaluate(() => {
    const out = [];
    const hero = document.getElementById('hero').getBoundingClientRect();
    if (Math.round(hero.width) !== 1280 || Math.round(hero.height) !== 640)
      out.push(`hero is ${Math.round(hero.width)}x${Math.round(hero.height)}, expected 1280x640`);
    for (const id of ['hero-h1', 'caption', 'chip', 'rail']) {
      const el = document.getElementById(id);
      // Horizontal stays strict: this is the guard that catches a long ES string.
      if (el.scrollWidth > el.clientWidth + 1) out.push(`#${id} overflows by ${el.scrollWidth - el.clientWidth}px`);
      // Vertical gets a half-line tolerance. Tight leading (h1 is line-height 1.05)
      // makes the em box exceed the content box by a few px with no clipping. Half a
      // line still catches the thing we care about — an unplanned extra wrapped line.
      const tol = parseFloat(getComputedStyle(el).lineHeight) * 0.5 || 8;
      if (el.scrollHeight > el.clientHeight + tol)
        out.push(`#${id} overflows vertically by ${el.scrollHeight - el.clientHeight}px (tolerance ${Math.round(tol)}px) — likely an extra wrapped line`);
    }
    if (document.documentElement.scrollWidth > 1280) out.push('page scrolls horizontally');
    return out;
  });
  if (bad.length) throw new Error('layout: ' + bad.join('; '));

  // (5) Two frames so the final layout is committed to the compositor.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/* ---------- main ---------- */
const pw = await loadPw();
const { srv, port } = await serve(HERE);
const useChrome = process.argv.includes('--chrome');

let browser;
try {
  browser = await pw.chromium.launch({ args: ARGS, ...(useChrome ? { channel: 'chrome' } : {}) });
} catch (e) {
  if (useChrome) throw e;
  console.warn('bundled Chromium unavailable, falling back to system Chrome...');
  browser = await pw.chromium.launch({ args: ARGS, channel: 'chrome' });
}

let failed = false;
for (const v of VARIANTS) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: DSF,
    colorScheme: v.theme,
    reducedMotion: 'reduce',
    locale: v.lang === 'es' ? 'es-MX' : 'en-US',
    timezoneId: 'UTC',
  });
  const page = await ctx.newPage();
  page.on('console', m => m.type() === 'error' && console.warn(`  console: ${m.text()}`));
  page.on('requestfailed', r => console.warn(`  request failed: ${r.url()}`));

  await page.goto(`http://127.0.0.1:${port}/hero.html?lang=${v.lang}&theme=${v.theme}`,
                  { waitUntil: 'networkidle', timeout: 45_000 });
  await waitPainted(page);

  const dest = path.join(OUT, v.file);
  await page.locator('#hero').screenshot({
    path: dest, type: 'png', scale: 'device', animations: 'disabled', caret: 'hide',
  });
  await ctx.close();

  const { size } = await stat(dest);
  const kb = Math.round(size / 1024);
  const flag = size > BUDGET_FAIL ? 'OVER CEILING' : size > BUDGET_WARN ? 'over budget' : 'ok';
  if (size > BUDGET_FAIL) failed = true;
  console.log(`${v.file.padEnd(22)} ${W * DSF}x${H * DSF}  ${String(kb).padStart(4)} KB  ${flag}`);
}

await browser.close();
srv.close();
if (failed) {
  console.error('\nOne or more PNGs exceed 600 KB. Either:\n' +
    '  brew install oxipng && oxipng -o 4 --strip safe docs/assets/hero-*.png\n' +
    '  or drop the viewport to 1200x480 in this file.');
  process.exit(1);
}
console.log('\nDone. Bump the ?v= query in README.md and README.es.md so GitHub camo re-fetches.');
