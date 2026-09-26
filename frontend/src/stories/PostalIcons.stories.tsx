import React from 'react';
import {
  SolarBox,
  SolarLetter,
  SolarTicket,
  SolarClock,
  SolarBell,
  SolarQr,
  SolarOperator,
  Icon3DParcel,
  Icon3DLetter,
  Icon3DTicket,
  Icon3DClock,
  Icon3DBell,
} from '../components/common/PostalIcons';

export default {
  title: 'Design System/PostalIcons',
};

export const IconsOverview = () => (
  <div style={{ fontFamily: 'var(--font-sans)', padding: '2rem', maxWidth: '1000px' }}>
    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#010E3E', marginBottom: '0.5rem' }}>
      Коллекция иконок: Solar Icons & 3D Tactile Badges
    </h1>
    <p style={{ color: '#64748B', marginBottom: '2rem' }}>
      Иконки извлечены и стилизованы на основе рекомендаций iconify.design, solar-icons и 3dicons.co.
    </p>

    {/* 3D Иконки */}
    <section style={{ marginBottom: '2.5rem', background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #DFE1F4' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#010E3E', marginBottom: '1rem' }}>
        3D Tactile Accents (В стиле 3dicons.co)
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.5rem', textAlign: 'center' }}>
        <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px' }}>
          <Icon3DParcel size={56} style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#010E3E', margin: 0 }}>Посылки и EMS</p>
        </div>
        <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px' }}>
          <Icon3DLetter size={56} style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#010E3E', margin: 0 }}>Письма и открытки</p>
        </div>
        <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px' }}>
          <Icon3DTicket size={56} style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#010E3E', margin: 0 }}>Электронный талон</p>
        </div>
        <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px' }}>
          <Icon3DClock size={56} style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#010E3E', margin: 0 }}>Расчетный ETA</p>
        </div>
        <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px' }}>
          <Icon3DBell size={56} style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#010E3E', margin: 0 }}>Вызов к окну</p>
        </div>
      </div>
    </section>

    {/* Solar Линейные иконки */}
    <section style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #DFE1F4' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#010E3E', marginBottom: '1rem' }}>
        Solar Icons (Линейные векторные глифы)
      </h2>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', color: '#1A34E8' }}>
        <div style={{ textAlign: 'center' }}>
          <SolarBox size={32} />
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>SolarBox</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SolarLetter size={32} />
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>SolarLetter</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SolarTicket size={32} />
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>SolarTicket</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SolarClock size={32} />
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>SolarClock</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SolarBell size={32} />
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>SolarBell</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SolarQr size={32} />
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>SolarQr</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SolarOperator size={32} />
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>SolarOperator</p>
        </div>
      </div>
    </section>
  </div>
);
