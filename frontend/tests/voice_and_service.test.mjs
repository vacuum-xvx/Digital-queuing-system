import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTS(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}

test('postalVoice: numberToRussianWords converts numbers accurately', async () => {
  const pv = await loadTS('../src/utils/postalVoice.ts');
  assert.equal(pv.numberToRussianWords(0), 'ноль');
  assert.equal(pv.numberToRussianWords(1), 'один');
  assert.equal(pv.numberToRussianWords(3), 'три');
  assert.equal(pv.numberToRussianWords(42), 'сорок два');
  assert.equal(pv.numberToRussianWords(1234), 'одна тысяча двести тридцать четыре');
});

test('postalVoice: formatAnnouncementPhrase builds polite phrase with Russian numbers and window', async () => {
  const pv = await loadTS('../src/utils/postalVoice.ts');
  const res = pv.formatAnnouncementPhrase('Q-001234', 3);
  assert.match(res.phrase, /Внимание\. Клиент с талоном Ку, одна тысяча двести тридцать четыре\. Пожалуйста, пройдите к окну номер три\./);
  assert.equal(res.ticketNumber, 'Q-001234');
  assert.equal(res.windowId, 3);
  assert.equal(res.windowPhrase, 'три');
});

test('postalVoice: announceTicketCall triggers speechSynthesis with Russian voice and handles fallback', async () => {
  const pv = await loadTS('../src/utils/postalVoice.ts');

  // Setup mock window & speechSynthesis
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  const spokenUtterances = [];
  const mockVoices = [
    { name: 'Google русский', lang: 'ru-RU', localService: false, default: true },
    { name: 'Microsoft Irina', lang: 'ru-RU', localService: true, default: false },
    { name: 'Alex', lang: 'en-US', localService: true, default: false },
  ];

  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  }

  const mockSpeechSynthesis = {
    paused: false,
    speaking: false,
    getVoices: () => mockVoices,
    speak: (utt) => {
      spokenUtterances.push(utt);
      setTimeout(() => {
        if (utt.onstart) utt.onstart();
        setTimeout(() => {
          if (utt.onend) utt.onend();
        }, 10);
      }, 5);
    },
    cancel: () => {},
    resume: () => {},
    pause: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  global.SpeechSynthesisUtterance = MockUtterance;
  global.window = {
    speechSynthesis: mockSpeechSynthesis,
    SpeechSynthesisUtterance: MockUtterance,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  try {
    pv.initSpeechVoices();
    const result = await pv.announceTicketCall('Q-001234', 3, { soundEnabled: false });

    assert.equal(spokenUtterances.length, 1);
    assert.match(spokenUtterances[0].text, /Клиент с талоном Ку, одна тысяча двести тридцать четыре/);
    assert.equal(spokenUtterances[0].lang, 'ru-RU');
    assert.equal(spokenUtterances[0].voice?.lang, 'ru-RU');
    assert.equal(result.ticketNumber, 'Q-001234');
  } finally {
    delete global.SpeechSynthesisUtterance;
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  }
});

test('postalVoice: unlockSpeechSynthesis resumes audio and speech without throwing', async () => {
  const pv = await loadTS('../src/utils/postalVoice.ts');

  let resumed = false;
  const originalWindow = globalThis.window;
  globalThis.window = {
    speechSynthesis: {
      paused: true,
      resume: () => { resumed = true; },
      getVoices: () => [],
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  try {
    pv.unlockSpeechSynthesis();
    assert.equal(resumed, true);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('TVBoard: polling checks w.currentTicketStatus === "CALLED" and uses ticketNumber:CALLED for deduplication', async () => {
  const content = await readFile(new URL('../src/features/client/TVBoard.tsx', import.meta.url), 'utf8');

  // Verify status check in polling loop
  assert.match(content, /w\.currentTicketNumber && w\.currentTicketStatus === 'CALLED'/);
  assert.match(content, /const currentKey = `\$\{w\.currentTicketNumber\}:CALLED`/);
  assert.match(content, /if \(prev !== currentKey\)/);

  // Verify initial mount doesn't announce already-called tickets
  assert.match(content, /if \(isInitialRef\.current\) \{/);
  assert.match(content, /lastAnnouncedRef\.current\.set\(w\.number, `\$\{w\.currentTicketNumber\}:CALLED`\)/);

  // Verify "Включить звук" and "Звук включён" buttons and unlocking
  assert.match(content, /Включить звук/);
  assert.match(content, /Звук включён/);
  assert.match(content, /handleUnlockAudio/);
  assert.match(content, /unlockSpeechSynthesis\(\)/);
});

test('TicketCard: displays ticket.serviceName prominently with fallback options', async () => {
  const content = await readFile(new URL('../src/features/operator/TicketCard.tsx', import.meta.url), 'utf8');

  // Check that service name is extracted with priority to ticket.serviceName
  assert.match(content, /ticket\.serviceName/);
  assert.match(content, /services\?\.find\(s => s\.id === ticket\.serviceId\)\?\.name/);
  assert.match(content, /'Услуга не определена'/);
  // Check rendering in the card
  assert.match(content, /Услуга:/);
  assert.match(content, /\{serviceName\}/);
});

test('OperatorWorkspace: displays service name in queue list and preserves it on actions', async () => {
  const content = await readFile(new URL('../src/features/operator/OperatorWorkspace.tsx', import.meta.url), 'utf8');

  // Queue item renders serviceName with fallback
  assert.match(content, /item\.serviceName \|\| services\.find/);

  // createLiveTicket preserves serviceName
  assert.match(content, /ticket\.serviceName = selectedSvc\.name/);

  // redirectTicket sets notification with target service
  assert.match(content, /targetSvc\.name/);
});

test('Operator Types & OpenAPI: serviceName field is present in Ticket interface and DTO', async () => {
  const typesContent = await readFile(new URL('../src/api/operator/types.ts', import.meta.url), 'utf8');
  assert.match(typesContent, /serviceName\?: string;/);

  const openapiContent = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');
  assert.match(openapiContent, /serviceName:\s*\n\s*type: string/);
});
