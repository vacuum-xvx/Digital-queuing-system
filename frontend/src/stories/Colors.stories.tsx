import React from 'react';

export default {
  title: 'Design System/Colors',
};

const PALETTE = [
  { name: 'Pochta Electric Blue', hex: '#1A34E8', role: 'Основной цвет бренда, кнопки, активные талоны', variable: '--pochta-blue' },
  { name: 'Pochta Hover Blue', hex: '#5975FF', role: 'Состояние наведения', variable: '--pochta-blue-hover' },
  { name: 'Pochta Deep Navy', hex: '#010E3E', role: 'Хедер, ночной режим, ТВ-табло', variable: '--pochta-navy' },
  { name: 'Pochta Postal Red', hex: '#FF3A44', role: 'Акценты, тревоги, отмены, марки', variable: '--pochta-red' },
  { name: 'Pochta Warning Gold', hex: '#FF9C00', role: 'Предупреждения, пиковые часы нагрузки', variable: '--pochta-orange' },
  { name: 'Pochta Success Emerald', hex: '#2DA771', role: 'Успешное завершение, свободные слоты', variable: '--pochta-green' },
  { name: 'Surface Ice Blue', hex: '#F0F4FF', role: 'Мягкий фон карточек услуг и бейджей', variable: '--secondary' },
  { name: 'Canvas Background', hex: '#F8FAFC', role: 'Общий фон экранов', variable: '--background' },
  { name: 'Border Subtle', hex: '#DFE1F4', role: 'Деликатные границы карточек', variable: '--border' },
];

export const Palette = () => (
  <div style={{ fontFamily: 'var(--font-sans)', padding: '2rem', maxWidth: '1000px' }}>
    <header style={{ marginBottom: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#010E3E', margin: '0 0 0.5rem 0' }}>
        Дизайн-система «Цифровая Очередь» • Палитра Pochta Modern Digital
      </h1>
      <p style={{ color: '#64748B', fontSize: '0.95rem' }}>
        Фирменные цвета, извлеченные из актуального портала pochta.ru и стандартизированные в формате CSS-токенов.
      </p>
    </header>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
      {PALETTE.map((c) => (
        <div
          key={c.name}
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #DFE1F4',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(1, 14, 62, 0.04)',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ height: '90px', background: c.hex, borderBottom: '1px solid rgba(0,0,0,0.06)' }} />
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <strong style={{ fontSize: '1rem', color: '#010E3E' }}>{c.name}</strong>
              <code style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1A34E8', background: '#F0F4FF', padding: '2px 6px', borderRadius: '6px' }}>
                {c.hex}
              </code>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 0.5rem 0' }}>{c.role}</p>
            <code style={{ fontSize: '0.75rem', color: '#94A3B8' }}>var({c.variable})</code>
          </div>
        </div>
      ))}
    </div>
  </div>
);
