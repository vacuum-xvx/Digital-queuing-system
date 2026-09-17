/**
 * =============================================================================
 * Утилиты времени: все отображаемые метки приведены к UTC+3 (Москва)
 * независимо от локальной таймзоны браузера или сервера.
 * =============================================================================
 */

const MOSCOW_TZ = 'Europe/Moscow';

/** Текущее время в Москве */
export function nowMoscow(): Date {
  return new Date();
}

/**
 * Форматирует время в московском часовом поясе.
 * @example "17:45:03"
 */
export function formatMoscowTime(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ru-RU', {
    timeZone: MOSCOW_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  });
}

/**
 * Форматирует дату в московском часовом поясе.
 * @example "17.09.2026"
 */
export function formatMoscowDate(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', {
    timeZone: MOSCOW_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  });
}

/**
 * Форматирует дату и время в московском часовом поясе.
 * @example "17.09.2026, 17:45"
 */
export function formatMoscowDateTime(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    timeZone: MOSCOW_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/**
 * Возвращает строку HH:MM:SS текущего московского времени.
 * @example "17:45:03"
 */
export function moscowTimeString(date: Date): string {
  return date.toLocaleTimeString('ru-RU', {
    timeZone: MOSCOW_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Возвращает значение для input[type=datetime-local] с учётом московского
 * смещения (UTC+3), чтобы поле показывало и принимало московское время.
 */
export function toMoscowDatetimeLocal(date: Date): string {
  // UTC+3 = +180 минут
  const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
  const moscowDate = new Date(date.getTime() + MOSCOW_OFFSET_MS);
  return moscowDate.toISOString().slice(0, 16);
}

/**
 * Парсит значение из input[type=datetime-local] как московское время
 * и возвращает ISO-строку с явным смещением +03:00.
 */
export function parseMoscowDatetimeLocal(value: string): string {
  // value = "2026-09-17T17:45" — предполагаем Москву
  return value + ':00+03:00';
}
