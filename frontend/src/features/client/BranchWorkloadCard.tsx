import React, { useState, useMemo } from 'react';
import { Branch } from '../../api/client/types';
import {
  DAYS_OF_WEEK,
  DayOfWeekRu,
  getBranchHourlyWorkload,
  getMoscowTimeComponents,
  evaluateServiceFeasibility,
  HourlyLoad,
} from '../../utils/workload';
import { CheckCircle2, AlertTriangle, Clock, HelpCircle, Sparkles, ChevronRight, Info } from 'lucide-react';

export interface BranchWorkloadCardProps {
  branch?: Branch | null;
  /** Принудительно задать наличие данных о загрузке */
  initialHasLoadData?: boolean;
  /** Компактный режим (для списков) */
  compact?: boolean;
  /** Опциональное переопределение времени ожидания (из реального ETA талона) */
  overrideWaitMinutes?: number;
  className?: string;
}

export function BranchWorkloadCard({
  branch,
  initialHasLoadData = true,
  compact = false,
  overrideWaitMinutes,
  className = '',
}: BranchWorkloadCardProps) {
  const moscowNow = useMemo(() => getMoscowTimeComponents(), []);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(moscowNow.dayIndex);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [hasLoadData, setHasLoadData] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('workload') === 'none') return false;
      if (p.get('workload') === 'loaded') return true;
    }
    return initialHasLoadData;
  });

  const workHours = branch?.workHours || '08:00–20:00';

  // Почасовые данные для выбранного дня
  const hourlyData = useMemo(() => {
    return getBranchHourlyWorkload(branch?.id || '', selectedDayIndex);
  }, [branch?.id, selectedDayIndex]);

  // Оценка успеваемости обслуживания
  const activeHour = selectedHour ?? (selectedDayIndex === moscowNow.dayIndex ? moscowNow.hour : 14);
  const feasibility = useMemo(() => {
    return evaluateServiceFeasibility({
      workHours,
      hasLoadData,
      selectedHour: selectedDayIndex === moscowNow.dayIndex ? (selectedHour ?? undefined) : activeHour,
      overrideWaitMinutes,
    });
  }, [workHours, hasLoadData, selectedDayIndex, moscowNow.dayIndex, selectedHour, activeHour, overrideWaitMinutes]);

  // Метки часов для оси X (08:00, 11:00, 14:00, 17:00, 20:00, 22:00)
  const axisTicks = [8, 11, 14, 17, 20, 22];

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-xs ${className}`}>
        {feasibility.status === 'FEASIBLE' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Успеваете до {feasibility.closingTimeText}</span>
          </span>
        )}
        {feasibility.status === 'TIGHT' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Впритык: осталось {feasibility.minutesRemaining} мин</span>
          </span>
        )}
        {feasibility.status === 'RISKY' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 font-bold border border-orange-200">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
            <span>Риск не успеть</span>
          </span>
        )}
        {feasibility.status === 'CLOSED' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Закрыто</span>
          </span>
        )}
        {feasibility.status === 'NO_DATA' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 font-semibold border border-slate-200">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Нет данных о загрузке</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Загруженность отделения"
      className={`bg-white rounded-3xl border border-[#D2D8E2] p-5 sm:p-6 shadow-sm space-y-4 text-left transition-all ${className}`}
    >
      {/* Шапка карточки */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Загруженность
          </h3>
          <p className="text-xs text-slate-500 font-medium pt-0.5">
            Режим работы: <strong className="text-slate-700">{workHours}</strong>
          </p>
        </div>

        {/* Переключатель для демонстрации сценариев (наличие/отсутствие данных) */}
        <button
          type="button"
          onClick={() => setHasLoadData(prev => !prev)}
          className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-2xs ${
            hasLoadData
              ? 'bg-blue-50/70 border-blue-200 text-[#003B73] hover:bg-blue-100'
              : 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100'
          }`}
          title="Нажмите, чтобы переключить режим наличия или отсутствия данных о загрузке"
          aria-pressed={hasLoadData}
        >
          <span
            className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${
              hasLoadData ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span className="hidden xs:inline">{hasLoadData ? 'Загрузка:' : 'Статус:'}</span>
          <span className="underline underline-offset-2">
            {hasLoadData ? 'есть данные' : 'нет данных'}
          </span>
        </button>
      </div>

      {/* Селектор дней недели (стилизован под макет) */}
      <nav aria-label="Выбор дня недели" className="bg-[#F1F5F9] p-1 rounded-2xl flex items-center justify-between gap-1 select-none">
        {DAYS_OF_WEEK.map((dayLabel, idx) => {
          const isSelected = selectedDayIndex === idx;

          return (
            <button
              key={dayLabel}
              type="button"
              onClick={() => {
                setSelectedDayIndex(idx);
                setSelectedHour(null);
              }}
              className={`flex-1 cx-workload-day-pill ${
                isSelected ? 'cx-workload-day-pill-selected' : 'cx-workload-day-pill-unselected'
              }`}
              aria-pressed={isSelected}
            >
              <span>{dayLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* График загруженности или состояние отсутствия данных */}
      {hasLoadData ? (
        <div className="space-y-2 pt-1">
          {/* Столбцы графика (14 часов: с 08:00 до 21:00) */}
          <div className="flex items-end justify-between gap-1 sm:gap-1.5 h-20 sm:h-24 px-1 pb-1 pt-2">
            {hourlyData.map((item) => {
              const isHourSelected = selectedHour === item.hour;

              // Высота бара в процентах
              const barHeightPct = Math.max(14, Math.min(100, item.loadPercent));

              return (
                <button
                  key={item.hour}
                  type="button"
                  onClick={() => setSelectedHour(isHourSelected ? null : item.hour)}
                  className="flex-1 cx-workload-bar-column focus:outline-none"
                  title={`${item.label} • Загрузка: ${item.loadPercent}% (~${item.estimatedWaitMinutes} мин ожидания)`}
                  aria-label={`${item.label}, загрузка ${item.loadPercent}%`}
                >
                  <div
                    style={{ height: `${barHeightPct}%` }}
                    className={`cx-workload-bar-fill ${
                      item.isPeak ? 'cx-workload-bar-orange' : 'cx-workload-bar-green'
                    } ${isHourSelected ? 'ring-2 ring-purple-600 ring-offset-1 scale-105' : ''}`}
                  />
                </button>
              );
            })}
          </div>

          {/* Засечки (ticks) под графиком */}
          <div className="flex justify-between px-1 text-slate-300">
            {hourlyData.map((item) => {
              const hasTick = axisTicks.includes(item.hour);
              const isCurrent =
                selectedDayIndex === moscowNow.dayIndex && moscowNow.hour === item.hour;

              return (
                <div key={`tick-${item.hour}`} className="flex-1 flex justify-center">
                  {hasTick ? (
                    <div
                      className={`w-0.5 h-2 rounded-full ${
                        isCurrent ? 'bg-[#A855F7] h-2.5' : 'bg-slate-300'
                      }`}
                    />
                  ) : (
                    <div className="w-0.5 h-1 invisible" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Подписи часов по оси X */}
          <div className="flex justify-between items-center text-[11px] sm:text-xs font-mono font-medium text-slate-800 px-0.5">
            {axisTicks.map((hourVal) => {
              const label = `${String(hourVal).padStart(2, '0')}:00`;
              const isCurrentMoscowHour =
                selectedDayIndex === moscowNow.dayIndex && moscowNow.hour === hourVal;

              if (isCurrentMoscowHour) {
                return (
                  <span
                    key={hourVal}
                    className="bg-[#A855F7] text-white font-bold px-2 sm:px-2.5 py-0.5 rounded-full text-[11px] shadow-sm tracking-tight"
                  >
                    {label}
                  </span>
                );
              }

              return (
                <span key={hourVal} className="text-slate-900 font-semibold">
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        /* Состояние: «нет информации о загрузке почты» */
        <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2 animate-fadeIn">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <HelpCircle className="w-5 h-5" />
          </div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-800">
            Информация о загруженности отделения отсутствует
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Для этого отделения статистика загрузки по часам ещё формируется. Талоны обслуживаются в стандартном порядке очереди.
          </p>
        </div>
      )}

      {/* Блок прогноза: «Успеваешь ли ты обслужиться...» */}
      <div
        className={`rounded-2xl p-4 sm:p-4.5 border transition-all ${
          feasibility.status === 'FEASIBLE'
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            : feasibility.status === 'TIGHT'
            ? 'bg-amber-50/90 border-amber-200 text-amber-950'
            : feasibility.status === 'RISKY'
            ? 'bg-orange-50/90 border-orange-200 text-orange-950'
            : feasibility.status === 'CLOSED'
            ? 'bg-rose-50/80 border-rose-200 text-rose-950'
            : 'bg-blue-50/50 border-blue-200/70 text-slate-900'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {feasibility.status === 'FEASIBLE' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
            {feasibility.status === 'TIGHT' && (
              <Clock className="w-5 h-5 text-amber-600" />
            )}
            {feasibility.status === 'RISKY' && (
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            )}
            {feasibility.status === 'CLOSED' && (
              <Clock className="w-5 h-5 text-rose-600" />
            )}
            {feasibility.status === 'NO_DATA' && (
              <HelpCircle className="w-5 h-5 text-[#003B73]" />
            )}
          </div>

          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-xs sm:text-sm font-black tracking-tight">
                {feasibility.status === 'FEASIBLE' && 'Вы успеваете обслужиться'}
                {feasibility.status === 'TIGHT' && 'Успеваете, но мало времени'}
                {feasibility.status === 'RISKY' && 'Высокий риск не успеть'}
                {feasibility.status === 'CLOSED' && 'Отделение сейчас закрыто'}
                {feasibility.status === 'NO_DATA' && 'Нет информации о загрузке'}
              </h4>

              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  feasibility.status === 'FEASIBLE'
                    ? 'bg-emerald-100 text-emerald-800'
                    : feasibility.status === 'TIGHT'
                    ? 'bg-amber-100 text-amber-800'
                    : feasibility.status === 'RISKY'
                    ? 'bg-orange-100 text-orange-800'
                    : feasibility.status === 'CLOSED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-200/70 text-slate-700'
                }`}
              >
                {feasibility.badgeText}
              </span>
            </div>

            <p className="text-xs leading-relaxed opacity-90">
              {feasibility.explanation}
            </p>

            {/* Дополнительная контекстная подсказка для клиента */}
            {hasLoadData && feasibility.estimatedWaitMinutes !== null && (
              <div className="pt-1 flex items-center gap-3 text-[11px] font-medium opacity-85">
                <span>⏱ Ожидание: ~{feasibility.estimatedWaitMinutes} мин</span>
                <span>•</span>
                <span>🚪 До закрытия: {feasibility.closingTimeText}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
