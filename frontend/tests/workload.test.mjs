import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTS(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}

test('parseWorkHours handles standard, spaced and edge-case formats', async () => {
  const { parseWorkHours } = await loadTS('../src/utils/workload.ts');

  assert.deepEqual(parseWorkHours('08:00–20:00'), {
    openHour: 8,
    openMinute: 0,
    closeHour: 20,
    closeMinute: 0,
    raw: '08:00–20:00',
  });

  assert.deepEqual(parseWorkHours('09:30 - 18:45'), {
    openHour: 9,
    openMinute: 30,
    closeHour: 18,
    closeMinute: 45,
    raw: '09:30 - 18:45',
  });

  const fallback = parseWorkHours(undefined);
  assert.equal(fallback.openHour, 8);
  assert.equal(fallback.closeHour, 20);
});

test('Saturday workload profile matches authentic Russian Post peak chart', async () => {
  const { getBranchHourlyWorkload } = await loadTS('../src/utils/workload.ts');
  const saturdayData = getBranchHourlyWorkload('branch-1', 5);

  assert.equal(saturdayData.length, 14);
  assert.equal(saturdayData[0].hour, 8);
  assert.equal(saturdayData[0].isPeak, false); // 08:00 green
  assert.equal(saturdayData[saturdayData.length - 1].hour, 21);

  // 14:00 must be peak orange, matching the screenshot
  const hour14 = saturdayData.find(d => d.hour === 14);
  assert.ok(hour14);
  assert.equal(hour14.isPeak, true);
  assert.equal(hour14.loadPercent, 88);

  // 09:00, 10:00, 11:00 are green
  const hour11 = saturdayData.find(d => d.hour === 11);
  assert.ok(hour11);
  assert.equal(hour11.isPeak, false);
});

test('evaluateServiceFeasibility returns FEASIBLE when plenty of time before closing', async () => {
  const { evaluateServiceFeasibility } = await loadTS('../src/utils/workload.ts');
  const refDate = new Date('2026-09-19T11:00:00.000Z'); // 14:00 Moscow

  const result = evaluateServiceFeasibility({
    workHours: '08:00–20:00',
    hasLoadData: true,
    referenceDate: refDate,
  });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.canTakeTicket, true);
  assert.match(result.badgeText, /Успеваете/);
  assert.match(result.explanation, /20:00/);
});

test('evaluateServiceFeasibility handles missing workload data (нет информации о загрузке почты)', async () => {
  const { evaluateServiceFeasibility } = await loadTS('../src/utils/workload.ts');
  const refDate = new Date('2026-09-19T11:00:00.000Z'); // 14:00 Moscow

  const result = evaluateServiceFeasibility({
    workHours: '08:00–20:00',
    hasLoadData: false,
    referenceDate: refDate,
  });

  assert.equal(result.status, 'NO_DATA');
  assert.equal(result.badgeText, 'Нет данных о загрузке');
  assert.equal(result.canTakeTicket, true);
  assert.match(result.headline, /Информация о загруженности отсутствует/);
  assert.match(result.explanation, /20:00/);
});

test('evaluateServiceFeasibility detects RISKY when close to closing with long wait', async () => {
  const { evaluateServiceFeasibility } = await loadTS('../src/utils/workload.ts');
  const refDate = new Date('2026-09-19T16:40:00.000Z'); // 19:40 Moscow

  const result = evaluateServiceFeasibility({
    workHours: '08:00–20:00',
    hasLoadData: true,
    referenceDate: refDate,
    overrideWaitMinutes: 20, // 20 min wait + 6 min service = 26 min > 20 min left
  });

  assert.equal(result.status, 'RISKY');
  assert.match(result.badgeText, /риск/i);
});

test('evaluateServiceFeasibility detects CLOSED when branch is outside working hours', async () => {
  const { evaluateServiceFeasibility } = await loadTS('../src/utils/workload.ts');
  const refDate = new Date('2026-09-19T18:30:00.000Z'); // 21:30 Moscow

  const result = evaluateServiceFeasibility({
    workHours: '08:00–20:00',
    hasLoadData: true,
    referenceDate: refDate,
  });

  assert.equal(result.status, 'CLOSED');
  assert.equal(result.canTakeTicket, false);
  assert.match(result.headline, /завершён/);
});
