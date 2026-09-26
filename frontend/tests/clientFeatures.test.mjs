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

// 1. branchLocations.ts
test('branchLocations.ts exports MOSCOW_BRANCHES and calculateSmartRoutes', async () => {
  const mod = await loadTS('../src/features/client/map/branchLocations.ts');

  assert.ok(Array.isArray(mod.MOSCOW_BRANCHES), 'MOSCOW_BRANCHES should be an array');
  assert.ok(mod.MOSCOW_BRANCHES.length >= 5, 'Should define at least 5 Moscow branches');

  // Verify structure of branches
  for (const branch of mod.MOSCOW_BRANCHES) {
    assert.ok(branch.id, 'Branch must have id');
    assert.ok(branch.code, 'Branch must have code');
    assert.ok(branch.name, 'Branch must have name');
    assert.ok(branch.address, 'Branch must have address');
    assert.ok(branch.metro, 'Branch must have metro');
    assert.equal(typeof branch.lat, 'number', 'Branch lat must be numeric');
    assert.equal(typeof branch.lng, 'number', 'Branch lng must be numeric');
    assert.equal(typeof branch.walkingMinutes, 'number', 'walkingMinutes must be numeric');
    assert.equal(typeof branch.estimatedWaitMinutes, 'number', 'estimatedWaitMinutes must be numeric');
    assert.ok(branch.workHours, 'Branch must have workHours');
  }

  assert.equal(typeof mod.calculateSmartRoutes, 'function', 'calculateSmartRoutes must be exported function');
});

test('calculateSmartRoutes correctly identifies fastest branch and calculates saved minutes', async () => {
  const { MOSCOW_BRANCHES, calculateSmartRoutes } = await loadTS('../src/features/client/map/branchLocations.ts');

  const routes = calculateSmartRoutes(MOSCOW_BRANCHES);
  assert.equal(routes.length, MOSCOW_BRANCHES.length, 'Routes length must match branches length');

  // The first item must be marked as the fastest
  assert.equal(routes[0].isFastest, true, 'First route in sorted list must have isFastest = true');
  assert.equal(routes[0].branch.name, 'Главпочтамт Мясницкая');
  assert.equal(routes[0].totalTimeMinutes, 9, '5 min walk + 4 min wait = 9 min total');

  // Slowest branch in default set is Tverskaya 7 (19 walk + 25 wait = 44 min)
  // Saved minutes for fastest = 44 - 9 = 35 minutes saved
  assert.equal(routes[0].timeSavedMinutes, 35, 'Fastest branch saves 35 minutes compared to slowest');

  // Last branch is the slowest
  const slowestRoute = routes[routes.length - 1];
  assert.equal(slowestRoute.isFastest, false);
  assert.equal(slowestRoute.timeSavedMinutes, 0, 'Slowest branch saves 0 minutes');
  assert.equal(slowestRoute.totalTimeMinutes, 44);

  // Test custom input scenario
  const customBranches = [
    {
      id: 'b1',
      code: '100001',
      name: 'Branch Far',
      address: 'Far st',
      metro: 'A',
      metroColor: '#fff',
      lat: 55.7,
      lng: 37.6,
      rating: 4.8,
      reviewCount: 100,
      activeQueueCount: 10,
      estimatedWaitMinutes: 20,
      walkingMinutes: 10,
      distanceKm: 1.0,
      workHours: '08:00–20:00',
    },
    {
      id: 'b2',
      code: '100002',
      name: 'Branch Fast',
      address: 'Fast st',
      metro: 'B',
      metroColor: '#fff',
      lat: 55.71,
      lng: 37.61,
      rating: 4.9,
      reviewCount: 200,
      activeQueueCount: 1,
      estimatedWaitMinutes: 2,
      walkingMinutes: 3,
      distanceKm: 0.2,
      workHours: '08:00–20:00',
    },
  ];

  const customRoutes = calculateSmartRoutes(customBranches);
  assert.equal(customRoutes[0].branch.id, 'b2');
  assert.equal(customRoutes[0].isFastest, true);
  assert.equal(customRoutes[0].totalTimeMinutes, 5); // 3 + 2
  assert.equal(customRoutes[0].timeSavedMinutes, 25); // (10 + 20) - 5 = 25
  assert.equal(customRoutes[1].branch.id, 'b1');
  assert.equal(customRoutes[1].isFastest, false);
  assert.equal(customRoutes[1].timeSavedMinutes, 0);
});

// 2. BranchMapModal.tsx
test('BranchMapModal.tsx exists, contains Carto Positron / OSM tiles, Leaflet map setup, and divIcon markers', async () => {
  const content = await readFile(new URL('../src/features/client/map/BranchMapModal.tsx', import.meta.url), 'utf8');

  // Verify Leaflet import and container ref
  assert.match(content, /import\s+L\s+from\s+['"]leaflet['"]/);
  assert.match(content, /mapContainerRef/);
  assert.match(content, /mapInstanceRef/);

  // Verify Carto Positron / OSM tiles
  assert.match(content, /basemaps\.cartocdn\.com/);
  assert.match(content, /OpenStreetMap/);
  assert.match(content, /CARTO/i);

  // Verify Leaflet map setup
  assert.match(content, /L\.map\s*\(\s*mapContainerRef\.current/);
  assert.match(content, /L\.tileLayer\s*\(/);
  assert.match(content, /map\.invalidateSize\(\)/);

  // Verify divIcon markers
  assert.match(content, /L\.divIcon\s*\(/);
  assert.match(content, /className:\s*['"]pochta-marker-container['"]/);
  assert.match(content, /pochta-map-marker-pin/);
  assert.match(content, /L\.marker\s*\(\s*\[branch\.lat,\s*branch\.lng\]/);
});

// 3. ArrivalSheet.tsx
test('ArrivalSheet.tsx exists and contains arrival detection badge, 1-tap ticket creation, and service selection', async () => {
  const content = await readFile(new URL('../src/features/client/arrival/ArrivalSheet.tsx', import.meta.url), 'utf8');

  // Arrival detection badge
  assert.match(content, /Вы на месте/);
  assert.match(content, /радар:\s*15\s*м/);
  assert.match(content, /animate-ping/);

  // 1-tap ticket creation
  assert.match(content, /Взять талон без терминала/);
  assert.match(content, /onTakeTicket/);
  assert.match(content, /handleConfirm/);

  // Service selection
  assert.match(content, /selectedServiceId/);
  assert.match(content, /setSelectedServiceId/);
  assert.match(content, /services\.map/);
  assert.match(content, /Выберите услугу/);
});

// 4. calendarUtils.ts
test('calendarUtils.ts exports downloadICSFile, getGoogleCalendarUrl, and getYandexCalendarUrl', async () => {
  const mod = await loadTS('../src/features/client/calendar/calendarUtils.ts');

  assert.equal(typeof mod.downloadICSFile, 'function', 'downloadICSFile should be exported');
  assert.equal(typeof mod.getGoogleCalendarUrl, 'function', 'getGoogleCalendarUrl should be exported');
  assert.equal(typeof mod.getYandexCalendarUrl, 'function', 'getYandexCalendarUrl should be exported');

  // Verify downloadICSFile contains standard RFC 5545 iCalendar elements
  const content = await readFile(new URL('../src/features/client/calendar/calendarUtils.ts', import.meta.url), 'utf8');
  assert.match(content, /BEGIN:VCALENDAR/);
  assert.match(content, /BEGIN:VEVENT/);
  assert.match(content, /DTSTART:/);
  assert.match(content, /DTEND:/);
  assert.match(content, /SUMMARY:/);
  assert.match(content, /text\/calendar/);
});

test('getGoogleCalendarUrl generates proper action=TEMPLATE, text, and dates parameters', async () => {
  const { getGoogleCalendarUrl, getYandexCalendarUrl } = await loadTS('../src/features/client/calendar/calendarUtils.ts');

  const scheduledAt = '2026-09-30T10:00:00.000Z';
  const branchName = 'Главпочтамт Мясницкая 101000';
  const serviceName = 'Отправка посылок EMS';
  const ticketNumber = 'A-42';

  const gUrl = getGoogleCalendarUrl(scheduledAt, branchName, serviceName, ticketNumber);
  assert.ok(gUrl.startsWith('https://calendar.google.com/calendar/render?'));

  const parsed = new URL(gUrl);
  assert.equal(parsed.searchParams.get('action'), 'TEMPLATE');
  assert.match(parsed.searchParams.get('text'), /Отправка посылок EMS/);
  assert.match(parsed.searchParams.get('text'), /A-42/);
  assert.equal(parsed.searchParams.get('dates'), '20260930T100000Z/20260930T103000Z');
  assert.match(parsed.searchParams.get('location'), /Главпочтамт Мясницкая 101000/);

  // Verify Yandex Calendar URL as well
  const yUrl = getYandexCalendarUrl(scheduledAt, branchName, serviceName, ticketNumber);
  assert.ok(yUrl.startsWith('https://calendar.yandex.ru/event?'));
  const parsedY = new URL(yUrl);
  assert.match(parsedY.searchParams.get('name'), /Отправка посылок EMS/);
  assert.equal(parsedY.searchParams.get('start'), '2026-09-30T10:00:00.000Z');
  assert.equal(parsedY.searchParams.get('end'), '2026-09-30T10:30:00.000Z');
});

// 5. LiveTicketBanner.tsx
test('LiveTicketBanner.tsx contains ticket number mono font, window number when called, and waiting position', async () => {
  const content = await readFile(new URL('../src/features/client/ticket/LiveTicketBanner.tsx', import.meta.url), 'utf8');

  // Ticket number mono font
  assert.match(content, /font-mono[^>]*>\s*\{\s*ticket\.publicNumber\s*\}/);

  // Window number when called
  assert.match(content, /ticket\.status\s*===\s*['"]CALLED['"]/);
  assert.match(content, /ticket\.window/);
  assert.match(content, /Окно №\{\s*ticket\.window\.number\s*\}/);

  // Waiting position
  assert.match(content, /Перед вами:/);
  assert.match(content, /peopleAhead/);
  assert.match(content, /position/);
});

// 6. ClientProfileModal.tsx
test('ClientProfileModal.tsx contains 99% reliability index, karma stats, and notification settings', async () => {
  const content = await readFile(new URL('../src/features/client/profile/ClientProfileModal.tsx', import.meta.url), 'utf8');

  // 99% reliability index
  assert.match(content, /99%\s*Надежность/);
  assert.match(content, /Индекс ответственности/);

  // Karma stats
  assert.match(content, /Визитов вовремя/);
  assert.match(content, /18\s*\/\s*18/);
  assert.match(content, /Неявок/);
  assert.match(content, /Операторы/);
  assert.match(content, /★\s*5\.0/);
  assert.match(content, /Золотой статус/);

  // Notification settings
  assert.match(content, /Настройки оповещений и сенсоров/);
  assert.match(content, /Звуковой сигнал при вызове/);
  assert.match(content, /Вибрация \(Тактильный отклик\)/);
  assert.match(content, /152-ФЗ/);
  assert.match(content, /soundEnabled/);
  assert.match(content, /hapticEnabled/);
  assert.match(content, /geoEnabled/);
});

// 7. BranchFeedbackModal.tsx
test('BranchFeedbackModal.tsx contains 5-star rating, WB reaction tags, and feedback submission', async () => {
  const content = await readFile(new URL('../src/features/client/feedback/BranchFeedbackModal.tsx', import.meta.url), 'utf8');

  // 5-star rating
  assert.match(content, /\[1,\s*2,\s*3,\s*4,\s*5\]\.map/);
  assert.match(content, /setRating\(star\)/);
  assert.match(content, /Star/);
  assert.match(content, /Оценка \$\{star\} из 5/);

  // WB reaction tags
  assert.match(content, /FEEDBACK_TAGS/);
  assert.match(content, /⚡ Быстрое окно/);
  assert.match(content, /😊 Вежливый оператор/);
  assert.match(content, /❄️ Комфортный зал/);
  assert.match(content, /📦 Аккуратная посылка/);
  assert.match(content, /📱 Удобная электронная очередь/);

  // Feedback submission
  assert.match(content, /<form\s+onSubmit=\{handleSubmit\}/);
  assert.match(content, /Отправить отзыв/);
  assert.match(content, /setSubmitted\(true\)/);
  assert.match(content, /onSubmitSuccess/);
  assert.match(content, /Спасибо за ваш отзыв!/);
});

// 8. PrivacyPolicyModal.tsx
test('PrivacyPolicyModal.tsx references 152-ФЗ and local data wiping', async () => {
  const content = await readFile(new URL('../src/features/client/legal/PrivacyPolicyModal.tsx', import.meta.url), 'utf8');

  // References 152-ФЗ
  assert.match(content, /152-ФЗ/);
  assert.match(content, /Федеральным законом № 152-ФЗ «О персональных данных»/);

  // Local data wiping
  assert.match(content, /Удаление локальных данных/);
  assert.match(content, /Очистить историю талонов на этом устройстве/);
  assert.match(content, /onClearData/);
});

// 9. MobileTabBar.tsx
test('MobileTabBar.tsx contains the 5 tabs: Главная, Карта, Талон, Запись, Кабинет', async () => {
  const content = await readFile(new URL('../src/features/client/navigation/MobileTabBar.tsx', import.meta.url), 'utf8');

  // Verify all 5 tabs are present
  assert.match(content, />Главная</);
  assert.match(content, />Карта</);
  // Center tab: labeled Талоны / Взять / Талон
  assert.match(content, /Талон/);
  assert.match(content, />Запись</);
  assert.match(content, />Кабинет</);

  // Verify navigation handlers
  assert.match(content, /onNavigateHome/);
  assert.match(content, /onOpenMap/);
  assert.match(content, /onNavigateBooking/);
  assert.match(content, /onOpenProfile/);
});
