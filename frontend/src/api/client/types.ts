export type Branch = {
  id: string;
  name: string;
};

export type BranchListResponse = {
  items: Branch[];
};

export type Service = {
  id: string;
  code: string;
  name: string;
};

export type ServiceListResponse = {
  items: Service[];
};

export type TicketStatus =
  | 'SCHEDULED'
  | 'WAITING'
  | 'CALLED'
  | 'SERVING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type TicketSource = 'APPOINTMENT' | 'QR' | 'LIVE';

export type TicketWindow = {
  id: string;
  number: number;
};

export type Ticket = {
  id: string;
  publicNumber: string;
  branchId: string;
  serviceId: string;
  source: TicketSource;
  status: TicketStatus;
  window: TicketWindow | null;
  createdAt: string;
  queueEnteredAt: string;
  calledAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
};

