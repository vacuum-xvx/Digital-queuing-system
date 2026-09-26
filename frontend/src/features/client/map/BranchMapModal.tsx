import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MOSCOW_BRANCHES,
  BranchLocation,
  calculateSmartRoutes,
  calculateFastestAlternative,
} from './branchLocations';
import {
  X,
  Clock,
  Star,
  Zap,
  Navigation,
  Check,
  Layers,
  MapPin,
  Sparkles,
  Info,
} from 'lucide-react';
import { PochtaEmblem } from '../../../components/common/PochtaBrand';

declare global {
  interface Window {
    ymaps?: any;
  }
}

interface BranchMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBranchId: string;
  onSelectBranch: (branchId: string) => void;
}

const YANDEX_MAPS_KEY = '97fb22de-5d60-4106-aab0-6cf5d831324c';
const YANDEX_MAPS_SCRIPT_URL = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_KEY}&lang=ru_RU`;

export const BranchMapModal: React.FC<BranchMapModalProps> = ({
  isOpen,
  onClose,
  selectedBranchId,
  onSelectBranch,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const yandexContainerRef = useRef<HTMLDivElement | null>(null);
  const yandexMapInstanceRef = useRef<any>(null);
  const yandexPlacemarksRef = useRef<Map<string, any>>(new Map());

  const [mapEngine, setMapEngine] = useState<'yandex' | 'leaflet'>('yandex');
  const [yandexReady, setYandexReady] = useState<boolean>(false);
  const [yandexLoadFailed, setYandexLoadFailed] = useState<boolean>(false);

  const [activeBranchId, setActiveBranchId] = useState<string>(
    selectedBranchId || MOSCOW_BRANCHES[0].id
  );
  const [filter, setFilter] = useState<'all' | 'near' | 'fast' | '24h'>('all');

  const smartRoutes = useMemo(() => calculateSmartRoutes(MOSCOW_BRANCHES), []);

  const fastestAlternative = useMemo(() => {
    return calculateFastestAlternative(activeBranchId, MOSCOW_BRANCHES);
  }, [activeBranchId]);

  const filteredRoutes = useMemo(() => {
    return smartRoutes.filter(item => {
      if (filter === 'near') return item.branch.distanceKm <= 0.8;
      if (filter === 'fast') return item.branch.estimatedWaitMinutes <= 5;
      if (filter === '24h')
        return (
          item.branch.workHours.includes('24/7') ||
          item.branch.workHours.includes('Круглосуточно')
        );
      return true;
    });
  }, [smartRoutes, filter]);

  const activeBranch = useMemo(() => {
    return (
      MOSCOW_BRANCHES.find(b => b.id === activeBranchId) || MOSCOW_BRANCHES[0]
    );
  }, [activeBranchId]);

  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load Yandex Maps 2.1 script
  useEffect(() => {
    if (!isOpen) return;

    if (window.ymaps) {
      window.ymaps.ready(() => {
        setYandexReady(true);
      });
      return;
    }

    const existingScript = document.querySelector(
      `script[src*="api-maps.yandex.ru"]`
    );
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.ymaps) {
          window.ymaps.ready(() => setYandexReady(true));
        }
      });
      existingScript.addEventListener('error', () => {
        setYandexLoadFailed(true);
        setMapEngine('leaflet');
      });
      return;
    }

    const script = document.createElement('script');
    script.src = YANDEX_MAPS_SCRIPT_URL;
    script.type = 'text/javascript';
    script.async = true;
    script.onload = () => {
      if (window.ymaps) {
        window.ymaps.ready(() => {
          setYandexReady(true);
        });
      }
    };
    script.onerror = () => {
      setYandexLoadFailed(true);
      setMapEngine('leaflet');
    };
    document.head.appendChild(script);
  }, [isOpen]);

  // Initialize & update Yandex Map
  useEffect(() => {
    if (
      !isOpen ||
      mapEngine !== 'yandex' ||
      !yandexReady ||
      !yandexContainerRef.current ||
      !window.ymaps
    ) {
      return;
    }

    if (!yandexMapInstanceRef.current) {
      const ymap = new window.ymaps.Map(yandexContainerRef.current, {
        center: [activeBranch.lat, activeBranch.lng],
        zoom: 14,
        controls: ['zoomControl', 'geolocationControl', 'typeSelector'],
      });
      yandexMapInstanceRef.current = ymap;
    }

    const ymap = yandexMapInstanceRef.current;
    if (!ymap) return;

    // Clear old placemarks
    yandexPlacemarksRef.current.forEach(p => ymap.geoObjects.remove(p));
    yandexPlacemarksRef.current.clear();

    // Add placemarks for all branches
    MOSCOW_BRANCHES.forEach(branch => {
      const isSelected = branch.id === activeBranchId;
      const isFastest = smartRoutes.find(r => r.branch.id === branch.id)?.isFastest;

      const placemark = new window.ymaps.Placemark(
        [branch.lat, branch.lng],
        {
          hintContent: `№ ${branch.code} • ${branch.name}`,
          balloonContentHeader: `<strong>Почта России № ${branch.code}</strong>`,
          balloonContentBody: `
            <div style="font-family: sans-serif; font-size: 13px; color: #0B3558;">
              <p style="margin: 4px 0;"><strong>${branch.name}</strong></p>
              <p style="margin: 4px 0; color: #476788;">${branch.address}</p>
              <p style="margin: 4px 0;">В очереди: <b>${branch.activeQueueCount} чел.</b> (~${branch.estimatedWaitMinutes} мин)</p>
              <p style="margin: 4px 0;">Рейтинг: <b>★ ${branch.rating.toFixed(2)}</b> (${branch.reviewCount} отзывов)</p>
              ${isFastest ? '<p style="color: #2DA771; font-weight: bold; margin: 4px 0;">⚡ Самое быстрое отделение!</p>' : ''}
            </div>
          `,
          balloonContentFooter: `<small style="color: #476788;">Режим работы: ${branch.workHours}</small>`,
        },
        {
          preset: isSelected
            ? 'islands#nightDotIcon'
            : isFastest
            ? 'islands#darkGreenDotIcon'
            : 'islands#blueDotIcon',
          iconColor: isSelected ? '#0055A5' : isFastest ? '#2DA771' : '#006BFF',
        }
      );

      placemark.events.add('click', () => {
        setActiveBranchId(branch.id);
      });

      ymap.geoObjects.add(placemark);
      yandexPlacemarksRef.current.set(branch.id, placemark);
    });

    ymap.panTo([activeBranch.lat, activeBranch.lng], {
      flying: true,
      duration: 500,
    });
  }, [isOpen, mapEngine, yandexReady, activeBranchId, smartRoutes, activeBranch]);

  // Leaflet map initialization (Carto Positron / OpenStreetMap fallback & engine)
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [activeBranch.lat, activeBranch.lng],
        zoom: 14,
        zoomControl: false,
      });

      // Carto Positron / OSM tiles for maximum reliability and clean styling
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 19,
        }
      ).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    if (map) {
      map.invalidateSize();

      // Clear old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();

      // Render new marker badges
      MOSCOW_BRANCHES.forEach(branch => {
        const isSelected = branch.id === activeBranchId;
        const isFastest = smartRoutes.find(r => r.branch.id === branch.id)?.isFastest;

        const badgeHtml = `
          <div class="pochta-map-marker-pin ${isSelected ? 'is-selected' : ''} ${
          isFastest ? 'is-fastest' : ''
        }" style="
            display: flex;
            align-items: center;
            gap: 5px;
            background: ${isSelected ? '#0055A5' : '#FFFFFF'};
            color: ${isSelected ? '#FFFFFF' : '#0B3558'};
            border: 2px solid ${
              isSelected ? '#0055A5' : isFastest ? '#2DA771' : '#D4E0ED'
            };
            padding: 5px 10px;
            border-radius: 9999px;
            box-shadow: 0 4px 14px rgba(11, 53, 88, 0.14);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 700;
            font-size: 11px;
            white-space: nowrap;
            cursor: pointer;
            transform: translate(-50%, -50%);
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
          ">
            <span style="color: #FF9C00; display: flex; align-items: center;">★ ${branch.rating.toFixed(
              2
            )}</span>
            <span style="opacity: 0.4; font-size: 10px;">•</span>
            <span style="color: ${
              isSelected ? '#E0ECFB' : '#0055A5'
            }; font-family: monospace;">
              ${branch.activeQueueCount} чел.
            </span>
            ${
              isFastest
                ? '<span style="background: #2DA771; color: #fff; font-size: 9px; padding: 1px 4px; border-radius: 4px; font-weight: 800;">⚡ ТОП</span>'
                : ''
            }
          </div>
        `;

        const customIcon = L.divIcon({
          html: badgeHtml,
          className: 'pochta-marker-container',
          iconSize: [120, 32],
          iconAnchor: [60, 16],
        });

        const marker = L.marker([branch.lat, branch.lng], {
          icon: customIcon,
        }).addTo(map);

        marker.on('click', () => {
          setActiveBranchId(branch.id);
          map.panTo([branch.lat, branch.lng], { animate: true, duration: 0.5 });
        });

        markersRef.current.set(branch.id, marker);
      });
    }
  }, [isOpen, activeBranchId, smartRoutes, activeBranch]);

  // Clean maps on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (yandexMapInstanceRef.current) {
        yandexMapInstanceRef.current.destroy();
        yandexMapInstanceRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-modal-title"
    >
      <div className="relative w-full h-full sm:h-[90vh] sm:max-w-6xl bg-white sm:rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-[#D4E0ED]">
        {/* Left Sidebar: WB-Style Pick-up Point Cards & Smart Route */}
        <aside className="w-full md:w-96 lg:w-[430px] flex flex-col h-[52vh] md:h-full bg-[#F8FAFC] border-r border-[#D4E0ED] shrink-0 z-10">
          {/* Header */}
          <div className="p-4 sm:p-5 bg-white border-b border-[#D4E0ED] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PochtaEmblem
                className="w-8 h-8 drop-shadow-sm"
                bg="#0055A5"
                fg="#FFFFFF"
              />
              <div>
                <h2
                  id="map-modal-title"
                  className="text-base font-black text-[#0B3558] leading-tight"
                >
                  Отделения на карте
                </h2>
                <p className="text-[11px] text-[#476788] font-medium">
                  Умный маршрут: дорога + очередь без задержек
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#476788] hover:text-[#0B3558] hover:bg-slate-100 rounded-full transition-colors md:hidden"
              aria-label="Закрыть карту"
            >
              <X size={20} />
            </button>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2.5 bg-white border-b border-[#D4E0ED] flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-[#0055A5] text-white shadow-sm'
                  : 'bg-[#F0F4F8] text-[#476788] hover:bg-slate-200'
              }`}
            >
              Все ({MOSCOW_BRANCHES.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('near')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                filter === 'near'
                  ? 'bg-[#0055A5] text-white shadow-sm'
                  : 'bg-[#F0F4F8] text-[#476788] hover:bg-slate-200'
              }`}
            >
              🚶 Рядом (&lt;800м)
            </button>
            <button
              type="button"
              onClick={() => setFilter('fast')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                filter === 'fast'
                  ? 'bg-[#0055A5] text-white shadow-sm'
                  : 'bg-[#F0F4F8] text-[#476788] hover:bg-slate-200'
              }`}
            >
              ⚡ Без очереди (&le;5м)
            </button>
            <button
              type="button"
              onClick={() => setFilter('24h')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                filter === '24h'
                  ? 'bg-[#0055A5] text-white shadow-sm'
                  : 'bg-[#F0F4F8] text-[#476788] hover:bg-slate-200'
              }`}
            >
              🌙 24/7
            </button>
          </div>

          {/* Fastest Alternative Recommendation Banner */}
          {fastestAlternative.betterBranch && (
            <div className="mx-3 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
              <Sparkles size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <span className="font-bold text-emerald-900 block">
                  Совет: сэкономьте {fastestAlternative.timeSavedMinutes} мин!
                </span>
                <span className="text-emerald-700 text-[11px] block mt-0.5">
                  В отделении <strong>{fastestAlternative.betterBranch.name}</strong>{' '}
                  дорога + очередь займут быстрее.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (fastestAlternative.betterBranch) {
                      setActiveBranchId(fastestAlternative.betterBranch.id);
                    }
                  }}
                  className="mt-1.5 text-[11px] font-bold text-emerald-800 underline hover:text-emerald-950"
                >
                  Перейти к {fastestAlternative.betterBranch.code}
                </button>
              </div>
            </div>
          )}

          {/* WB-Style Pick-up Point Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredRoutes.map(
              ({ branch, totalTimeMinutes, timeSavedMinutes, isFastest }) => {
                const isSelected = branch.id === activeBranchId;
                const photoThumbnail = branch.photos?.[0];

                return (
                  <div
                    key={branch.id}
                    onClick={() => {
                      setActiveBranchId(branch.id);
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.panTo(
                          [branch.lat, branch.lng],
                          { animate: true, duration: 0.5 }
                        );
                      }
                      if (yandexMapInstanceRef.current) {
                        yandexMapInstanceRef.current.panTo(
                          [branch.lat, branch.lng],
                          { flying: true, duration: 500 }
                        );
                      }
                    }}
                    className={`rounded-2xl transition-all cursor-pointer relative p-3.5 border ${
                      isSelected
                        ? 'bg-[#FFFFFF] border-[#0055A5] ring-2 ring-[#0055A5]/20 shadow-md'
                        : 'bg-[#FFFFFF] border-[#D4E0ED] hover:border-[#0055A5]/50 hover:shadow-sm'
                    }`}
                  >
                    {/* Top Row: Index + Rating + Fast badge */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-[#0B3558] bg-[#F0F4F8] px-2 py-0.5 rounded">
                          № {branch.code}
                        </span>
                        <div className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                          <Star size={11} className="fill-amber-500 text-amber-500" />
                          <span>{branch.rating.toFixed(2)}</span>
                          <span className="text-[10px] text-[#476788] font-normal">
                            ({branch.reviewCount})
                          </span>
                        </div>
                      </div>

                      {isFastest ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <Zap size={10} className="fill-emerald-600 text-emerald-600" />
                          ТОП
                        </span>
                      ) : timeSavedMinutes > 0 ? (
                        <span className="text-[11px] font-bold text-emerald-600">
                          -{timeSavedMinutes} мин
                        </span>
                      ) : null}
                    </div>

                    {/* Content: Photo + Title + Metro */}
                    <div className="flex items-start gap-3">
                      {photoThumbnail && (
                        <img
                          src={photoThumbnail}
                          alt={branch.name}
                          className="w-14 h-14 rounded-xl object-cover border border-[#D4E0ED] shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-[#0B3558] leading-snug truncate">
                          {branch.name}
                        </h3>
                        <p className="text-xs text-[#476788] mt-0.5 flex items-center gap-1.5 truncate">
                          <span
                            className="w-2 h-2 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: branch.metroColor }}
                          />
                          <span>м. {branch.metro}</span>
                          <span className="text-slate-300">•</span>
                          <span className="truncate">{branch.address}</span>
                        </p>

                        {/* WB Workload Badge */}
                        <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EDF4FC] text-[#0055A5] text-[11px] font-medium border border-[#D4E0ED]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>
                            {branch.activeQueueCount} чел. в очереди • ~
                            {branch.estimatedWaitMinutes} мин
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Amenities tags (WB entrance / pickup badges) */}
                    {branch.amenities && branch.amenities.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {branch.amenities.map(amenity => (
                          <span
                            key={amenity}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#F0F4F8] text-[#476788] border border-[#D4E0ED]/60"
                          >
                            {amenity}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Bottom Metrics Bar: Walk, Queue, Total */}
                    <div className="mt-2.5 pt-2 border-t border-[#D4E0ED]/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex items-center gap-1 text-[#476788]"
                          title="Пешком"
                        >
                          <Navigation size={12} className="text-[#0055A5]" />
                          <span className="font-semibold text-[#0B3558]">
                            {branch.walkingMinutes} мин
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-1 text-[#476788]"
                          title="Ожидание в очереди"
                        >
                          <Clock size={12} className="text-amber-500" />
                          <span className="font-semibold text-[#0B3558]">
                            ~{branch.estimatedWaitMinutes} мин
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#476788]">Итого:</span>
                        <span className="text-xs font-bold font-mono text-[#0055A5] bg-[#EDF4FC] px-2 py-0.5 rounded-md border border-[#D4E0ED]">
                          {totalTimeMinutes} мин
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>

          {/* Action Footer */}
          <div className="p-4 bg-white border-t border-[#D4E0ED] flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectBranch(activeBranch.id);
                onClose();
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-[#0055A5] hover:bg-[#004282] active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-800/20 transition-all cursor-pointer"
            >
              <Check size={18} />
              <span>Выбрать это отделение ({activeBranch.code})</span>
            </button>
            <p className="text-[10px] text-center text-[#476788]">
              Выбранное отделение будет использоваться для талонов и записи
            </p>
          </div>
        </aside>

        {/* Right Map Canvas (Yandex Maps + Leaflet/Carto Fallback) */}
        <div className="relative flex-1 h-[48vh] md:h-full bg-slate-100">
          {/* Map Layer Switcher & Status */}
          <div className="absolute top-4 left-4 z-[400] flex items-center gap-2 bg-white/90 backdrop-blur-md p-1 rounded-xl shadow-md border border-[#D4E0ED]">
            <button
              type="button"
              onClick={() => setMapEngine('yandex')}
              disabled={yandexLoadFailed}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                mapEngine === 'yandex'
                  ? 'bg-[#0055A5] text-white shadow-sm'
                  : 'text-[#476788] hover:bg-slate-100'
              } ${yandexLoadFailed ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Layers size={13} />
              <span>Яндекс Карты</span>
            </button>
            <button
              type="button"
              onClick={() => setMapEngine('leaflet')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                mapEngine === 'leaflet'
                  ? 'bg-[#0055A5] text-white shadow-sm'
                  : 'text-[#476788] hover:bg-slate-100'
              }`}
            >
              <Layers size={13} />
              <span>CARTO / OSM</span>
            </button>
          </div>

          {/* Close button on desktop top-right */}
          <button
            type="button"
            onClick={onClose}
            className="hidden md:flex absolute top-4 right-4 z-[400] w-10 h-10 items-center justify-center bg-white hover:bg-slate-50 text-[#0B3558] rounded-full shadow-lg border border-[#D4E0ED] transition-all hover:scale-105 cursor-pointer"
            aria-label="Закрыть карту"
          >
            <X size={20} />
          </button>

          {/* Yandex Map Container */}
          <div
            ref={yandexContainerRef}
            className={`w-full h-full ${
              mapEngine === 'yandex' ? 'block' : 'hidden'
            }`}
          />

          {/* Leaflet Carto Positron / OSM Container */}
          <div
            ref={mapContainerRef}
            className={`w-full h-full ${
              mapEngine === 'leaflet' ? 'block' : 'hidden'
            }`}
          />

          {/* Bottom Floating Branch Summary Card on Map (Mobile & Desktop) */}
          <div className="absolute bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-sm z-[400] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-[#D4E0ED]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0055A5] bg-[#EDF4FC] px-2 py-0.5 rounded border border-[#D4E0ED]">
                  Отделение {activeBranch.code}
                </span>
                <h4 className="text-sm font-bold text-[#0B3558] mt-1 truncate">
                  {activeBranch.name}
                </h4>
                <p className="text-xs text-[#476788] flex items-center gap-1 mt-0.5 truncate">
                  <MapPin size={11} className="text-[#0055A5] shrink-0" />
                  <span className="truncate">{activeBranch.address}</span>
                </p>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  <Star size={12} className="fill-amber-500 text-amber-500" />
                  {activeBranch.rating.toFixed(2)}
                </span>
                <span className="text-[10px] text-[#476788] mt-0.5">
                  {activeBranch.reviewCount} отзывов
                </span>
              </div>
            </div>

            {/* Amenities line in bottom card */}
            {activeBranch.amenities && (
              <div className="mt-2 flex flex-wrap gap-1">
                {activeBranch.amenities.map(a => (
                  <span
                    key={a}
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#F0F4F8] text-[#476788]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-2.5 pt-2.5 border-t border-[#D4E0ED] flex items-center justify-between text-xs text-[#476788]">
              <span>🕒 {activeBranch.workHours}</span>
              <span className="font-mono font-bold text-[#0055A5]">
                Очередь: {activeBranch.activeQueueCount} чел.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
