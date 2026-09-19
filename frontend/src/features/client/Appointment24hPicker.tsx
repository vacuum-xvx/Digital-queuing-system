import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Check, Sparkles } from 'lucide-react';
import { getMoscowTimeComponents, parseWorkHours } from '../../utils/workload';

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
  const moscowNow = useMemo(() => getMoscowTimeComponents(), []);
  const parsedWorkHours = useMemo(() => parseWorkHours(workHours), [workHours]);

  // Разбор текущего значения YYYY-MM-DDTHH:mm
  const [datePart, timePart] = useMemo(() => {
    if (value && value.includes('T')) {
      const [d, t] = value.split('T');
      return [d, t.slice(0, 5)];
    }
    // По умолчанию: завтра в 10:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    return [dateStr, '10:00'];
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

  const allowedMinutes = ['00', '10', '15', '20', '30', '40', '45', '50'];

  // Быстрые дни
  const todayDateStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const tomorrowDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const afterTomorrowDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
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

  // Человекочитаемое представление выбранной даты и времени
  const formattedPreview = useMemo(() => {
    if (!datePart) return '';
    try {
      const [y, m, d] = datePart.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dayRu = dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      return `${dayRu}, в ${selectedHour}:${selectedMinute}`;
    } catch {
      return `${datePart} в ${selectedHour}:${selectedMinute}`;
    }
  }, [datePart, selectedHour, selectedMinute]);

  return (
    <div className="space-y-4 text-left">
      {/* 1. Выбор даты визита */}
      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#003B73]" />
            <span>Дата визита</span>
          </span>
          <span className="text-[11px] text-slate-400 font-normal">Часовой пояс: МСК</span>
        </label>

        {/* Быстрые кнопки выбора даты */}
        <div className="grid grid-cols-3 gap-1.5 select-none">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDateChange(todayDateStr)}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
              datePart === todayDateStr
                ? 'bg-[#003B73] text-white border-[#003B73] shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Сегодня
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDateChange(tomorrowDateStr)}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
              datePart === tomorrowDateStr
                ? 'bg-[#003B73] text-white border-[#003B73] shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Завтра
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDateChange(afterTomorrowDateStr)}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
              datePart === afterTomorrowDateStr
                ? 'bg-[#003B73] text-white border-[#003B73] shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Послезавтра
          </button>
        </div>

        {/* Календарный ввод конкретной даты */}
        <input
          type="date"
          min={todayDateStr}
          value={datePart}
          disabled={disabled}
          onChange={(e) => handleDateChange(e.target.value)}
          className="w-full px-3.5 py-2.5 text-xs font-bold font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#003B73] bg-white shadow-2xs"
          aria-label="Выбор даты записи"
        />
      </div>

      {/* 2. Выбор времени (24-часовой формат) */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-[#003B73]" />
            <span>Время визита</span>
          </label>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-[#003B73] border border-blue-200">
            24-часовой формат
          </span>
        </div>

        {/* Выпадающие списки Часы : Минуты в строгом 24h формате */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[11px] font-medium text-slate-500 block mb-1">
              Часы (00–23)
            </span>
            <select
              value={selectedHour}
              disabled={disabled}
              onChange={(e) => handleHourChange(e.target.value)}
              className="w-full px-3 py-2.5 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white shadow-2xs focus:ring-2 focus:ring-[#003B73] text-slate-900"
              aria-label="Час визита (24-часовой формат)"
            >
              {allowedHours.map((h) => (
                <option key={h} value={h}>
                  {h}:00 ({Number(h) < 12 ? 'Утро' : Number(h) < 18 ? 'День' : 'Вечер'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-500 block mb-1">
              Минуты (00–59)
            </span>
            <select
              value={selectedMinute}
              disabled={disabled}
              onChange={(e) => handleMinuteChange(e.target.value)}
              className="w-full px-3 py-2.5 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white shadow-2xs focus:ring-2 focus:ring-[#003B73] text-slate-900"
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
        <div className="pt-1">
          <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
            Быстрый выбор времени (24ч):
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {POPULAR_24H_SLOTS.map((slot) => {
              const active = `${selectedHour}:${selectedMinute}` === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSlotSelect(slot)}
                  className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all border ${
                    active
                      ? 'bg-[#003B73] text-white border-[#003B73] shadow-xs ring-1 ring-[#003B73]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Информационный бейдж с подтверждением 24-часового формата */}
      <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs text-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-[#003B73] shrink-0" />
          <div>
            <span className="text-[11px] text-slate-500 block">Выбранное время визита:</span>
            <strong className="text-slate-900 font-bold capitalize">{formattedPreview}</strong>
          </div>
        </div>
        <span className="font-mono text-xs font-black text-[#003B73] px-2.5 py-1 rounded-xl bg-white border border-blue-200 shadow-2xs shrink-0">
          {selectedHour}:{selectedMinute} (24ч)
        </span>
      </div>
    </div>
  );
};
