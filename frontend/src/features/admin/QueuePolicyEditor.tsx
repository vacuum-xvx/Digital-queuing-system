import React, { useState, useEffect, useCallback } from 'react';
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
  const [appointmentDuePriority, setAppointmentDuePriority] = useState<string>('');
  const [qrPriority, setQrPriority] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const fetchPolicy = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getQueuePolicy(branchId);
      setPolicy(data);
      setAppointmentDuePriority(String(data.appointmentDuePriority));
      setQrPriority(String(data.qrPriority));
    } catch (err) {
      setNotice({
        type: 'error',
        message:
          err instanceof AdminApiError
            ? `Ошибка загрузки правил очереди: ${err.message}`
            : 'Не удалось связаться с сервером при получении правил очереди',
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  // Client-side Validation (Sprint #2 rules):
  // 1. Integer range 0..1000
  // 2. appointmentDuePriority > qrPriority
  // 3. Equal priorities are invalid
  const apptVal = parseInt(appointmentDuePriority, 10);
  const qrVal = parseInt(qrPriority, 10);

  let validationError: string | null = null;
  if (isNaN(apptVal) || isNaN(qrVal)) {
    validationError = 'Введите числовые значения приоритетов';
  } else if (apptVal < 0 || apptVal > 1000 || qrVal < 0 || qrVal > 1000) {
    validationError = 'Приоритеты должны быть целыми числами в диапазоне от 0 до 1000';
  } else if (apptVal === qrVal) {
    validationError = 'Приоритет предварительной записи и QR не могут быть равны';
  } else if (apptVal <= qrVal) {
    validationError = 'Приоритет предварительной записи должен быть строго больше приоритета QR';
  }

  const isFormValid = !validationError && policy !== null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !policy || isSaving) return;

    setIsSaving(true);
    setNotice(null);

    try {
      const updated = await api.updateQueuePolicy(branchId, {
        appointmentDuePriority: apptVal,
        qrPriority: qrVal,
        expectedVersion: policy.version,
      });

      setPolicy(updated);
      setAppointmentDuePriority(String(updated.appointmentDuePriority));
      setQrPriority(String(updated.qrPriority));
      setNotice({
        type: 'success',
        message: `Правила очереди успешно сохранены! Версия обновлена: ${updated.version}`,
      });
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'POLICY_VERSION_CONFLICT') {
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
          <h2>Редактор правил очереди (Queue Policy)</h2>
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

      {isLoading && !policy ? (
        <p style={{ color: '#64748b', padding: '24px 0' }}>Загрузка правил очереди...</p>
      ) : (
        <form onSubmit={handleSave} className="policy-form">
          <div className="form-group">
            <label htmlFor="input-appt-priority">
              Приоритет предварительной записи:
              <span className="label-hint"> (0..1000, должен быть выше QR)</span>
            </label>
            <input
              id="input-appt-priority"
              type="number"
              min="0"
              max="1000"
              className="operator-select policy-input"
              value={appointmentDuePriority}
              onChange={(e) => setAppointmentDuePriority(e.target.value)}
              disabled={isSaving || isLoading}
            />
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label htmlFor="input-qr-priority">
              Приоритет QR:
              <span className="label-hint"> (0..1000)</span>
            </label>
            <input
              id="input-qr-priority"
              type="number"
              min="0"
              max="1000"
              className="operator-select policy-input"
              value={qrPriority}
              onChange={(e) => setQrPriority(e.target.value)}
              disabled={isSaving || isLoading}
            />
          </div>

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
