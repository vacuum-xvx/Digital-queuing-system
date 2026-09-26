/**
 * Утилиты экспорта предварительной записи в календари:
 * - Apple Calendar / Microsoft Outlook / стандартный iCalendar (.ics)
 * - Google Calendar Web
 * - Яндекс Календарь
 */

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function downloadICSFile(
  scheduledAtIso: string,
  branchName: string,
  serviceName: string,
  ticketNumber?: string
): void {
  const startDate = new Date(scheduledAtIso);
  if (Number.isNaN(startDate.getTime())) return;

  // Длительность слота: 30 минут
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

  const startFormatted = formatICSDate(startDate);
  const endFormatted = formatICSDate(endDate);
  const nowFormatted = formatICSDate(new Date());

  const summary = `Почта России: ${serviceName}${ticketNumber ? ` (Талон ${ticketNumber})` : ''}`;
  const description = `Предварительная запись в отделение Почты России.\\nУслуга: ${serviceName}\\nНомер талона: ${ticketNumber || 'Будет присвоен'}\\nПожалуйста, подойдите за 5 минут до назначенного времени и подтвердите прибытие в приложении.`;
  const location = branchName || 'Отделение Почты России';

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Russian Post//Digital Queue//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:postcode-${Date.now()}@pochta.ru`,
    `DTSTAMP:${nowFormatted}`,
    `DTSTART:${startFormatted}`,
    `DTEND:${endFormatted}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Напоминание: визит на Почту России через 15 минут',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `pochta-appointment-${startFormatted.slice(0, 8)}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarUrl(
  scheduledAtIso: string,
  branchName: string,
  serviceName: string,
  ticketNumber?: string
): string {
  const startDate = new Date(scheduledAtIso);
  if (Number.isNaN(startDate.getTime())) return '#';

  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  const startFormatted = formatICSDate(startDate);
  const endFormatted = formatICSDate(endDate);

  const title = encodeURIComponent(`Почта России: ${serviceName}${ticketNumber ? ` (Талон ${ticketNumber})` : ''}`);
  const details = encodeURIComponent(
    `Предварительная запись в отделение Почты России.\nУслуга: ${serviceName}\nНомер талона: ${ticketNumber || 'Будет присвоен'}\nПожалуйста, подойдите за 5 минут до назначенного времени.`
  );
  const location = encodeURIComponent(branchName || 'Отделение Почты России');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startFormatted}/${endFormatted}&details=${details}&location=${location}`;
}

export function getYandexCalendarUrl(
  scheduledAtIso: string,
  branchName: string,
  serviceName: string,
  ticketNumber?: string
): string {
  const startDate = new Date(scheduledAtIso);
  if (Number.isNaN(startDate.getTime())) return '#';

  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  const title = encodeURIComponent(`Почта России: ${serviceName}${ticketNumber ? ` (Талон ${ticketNumber})` : ''}`);
  const desc = encodeURIComponent(`Отделение: ${branchName}. Услуга: ${serviceName}`);

  return `https://calendar.yandex.ru/event?name=${title}&start=${startIso}&end=${endIso}&desc=${desc}&location=${encodeURIComponent(branchName)}`;
}
