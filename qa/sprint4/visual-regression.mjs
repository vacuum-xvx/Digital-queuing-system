import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/sprint4-browser/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const base = process.env.UI_BASE_URL || 'http://localhost:5173';
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(base);
    await page.getByText('Добро пожаловать', { exact: true }).waitFor();
    assert.equal(await page.getByText('Добро пожаловать', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
    const sound = page.getByRole('button', { name: /ключить звук/ });
    assert.equal(await sound.evaluate(el => getComputedStyle(el).color === getComputedStyle(el.querySelector('span')).color), true);
    await page.locator('button[aria-controls="a11y-settings"]').click();
    await page.locator('#a11y-settings').getByRole('button', { name: 'ВЫКЛ', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.classList.contains('a11y-contrast')));
    const active = page.locator('#a11y-settings').getByRole('button', { name: 'ВКЛЮЧЕН', exact: true });
    assert.equal(await active.getAttribute('aria-pressed'), 'true');
    assert(await page.evaluate(() => [...document.querySelectorAll('.main-product-header button')].filter(el => el.getBoundingClientRect().width).every(el => el.getBoundingClientRect().right <= innerWidth + 1)));
    await page.screenshot({ path: `/tmp/queue-a11y-${width}.png`, fullPage: true });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route('**/api/v1/branches/*/tv', route => route.fulfill({ json: { windows: [{ number: 12, status: 'OPEN', currentTicketNumber: 'Q-123456' }], queue: [] } }));
  await page.goto(`${base}/tv?branchId=test`);
  const ticket = page.locator('.tv-call-ticket');
  await ticket.waitFor();
  assert.equal(await ticket.evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
  assert(await ticket.evaluate(el => el.scrollWidth <= el.closest('.tv-call-card').clientWidth));
  await page.screenshot({ path: '/tmp/queue-tv.png' });
  console.log('PASS: welcome, sound, accessibility at 390/1440px; TV single-line ticket at 1920px');
} finally { await browser.close(); }