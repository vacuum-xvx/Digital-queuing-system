export interface AdminMetrics {
  waitingClientsCount: number;
  avgWaitTimeMinutes: number;
  maxWaitTimeMinutes: number;
  servedTodayCount: number;
  activeWindowsCount: number;
  totalWindowsCount: number;
}

export interface AdminWindowService {
  id: string;
  code: string;
  name: string;
}

export interface AdminWindow {
  id: string;
  number: number;
  status: 'OPEN' | 'CLOSED' | 'CLOSING';
  currentTicketNumber: string | null;
  currentService: string | null;
  services: AdminWindowService[];
  servedCount: number;
  operatorName?: string;
}

export interface AdminQueueTicket {
  id: string;
  publicNumber: string;
  source: 'QR' | 'APPOINTMENT' | 'LIVE';
  serviceName: string;
  queueEnteredAt: string;
  waitTimeMinutes: number;
  status: 'WAITING' | 'CALLED' | 'SERVING';
}

export interface PriorityRule {
  source: 'APPOINTMENT' | 'QR' | 'LIVE';
  name: string;
  weight: number;
  maxWaitLimitMinutes: number;
  description: string;
}

export interface AnomalyTicket {
  id: string;
  publicNumber: string;
  type: 'EXCEEDED_WAIT' | 'UNFINISHED' | 'NO_SHOW' | 'TECH_ISSUE';
  description: string;
  time: string;
  durationMinutes: number;
}

export interface AdminBranchOverview {
  branchId: string;
  branchName: string;
  metrics: AdminMetrics;
  windows: AdminWindow[];
  queue: AdminQueueTicket[];
  priorities: PriorityRule[];
  anomalies: AnomalyTicket[];
}
