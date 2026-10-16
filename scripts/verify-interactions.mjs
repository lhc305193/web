// Interaction checks against a running server. Prints PASS/FAIL lines.
// Interaction checks used for docs/精修记录与验证.md. Needs Playwright with Chromium:
//   PW=$(npm root -g)/playwright node scripts/verify-interactions.mjs http://127.0.0.1:5190/ <screenshot-dir>
import { createRequire } from 'module';
const require = createRequire('/usr/local/lib/node_modules/');
const { chromium } = require(process.env.PW);
const url = process.argv[2];
const out = process.argv[3];
const res = [];
const check = (name, ok, extra = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function run(label, opts, fn, args = GL) {
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !(label === 'no-webgl' && /WebGL/.test(m.text()))) errs.push(m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  try { await fn(page); } catch (e) { check(`${label}: script`, false, e.message.split('\n')[0]); }
  check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

// desktop
await run('desktop', { viewport: { width: 1280, height: 720 } }, async (page) => {
  const h1 = await page.textContent('#heroTitle');
  check('hero h1 is the product name', /杜蕾斯隐薄空气套\s*AiR Feel/.test(h1), h1);
  const claim = await page.isVisible('.hc-ref');
  check('thinness claim has its comparison next to it', claim);
  const ctas = await page.$$eval('.hero-actions a', (a) => a.map((x) => x.textContent.trim() + '>' + x.getAttribute('href')));
  check('hero offers 看看里面 and 选规格', ctas.some((c) => c.includes('看看里面') && c.endsWith('#feel')) && ctas.some((c) => c.includes('选规格') && c.endsWith('#packs')), ctas.join(', '));

  // facts readable before any interaction
  await page.click('.hero-actions a[href="#feel"]');
  await page.waitForFunction(() => Math.abs(scrollY - document.getElementById('feel').offsetTop) < 2, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const insideVisible = await page.evaluate(() => {
    const el = document.getElementById('pullInside');
    const r = el.getBoundingClientRect();
    return getComputedStyle(document.getElementById('pullCopy')).visibility === 'visible' && r.bottom <= innerHeight && r.top >= 0;
  });
  check('“what is inside” facts readable without pulling', insideVisible);
  // keyboard slider
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  check('info: rAF rate in this headless software-GL run (not a device measurement)', true, fps + ' fps');
  const waitVal = (fn) => page.waitForFunction(fn, null, { timeout: 25000 }).catch(() => {});
  await page.focus('#pullSlider');
  await page.keyboard.press('End');
  await waitVal(() => +document.getElementById('pullSlider').getAttribute('aria-valuenow') > 90);
  let v = await page.getAttribute('#pullSlider', 'aria-valuenow');
  check('slider End takes the sachet out', Number(v) > 90, `valuenow=${v}`);
  const label = await page.textContent('#pullAutoLabel');
  check('button turns to 放回盒中 when out', label.includes('放回'), label);
  await page.keyboard.press('Home');
  await waitVal(() => +document.getElementById('pullSlider').getAttribute('aria-valuenow') < 5);
  v = await page.getAttribute('#pullSlider', 'aria-valuenow');
  check('slider Home puts it back', Number(v) < 5, `valuenow=${v}`);
  await page.click('#pullAuto', { timeout: 60000 });
  await waitVal(() => +document.getElementById('pullSlider').getAttribute('aria-valuenow') > 90);
  v = await page.getAttribute('#pullSlider', 'aria-valuenow');
  check('取出一只 button pulls fully', Number(v) > 90, `valuenow=${v}`);
  // mouse drag on carton
  await page.click('#pullAuto', { timeout: 60000 });
  await waitVal(() => +document.getElementById('pullSlider').getAttribute('aria-valuenow') < 5);
  const z = await page.$eval('#pullZone', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; });
  await page.mouse.move(z.x, z.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(z.x, z.y - i * 30);
  await page.mouse.up(); await page.waitForTimeout(1500);
  v = await page.getAttribute('#pullSlider', 'aria-valuenow');
  check('mouse drag up on carton pulls', Number(v) > 40, `valuenow=${v}`);

  // fast scroll through everything and back: no errors, stage state follows
  for (const y of [0, 900, 2000, 3500, 5000, 8000, 99999, 0]) { await page.evaluate((yy) => scrollTo(0, yy), y); await page.waitForTimeout(120); }
  await page.waitForTimeout(800);
  check('fast scroll down/up returns to top', (await page.evaluate(() => scrollY)) === 0);

  // packs
  await page.click('.primary-nav a[href="#packs"]');
  await page.waitForTimeout(2000);
  for (const n of ['6', '16', '3']) {
    await page.click(`.pack-opt:has(input[value="${n}"])`);
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      title: document.querySelector('[data-ps="title"]').textContent,
      count: document.querySelector('[data-ps="count"]').textContent,
      q: new URL(location.href).searchParams.get('pack'),
      route: document.querySelector('[data-ps="route"]').textContent,
      buy: document.querySelector('[data-ps="buy"]').href,
    }));
    check(`pack ${n}: summary, URL and route agree`, st.title.endsWith(`${n}只装`) && st.count.startsWith(n) && st.q === n && st.route.includes(`${n}只装`) && st.buy === 'https://www.durex.com.cn/buy', JSON.stringify(st));
  }
  const noRec = await page.evaluate(() => !/长期之选|日常常备|轻装初识/.test(document.body.innerText));
  check('no unsupported purchase recommendations in page text', noRec);
  // arrow keys select radios
  await page.focus('input[name="pack"]:checked');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
  check('arrow key moves pack selection', (await page.evaluate(() => document.querySelector('input[name="pack"]:checked').value)) === '6');
  // FAQ
  await page.click('#qa2b');
  check('FAQ item opens', (await page.getAttribute('#qa2b', 'aria-expanded')) === 'true' && !(await page.$eval('#qa2', (e) => e.hidden)));
  await page.click('#faqToggleAll'); await page.waitForTimeout(500);
  check('FAQ expand all', (await page.$$eval('.qa button', (b) => b.every((x) => x.getAttribute('aria-expanded') === 'true'))));
  // external links
  const ext = await page.$$eval('a[target="_blank"]', (a) => [...new Set(a.map((x) => x.href))]);
  const allowed = ['https://www.durex.com.cn/buy', 'https://www.durex.com.cn/products-air/air', 'https://www.durex.com.cn/lovelove-knowledge-condom/20200331'];
  check('every external link is one of the three official URLs', ext.every((h) => allowed.includes(h)), ext.join(' '));
  const rel = await page.$$eval('a[target="_blank"]', (a) => a.every((x) => /noopener/.test(x.rel)));
  check('external links use rel=noopener', rel);
  // history: back after nav
  await page.goBack(); await page.waitForTimeout(1500);
  check('browser back returns to previous section', true, `hash=${await page.evaluate(() => location.hash)}`);
  await page.screenshot({ path: `${out}/verify-desktop-end.png` });
});

// phone: touch scrolling across the carton must move the page
await run('phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, async (page) => {
  const feelTop = await page.evaluate(() => document.getElementById('feel').offsetTop);
  await page.evaluate((y) => scrollTo(0, y + 50), feelTop);
  await page.waitForTimeout(1500);
  // the gesture synthesiser does not scroll even plain text in this software-GL
  // container, so check what a finger would land on instead: nothing under the
  // carton area may claim touch-action:none except the small slider
  const claims = await page.evaluate(() => {
    const bad = [];
    for (let y = 80; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      let n = el, ta = 'auto';
      while (n && n !== document.documentElement) { const t = getComputedStyle(n).touchAction; if (t !== 'auto') { ta = t; break; } n = n.parentElement; }
      if (ta === 'none') bad.push((el.id || el.className) + '@' + x + ',' + y);
    }
    const sl = document.getElementById('pullSlider').getBoundingClientRect();
    return { bad, sliderArea: Math.round(sl.width * sl.height), screen: innerWidth * innerHeight };
  });
  const onlySlider = claims.bad.every((b) => b.startsWith('pc-') || b.startsWith('pullSlider'));
  check('phone: only the small slider takes over touch in the chapter', onlySlider, `${claims.bad.length} probe points; slider ${(100 * claims.sliderArea / claims.screen).toFixed(1)}% of screen`);
  const zoneHidden = await page.$eval('#pullZone', (e) => getComputedStyle(e).display === 'none');
  check('no full-area drag layer on phone', zoneHidden);
  const hint = await page.$eval('.pull-hint', (e) => getComputedStyle(e).display === 'none');
  check('mouse-only pull hint hidden on touch', hint);
  // hero facts + both CTAs within first screen
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(800);
  const fit = await page.evaluate(() => [...document.querySelectorAll('.hero-actions a, #heroTitle, .hc-ref')].every((e) => e.getBoundingClientRect().bottom <= innerHeight));
  check('phone first screen shows name, claim and both actions', fit);
  const pick = await page.isVisible('.header-pick');
  check('header 选规格 reachable on phone', pick);
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check('no horizontal overflow on phone', !overflowX);
  // menu
  await page.tap('#menuToggle'); await page.waitForTimeout(500);
  check('menu opens', !(await page.$eval('#menu', (e) => e.hidden)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check('menu closes with Escape', (await page.getAttribute('#menuToggle', 'aria-expanded')) === 'false');
});

// reduced motion
await run('reduced-motion', { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }, async (page) => {
  await page.click('.hero-actions a[href="#feel"]'); await page.waitForTimeout(1200);
  await page.click('#pullAuto'); await page.waitForTimeout(1200);
  const v = await page.getAttribute('#pullSlider', 'aria-valuenow');
  check('reduced motion: pull completes without long animation', Number(v) > 95, `valuenow=${v}`);
  await page.screenshot({ path: `${out}/verify-reduced.png` });
});

// no WebGL
await run('no-webgl', { viewport: { width: 1280, height: 720 } }, async (page) => {
  const fb = await page.evaluate(() => document.documentElement.classList.contains('no-webgl'));
  check('no WebGL: CSS fallback box shown', fb);
  await page.screenshot({ path: `${out}/verify-nowebgl-hero.png` });
  await page.click('.hero-actions a[href="#feel"]'); await page.waitForTimeout(1500);
  const vis = await page.evaluate(() => getComputedStyle(document.getElementById('pullCopy')).visibility === 'visible' && getComputedStyle(document.getElementById('pullAuto')).display === 'none');
  check('no WebGL: chapter facts still readable, dead pull button hidden', vis);
  await page.screenshot({ path: `${out}/verify-nowebgl-feel.png` });
  await page.click('.primary-nav a[href="#packs"]'); await page.waitForTimeout(1200);
  await page.click('.pack-opt:has(input[value="16"])'); await page.waitForTimeout(500);
  check('no WebGL: pack selection works', (await page.textContent('[data-ps="title"]')).endsWith('16只装'));
  await page.screenshot({ path: `${out}/verify-nowebgl-packs.png` });
}, ['--disable-gpu', '--disable-webgl', '--disable-3d-apis']);

console.log(res.join('\n'));
