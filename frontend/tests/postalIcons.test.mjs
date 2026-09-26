import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTS(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const tempFile = new URL('../node_modules/.postalIcons_test.mjs', import.meta.url);
  await writeFile(tempFile, outputText, 'utf8');
  try {
    return await import(tempFile.href + '?t=' + Date.now());
  } finally {
    try {
      await unlink(tempFile);
    } catch {
      // ignore
    }
  }
}

test('PostalIcons exports all Solar and 3D icons with story and badge components', async () => {
  const icons = await loadTS('../src/components/common/PostalIcons.tsx');

  // Verify all 9 Solar Icons
  assert.equal(typeof icons.SolarBox, 'function');
  assert.equal(typeof icons.SolarLetter, 'function');
  assert.equal(typeof icons.SolarTicket, 'function');
  assert.equal(typeof icons.SolarClock, 'function');
  assert.equal(typeof icons.SolarBell, 'function');
  assert.equal(typeof icons.SolarQr, 'function');
  assert.equal(typeof icons.SolarOperator, 'function');
  assert.equal(typeof icons.SolarSparkles, 'function');
  assert.equal(typeof icons.SolarAlert, 'function');

  // Verify all 5 3D Vector Icons
  assert.equal(typeof icons.Icon3DParcel, 'function');
  assert.equal(typeof icons.Icon3DLetter, 'function');
  assert.equal(typeof icons.Icon3DTicket, 'function');
  assert.equal(typeof icons.Icon3DClock, 'function');
  assert.equal(typeof icons.Icon3DBell, 'function');

  // Verify Badge and Story
  assert.equal(typeof icons.Postal3DBadge, 'function');
  assert.equal(typeof icons.PostalIconsGallery, 'function');
  assert.equal(typeof icons.PostalIconsStory, 'function');
});

test('3D vector icons contain required authentic labels and titles', async () => {
  const source = await readFile(new URL('../src/components/common/PostalIcons.tsx', import.meta.url), 'utf8');

  // Check specific Russian aria-labels and service titles
  assert.ok(source.includes("aria-label': ariaLabel = 'Посылки и EMS'"));
  assert.ok(source.includes("aria-label': ariaLabel = 'Письма и открытки'"));
  assert.ok(source.includes("aria-label': ariaLabel = 'Электронный талон очереди'"));
  assert.ok(source.includes("aria-label': ariaLabel = 'Время ожидания / Расчетный ETA'"));
  assert.ok(source.includes("aria-label': ariaLabel = 'Вас вызывают к окну!'"));

  // Check viewBox and 3D styling references
  assert.ok(source.includes('viewBox="0 0 128 128"'));
  assert.ok(source.includes('role="img"'));
  assert.ok(source.includes('#1A34E8')); // Electric Pochta Blue
  assert.ok(source.includes('#FF3A44')); // Pochta Red
  assert.ok(source.includes('#FFB800')); // Pochta Gold
});

test('Solar Icons support both linear and duotone variants with customizable strokes and opacity', async () => {
  const source = await readFile(new URL('../src/components/common/PostalIcons.tsx', import.meta.url), 'utf8');

  // Check 24x24 viewBox for Solar icons
  assert.ok(source.includes('viewBox="0 0 24 24"'));
  assert.ok(source.includes("variant?: 'linear' | 'duotone'"));
  assert.ok(source.includes('secondaryOpacity'));
  assert.ok(source.includes('secondaryColor'));
});
