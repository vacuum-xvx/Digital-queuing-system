import { formatMoscowDateTime } from '../../utils/time';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QueuePolicy, AdminApiError } from '../../api/admin/types';
import * as api from '../../api/admin/adminApi';
import { Sliders, ShieldAlert, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface QueuePolicyEditorProps {
  branchId: string;
  branchName?: string;
}

export const QueuePolicyEditor: React.FC<QueuePolicyEditorProps> = ({
  branchId,
  branchName,
}) => {
  const [policy, setPolicy] = useState<QueuePolicy | null>(null);
  const fields = [
    'appointmentDuePriority',
    'qrPriority',
    'livePriority',
    'antiStarvationThresholdMinutes',
    'antiStarvationPointsPerMinute',
    'appointmentGraceMinutes',
    'appointmentLatePenaltyPerMinute',
    'appointmentLatePenaltyMaxPoints',
  ] as const;

  const [values, setValues] = useState<Record<typeof fields[number], string>>({
    appointmentDuePriority: '',
    qrPriority: '',
    livePriority: '',
    antiStarvationThresholdMinutes: '',
    antiStarvationPointsPerMinute: '',
    appointmentGraceMinutes: '',
    appointmentLatePenaltyPerMinute: '',
    appointmentLatePenaltyMaxPoints: '',
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const requestId = useRef(0);

  const fetchPolicy = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setPolicy(null);
    try {
      const data = await api.getQueuePolicy(branchId);
      if (id !== requestId.current) return;
      setPolicy(data);
      setValues(
        Object.fromEntries(fields.map((field) => [field, String(data[field])])) as typeof values
      );
    } catch (err) {
      if (id !== requestId.current) return;
      setNotice({
        type: 'error',
        message:
          err instanceof AdminApiError
            ? `Ошибка загрузки правил очереди: ${err.message}`
            : 'Не удалось связаться с сервером при получении правил очереди',
      });
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void fetchPolicy();
    return () => {
      requestId.current += 1;
    };
  }, [fetchPolicy]);

  const nums = Object.fromEntries(
    fields.map((field) => [field, Number(values[field])])
  ) as Record<typeof fields[number], number>;

  const apptVal = nums.appointmentDuePriority;
  const qrVal = nums.qrPriority;

  let validationError: string | null = null;
  if (fields.some((field) => !values[field].trim() || !Number.isInteger(nums[field]))) {
    validationError = 'Введите целые числовые значения приоритетов';
  } else if (
    apptVal < 0 ||
    apptVal > 1000 ||
    qrVal < 0 ||
    qrVal > 1000 ||
    nums.livePriority < 0 ||
    nums.livePriority > 1000 ||
    nums.antiStarvationThresholdMinutes < 0 ||
    nums.antiStarvationThresholdMinutes > 240 ||
    nums.antiStarvationPointsPerMinute < 1 ||
    nums.antiStarvationPointsPerMinute > 600 ||
    nums.appointmentGraceMinutes < 0 ||
    nums.appointmentGraceMinutes > 120 ||
    nums.appointmentLatePenaltyPerMinute < 0 ||
    nums.appointmentLatePenaltyPerMinute > 600 ||
    nums.appointmentLatePenaltyMaxPoints < 0 ||
    nums.appointmentLatePenaltyMaxPoints > 1000 ||
    nums.appointmentLatePenaltyMaxPoints > apptVal
  ) {
    validationError = 'Приоритеты должны быть целыми числами в допустимом диапазоне';
  } else if (apptVal <= qrVal || apptVal <= nums.livePriority) {
    validationError = 'Приоритет предварительной записи должен быть строго выше QR и живой очереди';
  }

  const isFormValid = !validationError && policy !== null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !policy || isSaving || isLoading) return;

    const id = requestId.current;
    setIsSaving(true);
    setNotice(null);

    try {
      const updated = await api.updateQueuePolicy(branchId, {
        ...nums,
        expectedVersion: policy.version,
      });

      if (id !== requestId.current) return;
      setPolicy(updated);
      setValues(
        Object.fromEntries(fields.map((field) => [field, String(updated[field])])) as typeof values
      );
      setNotice({
        type: 'success',
        message: `Правила очереди успешно сохранены! Версия обновлена: v${updated.version}`,
      });
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof AdminApiError && err.status === 409 && err.code === 'POLICY_VERSION_CONFLICT') {
        setNotice({
          type: 'warning',
          message: 'Настройки были изменены другим администратором. Загружаем актуальную версию.',
        });
        await fetchPolicy();
      } else {
        setNotice({
          type: 'error',
          message:
            err instanceof AdminApiError
              ? `Ошибка сохранения: ${err.message}`
              : 'Не удалось сохранить изменения на сервере',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const labels: Record<typeof fields[number], { title: string; hint: string }> = {
    appointmentDuePriority: {
      title: 'Приоритет предварительной записи (W_apt)',
      hint: 'Базовый вес клиента с подтвержденным слотом (диапазон 0..1000)',
    },
    qrPriority: {
      title: 'Приоритет QR-кода (W_qr)',
      hint: 'Базовый вес талона, полученного через смартфон',
    },
    livePriority: {
      title: 'Приоритет живой очереди (W_live)',
      hint: 'Базовый вес талона от стойки/оператора без смартфона',
    },
    antiStarvationThresholdMinutes: {
      title: 'Порог защиты от долгого ожидания (мин)',
      hint: 'Время ожидания, после которого начисляется штраф голодания',
    },
    antiStarvationPointsPerMinute: {
      title: 'Баллов за минуту после порога',
      hint: 'Скорость нарастания приоритета при голодании очереди',
    },
    appointmentGraceMinutes: {
      title: 'Льготный период записи (мин)',
      hint: 'Окно времени после наступления слота без применения штрафов',
    },
    appointmentLatePenaltyPerMinute: {
      title: 'Штраф за минуту опоздания',
      hint: 'Снижение приоритета опоздавшего клиента за каждую минуту',
    },
    appointmentLatePenaltyMaxPoints: {
      title: 'Максимальный штраф за опоздание',
      hint: 'Предел снижения приоритета (не более веса записи)',
    },
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-[#D2D8E2] p-5 sm:p-6 shadow-sm space-y-4">
        {/* Header & Version */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-[#003B73]" />
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Конфигуратор весовых коэффициентов очереди
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                {branchName ? `Отделение: ${branchName}` : `ID отделения: ${branchId}`} · Score = W_ch + T_wait * K + Bonus
              </p>
            </div>
          </div>

          {policy && (
            <span className="font-mono text-xs font-bold bg-blue-50 text-[#054FA6] px-3 py-1 rounded-full border border-blue-200">
              Текущая версия: v{policy.version}
            </span>
          )}
        </div>

        {notice && (
          <div
            role="alert"
            className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 ${
              notice.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : notice.type === 'warning'
                ? 'bg-amber-50 border border-amber-200 text-amber-900'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{notice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-slate-400 hover:text-slate-600 px-1 font-bold"
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse">
            Загрузка правил очереди...
          </div>
        ) : !policy ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs text-slate-500">Не удалось загрузить правила очереди</p>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                void fetchPolicy();
              }}
              className="px-4 py-2 bg-[#003B73] text-white font-bold text-xs rounded-xl"
            >
              Повторить загрузку
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => (
                <div
                  key={field}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 focus-within:border-[#054FA6] focus-within:ring-1 focus-within:ring-[#054FA6] transition-all"
                >
                  <label
                    htmlFor={`input-${field}`}
                    className="block font-bold text-xs text-slate-800"
                  >
                    {labels[field].title}
                  </label>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {labels[field].hint}
                  </p>
                  <input
                    id={`input-${field}`}
                    type="number"
                    required
                    step="1"
                    value={values[field]}
                    disabled={isSaving || isLoading}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    className="w-full mt-1 px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {/* SLA Info Callouts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Starvation Guard</span>
                </div>
                <p className="text-[11px] leading-snug">
                  При превышении порогового времени ожидания талон получает приоритетный балл и защищен от вечного вытеснения.
                </p>
              </div>

              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#054FA6]" />
                  <span>SLA предварительной записи</span>
                </div>
                <p className="text-[11px] leading-snug">
                  Приоритет записи должен строго превышать QR и Live. При опоздании приоритет затухает плавно по формуле.
                </p>
              </div>
            </div>

            {validationError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"
              >
                ⚠️ {validationError}
              </div>
            )}

            {policy?.updatedAt && (
              <div className="text-[11px] font-mono text-slate-400">
                Последнее обновление: {formatMoscowDateTime(policy.updatedAt) + ' МСК'}
              </div>
            )}

            <button
              type="submit"
              id="btn-save-policy"
              disabled={!isFormValid || isSaving || isLoading}
              className="w-full min-h-[48px] py-3 bg-[#003B73] hover:bg-[#054FA6] text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? 'Сохранение правил…' : 'Сохранить правила очереди'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
