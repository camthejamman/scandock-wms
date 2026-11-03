// k6 smoke test: a light, steady load on the read endpoints the handheld hammers all day.
//   docker compose --profile perf run --rm k6
// Thresholds are deliberately generous for a laptop; tighten them per environment.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const API = __ENV.API_URL || 'http://localhost:4000';
const errors = new Rate('errors');
const lookup = new Trend('item_lookup_ms', true);

export const options = {
  stages: [
    { duration: '5s', target: 5 },
    { duration: '20s', target: 10 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
    item_lookup_ms: ['p(95)<150'],
    errors: ['rate<0.01'],
  },
};

export function setup() {
  const res = http.post(
    `${API}/api/auth/login`,
    JSON.stringify({ username: 'picker1', pin: '1234' }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );
  check(res, { 'login ok': (r) => r.status === 200 });
  return { token: res.json('token') };
}

const SKUS = ['TOY-ROBOT-RED', 'PUZ-1000-OCEAN', 'BATT-AA-24PK', 'ART-CRAYON-64', 'PLUSH-BEAR-SM'];
const BINS = ['P-01-01', 'A-01-02', 'P-02-03', 'B-01-01'];

export default function (data) {
  const params = { headers: { authorization: `Bearer ${data.token}` } };
  const sku = SKUS[Math.floor(Math.random() * SKUS.length)];
  const bin = BINS[Math.floor(Math.random() * BINS.length)];

  const item = http.get(`${API}/api/inventory/item/${sku}`, params);
  lookup.add(item.timings.duration);
  errors.add(!check(item, { 'item inquiry 200': (r) => r.status === 200 }));

  const binRes = http.get(`${API}/api/inventory/bin/${bin}`, params);
  errors.add(!check(binRes, { 'bin inquiry 200': (r) => r.status === 200 }));

  const picks = http.get(`${API}/api/sales-orders?pickable=true&pageSize=20`, params);
  errors.add(!check(picks, { 'pick list 200': (r) => r.status === 200 }));

  const dash = http.get(`${API}/api/reports/dashboard`, params);
  errors.add(!check(dash, { 'dashboard 200': (r) => r.status === 200 }));

  sleep(0.5);
}
