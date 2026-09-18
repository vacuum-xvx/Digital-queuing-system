import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Опции нагрузочного тестирования
export const options = {
  stages: [
    { duration: '10s', target: 10 },  // Разгон до 10 VU
    { duration: '20s', target: 30 },  // Основная нагрузка 30 VU
    { duration: '10s', target: 50 },  // Пиковая нагрузка 50 VU
    { duration: '10s', target: 0 },   // Плавное снижение нагрузки
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Менее 1% ошибок
    http_req_duration: ['p(95)<300'],  // 95% запросов быстрее 300мс
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '22222222-2222-2222-2222-222222222222'; // Посылки

export default function () {
  // 1. Проверка работоспособности Health
  let healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health returns 200': (r) => r.status === 200,
  });

  // 2. Список отделений
  let branchesRes = http.get(`${BASE_URL}/api/v1/branches`);
  check(branchesRes, {
    'branches returns 200': (r) => r.status === 200,
  });

  // 3. Список услуг отделения
  let servicesRes = http.get(`${BASE_URL}/api/v1/branches/${BRANCH_ID}/services`);
  check(servicesRes, {
    'services returns 200': (r) => r.status === 200,
  });

  // 4. Очередь для ТВ-табло
  let tvRes = http.get(`${BASE_URL}/api/v1/branches/${BRANCH_ID}/tv`);
  check(tvRes, {
    'tv queue returns 200': (r) => r.status === 200,
  });

  // 5. Взятие талона через QR-код с уникальным ключом идемпотентности
  const idempotencyKey = `k6-${__VU}-${__ITER}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const ticketPayload = JSON.stringify({
    serviceId: SERVICE_ID,
  });

  const ticketParams = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
  };

  let createTicketRes = http.post(
    `${BASE_URL}/api/v1/branches/${BRANCH_ID}/tickets/qr`,
    ticketPayload,
    ticketParams
  );

  const ticketCreated = check(createTicketRes, {
    'create ticket returns 201': (r) => r.status === 201,
  });

  if (ticketCreated) {
    try {
      const ticket = JSON.parse(createTicketRes.body);
      if (ticket && ticket.id) {
        // 6. Проверка позиции талона в очереди
        let posRes = http.get(`${BASE_URL}/api/v1/tickets/${ticket.id}/position`);
        check(posRes, {
          'ticket position returns 200': (r) => r.status === 200,
        });

        // 7. Проверка расчетного времени ожидания (ETA)
        let etaRes = http.get(`${BASE_URL}/api/v1/tickets/${ticket.id}/eta`);
        check(etaRes, {
          'ticket eta returns 200': (r) => r.status === 200,
        });
      }
    } catch (e) {
      // Игнорируем ошибку парсинга в случае сбоя
    }
  }

  // Пауза между итерациями пользователя (0.2 - 0.6 сек)
  sleep(0.2 + Math.random() * 0.4);
}
