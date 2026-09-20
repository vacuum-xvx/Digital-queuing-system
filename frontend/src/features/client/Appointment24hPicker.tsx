import React, { useEffect, useMemo } from 'react';
import { Calendar, Clock, Check } from 'lucide-react';
import { parseWorkHours } from '../../utils/workload';

function moscowDateInput(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addMoscowDays(date: Date, days: number): string {
  const parts = moscowDateInput(date).split('-').map(Number);
  const shifted = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return shifted.toISOString().slice(0, 10);
}

interface Appointment24hPickerProps {
  value: string; // ISO-like "YYYY-MM-DDTHH:mm"
  onChange: (val: string) => void;
  disabled?: boolean;
  workHours?: string;
}

// Популярные 24-часовые интервалы для быстрой записи
const POPULAR_24H_SLOTS = [
  '09:00',
  '10:00',
  '11:30',
  '13:00',
  '14:30',
  '16:00',
  '17:30',
  '19:00',
];

export const Appointment24hPicker: React.FC<Appointment24hPickerProps> = ({
  value,
  onChange,
  disabled = false,
  workHours = '08:00–20:00',
}) => {
  const parsedWorkHours = useMemo(() => parseWorkHours(workHours), [workHours]);

  // Разбор текущего значения YYYY-MM-DDTHH:mm
  const [datePart, timePart] = useMemo(() => {
    if (value && value.includes('T')) {
      const [d, t] = value.split('T');
      return [d, t.slice(0, 5)];
    }
    // По умолчанию: завтра в 10:00
    return [addMoscowDays(new Date(), 1), '10:00'];
  }, [value]);

  const [selectedHour, selectedMinute] = useMemo(() => {
    if (timePart && timePart.includes(':')) {
      const [h, m] = timePart.split(':');
      return [h.padStart(2, '0'), m.padStart(2, '0')];
    }
    return ['10', '00'];
  }, [timePart]);

  // Допустимый диапазон часов работы отделения (строго 24ч: 08..20)
  const allowedHours = useMemo(() => {
    const hours: string[] = [];
    const start = Math.max(0, Math.min(23, parsedWorkHours.openHour));
    const end = Math.max(start, Math.min(23, parsedWorkHours.closeHour - 1));
    for (let h = start; h <= end; h++) {
      hours.push(String(h).padStart(2, '0'));
    }
    return hours.length > 0 ? hours : ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
  }, [parsedWorkHours]);

  const allowedMinutes = [
    '00', '05', '10', '15', '20', '25',
    '30', '35', '40', '45', '50', '55'
  ];

  // Быстрые дни
  const todayDateStr = useMemo(() => {
    return moscowDateInput(new Date());
  }, []);

  const tomorrowDateStr = useMemo(() => {
    return addMoscowDays(new Date(), 1);
  }, []);

  const afterTomorrowDateStr = useMemo(() => {
    return addMoscowDays(new Date(), 2);
  }, []);

  // Синхронизация при первом рендере если value пусто
  useEffect(() => {
    if (!value) {
      onChange(`${tomorrowDateStr}T10:00`);
    }
  }, [value, tomorrowDateStr, onChange]);

  const handleDateChange = (newDate: string) => {
    onChange(`${newDate}T${selectedHour}:${selectedMinute}`);
  };

  const handleHourChange = (newHour: string) => {
    onChange(`${datePart}T${newHour}:${selectedMinute}`);
  };

  const handleMinuteChange = (newMinute: string) => {
    onChange(`${datePart}T${selectedHour}:${newMinute}`);
  };

  const handleSlotSelect = (slot24h: string) => {
    const [h, m] = slot24h.split(':');
    onChange(`${datePart}T${h.padStart(2, '0')}:${m.padStart(2, '0')}`);
  };

  // Человекочитаемое представление выбранной даты (без дублирования времени после запятой)
  const formattedPreview = useMemo(() => {
    if (!datePart) return '';
    try {
      const [y, m, d] = datePart.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch {
      return datePart;
    }
  }, [datePart]);

  return (
    <div className="space-y-4 text-left w-full max-w-full min-w-0">
      {/* 1. Выбор даты визита */}
      <div className="space-y-2 w-full max-w-full min-w-0">
        <label className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#003B73] shrink-0" />
            <span>Дата визита</span>
          </span>
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal">Часовой пояс: МСК</span>
        </label>

        {/* Быстрые кнопки выбора даты */}
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 select-none w-full max-w-full min-w-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDateChange(todayDateStr)}
            aria-pressed={datePart === todayDateStr}
            className="appointment-choice appointment-date-choice"
          >
            <span>Сегодня</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDateChange(tomorrowDateStr)}
            aria-pressed={datePart === tomorrowDateStr}
            className="appointment-choice appointment-date-choice"
          >
            <span>Завтра</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDateChange(afterTomorrowDateStr)}
            aria-pressed={datePart === afterTomorrowDateStr}
            className="appointment-choice appointment-date-choice"
          >
            <span>Послезавтра</span>
          </button>
        </div>

        {/* Календарный ввод конкретной даты */}
        <input
          type="date"
          min={todayDateStr}
          value={datePart}
          disabled={disabled}
          onChange={(e) => handleDateChange(e.target.value)}
          className="w-full min-w-0 max-w-full box-border px-3 py-2 text-xs font-bold font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#003B73] bg-white shadow-2xs block"
          aria-label="Выбор даты записи"
        />
      </div>

      {/* 2. Выбор времени (24-часовой формат) */}
      <div className="space-y-2 pt-1 border-t border-slate-100 w-full max-w-full min-w-0">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-[#003B73] shrink-0" />
            <span>Время визита</span>
          </label>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-[#003B73] border border-blue-200">
            24-часовой формат
          </span>
        </div>

        {/* Выпадающие списки Часы : Минуты в строгом 24h формате */}
        <div className="grid grid-cols-2 gap-2 min-w-0 max-w-full">
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-slate-500 block mb-1 truncate">
              Часы (00–23)
            </span>
            <select
              value={selectedHour}
              disabled={disabled}
              onChange={(e) => handleHourChange(e.target.value)}
              className="w-full min-w-0 max-w-full px-2.5 sm:px-3 py-2.5 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white shadow-2xs focus:ring-2 focus:ring-[#003B73] text-slate-900 truncate"
              aria-label="Час визита (24-часовой формат)"
            >
              {allowedHours.map((h) => (
                <option key={h} value={h}>
                  {h}:00 ({Number(h) < 12 ? 'Утро' : Number(h) < 18 ? 'День' : 'Вечер'})
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <span className="text-[11px] font-medium text-slate-500 block mb-1 truncate">
              Минуты (00–59)
            </span>
            <select
              value={selectedMinute}
              disabled={disabled}
              onChange={(e) => handleMinuteChange(e.target.value)}
              className="w-full min-w-0 max-w-full px-2.5 sm:px-3 py-2.5 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white shadow-2xs focus:ring-2 focus:ring-[#003B73] text-slate-900 truncate"
              aria-label="Минуты визита"
            >
              {allowedMinutes.map((m) => (
                <option key={m} value={m}>
                  :{m} мин
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Быстрые слоты времени (24-часовые чипы) */}
        <div className="pt-1 w-full max-w-full min-w-0">
          <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
            Быстрый выбор времени:
          </span>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full max-w-full min-w-0">
            {POPULAR_24H_SLOTS.map((slot) => {
              const active = `${selectedHour}:${selectedMinute}` === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSlotSelect(slot)}
                  aria-pressed={active}
                  className="appointment-choice appointment-time-choice"
                >
                  <span>{slot}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Информационный бейдж с подтверждением 24-часового формата */}
      <div className="cx-appointment-summary p-3 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs text-slate-800 w-full max-w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Check className="w-4 h-4 text-[#003B73] shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="cx-appointment-summary-label text-[11px] text-slate-500 block">Выбранное время визита:</span>
            <strong className="cx-appointment-summary-date text-slate-900 font-bold capitalize block text-xs">{formattedPreview}</strong>
          </div>
        </div>
        <span className="cx-appointment-summary-time font-mono text-xs font-black text-[#003B73] px-2.5 py-1 rounded-xl bg-white border border-blue-200 shadow-2xs">
          {selectedHour}:{selectedMinute}
        </span>
      </div>
    </div>
  );
};
