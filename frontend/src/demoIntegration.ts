import { useEffect } from 'react';
import { useAdminOverview } from './api/queries';
export interface DemoTicket {
  id: string;
  number: string;
  serviceId: string;
  source: 'QR' | 'APPOINTMENT' | 'LIVE';
  createdAt: number;
  status: 'WAITING' | 'CALLED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  windowId?: number | null;
  calledAt?: number;
  waitMinutes?: number;
}

export interface DemoWindow {
  id: number;
  windowUuid?: string;
  name: string;
  operator: string;
  status: 'ACTIVE' | 'CLOSED' | 'OPEN';
  currentTicketId: string | null;
  servedCount: number;
  services: string[];
}
const DEMO_BRANCH_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Пары «фрагмент названия услуги → UUID услуги» для ответов, в которых
 * пришло только человекочитаемое имя услуги (например, window.currentService).
 */
const SERVICE_ID_BY_NAME: Array<[RegExp, string]> = [
  [/Посылк|pickup/i, '22222222-2222-2222-2222-222222222222'],
  [/Отправк|send/i, '33333333-2222-2222-2222-222222222222'],
  [/Платеж|Финанс|finance/i, '55555555-5555-5555-5555-555555555555'],
  [/товар|retail/i, '44444444-2222-2222-2222-222222222222'],
];

const DEFAULT_SERVICE_ID = '22222222-2222-2222-2222-222222222222';

/**
 * Приводит услугу талона к UUID. Оператор сопоставляет талоны с окнами
 * по UUID услуги, поэтому имя услуги («Посылки») в serviceId приводит
 * к пустому списку ожидающих.
 */
export function resolveServiceId(serviceId?: string | null, serviceName?: string | null): string {
  if (serviceId) return serviceId;
  if (serviceName) {
    const match = SERVICE_ID_BY_NAME.find(([pattern]) => pattern.test(serviceName));
    if (match) return match[1];
  }
  return DEFAULT_SERVICE_ID;
}

export function mapBackendTicketToDemo(t: any): DemoTicket {
  return {
    id: t.id,
    number: t.publicNumber,
    serviceId: resolveServiceId(t.serviceId, t.serviceName),
    source: t.source as any,
    status: t.status as any,
    createdAt: new Date(t.queueEnteredAt || t.createdAt || Date.now()).getTime(),
    windowId: t.window?.number || null,
    calledAt: t.calledAt ? new Date(t.calledAt).getTime() : undefined,
    waitMinutes: t.waitTimeMinutes || 0,
  };
}

export function useDemoIntegration(
  setTickets: (updater: (prev: DemoTicket[]) => DemoTicket[]) => void,
  setWindows: (updater: (prev: DemoWindow[]) => DemoWindow[]) => void
) {
  const { data: overview, refetch } = useAdminOverview(DEMO_BRANCH_ID, 3000);

  useEffect(() => {
    if (overview) {
      // 1. Map Windows.
      //    Admin overview отдаёт currentTicketNumber / currentService плоско,
      //    а не вложенным объектом currentTicket.
      const newWindows = (overview.windows ?? []).map((w: any) => ({
        id: w.number,
        windowUuid: w.id,
        name: `Окно ${w.number}`,
        status: w.status === 'CLOSED' ? 'CLOSED' : 'ACTIVE',
        services: (w.services ?? []).map((s: any) => s.id),
        currentTicketId: w.currentTicketNumber ?? null,
        servedCount: w.servedCount || 0,
        operator: w.operatorName || 'Оператор',
      }));

      // В очереди админского overview нет номера окна, поэтому привязку
      // «талон → окно» берём из списка окон.
      const windowByTicketNumber = new Map<string, number>();
      for (const w of overview.windows ?? []) {
        if (w.currentTicketNumber) windowByTicketNumber.set(w.currentTicketNumber, w.number);
      }

      // 2. Map Queue Tickets
      const newTickets = (overview.queue ?? []).map((t: any) => ({
        ...mapBackendTicketToDemo(t),
        windowId: windowByTicketNumber.get(t.publicNumber) ?? null,
      }));

      // 3. Талон, который уже обслуживается в окне, но отсутствует в очереди
      //    (страховка для ответов, где queue не содержит вызываемых талонов).
      const servedTickets = (overview.windows ?? [])
        .filter((w: any) => w.currentTicketNumber && !newTickets.some((t: any) => t.number === w.currentTicketNumber))
        .map((w: any) => {
          const currentService = (w.services ?? []).find((s: any) => s.name === w.currentService);
          return {
            id: `w-${w.number}`,
            number: w.currentTicketNumber,
            serviceId: resolveServiceId(currentService?.id, w.currentService),
            source: 'QR',
            status: 'CALLED',
            createdAt: Date.now() - 5 * 60000,
            windowId: w.number,
          };
        });

      const allTickets = [...newTickets, ...servedTickets];

      // Update state
      setWindows(() => newWindows);
      setTickets(() => allTickets);
    }
  }, [overview, setTickets, setWindows]);

  return { overview, refetchOverview: refetch };
}

export { createQrTicket, createAppointment } from './api/client/clientApi';
export { callNext, startService, completeService, markNoShow, createLiveTicket } from './api/operator/operatorApi';
