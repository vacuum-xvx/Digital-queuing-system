import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTS(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}

test('Moscow civil input and display are independent of host timezone', async () => {
  const time = await loadTS('../src/utils/time.ts');
  const saved = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Europe/Berlin', 'America/New_York']) {
      process.env.TZ = zone;
      assert.equal(time.parseMoscowDatetimeLocal('2026-09-18T09:30'), '2026-09-18T06:30:00.000Z');
      assert.equal(time.toMoscowDatetimeLocal(new Date('2026-09-18T23:30:00Z')), '2026-09-19T02:30');
      assert.match(time.formatMoscowDateTime('2026-09-18T23:30:00Z'), /19\.09\.2026.*02:30/);
      assert.match(time.formatMoscowTime('2026-09-18T06:30:00Z', { timeZone: zone }), /09:30/);
      assert.throws(() => time.parseMoscowDatetimeLocal('2026-02-30T09:30'));
    }
  } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
});

test('announcement reset cancels pending work without overlapping current speech', async () => {
  const { enqueueAnnouncement, clearAnnouncementQueue } = await loadTS('../src/utils/announcementQueue.ts');
  const order = [];
  let finish;
  enqueueAnnouncement(() => new Promise(resolve => { order.push('first'); finish = resolve; }));
  enqueueAnnouncement(async () => { order.push('cancelled'); });
  await new Promise(resolve => setImmediate(resolve));
  clearAnnouncementQueue();
  enqueueAnnouncement(async () => { order.push('next'); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first']);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first', 'next']);
});

test('vite config preserves reverse proxy for /api, /health, /ready to backend:8080', async () => {
  const content = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(content, /'\/api':\s*\{\s*target:\s*'http:\/\/backend:8080'/);
  assert.match(content, /'\/health':\s*\{\s*target:\s*'http:\/\/backend:8080'/);
  assert.match(content, /'\/ready':\s*\{\s*target:\s*'http:\/\/backend:8080'/);
});

test('auth getMe returns null on 401 unauthenticated without fatal error', async () => {
  const auth = await loadTS('../src/api/authApi.ts');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'not authenticated' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    const me = await auth.getMe();
    assert.equal(me, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth getApiBaseUrl normalizes api prefixes without duplicating', async () => {
  const auth = await loadTS('../src/api/authApi.ts');
  assert.equal(typeof auth.getApiBaseUrl, 'function');
  assert.equal(auth.getApiBaseUrl(), '/api/v1');
});
