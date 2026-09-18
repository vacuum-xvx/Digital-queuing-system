// Run with Playwright installed outside the repository (see README).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/sprint4-browser/node_modules/playwright/index.mjs');
const baseURL = process.env.UI_BASE_URL || 'http://localhost:5173';
const branch = '11111111-1111-1111-1111-111111111111';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/snap/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
const contexts = [];
async function context(zone='UTC') {
  const value = await browser.newContext({ timezoneId: zone, viewport: { width:390,height:844 } });
  value.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  contexts.push(value);
  return value;
}
async function overflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile horizontal overflow');
}
async function login(page, area, email, password) {
  await page.goto(`${baseURL}/${area}/login`);
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact:true }).fill(password);
  await page.getByRole('button', { name:'Войти', exact:true }).click();
  await page.getByRole('link', { name:'Открыть рабочее место' }).click();
  await page.getByRole('button', { name:'Выйти', exact:true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name:'Выйти', exact:true }).waitFor();
}
try {
  const clientContext = await context('America/New_York');
  const client = await clientContext.newPage();
  let creations = 0;
  client.on('request', req => { if (req.method()==='POST' && /tickets\/qr$/.test(req.url())) creations++; });
  await client.goto(`${baseURL}/q/invalid`);
  await client.getByRole('heading',{name:'Отделение не найдено'}).waitFor();
  assert.equal(creations,0);
  await client.goto(`${baseURL}/q/${branch}`);
  await client.getByRole('heading',{name:'Выберите услугу'}).waitFor();
  assert.equal(creations,0);
  await client.getByRole('button',{name:/Посылки/}).click();
  assert.equal(creations,0);
  const response = client.waitForResponse(res => /tickets\/qr$/.test(res.url()) && res.request().method()==='POST');
  await client.getByRole('button',{name:'Получить талон',exact:true}).click();
  const ticket = await (await response).json();
  assert.match(ticket.publicNumber,/^Q-/);
  await client.getByText(/Ожидание примерно/).waitFor();
  await client.reload();
  await client.getByRole('button',{name:/Мои талоны/}).click();
  await client.getByText(ticket.publicNumber,{exact:true}).waitFor();
  await overflow(client);
  const operator = await (await context()).newPage();
  await login(operator,'operator',process.env.QA_OPERATOR_EMAIL || 'operator@pochta.local',process.env.QA_OPERATOR_PASSWORD);
  await operator.getByLabel('Окно',{exact:true}).selectOption('33333333-3333-3333-3333-333333333333');
  await operator.getByRole('button',{name:'Вызвать следующего',exact:true}).click();
  await operator.getByText(ticket.publicNumber,{exact:true}).waitFor();
  await client.getByText('Вас вызывают',{exact:true}).waitFor();
  assert.equal(await client.getByText(/Ожидание примерно/).count(),0);
  await operator.getByRole('button',{name:'Начать обслуживание',exact:true}).click();
  await operator.getByRole('button',{name:'Завершить обслуживание',exact:true}).click();
  await client.getByText('Обслуживание завершено',{exact:true}).waitFor();
  await overflow(operator);
  await operator.reload();
  await operator.getByRole('heading',{name:'Нет активного талона'}).waitFor();
  assert.equal(await operator.getByLabel('Окно',{exact:true}).inputValue(),'33333333-3333-3333-3333-333333333333');
  await operator.getByRole('button',{name:'Выдать LIVE-талон'}).click();
  await operator.getByText(/Выдан талон L-/).waitFor();
  await operator.getByRole('button',{name:'Вызвать следующего',exact:true}).click();
  await operator.getByRole('button',{name:'Не явился',exact:true}).click();
  await operator.getByRole('heading',{name:'Нет активного талона'}).waitFor();
  await operator.getByRole('button',{name:'Выйти',exact:true}).click();
  await operator.getByRole('button',{name:'Войти',exact:true}).waitFor();
  const admin = await (await context()).newPage();
  await login(admin,'admin',process.env.QA_CHIEF_EMAIL || 'admin@pochta.local',process.env.QA_CHIEF_PASSWORD);
  await admin.getByRole('heading',{name:'QR-код отделения'}).waitFor();
  await admin.getByRole('img',{name:/QR-код для получения/}).waitFor();
  await overflow(admin);
  await admin.getByRole('button',{name:'Выйти',exact:true}).click();
  for (const zone of ['UTC','Europe/Berlin','America/New_York']) {
    const page = await (await context(zone)).newPage();
    await page.goto(baseURL);
    await page.getByRole('button',{name:/Записаться онлайн/}).click();
    await page.getByRole('button',{name:/Демо-отделение/}).click();
    await page.getByRole('button',{name:/Посылки/}).click();
    const civil = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000))+'T14:30';
    await page.getByLabel('Дата и время (МСК)',{exact:true}).fill(civil);
    const appointmentResponse = page.waitForResponse(res => /tickets\/appointment$/.test(res.url()) && res.request().method()==='POST');
    await page.getByRole('button',{name:'Подтвердить запись'}).click();
    const appointment = await (await appointmentResponse).json();
    assert.equal(new Date(appointment.scheduledAt).toISOString(),civil.slice(0,10)+'T11:30:00.000Z');
    await page.getByText(/14:30.*МСК/).waitFor();
    await page.reload();
    await page.getByRole('button',{name:/Мои талоны/}).click();
    await page.getByText(/14:30.*МСК/).waitFor();
    await page.getByRole('button',{name:'Я уже в отделении'}).click();
    await page.getByText(/прибытие отмечено/).waitFor();
    await page.getByRole('button',{name:'Отменить запись'}).click();
    await overflow(page);
  }
  const demo = await (await context()).newPage();
  await demo.goto(baseURL+'/demo');
  await demo.getByText(/Демонстрационный режим: часть показателей моделируется/).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Browser: PASS; real QR → Operator → Client, LIVE/NO_SHOW, auth restore/logout, Admin QR, appointment in 3 timezones, mobile, demo separation');
} finally {
  await Promise.all(contexts.map(ctx=>ctx.close()));
  await browser.close();
}
