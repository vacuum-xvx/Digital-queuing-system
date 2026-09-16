import React from 'react';
import { Branch } from '../../api/operator/types';

interface BranchSelectorProps {
  branches: Branch[];
  selectedBranchId: string;
  isLoading: boolean;
  onSelectBranch: (branchId: string) => void;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  branches,
  selectedBranchId,
  isLoading,
  onSelectBranch,
}) => {
  return (
    <div className="operator-card">
      <h2>1. Выберите отделение</h2>
      {isLoading ? (
        <p style={{ color: '#64748b', fontSize: '14px' }}>Загрузка отделений...</p>
      ) : branches.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '14px' }}>Отделения не найдены</p>
      ) : (
        <select
          id="operator-branch-select"
          className="operator-select"
          value={selectedBranchId}
          onChange={(e) => onSelectBranch(e.target.value)}
          aria-label="Выбор отделения"
        >
          <option value="">-- Выберите отделение --</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};
