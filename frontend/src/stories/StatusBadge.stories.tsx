import React from 'react';
import { SolarBell, SolarClock, SolarTicket } from '../components/common/PostalIcons';

export default {
  title: 'Design System/StatusBadge',
};

export const StatusBadges = () => (
  <div style={{ fontFamily: 'var(--font-sans)', padding: '2rem', maxWidth: '800px' }}>
    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#010E3E', marginBottom: '1.5rem' }}>
      Статусы талонов очереди
    </h1>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. В очереди */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #DFE1F4' }}>
        <div>
          <strong style={{ fontSize: '1.1rem', color: '#010E3E' }}>Талон А-042</strong>
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748B' }}>Перед вами 2 человека (~6 мин)</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '9999px', background: '#F0F4FF', color: '#1A34E8', fontWeight: 700, fontSize: '0.85rem', border: '1px solid #C9D6F2' }}>
          <SolarClock size={16} />
          Вы в очереди
        </span>
      </div>

      {/* 2. Вас вызывают (с динамической анимацией) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', background: '#F0F4FF', borderRadius: '16px', border: '2px solid #1A34E8', boxShadow: '0 0 0 4px rgba(26, 52, 232, 0.15)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#FF3A44', animation: 'pulse 1.5s infinite' }} />
            <strong style={{ fontSize: '1.25rem', color: '#010E3E' }}>Талон А-042</strong>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#1A34E8' }}>
            Пройдите к Окну № 4
          </p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', borderRadius: '9999px', background: '#1A34E8', color: '#FFFFFF', fontWeight: 800, fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(26, 52, 232, 0.3)' }}>
          <SolarBell size={18} />
          Вас вызывают!
        </span>
      </div>

      {/* 3. Идет обслуживание */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #DFE1F4' }}>
        <div>
          <strong style={{ fontSize: '1.1rem', color: '#010E3E' }}>Талон А-042</strong>
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748B' }}>Обслуживание в Окне № 4</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '9999px', background: '#FFF8E6', color: '#B36B00', fontWeight: 700, fontSize: '0.85rem', border: '1px solid #FFE08A' }}>
          <SolarTicket size={16} />
          Обслуживание
        </span>
      </div>

      {/* 4. Завершено */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #DFE1F4' }}>
        <div>
          <strong style={{ fontSize: '1.1rem', color: '#64748B' }}>Талон А-042</strong>
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#94A3B8' }}>Визит успешно завершен в 16:40</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '9999px', background: '#E8F8F0', color: '#2DA771', fontWeight: 700, fontSize: '0.85rem', border: '1px solid #A3E5C2' }}>
          ✓ Завершено
        </span>
      </div>
    </div>
  </div>
);
