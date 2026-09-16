import React, { useState } from 'react';
import { PriorityRule } from '../../api/admin/types';

interface PrioritySettingsViewProps {
  initialPriorities: PriorityRule[];
  onSave: (rules: PriorityRule[]) => Promise<void>;
}

export const PrioritySettingsView: React.FC<PrioritySettingsViewProps> = ({
  initialPriorities,
  onSave,
}) => {
  const [rules, setRules] = useState<PriorityRule[]>(initialPriorities);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleWeightChange = (index: number, newWeight: number) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], weight: newWeight };
    setRules(updated);
    setIsSaved(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(rules);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-panel-card">
      <h2>Настройка правил приоритета очереди</h2>
      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
        Алгоритм очереди использует настраиваемые весовые коэффициенты для балансировки между
        предварительной записью, электронными талонами по QR-коду и живой очередью.
      </p>

      {rules.map((rule, idx) => (
        <div key={rule.source} className="priority-rule-card">
          <div className="priority-rule-header">
            <span className="priority-rule-name">{rule.name}</span>
            <span className="priority-weight-badge">Вес: {rule.weight.toFixed(1)}x</span>
          </div>
          <div className="priority-rule-desc">{rule.description}</div>
          <div className="slider-group">
            <span style={{ fontSize: '12px', color: '#64748b' }}>0.5x</span>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={rule.weight}
              onChange={(e) => handleWeightChange(idx, parseFloat(e.target.value))}
              aria-label={`Вес приоритета для ${rule.name}`}
            />
            <span style={{ fontSize: '12px', color: '#64748b' }}>2.5x</span>
            <span style={{ fontWeight: 700, minWidth: '40px' }}>{rule.weight.toFixed(1)}x</span>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn-save-priorities"
        disabled={isSaving}
        onClick={handleSave}
      >
        {isSaving ? 'Сохранение...' : isSaved ? '✓ Сохранено в конфигурацию' : 'Сохранить правила приоритетов'}
      </button>
    </div>
  );
};
