import { Branch, OperatorWindow, Ticket } from './types';

export const DEMO_BRANCH: Branch = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Демо-отделение №1',
};

export const DEMO_WINDOWS: OperatorWindow[] = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    number: 1,
    status: 'OPEN',
    services: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'PARCELS',
        name: 'Посылки',
      },
    ],
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    number: 2,
    status: 'OPEN',
    services: [
      {
        id: '55555555-5555-5555-5555-555555555555',
        code: 'PAYMENTS',
        name: 'Платежи',
      },
    ],
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    number: 3,
    status: 'OPEN',
    services: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'PARCELS',
        name: 'Посылки',
      },
    ],
  },
];

let mockActiveTicket: Ticket | null = null;

export function getMockActiveTicket(): Ticket | null {
  return mockActiveTicket;
}

export function setMockActiveTicket(ticket: Ticket | null): void {
  mockActiveTicket = ticket;
}

let mockTicketSeq = 1;

export function createMockTicket(
  windowNumber: number,
  status: Ticket['status'] = 'CALLED',
  forcedSource?: Ticket['source']
): Ticket {
  const now = new Date().toISOString();
  const currentSeq = mockTicketSeq++;
  const numStr = String(currentSeq).padStart(6, '0');
  const isAppointment = forcedSource ? forcedSource === 'APPOINTMENT' : currentSeq % 2 === 0;
  const source: Ticket['source'] = isAppointment ? 'APPOINTMENT' : 'QR';
  const prefix = isAppointment ? 'A' : 'Q';

  return {
    id: `99999999-9999-9999-9999-${numStr.slice(-12).padStart(12, '0')}`,
    publicNumber: `${prefix}-${numStr}`,
    branchId: '11111111-1111-1111-1111-111111111111',
    serviceId: '22222222-2222-2222-2222-222222222222',
    source,
    status,
    window: {
      id: '33333333-3333-3333-3333-333333333333',
      number: windowNumber,
    },
    createdAt: now,
    queueEnteredAt: now,
    calledAt: now,
    serviceStartedAt: status === 'SERVING' ? now : null,
    completedAt: status === 'COMPLETED' ? now : null,
  };
}
