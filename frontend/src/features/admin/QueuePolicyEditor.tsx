import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QueuePolicy, AdminApiError } from '../../api/admin/types';
import * as api from '../../api/admin/adminApi';

interface QueuePolicyEditorProps {
  branchId: string;
  branchName?: string;
}

export const QueuePolicyEditor: React.FC<QueuePolicyEditorProps> = ({
  branchId,
  branchName,
}) => {
  const [policy, setPolicy] = useState<QueuePolicy | null>(null);
  const fields = ['appointmentDuePriority','qrPriority','livePriority','antiStarvationThresholdMinutes','antiStarvationPointsPerMinute','appointmentGraceMinutes','appointmentLatePenaltyPerMinute','appointmentLatePenaltyMaxPoints'] as const;
  const [values, setValues] = useState<Record<typeof fields[number], string>>({ appointmentDuePriority:'', qrPriority:'', livePriority:'', antiStarvationThresholdMinutes:'', antiStarvationPointsPerMinute:'', appointmentGraceMinutes:'', appointmentLatePenaltyPerMinute:'', appointmentLatePenaltyMaxPoints:'' });

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
      setValues(Object.fromEntries(fields.map((field) => [field, String(data[field])])) as typeof values);
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
    return () => { requestId.current += 1; };
  }, [fetchPolicy]);

  // Client-side Validation (Sprint #2 rules):
  // 1. Integer range 0..1000
  // 2. appointmentDuePriority > qrPriority
  // 3. Equal priorities are invalid
  const nums = Object.fromEntries(fields.map((field) => [field, Number(values[field])])) as Record<typeof fields[number], number>;
  const apptVal = nums.appointmentDuePriority;
  const qrVal = nums.qrPriority;

  let validationError: string | null = null;
  if (fields.some((field) => !values[field].trim() || !Number.isInteger(nums[field]))) {
    validationError = 'Введите целые числовые значения приоритетов';
  } else if (apptVal < 0 || apptVal > 1000 || qrVal < 0 || qrVal > 1000 || nums.livePriority < 0 || nums.livePriority > 1000 || nums.antiStarvationThresholdMinutes < 0 || nums.antiStarvationThresholdMinutes > 240 || nums.antiStarvationPointsPerMinute < 1 || nums.antiStarvationPointsPerMinute > 600 || nums.appointmentGraceMinutes < 0 || nums.appointmentGraceMinutes > 120 || nums.appointmentLatePenaltyPerMinute < 0 || nums.appointmentLatePenaltyPerMinute > 600 || nums.appointmentLatePenaltyMaxPoints < 0 || nums.appointmentLatePenaltyMaxPoints > 1000 || nums.appointmentLatePenaltyMaxPoints > apptVal) {
    validationError = 'Приоритеты должны быть целыми числами в диапазоне от 0 до 1000';
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
      setValues(Object.fromEntries(fields.map((field) => [field, String(updated[field])])) as typeof values);
      setNotice({
        type: 'success',
        message: `Правила очереди успешно сохранены! Версия обновлена: ${updated.version}`,
      });
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof AdminApiError && err.status === 409 && err.code === 'POLICY_VERSION_CONFLICT') {
        setNotice({
          type: 'warning',
          message: 'Настройки были изменены. Обновляем актуальную версию.',
        });
        // Immediately fetch the newer policy as mandated by contract
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

  return (
    <div className="admin-panel-card queue-policy-card">
      <div className="queue-policy-header">
        <div>
          <h2>Приоритеты очереди</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            {branchName ? `Отделение: ${branchName}` : `ID отделения: ${branchId}`}
          </p>
        </div>
        {policy && (
          <div className="policy-version-badge">
            <span>Текущая версия: </span>
            <strong>{policy.version}</strong>
          </div>
        )}
      </div>

      {notice && (
        <div
          role="alert"
          className={`alert-box ${
            notice.type === 'success'
              ? 'alert-success'
              : notice.type === 'warning'
              ? 'alert-warning'
              : 'alert-error'
          }`}
          style={{ marginTop: '16px', marginBottom: '16px' }}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setNotice(null)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: '#64748b', padding: '24px 0' }}>Загрузка правил очереди...</p>
      ) : !policy ? (
        <button type="button" onClick={() => { setNotice(null); void fetchPolicy(); }}>Повторить загрузку</button>
      ) : (
        <form onSubmit={handleSave} className="policy-form">
          {fields.map((field) => {
            const labels: Record<typeof field, string> = { appointmentDuePriority: 'Приоритет предварительной записи', qrPriority: 'Приоритет QR', livePriority: 'Приоритет живой очереди', antiStarvationThresholdMinutes: 'Порог защиты от долгого ожидания', antiStarvationPointsPerMinute: 'Баллов за минуту после порога', appointmentGraceMinutes: 'Льготный период записи', appointmentLatePenaltyPerMinute: 'Штраф за минуту опоздания', appointmentLatePenaltyMaxPoints: 'Максимальный штраф' };
            return <div className="form-group" key={field}><label htmlFor={`input-${field}`}>{labels[field]}</label><input id={`input-${field}`} type="number" required step="1" className="operator-select policy-input" value={values[field]} onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))} disabled={isSaving || isLoading} /></div>;
          })}

          {validationError && (
            <div className="validation-error-text" role="alert">
              ⚠️ {validationError}
            </div>
          )}

          {policy?.updatedAt && (
            <div className="policy-updated-text">
              Последнее обновление: {new Date(policy.updatedAt).toLocaleString()}
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button
              type="submit"
              id="btn-save-policy"
              className="btn btn-primary"
              disabled={!isFormValid || isSaving || isLoading}
            >
              {isSaving ? <span className="spinner" /> : null}
              <span>Сохранить правила очереди</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
