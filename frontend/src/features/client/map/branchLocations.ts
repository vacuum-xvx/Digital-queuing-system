export interface BranchLocation {
  id: string;
  code: string;
  name: string;
  address: string;
  metro: string;
  metroColor: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  activeQueueCount: number;
  estimatedWaitMinutes: number;
  walkingMinutes: number;
  distanceKm: number;
  workHours: string;
  isBackendBranch?: boolean;
  photos?: string[];
  amenities?: string[];
}

function makeBranchSvg(code: string, label: string, variant: 'facade' | 'entrance'): string {
  const bg = '#0055A5';
  const subtitle = variant === 'facade' ? 'Фасад отделения' : 'Входная группа';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
  <defs>
    <linearGradient id="sky-${code}-${variant}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#EDF4FC"/>
      <stop offset="100%" stop-color="#D7E6F8"/>
    </linearGradient>
    <linearGradient id="facade-${code}-${variant}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F4F8FC"/>
    </linearGradient>
  </defs>
  <rect width="400" height="240" fill="url(#sky-${code}-${variant})"/>
  <rect x="20" y="45" width="360" height="195" rx="14" fill="url(#facade-${code}-${variant})" stroke="#CADBEF" stroke-width="2"/>
  <rect x="20" y="45" width="360" height="44" rx="14" fill="${bg}"/>
  <rect x="20" y="75" width="360" height="14" fill="${bg}"/>
  <text x="36" y="73" fill="#FFFFFF" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="800" letter-spacing="0.5">ПОЧТА РОССИИ • ${code}</text>
  <circle cx="355" cy="67" r="10" fill="#FFFFFF" fill-opacity="0.2"/>
  <rect x="145" y="105" width="110" height="135" rx="8" fill="#D9E6F5" stroke="#0055A5" stroke-width="2"/>
  <rect x="154" y="115" width="42" height="125" rx="4" fill="#FFFFFF" opacity="0.95"/>
  <rect x="204" y="115" width="42" height="125" rx="4" fill="#FFFFFF" opacity="0.95"/>
  <rect x="40" y="110" width="80" height="65" rx="8" fill="#C5D9F0" stroke="#0055A5" stroke-width="1.5"/>
  <rect x="280" y="110" width="80" height="65" rx="8" fill="#C5D9F0" stroke="#0055A5" stroke-width="1.5"/>
  <text x="200" y="210" text-anchor="middle" fill="#0B3558" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="11" font-weight="700">${label}</text>
  <text x="200" y="226" text-anchor="middle" fill="#476788" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="9">${subtitle}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MOSCOW_BRANCHES: BranchLocation[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    code: '101000',
    name: 'Главпочтамт Мясницкая',
    address: 'ул. Мясницкая, 26, стр. 1',
    metro: 'Чистые пруды',
    metroColor: '#EF161E',
    lat: 55.7645,
    lng: 37.6385,
    rating: 4.92,
    reviewCount: 1284,
    activeQueueCount: 3,
    estimatedWaitMinutes: 4,
    walkingMinutes: 5,
    distanceKm: 0.35,
    workHours: '08:00–22:00',
    isBackendBranch: true,
    photos: [
      makeBranchSvg('101000', 'Мясницкая 26', 'facade'),
      makeBranchSvg('101000', 'Центральный вход', 'entrance'),
    ],
    amenities: ['Доступно для колясок', 'Парковка', 'Упаковка'],
  },
  {
    id: 'branch-pokrovka',
    code: '101000-2',
    name: 'Отделение Покровка',
    address: 'ул. Покровка, 17/1',
    metro: 'Китай-город',
    metroColor: '#F38B00',
    lat: 55.7592,
    lng: 37.6471,
    rating: 4.86,
    reviewCount: 640,
    activeQueueCount: 2,
    estimatedWaitMinutes: 3,
    walkingMinutes: 7,
    distanceKm: 0.6,
    workHours: '08:00–20:00',
    photos: [
      makeBranchSvg('101000-2', 'Покровка 17', 'facade'),
      makeBranchSvg('101000-2', 'Вход с улицы', 'entrance'),
    ],
    amenities: ['Доступно для колясок', 'Упаковка'],
  },
  {
    id: 'branch-nikolskaya',
    code: '109012',
    name: 'Отделение Никольская',
    address: 'ул. Никольская, 11-13с4',
    metro: 'Лубянка',
    metroColor: '#EF161E',
    lat: 55.7571,
    lng: 37.6235,
    rating: 4.89,
    reviewCount: 1150,
    activeQueueCount: 4,
    estimatedWaitMinutes: 7,
    walkingMinutes: 10,
    distanceKm: 0.9,
    workHours: '08:00–21:00',
    photos: [
      makeBranchSvg('109012', 'Никольская 11', 'facade'),
      makeBranchSvg('109012', 'Вход в арку', 'entrance'),
    ],
    amenities: ['Парковка', 'Упаковка', 'Доступно для колясок'],
  },
  {
    id: 'branch-maroseyka',
    code: '101000-3',
    name: 'Отделение Маросейка',
    address: 'ул. Маросейка, 9/2',
    metro: 'Китай-город',
    metroColor: '#89339C',
    lat: 55.7578,
    lng: 37.6346,
    rating: 4.82,
    reviewCount: 910,
    activeQueueCount: 6,
    estimatedWaitMinutes: 12,
    walkingMinutes: 8,
    distanceKm: 0.75,
    workHours: '08:00–21:00',
    photos: [
      makeBranchSvg('101000-3', 'Маросейка 9', 'facade'),
      makeBranchSvg('101000-3', 'Вход', 'entrance'),
    ],
    amenities: ['Упаковка', 'Оплата картой'],
  },
  {
    id: 'branch-lenina',
    code: '390000',
    name: 'Отделение на Ленина 24',
    address: 'ул. Ленина, 24',
    metro: 'Центр',
    metroColor: '#0055A5',
    lat: 55.7539,
    lng: 37.6208,
    rating: 4.88,
    reviewCount: 1420,
    activeQueueCount: 3,
    estimatedWaitMinutes: 5,
    walkingMinutes: 15,
    distanceKm: 1.2,
    workHours: '08:00–22:00',
    photos: [
      makeBranchSvg('390000', 'ул. Ленина 24', 'facade'),
      makeBranchSvg('390000', 'Центральный вход', 'entrance'),
    ],
    amenities: ['Доступно для колясок', 'Парковка', 'Упаковка'],
  },
  {
    id: 'branch-rozhdestvenka',
    code: '107031',
    name: 'Отделение Рождественка',
    address: 'ул. Рождественка, 8/15',
    metro: 'Кузнецкий Мост',
    metroColor: '#89339C',
    lat: 55.7607,
    lng: 37.6254,
    rating: 4.79,
    reviewCount: 820,
    activeQueueCount: 8,
    estimatedWaitMinutes: 18,
    walkingMinutes: 12,
    distanceKm: 1.1,
    workHours: '08:00–20:00',
    photos: [
      makeBranchSvg('107031', 'Рождественка 8', 'facade'),
      makeBranchSvg('107031', 'Вход с торца', 'entrance'),
    ],
    amenities: ['Упаковка'],
  },
  {
    id: 'branch-tverskaya',
    code: '125009',
    name: 'Отделение Тверская 7',
    address: 'ул. Тверская, 7',
    metro: 'Охотный Ряд',
    metroColor: '#EF161E',
    lat: 55.7583,
    lng: 37.6117,
    rating: 4.95,
    reviewCount: 2430,
    activeQueueCount: 14,
    estimatedWaitMinutes: 25,
    walkingMinutes: 19,
    distanceKm: 1.8,
    workHours: 'Круглосуточно (24/7)',
    photos: [
      makeBranchSvg('125009', 'Тверская 7', 'facade'),
      makeBranchSvg('125009', 'Вход 24/7', 'entrance'),
    ],
    amenities: ['Доступно для колясок', 'Парковка', 'Упаковка'],
  },
];

export interface SmartRouteInfo {
  branch: BranchLocation;
  totalTimeMinutes: number;
  timeSavedMinutes: number;
  isFastest: boolean;
}

export function calculateSmartRoutes(branches: BranchLocation[] = MOSCOW_BRANCHES): SmartRouteInfo[] {
  const withTotal = branches.map(b => ({
    branch: b,
    totalTimeMinutes: b.walkingMinutes + b.estimatedWaitMinutes,
  }));

  const sorted = [...withTotal].sort((a, b) => a.totalTimeMinutes - b.totalTimeMinutes);
  const slowestTotal = Math.max(...withTotal.map(w => w.totalTimeMinutes));

  return sorted.map((item, idx) => ({
    branch: item.branch,
    totalTimeMinutes: item.totalTimeMinutes,
    timeSavedMinutes: Math.max(0, slowestTotal - item.totalTimeMinutes),
    isFastest: idx === 0,
  }));
}

export function calculateFastestAlternative(
  currentBranchId: string,
  branches: BranchLocation[] = MOSCOW_BRANCHES,
  minTimeSavedMinutes: number = 3,
): { currentTotal: number; betterBranch?: BranchLocation; timeSavedMinutes: number } {
  const current = branches.find(b => b.id === currentBranchId);
  if (!current) {
    return { currentTotal: 0, betterBranch: undefined, timeSavedMinutes: 0 };
  }
  const currentTotal = current.walkingMinutes + current.estimatedWaitMinutes;

  let betterBranch: BranchLocation | undefined;
  let maxSaved = 0;

  for (const b of branches) {
    if (b.id === currentBranchId) continue;
    const total = b.walkingMinutes + b.estimatedWaitMinutes;
    const saved = currentTotal - total;
    if (saved > maxSaved) {
      maxSaved = saved;
      betterBranch = b;
    }
  }

  if (betterBranch && maxSaved >= minTimeSavedMinutes) {
    return {
      currentTotal,
      betterBranch,
      timeSavedMinutes: maxSaved,
    };
  }

  return {
    currentTotal,
    betterBranch: undefined,
    timeSavedMinutes: 0,
  };
}
