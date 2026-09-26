import React, { useId, useState } from 'react';

/**
 * =============================================================================
 * ПОЧТОВЫЕ ИКОНКИ И 3D-АКЦЕНТЫ «ПОЧТА РОССИИ» (Modern Digital Design System)
 * =============================================================================
 * Коллекция векторных иконок нового поколения:
 * 1. Solar Icons (Linear + Duotone) — 24x24 геометрические векторные иконки
 *    с поддержкой вариаций outline и полупрозрачного двухтонового акцента.
 * 2. 3D Vector Badges (в стиле 3dicons.co) — фирменная палитра Почты России
 *    (Electric Blue, Classic Navy, Vibrant Red, Postal Gold) с тактильным
 *    освещением, бликами и мягкими объемными тенями.
 * 3. Postal3DBadge — готовый карточный бейдж для витрин, киосков и табло.
 * 4. PostalIconsGallery (PostalIconsStory) — интерактивная витрина и тест-стори.
 * =============================================================================
 */

// =============================================================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// =============================================================================

export interface SolarIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  variant?: 'linear' | 'duotone';
  color?: string;
  secondaryColor?: string;
  secondaryOpacity?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
}

export interface Icon3DProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  title?: string;
}

export type SolarIconName =
  | 'SolarBox'
  | 'SolarLetter'
  | 'SolarTicket'
  | 'SolarClock'
  | 'SolarBell'
  | 'SolarQr'
  | 'SolarOperator'
  | 'SolarSparkles'
  | 'SolarAlert';

export type Icon3DName =
  | 'Icon3DParcel'
  | 'Icon3DLetter'
  | 'Icon3DTicket'
  | 'Icon3DClock'
  | 'Icon3DBell';

// =============================================================================
// ЧАСТЬ 1: SOLAR ICONS COLLECTION (Linear + Duotone)
// =============================================================================

/**
 * 1. SolarBox — Посылка / Отправление
 */
export function SolarBox({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.3,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Посылка / Отправление',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Duotone подложка верхней крышки */}
      {isDuotone && (
        <path
          d="M12 2.5L20.5 7L12 11.5L3.5 7L12 2.5Z"
          fill={secColor}
          fillOpacity={secondaryOpacity}
        />
      )}
      {/* Изометрический контур коробки */}
      <path
        d="M12 2.5L20.5 7L12 11.5L3.5 7L12 2.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 7V16.5L12 21V11.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 7V16.5L12 21"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Почтовый скотч / маркировка */}
      <path
        d="M7.75 4.75L16.25 9.25"
        stroke={isDuotone ? secColor : color}
        strokeOpacity={isDuotone ? 0.75 : 1}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M12 11.5V17"
        stroke={isDuotone ? secColor : color}
        strokeOpacity={isDuotone ? 0.6 : 1}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 2. SolarLetter — Письмо / Корреспонденция
 */
export function SolarLetter({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.25,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Письмо / Корреспонденция',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Корпус конверта */}
      <rect
        x="2.5"
        y="4.5"
        width="19"
        height="15"
        rx="3"
        stroke={color}
        strokeWidth={strokeWidth}
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Верхний клапан */}
      <path
        d="M3 6.5L10.85 12.15C11.54 12.65 12.46 12.65 13.15 12.15L21 6.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Нижние диагональные складки */}
      <path
        d="M3 18.5L8.5 13.5M21 18.5L15.5 13.5"
        stroke={isDuotone ? secColor : color}
        strokeOpacity={isDuotone ? 0.6 : 1}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 3. SolarTicket — Электронный талон очереди
 */
export function SolarTicket({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.25,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Электронный талон очереди',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Купон с боковыми вырезами */}
      <path
        d="M2.5 8C4 8 5.25 9.25 5.25 10.75C5.25 12.25 4 13.5 2.5 13.5V17C2.5 18.66 3.84 20 5.5 20H18.5C20.16 20 21.5 18.66 21.5 17V13.5C20 13.5 18.75 12.25 18.75 10.75C18.75 9.25 20 8 21.5 8V7C21.5 5.34 20.16 4 18.5 4H5.5C3.84 4 2.5 5.34 2.5 7V8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Перфорационная линия */}
      <path
        d="M9.5 5V19"
        stroke={isDuotone ? secColor : color}
        strokeOpacity={isDuotone ? 0.75 : 1}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray="2 2.5"
      />
      {/* Строки данных талона */}
      <path
        d="M13 9H17.5M13 12.5H16M13 16H17.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Индикатор номера */}
      <circle
        cx="6"
        cy="10.75"
        r="1"
        fill={color}
      />
    </svg>
  );
}

/**
 * 4. SolarClock — Время ожидания / Расчетный ETA
 */
export function SolarClock({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.22,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Время ожидания / Расчетный ETA',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Циферблат */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth={strokeWidth}
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Стрелки часов */}
      <path
        d="M12 7.5V12L15.5 14"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Метки 12, 3, 6, 9 */}
      <path
        d="M12 3.25V4.5M12 19.5V20.75M3.25 12H4.5M19.5 12H20.75"
        stroke={isDuotone ? secColor : color}
        strokeOpacity={isDuotone ? 0.7 : 0.8}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 5. SolarBell — Вас вызывают к окну! / Уведомления
 */
export function SolarBell({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.25,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Вас вызывают к окну!',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Купол колокола */}
      <path
        d="M18 16V10.5C18 7.19 15.31 4.5 12 4.5C8.69 4.5 6 7.19 6 10.5V16L4 18H20L18 16Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Верхняя петля */}
      <path
        d="M12 2C10.9 2 10 2.9 10 4V4.5H14V4C14 2.9 13.1 2 12 2Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Язычок колокола */}
      <path
        d="M10 19C10.25 20.15 11 21 12 21C13 21 13.75 20.15 14 19"
        stroke={isDuotone ? secColor : color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Звуковые волны вызова в режиме duotone */}
      {isDuotone && (
        <path
          d="M20.5 9C21.4 10.3 22 11.8 22 13.5M3.5 9C2.6 10.3 2 11.8 2 13.5"
          stroke={secColor}
          strokeOpacity={0.65}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * 6. SolarQr — QR-код талона / Сканер
 */
export function SolarQr({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.45,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'QR-код талона',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Верхний левый угол */}
      <rect
        x="3"
        y="3"
        width="7"
        height="7"
        rx="2"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <rect
        x="5.5"
        y="5.5"
        width="2"
        height="2"
        rx="0.5"
        fill={color}
      />

      {/* Верхний правый угол */}
      <rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="2"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <rect
        x="16.5"
        y="5.5"
        width="2"
        height="2"
        rx="0.5"
        fill={color}
      />

      {/* Нижний левый угол */}
      <rect
        x="3"
        y="14"
        width="7"
        height="7"
        rx="2"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <rect
        x="5.5"
        y="16.5"
        width="2"
        height="2"
        rx="0.5"
        fill={color}
      />

      {/* Модули данных */}
      <path
        d="M14 14H16.5V16.5H14ZM19 14H21V16H19ZM16.5 19H19V21H16.5ZM14 19H14.5V21H14ZM19 18.5H21V21H19ZM11 4H12V6H11ZM4 11H6V12H4ZM11 11H12.5V12.5H11ZM11 18H12.5V20H11Z"
        fill={isDuotone ? secColor : color}
        fillOpacity={isDuotone ? secondaryOpacity : 1}
      />
    </svg>
  );
}

/**
 * 7. SolarOperator — Оператор окна / Сотрудник отделения
 */
export function SolarOperator({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.25,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Оператор окна',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Голова оператора */}
      <circle
        cx="12"
        cy="8"
        r="3.5"
        stroke={color}
        strokeWidth={strokeWidth}
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Гарнитура связи */}
      <path
        d="M8.5 8.5C8.5 6.57 10.07 5 12 5C13.93 5 15.5 6.57 15.5 8.5V10.25C15.5 11.08 14.83 11.75 14 11.75H13"
        stroke={isDuotone ? secColor : color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="11.75"
        r="0.75"
        fill={isDuotone ? secColor : color}
      />
      {/* Плечи / Корпус */}
      <path
        d="M5 20C5 16.5 8.13 14 12 14C15.87 14 19 16.5 19 20"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Стойка окна обслуживания */}
      <path
        d="M2.5 21H21.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 8. SolarSparkles — Интеллектуальная оптимизация / AI Smart Queue
 */
export function SolarSparkles({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.35,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Интеллектуальная оптимизация',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Главная 4-конечная звезда */}
      <path
        d="M12 2C12 7.2 16 11 21 11C16 11 12 14.8 12 20C12 14.8 8 11 3 11C8 11 12 7.2 12 2Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Вспомогательная верхняя искра */}
      <path
        d="M5 2C5 3.7 6.3 5 8 5C6.3 5 5 6.3 5 8C5 6.3 3.7 5 2 5C3.7 5 5 3.7 5 2Z"
        fill={isDuotone ? secColor : color}
        fillOpacity={isDuotone ? 0.7 : 0.9}
      />
      {/* Вспомогательная нижняя искра */}
      <path
        d="M18.5 15C18.5 16.3 19.5 17.2 20.8 17.2C19.5 17.2 18.5 18.1 18.5 19.4C18.5 18.1 17.5 17.2 16.2 17.2C17.5 17.2 18.5 16.3 18.5 15Z"
        fill={isDuotone ? secColor : color}
        fillOpacity={isDuotone ? 0.7 : 0.9}
      />
    </svg>
  );
}

/**
 * 9. SolarAlert — Предупреждение / Аномалия очереди
 */
export function SolarAlert({
  size = 24,
  variant = 'duotone',
  color = 'currentColor',
  secondaryColor,
  secondaryOpacity = 0.25,
  strokeWidth = 1.5,
  className = '',
  title,
  'aria-label': ariaLabel = 'Предупреждение',
  ...rest
}: SolarIconProps) {
  const secColor = secondaryColor || color;
  const isDuotone = variant === 'duotone';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* Скругленный треугольник предупреждения */}
      <path
        d="M10.27 3.65C11.04 2.32 12.96 2.32 13.73 3.65L21.41 16.95C22.18 18.28 21.22 19.95 19.68 19.95H4.32C2.78 19.95 1.82 18.28 2.59 16.95L10.27 3.65Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={isDuotone ? secColor : 'none'}
        fillOpacity={isDuotone ? secondaryOpacity : 0}
      />
      {/* Восклицательный знак */}
      <path
        d="M12 8.5V13"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="16.5"
        r="1"
        fill={color}
      />
    </svg>
  );
}

// =============================================================================
// ЧАСТЬ 2: 3D-STYLED VECTOR ICON ACCENTS (В стиле 3dicons.co)
// Фирменные цвета: Electric Blue #1A34E8, Navy #003B73, Red #FF3A44, Gold #FFB800
// =============================================================================

/**
 * 1. Icon3DParcel — Посылки и EMS
 * Векторный 3D-бандероль/посылка с фирменным синим корпусом, золотым почтовым скотчем
 * и акцентным шильдиком экспресс-доставки EMS.
 */
export function Icon3DParcel({
  size = 64,
  className = '',
  title = 'Посылки и EMS',
  'aria-label': ariaLabel = 'Посылки и EMS',
  ...rest
}: Icon3DProps) {
  const uid = useId().replace(/:/g, '');
  const shadowId = `p-sh-${uid}`;
  const topGradId = `p-tg-${uid}`;
  const leftGradId = `p-lg-${uid}`;
  const rightGradId = `p-rg-${uid}`;
  const tapeGradId = `p-tp-${uid}`;
  const emsGradId = `p-em-${uid}`;
  const specGradId = `p-sp-${uid}`;

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      <title>{title}</title>
      <defs>
        {/* Базовая мягкая тень */}
        <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#010E3E" stopOpacity="0.32" />
          <stop offset="60%" stopColor="#010E3E" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#010E3E" stopOpacity="0" />
        </radialGradient>
        {/* Верхняя освещенная грань (Pochta Blue) */}
        <linearGradient id={topGradId} x1="20" y1="24" x2="108" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5975FF" />
          <stop offset="45%" stopColor="#1A34E8" />
          <stop offset="100%" stopColor="#0A24CC" />
        </linearGradient>
        {/* Левая затененная грань (Deep Postal Navy) */}
        <linearGradient id={leftGradId} x1="20" y1="44" x2="64" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F24A6" />
          <stop offset="100%" stopColor="#020936" />
        </linearGradient>
        {/* Правая прямая грань */}
        <linearGradient id={rightGradId} x1="64" y1="66" x2="108" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1A34E8" />
          <stop offset="100%" stopColor="#07197A" />
        </linearGradient>
        {/* Золотистый упаковочный скотч */}
        <linearGradient id={tapeGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="50%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#E69500" />
        </linearGradient>
        {/* Красный бейдж EMS */}
        <linearGradient id={emsGradId} x1="74" y1="56" x2="106" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF5C66" />
          <stop offset="60%" stopColor="#FF3A44" />
          <stop offset="100%" stopColor="#C91823" />
        </linearGradient>
        {/* Тактильный блик */}
        <linearGradient id={specGradId} x1="30" y1="24" x2="90" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Мягкая нижняя тень */}
      <ellipse cx="64" cy="116" rx="44" ry="8" fill={`url(#${shadowId})`} />

      {/* Корпус 3D посылки: Левая грань */}
      <path
        d="M20 44 L64 66 L64 104 L20 82 Z"
        fill={`url(#${leftGradId})`}
      />

      {/* Корпус 3D посылки: Правая грань */}
      <path
        d="M64 66 L108 44 L108 82 L64 104 Z"
        fill={`url(#${rightGradId})`}
      />

      {/* Корпус 3D посылки: Верхняя крышка */}
      <path
        d="M64 22 L108 44 L64 66 L20 44 Z"
        fill={`url(#${topGradId})`}
      />

      {/* Верхний тактильный блик крышки */}
      <path
        d="M64 24 L102 43 L64 62 L26 43 Z"
        fill={`url(#${specGradId})`}
      />

      {/* Фирменный золотой почтовый скотч (лента по центру) */}
      <path
        d="M56 26 L72 34 L72 58 L56 50 Z"
        fill={`url(#${tapeGradId})`}
      />
      <path
        d="M56 50 L64 54 L64 104 L56 100 Z"
        fill="#E69500"
      />
      <path
        d="M64 54 L72 50 L72 100 L64 104 Z"
        fill={`url(#${tapeGradId})`}
      />

      {/* EMS Экспресс-наклейка на правой грани */}
      <g filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))">
        <path
          d="M80 58 L104 46 L104 74 L80 86 Z"
          fill={`url(#${emsGradId})`}
        />
        {/* Текст EMS и молния */}
        <text
          x="92"
          y="70"
          fill="#FFFFFF"
          fontWeight="900"
          fontSize="9"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.5"
          textAnchor="middle"
          transform="skewY(-15) translate(14, 25)"
        >
          EMS
        </text>
      </g>

      {/* Световые контуры граней */}
      <path
        d="M20 44 L64 66 L108 44"
        stroke="#FFFFFF"
        strokeOpacity="0.25"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M64 66 L64 104"
        stroke="#FFFFFF"
        strokeOpacity="0.2"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * 2. Icon3DLetter — Письма и открытки
 * Объемный парящий почтовый конверт с фирменной восковой печатью Почты России
 * и микро-маркой с тиснением.
 */
export function Icon3DLetter({
  size = 64,
  className = '',
  title = 'Письма и открытки',
  'aria-label': ariaLabel = 'Письма и открытки',
  ...rest
}: Icon3DProps) {
  const uid = useId().replace(/:/g, '');
  const shadowId = `l-sh-${uid}`;
  const envBodyId = `l-eb-${uid}`;
  const envFoldId = `l-ef-${uid}`;
  const flapId = `l-fl-${uid}`;
  const sealId = `l-sl-${uid}`;
  const goldRimId = `l-gr-${uid}`;

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      <title>{title}</title>
      <defs>
        <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#010E3E" stopOpacity="0.3" />
          <stop offset="65%" stopColor="#010E3E" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#010E3E" stopOpacity="0" />
        </radialGradient>
        {/* Тело конверта — чистый почтовый лед */}
        <linearGradient id={envBodyId} x1="20" y1="24" x2="108" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#F0F4FF" />
          <stop offset="100%" stopColor="#DCE7FA" />
        </linearGradient>
        {/* Нижние складки конверта */}
        <linearGradient id={envFoldId} x1="20" y1="60" x2="108" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E9F0FD" />
          <stop offset="100%" stopColor="#CFDDF6" />
        </linearGradient>
        {/* Верхний отгибной клапан */}
        <linearGradient id={flapId} x1="24" y1="28" x2="104" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#EDF4FF" />
          <stop offset="100%" stopColor="#D4E4FC" />
        </linearGradient>
        {/* Красная восковая сургучная печать */}
        <linearGradient id={sealId} x1="52" y1="62" x2="76" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF5C66" />
          <stop offset="50%" stopColor="#FF3A44" />
          <stop offset="100%" stopColor="#B0121C" />
        </linearGradient>
        {/* Золотой ободок печати */}
        <linearGradient id={goldRimId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="100%" stopColor="#E69500" />
        </linearGradient>
      </defs>

      {/* Мягкая проекционная тень */}
      <ellipse cx="64" cy="115" rx="44" ry="7.5" fill={`url(#${shadowId})`} />

      {/* Основа конверта с тактильным объемом */}
      <rect
        x="20"
        y="28"
        width="88"
        height="68"
        rx="10"
        fill={`url(#${envBodyId})`}
        stroke="#CCD9F0"
        strokeWidth="1.2"
      />

      {/* Боковые складки */}
      <path
        d="M20 32 L64 68 L20 92 Z"
        fill="#E5EEFC"
        opacity="0.8"
      />
      <path
        d="M108 32 L64 68 L108 92 Z"
        fill="#DDE8F8"
        opacity="0.8"
      />

      {/* Нижний треугольный клапан */}
      <path
        d="M20 94 C20 95.5 21.5 96 24 96 H104 C106.5 96 108 95.5 108 94 L64 62 Z"
        fill={`url(#${envFoldId})`}
      />

      {/* Верхний треугольный клапан с объемной тенью */}
      <g filter="drop-shadow(0 4px 6px rgba(1, 14, 62, 0.12))">
        <path
          d="M21 30 C22 28.5 24 28 27 28 H101 C104 28 106 28.5 107 30 L64 72 Z"
          fill={`url(#${flapId})`}
          stroke="#EBF2FE"
          strokeWidth="1"
        />
      </g>

      {/* Миниатюрная синяя почтовая марка (в правом верхнем углу) */}
      <g transform="translate(86, 32)">
        <rect
          width="16"
          height="19"
          rx="2"
          fill="#1A34E8"
          stroke="#FFFFFF"
          strokeWidth="1"
        />
        {/* Зубчатая перфорация марки */}
        <circle cx="0" cy="5" r="1" fill="#FFFFFF" />
        <circle cx="0" cy="10" r="1" fill="#FFFFFF" />
        <circle cx="0" cy="15" r="1" fill="#FFFFFF" />
        <circle cx="16" cy="5" r="1" fill="#FFFFFF" />
        <circle cx="16" cy="10" r="1" fill="#FFFFFF" />
        <circle cx="16" cy="15" r="1" fill="#FFFFFF" />
        {/* Белый почтовый рожок на марке */}
        <path
          d="M5 10 C5 7.5 7 6 10 6 V8 C8.5 8 7 9 7 10 C7 11 8 11.5 9 11.5 V13 C7 13 5 12 5 10 Z"
          fill="#FFFFFF"
        />
      </g>

      {/* Фирменная сургучная печать Почты России */}
      <g filter="drop-shadow(0 4px 8px rgba(217, 37, 52, 0.35))">
        <circle
          cx="64"
          cy="73"
          r="13"
          fill={`url(#${goldRimId})`}
        />
        <circle
          cx="64"
          cy="73"
          r="11"
          fill={`url(#${sealId})`}
        />
        {/* Тиснение герба/рожка на сургуче */}
        <path
          d="M60 73 C60 70 62 68.5 65 68.5 V70.5 C63.5 70.5 62 71.5 62 73 C62 74.5 63.5 75.5 65 75.5 V77.5 C62 77.5 60 76 60 73 Z"
          fill="#FFE082"
        />
        <circle cx="67" cy="73" r="1.5" fill="#FFE082" />
      </g>

      {/* Верхний световой глянец */}
      <line
        x1="28"
        y1="29"
        x2="100"
        y2="29"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
    </svg>
  );
}

/**
 * 3. Icon3DTicket — Электронный талон очереди
 * Объемный талон электронной очереди с перфорацией, синим брендовым хэдером,
 * кодом очереди «А042» и золотой звездой приоритета.
 */
export function Icon3DTicket({
  size = 64,
  className = '',
  title = 'Электронный талон очереди',
  'aria-label': ariaLabel = 'Электронный талон очереди',
  ...rest
}: Icon3DProps) {
  const uid = useId().replace(/:/g, '');
  const shadowId = `t-sh-${uid}`;
  const headerGradId = `t-hg-${uid}`;
  const bodyGradId = `t-bg-${uid}`;
  const depthGradId = `t-dg-${uid}`;
  const starGradId = `t-sg-${uid}`;

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      <title>{title}</title>
      <defs>
        <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#010E3E" stopOpacity="0.32" />
          <stop offset="65%" stopColor="#010E3E" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#010E3E" stopOpacity="0" />
        </radialGradient>
        {/* Синий хэдер талона (Pochta Blue) */}
        <linearGradient id={headerGradId} x1="24" y1="20" x2="104" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4364FF" />
          <stop offset="50%" stopColor="#1A34E8" />
          <stop offset="100%" stopColor="#054FA6" />
        </linearGradient>
        {/* Тело талона (глянцевый пластик/бумага) */}
        <linearGradient id={bodyGradId} x1="24" y1="48" x2="104" y2="102" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#EBF0F8" />
        </linearGradient>
        {/* 3D-толщина талона снизу */}
        <linearGradient id={depthGradId} x1="24" y1="100" x2="104" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        {/* Золотая звезда приоритета */}
        <linearGradient id={starGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="100%" stopColor="#FF9C00" />
        </linearGradient>
      </defs>

      {/* Мягкая нижняя тень */}
      <ellipse cx="64" cy="116" rx="42" ry="7.5" fill={`url(#${shadowId})`} />

      {/* 3D Толщина (нижняя фаска) */}
      <path
        d="M25 24 H103 C106 24 109 27 109 30 V98 C109 101 106 104 103 104 H25 C22 104 19 101 19 98 V30 C19 27 22 24 25 24 Z"
        fill={`url(#${depthGradId})`}
        transform="translate(0, 4)"
      />

      {/* Основной контур талона с фирменными полукруглыми вырезами */}
      <g filter="drop-shadow(0 6px 12px rgba(1, 14, 62, 0.15))">
        {/* Белая база талона */}
        <path
          d="M28 20 H100 C104 20 108 24 108 28 V50 C103 50 99 54 99 59 C99 64 103 68 108 68 V96 C108 100 104 104 100 104 H28 C24 104 20 100 20 96 V68 C25 68 29 64 29 59 C29 54 25 50 20 50 V28 C20 24 24 20 28 20 Z"
          fill={`url(#${bodyGradId})`}
        />

        {/* Верхняя синяя брендовая плашка */}
        <path
          d="M28 20 H100 C104 20 108 24 108 28 V46 H20 V28 C20 24 24 20 28 20 Z"
          fill={`url(#${headerGradId})`}
        />
      </g>

      {/* Белая плашка-логотип Почты на синем хэдере */}
      <rect x="28" y="27" width="22" height="12" rx="3" fill="#FFFFFF" fillOpacity="0.2" />
      <text
        x="39"
        y="36"
        fill="#FFFFFF"
        fontWeight="800"
        fontSize="7"
        fontFamily="system-ui, sans-serif"
        textAnchor="middle"
        letterSpacing="0.6"
      >
        ПОЧТА
      </text>

      {/* Золотая звезда приоритета */}
      <path
        d="M96 28 L97.8 32.2 L102 32.6 L98.8 35.4 L99.7 39.5 L96 37.2 L92.3 39.5 L93.2 35.4 L90 32.6 L94.2 32.2 Z"
        fill={`url(#${starGradId})`}
      />

      {/* Пунктирная перфорация */}
      <line
        x1="29"
        y1="59"
        x2="99"
        y2="59"
        stroke="#94A3B8"
        strokeWidth="1.8"
        strokeDasharray="4 3.5"
      />

      {/* Главный номер очереди — объемный «А042» */}
      <text
        x="64"
        y="80"
        fill="#010E3E"
        fontWeight="900"
        fontSize="21"
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="1.5"
        textAnchor="middle"
      >
        А042
      </text>

      {/* Информационная строка окна */}
      <text
        x="64"
        y="93"
        fill="#1A34E8"
        fontWeight="700"
        fontSize="7.5"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.4"
        textAnchor="middle"
      >
        ОКНО № 4 • В ОЧЕРЕДИ
      </text>

      {/* Верхний световой блик */}
      <line
        x1="28"
        y1="21"
        x2="100"
        y2="21"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
    </svg>
  );
}

/**
 * 4. Icon3DClock — Время ожидания / Расчетный ETA
 * 3D-хронометр с глубоким синим безелем, золотой кнопкой пуска,
 * круговой шкалой прогноза ожидания и градиентным стеклянным бликом.
 */
export function Icon3DClock({
  size = 64,
  className = '',
  title = 'Время ожидания / Расчетный ETA',
  'aria-label': ariaLabel = 'Время ожидания / Расчетный ETA',
  ...rest
}: Icon3DProps) {
  const uid = useId().replace(/:/g, '');
  const shadowId = `c-sh-${uid}`;
  const bezelOuterId = `c-bo-${uid}`;
  const bezelFrontId = `c-bf-${uid}`;
  const dialId = `c-di-${uid}`;
  const crownId = `c-cr-${uid}`;
  const arcId = `c-ar-${uid}`;
  const glassId = `c-gl-${uid}`;

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      <title>{title}</title>
      <defs>
        <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#010E3E" stopOpacity="0.35" />
          <stop offset="65%" stopColor="#010E3E" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#010E3E" stopOpacity="0" />
        </radialGradient>
        {/* Внешний объемный корпус (темно-синий) */}
        <linearGradient id={bezelOuterId} x1="64" y1="26" x2="64" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3DE8" />
          <stop offset="50%" stopColor="#0B1E8A" />
          <stop offset="100%" stopColor="#010A30" />
        </linearGradient>
        {/* Лицевой безель (Electric Pochta Blue) */}
        <linearGradient id={bezelFrontId} x1="22" y1="24" x2="106" y2="106" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5975FF" />
          <stop offset="45%" stopColor="#1A34E8" />
          <stop offset="100%" stopColor="#0527A8" />
        </linearGradient>
        {/* Белоснежный циферблат с деликатной тенью */}
        <radialGradient id={dialId} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="75%" stopColor="#F0F4FF" />
          <stop offset="100%" stopColor="#D9E6FC" />
        </radialGradient>
        {/* Золотая заводная головка хронометра */}
        <linearGradient id={crownId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="50%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#C47A00" />
        </linearGradient>
        {/* Градиент динамического ETA (синий в красный) */}
        <linearGradient id={arcId} x1="64" y1="28" x2="96" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1A34E8" />
          <stop offset="60%" stopColor="#5975FF" />
          <stop offset="100%" stopColor="#FF3A44" />
        </linearGradient>
        {/* Стеклянный полукруглый блик */}
        <linearGradient id={glassId} x1="64" y1="32" x2="64" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Мягкая нижняя тень */}
      <ellipse cx="64" cy="116" rx="40" ry="8" fill={`url(#${shadowId})`} />

      {/* Верхняя золотая кнопка хронометра */}
      <g filter="drop-shadow(0 2px 4px rgba(0,0,0,0.2))">
        {/* Скоба кнопки */}
        <path
          d="M50 17 C50 9 78 9 78 17"
          stroke={`url(#${crownId})`}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        {/* Поршень кнопки */}
        <rect
          x="58"
          y="13"
          width="12"
          height="12"
          rx="3"
          fill={`url(#${crownId})`}
        />
        {/* Боковая акцентная кнопка (на 2 часах) */}
        <rect
          x="94"
          y="26"
          width="8"
          height="8"
          rx="2.5"
          transform="rotate(45 94 26)"
          fill={`url(#${crownId})`}
        />
      </g>

      {/* Задняя фаска корпуса для объема */}
      <circle
        cx="64"
        cy="70"
        r="44"
        fill={`url(#${bezelOuterId})`}
      />

      {/* Переднее кольцо безеля */}
      <circle
        cx="64"
        cy="66"
        r="44"
        fill={`url(#${bezelFrontId})`}
        stroke="#809BFF"
        strokeWidth="1"
      />

      {/* Утопленный циферблат */}
      <circle
        cx="64"
        cy="66"
        r="36"
        fill={`url(#${dialId})`}
      />

      {/* Шкала ожидания ETA (дуга с 12 до 4 часов) */}
      <path
        d="M64 34 A32 32 0 0 1 93 78"
        stroke={`url(#${arcId})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Часовые деления на 12, 3, 6, 9 */}
      <line x1="64" y1="36" x2="64" y2="40" stroke="#FF3A44" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="94" y1="66" x2="90" y2="66" stroke="#003B73" strokeWidth="2" strokeLinecap="round" />
      <line x1="64" y1="96" x2="64" y2="92" stroke="#003B73" strokeWidth="2" strokeLinecap="round" />
      <line x1="34" y1="66" x2="38" y2="66" stroke="#003B73" strokeWidth="2" strokeLinecap="round" />

      {/* Часовая стрелка (на 2 часа) */}
      <line
        x1="64"
        y1="66"
        x2="78"
        y2="50"
        stroke="#010E3E"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Минутная стрелка (на 4 часа, акцентная красная) */}
      <line
        x1="64"
        y1="66"
        x2="85"
        y2="77"
        stroke="#FF3A44"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Центральный золотой штифт */}
      <circle
        cx="64"
        cy="66"
        r="4.5"
        fill={`url(#${crownId})`}
        stroke="#FFFFFF"
        strokeWidth="1"
      />

      {/* Стеклянный полукруглый блик выпуклой линзы */}
      <path
        d="M34 58 C37 43 49 35 64 35 C79 35 91 43 94 58 C80 48 48 48 34 58 Z"
        fill={`url(#${glassId})`}
      />
    </svg>
  );
}

/**
 * 5. Icon3DBell — Вас вызывают к окну!
 * Динамичный золотисто-синий колокольчик с тактильным звоном, звуковыми волнами
 * и красным уведомлением вызова.
 */
export function Icon3DBell({
  size = 64,
  className = '',
  title = 'Вас вызывают к окну!',
  'aria-label': ariaLabel = 'Вас вызывают к окну!',
  ...rest
}: Icon3DProps) {
  const uid = useId().replace(/:/g, '');
  const shadowId = `b-sh-${uid}`;
  const domeGradId = `b-dg-${uid}`;
  const rimGradId = `b-rg-${uid}`;
  const clapperGradId = `b-cg-${uid}`;
  const waveGradId = `b-wg-${uid}`;
  const alertGradId = `b-ag-${uid}`;

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      <title>{title}</title>
      <defs>
        <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#010E3E" stopOpacity="0.35" />
          <stop offset="65%" stopColor="#010E3E" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#010E3E" stopOpacity="0" />
        </radialGradient>
        {/* Купол колокола (Electric Blue -> Dark Navy) */}
        <linearGradient id={domeGradId} x1="28" y1="28" x2="100" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5975FF" />
          <stop offset="35%" stopColor="#1A34E8" />
          <stop offset="75%" stopColor="#0A22A8" />
          <stop offset="100%" stopColor="#010B38" />
        </linearGradient>
        {/* Золотой раструб колокола */}
        <linearGradient id={rimGradId} x1="24" y1="92" x2="104" y2="106" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="45%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#C47A00" />
        </linearGradient>
        {/* Золотой язычок колокольчика */}
        <linearGradient id={clapperGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        {/* Звуковые волны вызова */}
        <linearGradient id={waveGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5975FF" />
          <stop offset="100%" stopColor="#1A34E8" />
        </linearGradient>
        {/* Красный шильдик «№ 1» */}
        <linearGradient id={alertGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF5C66" />
          <stop offset="100%" stopColor="#D92534" />
        </linearGradient>
      </defs>

      {/* Мягкая нижняя тень */}
      <ellipse cx="64" cy="116" rx="42" ry="7.5" fill={`url(#${shadowId})`} />

      {/* Звуковые волны слева и справа (эффект звонка к окну) */}
      <g stroke={`url(#${waveGradId})`} strokeWidth="3" strokeLinecap="round">
        <path d="M19 58 C13 68 13 82 19 92" />
        <path d="M12 48 C3 64 3 88 12 102" strokeOpacity="0.45" strokeWidth="2.2" />
        <path d="M109 58 C115 68 115 82 109 92" />
        <path d="M116 48 C125 64 125 88 116 102" strokeOpacity="0.45" strokeWidth="2.2" />
      </g>

      {/* Верхнее золотое крепежное кольцо */}
      <path
        d="M54 22 C54 13 74 13 74 22"
        stroke={`url(#${rimGradId})`}
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Золотой язычок колокольчика (выглядывает снизу) */}
      <circle
        cx="64"
        cy="104"
        r="8.5"
        fill={`url(#${clapperGradId})`}
        stroke="#804A00"
        strokeWidth="0.8"
      />

      {/* Объемный синий купол колокола */}
      <g filter="drop-shadow(0 8px 16px rgba(1, 14, 62, 0.2))">
        <path
          d="M42 86 C42 50 50 30 64 30 C78 30 86 50 86 86 C94 88 102 93 102 97 C102 101 96 105 88 105 H40 C32 105 26 101 26 97 C26 93 34 88 42 86 Z"
          fill={`url(#${domeGradId})`}
        />

        {/* Нижний золотой ободок раструба */}
        <path
          d="M26 97 C26 92.5 34 88 42 86 H86 C94 88 102 92.5 102 97 C102 101.5 94 105.5 86 105.5 H42 C34 105.5 26 101.5 26 97 Z"
          fill={`url(#${rimGradId})`}
        />
      </g>

      {/* Световой глянец по куполу */}
      <path
        d="M49 38 C53 52 50 74 46 86"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />

      {/* Красный бейдж вызова «№ 1» (окно вызывает!) */}
      <g filter="drop-shadow(0 3px 6px rgba(217, 37, 52, 0.35))">
        <rect
          x="84"
          y="18"
          width="30"
          height="24"
          rx="12"
          fill={`url(#${alertGradId})`}
          stroke="#FFFFFF"
          strokeWidth="1.5"
        />
        <text
          x="99"
          y="34"
          fill="#FFFFFF"
          fontWeight="900"
          fontSize="11"
          fontFamily="system-ui, -apple-system, sans-serif"
          textAnchor="middle"
        >
          № 1
        </text>
      </g>
    </svg>
  );
}

// =============================================================================
// ЧАСТЬ 3: КАРТОЧНЫЙ БЕЙДЖ С 3D-ИКОНКОЙ (Postal3DBadge)
// =============================================================================

export interface Postal3DBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  type: 'parcel' | 'letter' | 'ticket' | 'clock' | 'bell';
  size?: 'sm' | 'md' | 'lg' | number;
  title?: string;
  subtitle?: string;
  tag?: string;
  active?: boolean;
}

const BADGE_PRESETS = {
  parcel: {
    Component: Icon3DParcel,
    defaultTitle: 'Посылки и EMS',
    defaultSubtitle: 'Отправка и выдача отправлений',
    defaultTag: 'Услуга 01',
    accentColor: '#1A34E8',
    glowColor: 'rgba(26, 52, 232, 0.15)',
  },
  letter: {
    Component: Icon3DLetter,
    defaultTitle: 'Письма и открытки',
    defaultSubtitle: 'Заказная и простая корреспонденция',
    defaultTag: 'Услуга 02',
    accentColor: '#FF3A44',
    glowColor: 'rgba(255, 58, 68, 0.15)',
  },
  ticket: {
    Component: Icon3DTicket,
    defaultTitle: 'Электронный талон очереди',
    defaultSubtitle: 'Цифровой номер и прогноз времени',
    defaultTag: 'Талон',
    accentColor: '#003B73',
    glowColor: 'rgba(0, 59, 115, 0.15)',
  },
  clock: {
    Component: Icon3DClock,
    defaultTitle: 'Время ожидания / Расчетный ETA',
    defaultSubtitle: 'Прогноз вызова искусственным интеллектом',
    defaultTag: 'ETA',
    accentColor: '#FF9C00',
    glowColor: 'rgba(255, 156, 0, 0.15)',
  },
  bell: {
    Component: Icon3DBell,
    defaultTitle: 'Вас вызывают к окну!',
    defaultSubtitle: 'Приглашение к окну обслуживания',
    defaultTag: 'Вызов',
    accentColor: '#1A34E8',
    glowColor: 'rgba(26, 52, 232, 0.25)',
  },
};

/**
 * Postal3DBadge — стильный карточный компонент витрины услуг, киоска или табло очереди
 */
export function Postal3DBadge({
  type,
  size = 'md',
  title,
  subtitle,
  tag,
  active = false,
  className = '',
  onClick,
  ...rest
}: Postal3DBadgeProps) {
  const preset = BADGE_PRESETS[type] || BADGE_PRESETS.parcel;
  const IconComp = preset.Component;

  const iconPx =
    typeof size === 'number'
      ? size
      : size === 'sm'
      ? 44
      : size === 'lg'
      ? 80
      : 60;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`group relative flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 border ${
        active
          ? 'bg-blue-50/70 border-blue-500 shadow-md ring-2 ring-blue-500/20'
          : 'bg-white border-slate-200/80 hover:border-blue-400 hover:shadow-lg hover:-translate-y-0.5'
      } ${onClick ? 'cursor-pointer select-none' : ''} ${className}`}
      {...rest}
    >
      {/* 3D Иконка с эффектом легкого зума при наведении */}
      <div className="relative shrink-0 transition-transform duration-300 group-hover:scale-105">
        <IconComp size={iconPx} />
      </div>

      {/* Текстовый блок */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            {tag || preset.defaultTag}
          </span>
          {active && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
              Активен
            </span>
          )}
        </div>
        <h4 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
          {title || preset.defaultTitle}
        </h4>
        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
          {subtitle || preset.defaultSubtitle}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// ЧАСТЬ 4: ВИЗУАЛЬНАЯ ВИТРИНА И ТЕСТ-СТОРИ (PostalIconsGallery / Story)
// =============================================================================

/**
 * PostalIconsGallery — интерактивная галерея для демонстрации, тестирования
 * и валидации всех иконок и 3D-значков.
 */
export function PostalIconsGallery() {
  const [solarVariant, setSolarVariant] = useState<'linear' | 'duotone'>('duotone');
  const [iconColor, setIconColor] = useState<string>('#1A34E8');
  const [activeTab, setActiveTab] = useState<'3d' | 'solar' | 'badges'>('3d');

  const solarList = [
    { Comp: SolarBox, name: 'SolarBox', label: 'Посылки' },
    { Comp: SolarLetter, name: 'SolarLetter', label: 'Письма' },
    { Comp: SolarTicket, name: 'SolarTicket', label: 'Талон очереди' },
    { Comp: SolarClock, name: 'SolarClock', label: 'Расчетный ETA' },
    { Comp: SolarBell, name: 'SolarBell', label: 'Вызов к окну' },
    { Comp: SolarQr, name: 'SolarQr', label: 'QR-код' },
    { Comp: SolarOperator, name: 'SolarOperator', label: 'Оператор' },
    { Comp: SolarSparkles, name: 'SolarSparkles', label: 'AI Смарт-очередь' },
    { Comp: SolarAlert, name: 'SolarAlert', label: 'Оповещение' },
  ];

  const threeDList = [
    { Comp: Icon3DParcel, name: 'Icon3DParcel', label: 'Посылки и EMS', desc: 'Услуга 01 • Прием и выдача' },
    { Comp: Icon3DLetter, name: 'Icon3DLetter', label: 'Письма и открытки', desc: 'Услуга 02 • Корреспонденция' },
    { Comp: Icon3DTicket, name: 'Icon3DTicket', label: 'Электронный талон очереди', desc: 'Услуга 03 • Цифровой талон' },
    { Comp: Icon3DClock, name: 'Icon3DClock', label: 'Время ожидания / Расчетный ETA', desc: 'Услуга 04 • Прогноз очереди' },
    { Comp: Icon3DBell, name: 'Icon3DBell', label: 'Вас вызывают к окну!', desc: 'Услуга 05 • Статус вызова' },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto bg-slate-50 min-h-screen text-slate-800 font-sans">
      {/* Заголовок витрины */}
      <div className="mb-8 border-b border-slate-200 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider mb-2">
          <span>АО «Почта России»</span>
          <span>•</span>
          <span>Иконографика нового поколения</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Postal Icons & 3D Badges Suite
        </h1>
        <p className="text-slate-600 mt-1 text-sm max-w-2xl">
          Высококачественные векторные иконки в линейном/двухтоновом стиле Solar Icons и
          3D-акценты в официальных цветах бренда по стандартам 3dicons.co.
        </p>

        {/* Табы */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setActiveTab('3d')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === '3d'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            3D Векторные значки (3dicons.co)
          </button>
          <button
            onClick={() => setActiveTab('solar')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'solar'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Solar Icons (Linear & Duotone)
          </button>
          <button
            onClick={() => setActiveTab('badges')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'badges'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Карточные бейджи (Postal3DBadge)
          </button>
        </div>
      </div>

      {/* Вкладка 1: 3D-значки */}
      {activeTab === '3d' && (
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {threeDList.map(({ Comp, name, label, desc }) => (
              <div
                key={name}
                className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center group"
              >
                <div className="w-28 h-28 flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                  <Comp size={96} />
                </div>
                <h3 className="font-bold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                  {label}
                </h3>
                <p className="text-xs text-slate-500 mt-1">{desc}</p>
                <div className="mt-4 pt-3 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>&lt;{name} size=&#123;64&#125; /&gt;</span>
                  <span className="text-blue-600 font-sans font-semibold">SVG 3D</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Вкладка 2: Solar Icons */}
      {activeTab === 'solar' && (
        <section>
          {/* Контролы цвета и режима */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-white rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Стиль:
              </span>
              <button
                onClick={() => setSolarVariant('duotone')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  solarVariant === 'duotone'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Duotone (Двухтоновый)
              </button>
              <button
                onClick={() => setSolarVariant('linear')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  solarVariant === 'linear'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Linear (Контурный)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Цвет:
              </span>
              {[
                { hex: '#1A34E8', name: 'Electric Blue' },
                { hex: '#003B73', name: 'Classic Navy' },
                { hex: '#FF3A44', name: 'Postal Red' },
                { hex: '#2DA771', name: 'Green' },
                { hex: '#252630', name: 'Slate' },
              ].map(({ hex, name }) => (
                <button
                  key={hex}
                  title={name}
                  onClick={() => setIconColor(hex)}
                  style={{ backgroundColor: hex }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    iconColor === hex ? 'scale-125 border-white ring-2 ring-blue-500' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {solarList.map(({ Comp, name, label }) => (
              <div
                key={name}
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center"
              >
                <div className="w-12 h-12 flex items-center justify-center mb-3">
                  <Comp size={32} variant={solarVariant} color={iconColor} strokeWidth={1.75} />
                </div>
                <span className="font-bold text-slate-800 text-xs truncate max-w-full">
                  {name}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 truncate max-w-full">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Вкладка 3: Готовые бейджи */}
      {activeTab === 'badges' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Postal3DBadge type="parcel" />
            <Postal3DBadge type="letter" />
            <Postal3DBadge type="ticket" active />
            <Postal3DBadge type="clock" />
            <Postal3DBadge type="bell" className="md:col-span-2" />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Алиас для интеграции со Storybook
 */
export const PostalIconsStory = PostalIconsGallery;
