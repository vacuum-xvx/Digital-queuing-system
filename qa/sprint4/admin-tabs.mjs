import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/sprint4-browser/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { id: 'admin', email: 'admin@example.test', role: 'opc_chief' } }));
  await page.route('**/api/v1/branches', route => route.fulfill({ json: { items: [{ id: 'test', name: 'Тестовое отделение' }] } }));
  await page.route('**/api/v1/admin/branches/test/overview', route => route.fulfill({ json: {
    branchId: 'test', branchName: 'Тестовое отделение', priorities: [], anomalies: [],
    windows: [{ id: '1', number: 1, status: 'OPEN', servedTodayCount: 0 }],
    queue: [1, 2].map(n => ({ id: String(n), publicNumber: `Q-00000${n}`, status: 'WAITING', source: 'QR', serviceName: 'Посылки', waitTimeMinutes: 3, queueEnteredAt: new Date().toISOString() })),
  } }));
  await page.route('**/api/v1/admin/branches/test/anomalies?*', route => route.fulfill({ status: 500, json: { error: { message: 'Test failure' } } }));
  await page.route('**/api/v1/admin/users?*', route => {
    const query = new URL(route.request().url()).searchParams;
    const limit = Number(query.get('limit'));
    const offset = Number(query.get('offset'));
    const total = query.get('search') ? 1 : 63;
    return route.fulfill({ json: {
      items: Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
        id: String(offset + i), email: `user${offset + i}@example.test`, role: 'client',
      })), total, limit, offset,
      counts: { all: total, client: total, employee: 0, opc_chief: 0, terminal: 0 },
    } });
  });
  await page.goto(`${process.env.UI_BASE_URL || 'http://localhost:5173'}/admin`);
  await page.getByRole('button', { name: 'Аномалии', exact: true }).click();
  await page.getByText('Не удалось загрузить журнал аномалий', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Очередь \(Live\)/ }).click();
  const board = page.locator('.live-queue-board');
  await board.waitFor();
  assert.equal(await page.getByText('Не удалось загрузить журнал аномалий', { exact: true }).count(), 0);
  assert.equal(await board.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  const ticket = board.getByText('Q-000002', { exact: true });
  assert.equal(await ticket.evaluate(el => getComputedStyle(el).color), 'rgb(15, 23, 42)');
  await page.screenshot({ path: '/tmp/admin-live-board-fixed.png', fullPage: true });
  await page.getByRole('button', { name: 'Пользователи', exact: true }).click();
  await page.getByRole('heading', { name: 'Управление доступом сотрудников (IAM)' }).waitFor();
  await page.getByText('1–25 из 63', { exact: true }).waitFor();
  const size = page.getByLabel('Записей на странице:');
  assert.equal(await size.inputValue(), '25');
  await page.getByRole('button', { name: 'Следующая страница' }).click();
  await page.getByText('26–50 из 63', { exact: true }).waitFor();
  for (const value of ['10', '50', '25']) {
    await size.selectOption(value);
    await page.getByText(`1–${value} из 63`, { exact: true }).waitFor();
    await page.waitForFunction(expected => document.querySelectorAll('tbody tr').length === expected, Number(value));
  }
  await page.getByRole('button', { name: 'Следующая страница' }).click();
  await page.getByText('26–50 из 63', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Поиск по пользователям' }).fill('user');
  await page.getByText('1–1 из 1', { exact: true }).waitFor();
  await size.selectOption('10');
  await page.getByText('1–1 из 1', { exact: true }).waitFor();
  assert.equal(await page.getByText(/NaN/).count(), 0);
  assert.equal(await page.getByText('Не удалось загрузить журнал аномалий', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: anomaly error isolated, white board and dark tickets, no NaN');
} finally { await browser.close(); }