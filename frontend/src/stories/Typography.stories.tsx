import React from 'react';

export default {
  title: 'Design System/Typography',
};

export const TypeScale = () => (
  <div style={{ fontFamily: 'var(--font-sans)', padding: '2rem', maxWidth: '900px' }}>
    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#010E3E', marginBottom: '1.5rem' }}>
      Типографика: Golos Text & JetBrains Mono
    </h1>

    <section style={{ marginBottom: '2.5rem', background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #DFE1F4' }}>
      <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', marginBottom: '1rem' }}>
        Номера талонов очереди (JetBrains Mono / Display)
      </h2>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <span style={{ fontSize: '3.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#1A34E8', letterSpacing: '-0.02em' }}>
            A-042
          </span>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>Крупный экран / ТВ-табло / Kiosk (3.5rem)</p>
        </div>
        <div>
          <span style={{ fontSize: '2.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#010E3E' }}>
            П-114
          </span>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>Мобильный талон клиента (2.25rem)</p>
        </div>
        <div>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#010E3E' }}>
            B-007
          </span>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>Карточка оператора (1.5rem)</p>
        </div>
      </div>
    </section>

    <section style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #DFE1F4' }}>
      <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', marginBottom: '1rem' }}>
        Иерархия интерфейса (Golos Text)
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#010E3E', margin: 0 }}>
            Электронная очередь Почты России
          </h1>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0' }}>H1 — 2rem (32px), Bold 800</p>
        </div>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#010E3E', margin: 0 }}>
            Выберите услугу или запишитесь ко времени
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0' }}>H2 — 1.35rem (22px), Bold 700</p>
        </div>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#010E3E', margin: 0 }}>
            Отделение 390000, Рязань, ул. Почтовая 49
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0' }}>H3 — 1.05rem (17px), SemiBold 600</p>
        </div>
        <div>
          <p style={{ fontSize: '0.925rem', color: '#252630', margin: 0, lineHeight: 1.5 }}>
            Основной текст интерфейса: четкий, сбалансированный и удобный для чтения пожилыми гражданами и на экранах терминалов самообслуживания.
          </p>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0' }}>Body — 0.925rem (15px), Regular 400</p>
        </div>
      </div>
    </section>
  </div>
);
