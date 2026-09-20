import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  disabled?: boolean;
  itemLabel: string;
}

export function Pagination({ page, total, pageSize = 25, onPageChange, onPageSizeChange, disabled = false, itemLabel }: PaginationProps) {
  if (!Number.isFinite(total) || !Number.isFinite(pageSize) || pageSize <= 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav className="data-pagination" aria-label={`Навигация по ${itemLabel}`}>
      <span className="data-pagination__summary">{first}–{last} из {total}</span>
      {onPageSizeChange && (
        <label className="data-pagination__size">
          Записей на странице:{' '}
          <select value={pageSize} disabled={disabled} onChange={event => onPageSizeChange(Number(event.target.value))}>
            {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      )}
      <div className="data-pagination__controls">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1} aria-label="Предыдущая страница">
          <ChevronLeft aria-hidden="true" /> Назад
        </button>
        <span aria-live="polite">Страница {page} из {pageCount}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= pageCount} aria-label="Следующая страница">
          Вперёд <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}