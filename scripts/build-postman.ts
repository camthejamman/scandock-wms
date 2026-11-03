/**
 * Builds the Postman collection + environment for the ScanDock API ("collection as code").
 *
 *   npm run postman:build          # writes postman/*.json
 *   npm run test:postman           # runs it with Newman against the stack on localhost
 *
 * The collection is ordered for the Collection Runner / Newman: setup logs in and stores tokens,
 * later folders chain ids through collection variables ({{sku}}, {{poNumber}}, {{soNumber}} …).
 * Every request carries pm.test assertions, so the run is a real regression pass, not a smoke ping.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'postman');

type Auth = 'inherit' | 'none' | 'operator';
interface Req {
  name: string;
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  body?: unknown;
  auth?: Auth;
  pre?: string[];
  tests: string[];
  description?: string;
}

const status = (code: number) =>
  `pm.test('status ${code}', () => pm.response.to.have.status(${code}));`;
const JSON_BODY = 'const body = pm.response.json();';
const errorCode = (code: string) =>
  `pm.test('error code ${code}', () => pm.expect(body.error.code).to.eql('${code}'));`;
const set = (key: string, expr: string) => `pm.collectionVariables.set('${key}', String(${expr}));`;
const expectEq = (label: string, expr: string, value: string) =>
  `pm.test('${label}', () => pm.expect(${expr}).to.eql(${value}));`;

function request(r: Req) {
  const item: Record<string, unknown> & { event: unknown[]; request: Record<string, unknown> } = {
    name: r.name,
    event: [],
    request: {
      method: r.method,
      header: [{ key: 'Accept', value: 'application/json' }],
      url: r.url,
      description: r.description ?? '',
    },
  };
  if (r.body !== undefined) {
    (item.request.header as unknown[]).push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  if (r.auth === 'none') item.request.auth = { type: 'noauth' };
  if (r.auth === 'operator') {
    item.request.auth = {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{operatorToken}}', type: 'string' }],
    };
  }
  if (r.pre?.length)
    item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: r.pre } });
  item.event.push({ listen: 'test', script: { type: 'text/javascript', exec: r.tests } });
  return item;
}

const folder = (name: string, description: string, items: unknown[]) => ({
  name,
  description,
  item: items,
});

const setup = folder(
  '00 Setup',
  'Health check, demo-data reset and the two sessions every later request relies on.',
  [
    request({
      name: 'Health',
      method: 'GET',
      url: '{{baseUrl}}/api/health',
      auth: 'none',
      pre: [
        '// A fresh run id keeps every SKU / bin / order number unique, so the collection can be run again and again.',
        "pm.collectionVariables.set('runId', Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase());",
      ],
      tests: [
        status(200),
        JSON_BODY,
        expectEq('api is ok', 'body.status', "'ok'"),
        expectEq('database is ok', 'body.db', "'ok'"),
        "pm.test('test hooks are enabled (needed for the reset below)', () => pm.expect(body.testHooks).to.eql(true));",
      ],
    }),
    request({
      name: 'Reset demo data',
      method: 'POST',
      url: '{{baseUrl}}/api/test/reset',
      auth: 'none',
      description:
        'Only exists when the API runs with TEST_HOOKS=true. Rebuilds the seed so expected numbers are stable.',
      tests: [status(200), JSON_BODY, expectEq('reset ok', 'body.ok', 'true')],
    }),
    request({
      name: 'Login as admin',
      method: 'POST',
      url: '{{baseUrl}}/api/auth/login',
      auth: 'none',
      body: { username: '{{adminUser}}', pin: '{{adminPin}}' },
      tests: [
        status(200),
        JSON_BODY,
        "pm.test('token looks like a JWT', () => pm.expect(body.token).to.match(/^[\\w-]+\\.[\\w-]+\\.[\\w-]+$/));",
        expectEq('role is admin', 'body.user.role', "'admin'"),
        set('token', 'body.token'),
      ],
    }),
    request({
      name: 'Login as operator',
      method: 'POST',
      url: '{{baseUrl}}/api/auth/login',
      auth: 'none',
      body: { username: '{{operatorUser}}', pin: '{{operatorPin}}' },
      tests: [
        status(200),
        JSON_BODY,
        expectEq('role is operator', 'body.user.role', "'operator'"),
        set('operatorToken', 'body.token'),
        set('operatorName', 'body.user.displayName'),
      ],
    }),
    request({
      name: 'Who am I',
      method: 'GET',
      url: '{{baseUrl}}/api/auth/me',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('admin session', 'body.user.username', "pm.variables.get('adminUser')"),
      ],
    }),
  ],
);

const access = folder(
  '01 Auth and access',
  'Negative authentication and role checks (REQ-001..003).',
  [
    request({
      name: 'Wrong PIN is 401',
      method: 'POST',
      url: '{{baseUrl}}/api/auth/login',
      auth: 'none',
      body: { username: '{{adminUser}}', pin: '0000' },
      tests: [
        status(401),
        JSON_BODY,
        errorCode('INVALID_CREDENTIALS'),
        "pm.test('no token leaked', () => pm.expect(body.token).to.be.undefined);",
      ],
    }),
    request({
      name: 'Deactivated user is 403',
      method: 'POST',
      url: '{{baseUrl}}/api/auth/login',
      auth: 'none',
      body: { username: 'inactive', pin: '1234' },
      tests: [status(403), JSON_BODY, errorCode('USER_INACTIVE')],
    }),
    request({
      name: 'No token is 401',
      method: 'GET',
      url: '{{baseUrl}}/api/items',
      auth: 'none',
      tests: [status(401), JSON_BODY, errorCode('UNAUTHENTICATED')],
    }),
    request({
      name: 'Operator cannot list users (403)',
      method: 'GET',
      url: '{{baseUrl}}/api/users',
      auth: 'operator',
      tests: [
        status(403),
        JSON_BODY,
        errorCode('FORBIDDEN'),
        "pm.test('message names the allowed roles', () => pm.expect(body.error.message).to.include('admin'));",
      ],
    }),
    request({
      name: 'Operator cannot change settings (403)',
      method: 'PATCH',
      url: '{{baseUrl}}/api/settings',
      auth: 'operator',
      body: { blindCounts: true },
      tests: [status(403)],
    }),
    request({
      name: 'Unknown route is a 404 envelope',
      method: 'GET',
      url: '{{baseUrl}}/api/nothing-here',
      tests: [status(404), JSON_BODY, errorCode('NOT_FOUND')],
    }),
  ],
);

const master = folder(
  '02 Master data',
  'Items and bins used by the rest of the run (REQ-004..006).',
  [
    request({
      name: 'Create item',
      method: 'POST',
      url: '{{baseUrl}}/api/items',
      body: {
        sku: 'pm-{{runId}}',
        name: 'Postman test item {{runId}}',
        category: 'Postman',
        weightLb: 2,
        reorderPoint: 1,
        unitCost: 3.5,
      },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('sku is upper-cased', 'body.sku', "'PM-' + pm.variables.get('runId')"),
        "pm.test('barcode is a 12-digit UPC-A', () => pm.expect(body.barcode).to.match(/^\\d{12}$/));",
        set('sku', 'body.sku'),
        set('barcode', 'body.barcode'),
      ],
    }),
    request({
      name: 'Duplicate SKU is 409',
      method: 'POST',
      url: '{{baseUrl}}/api/items',
      body: { sku: '{{sku}}', name: 'dupe' },
      tests: [status(409), JSON_BODY, errorCode('DUPLICATE_SKU')],
    }),
    request({
      name: 'Validation lists every bad field',
      method: 'POST',
      url: '{{baseUrl}}/api/items',
      body: { sku: 'x', name: '', weightLb: -1 },
      tests: [
        status(400),
        JSON_BODY,
        errorCode('VALIDATION_ERROR'),
        'const paths = body.error.details.map(d => d.path);',
        "pm.test('details name sku, name and weightLb', () => pm.expect(paths).to.include.members(['sku', 'name', 'weightLb']));",
      ],
    }),
    request({
      name: 'Get item by barcode',
      method: 'GET',
      url: '{{baseUrl}}/api/items/{{barcode}}',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('same item', 'body.sku', "pm.variables.get('sku')"),
        expectEq('nothing on hand yet', 'body.qtyOnHand', '0'),
        expectEq('flagged low stock (0 <= reorder point 1)', 'body.lowStock', 'true'),
      ],
    }),
    request({
      name: 'Create lot-tracked item',
      method: 'POST',
      url: '{{baseUrl}}/api/items',
      body: {
        sku: 'pml-{{runId}}',
        name: 'Postman lot item {{runId}}',
        lotTracked: true,
        weightLb: 1,
      },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('lot tracked', 'body.lotTracked', 'true'),
        set('lotSku', 'body.sku'),
      ],
    }),
    request({
      name: 'Create storage bin',
      method: 'POST',
      url: '{{baseUrl}}/api/bins',
      body: { code: 'pb-{{runId}}-s', zone: 'STORAGE' },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('code upper-cased', 'body.code', "'PB-' + pm.variables.get('runId') + '-S'"),
        expectEq('zone', 'body.zone', "'STORAGE'"),
        set('bin', 'body.code'),
      ],
    }),
    request({
      name: 'Create picking bin',
      method: 'POST',
      url: '{{baseUrl}}/api/bins',
      body: { code: 'pb-{{runId}}-p', zone: 'PICKING' },
      tests: [status(201), JSON_BODY, set('pickBin', 'body.code')],
    }),
    request({
      name: 'Invalid zone is 400',
      method: 'POST',
      url: '{{baseUrl}}/api/bins',
      body: { code: 'pb-{{runId}}-x', zone: 'ATTIC' },
      tests: [status(400), JSON_BODY, errorCode('VALIDATION_ERROR')],
    }),
    request({
      name: 'List picking bins',
      method: 'GET',
      url: '{{baseUrl}}/api/bins?zone=PICKING',
      tests: [
        status(200),
        JSON_BODY,
        "pm.test('every row is PICKING', () => body.data.forEach(b => pm.expect(b.zone).to.eql('PICKING')));",
        "pm.test('our new bin is listed', () => pm.expect(body.data.map(b => b.code)).to.include(pm.collectionVariables.get('pickBin')));",
      ],
    }),
  ],
);

const receiving = folder(
  '03 Receiving',
  'PO lifecycle: OPEN -> PARTIAL -> RECEIVED, with the over-receipt and lot rules (REQ-009..013).',
  [
    request({
      name: 'Create purchase order',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders',
      body: { vendor: 'Postman Vendor', lines: [{ sku: '{{sku}}', qty: 10 }] },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('status OPEN', 'body.status', "'OPEN'"),
        expectEq('one line of 10', 'body.lines[0].qtyRemaining', '10'),
        set('poNumber', 'body.poNumber'),
      ],
    }),
    request({
      name: 'Over-receipt is refused',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders/{{poNumber}}/receipts',
      body: { lines: [{ lineNo: 1, qty: 11, bin: '{{bin}}' }] },
      tests: [
        status(409),
        JSON_BODY,
        errorCode('OVER_RECEIPT'),
        expectEq('details say 10 remain', 'body.error.details.qtyRemaining', '10'),
      ],
    }),
    request({
      name: 'Receiving into a SHIPPING bin is refused',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders/{{poNumber}}/receipts',
      body: { lines: [{ lineNo: 1, qty: 1, bin: 'SHIP-01' }] },
      tests: [status(409), JSON_BODY, errorCode('INVALID_BIN_ZONE')],
    }),
    request({
      name: 'Receive 4 into storage (partial)',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders/{{poNumber}}/receipts',
      body: { lines: [{ sku: '{{barcode}}', qty: 4, bin: '{{bin}}' }] },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('PO is PARTIAL', 'body.poStatus', "'PARTIAL'"),
        expectEq('6 remaining', 'body.lines[0].qtyRemaining', '6'),
        expectEq('ERP document queued', 'body.erpQueued', 'true'),
        set('receiptId', 'body.receiptId'),
      ],
    }),
    request({
      name: 'Receive 6 into picking (complete)',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders/{{poNumber}}/receipts',
      body: { lines: [{ lineNo: 1, qty: 6, bin: '{{pickBin}}' }] },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('PO is RECEIVED', 'body.poStatus', "'RECEIVED'"),
        expectEq('nothing remaining', 'body.lines[0].qtyRemaining', '0'),
      ],
    }),
    request({
      name: 'PO detail shows both receipts',
      method: 'GET',
      url: '{{baseUrl}}/api/purchase-orders/{{poNumber}}',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('status RECEIVED', 'body.status', "'RECEIVED'"),
        expectEq('two receipts', 'body.receipts.length', '2'),
        expectEq('receipts carry the receiver', 'body.receipts[0].receivedBy', "'Ada Admin'"),
      ],
    }),
    request({
      name: 'A received PO refuses more',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders/{{poNumber}}/receipts',
      body: { lines: [{ lineNo: 1, qty: 1, bin: '{{bin}}' }] },
      tests: [status(409), JSON_BODY, errorCode('PO_NOT_OPEN')],
    }),
    request({
      name: 'Create PO for the lot-tracked item',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders',
      body: { vendor: 'Postman Lots', lines: [{ sku: '{{lotSku}}', qty: 5 }] },
      tests: [status(201), JSON_BODY, set('lotPo', 'body.poNumber')],
    }),
    request({
      name: 'Lot-tracked receipt without a lot is 400',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders/{{lotPo}}/receipts',
      body: { lines: [{ lineNo: 1, qty: 5, bin: '{{bin}}' }] },
      tests: [status(400), JSON_BODY, errorCode('LOT_REQUIRED')],
    }),
    request({
      name: 'Lot-tracked receipt with a lot',
      method: 'POST',
      url: '{{baseUrl}}/api/purchase-orders/{{lotPo}}/receipts',
      body: { lines: [{ lineNo: 1, qty: 5, bin: '{{bin}}', lot: 'LOT-{{runId}}' }] },
      tests: [
        status(201),
        JSON_BODY,
        expectEq(
          'lot kept on the receipt',
          'body.lines[0].lot',
          "'LOT-' + pm.variables.get('runId')",
        ),
        expectEq('PO RECEIVED', 'body.poStatus', "'RECEIVED'"),
      ],
    }),
    request({
      name: 'Inventory by bin',
      method: 'GET',
      url: '{{baseUrl}}/api/inventory/bin/{{bin}}',
      tests: [
        status(200),
        JSON_BODY,
        "const mine = body.rows.find(r => r.sku === pm.collectionVariables.get('sku'));",
        expectEq('4 of our item in storage', 'mine.qtyOnHand', '4'),
        "const lot = body.rows.find(r => r.sku === pm.collectionVariables.get('lotSku'));",
        expectEq('lot row present', 'lot.lot', "'LOT-' + pm.variables.get('runId')"),
      ],
    }),
    request({
      name: 'Inventory by item',
      method: 'GET',
      url: '{{baseUrl}}/api/inventory/item/{{sku}}',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('10 on hand in total', 'body.qtyOnHand', '10'),
        expectEq(
          'picking bin listed first',
          'body.rows[0].bin',
          "pm.collectionVariables.get('pickBin')",
        ),
        expectEq('no longer low stock', 'body.lowStock', 'false'),
      ],
    }),
  ],
);

const picking = folder(
  '04 Picking and shipping',
  'SO lifecycle: OPEN -> PICKING -> PICKED -> SHIPPED (REQ-014..018).',
  [
    request({
      name: 'Create sales order',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders',
      body: { customer: 'Postman Customer', country: 'US', lines: [{ sku: '{{sku}}', qty: 3 }] },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('status OPEN', 'body.status', "'OPEN'"),
        set('soNumber', 'body.soNumber'),
      ],
    }),
    request({
      name: 'SO detail suggests the picking bin first',
      method: 'GET',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}',
      tests: [
        status(200),
        JSON_BODY,
        expectEq(
          'first suggestion is the PICKING bin',
          'body.lines[0].suggestions[0].bin',
          "pm.collectionVariables.get('pickBin')",
        ),
        expectEq('10 available', 'body.lines[0].available', '10'),
        expectEq('estimated weight 3 x 2 lb', 'body.estimatedWeightLb', '6'),
        expectEq('UPS Ground suggested', 'body.shippingSuggestion.service', "'Ground'"),
      ],
    }),
    request({
      name: 'Wrong item scan is 409',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}/picks',
      body: { lineNo: 1, bin: '{{pickBin}}', qty: 1, sku: 'TOY-ROBOT-RED' },
      tests: [
        status(409),
        JSON_BODY,
        errorCode('WRONG_ITEM'),
        expectEq(
          'details name the expected sku',
          'body.error.details.expected',
          "pm.variables.get('sku')",
        ),
      ],
    }),
    request({
      name: 'Over-pick is 409',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}/picks',
      body: { lineNo: 1, bin: '{{pickBin}}', qty: 4 },
      tests: [status(409), JSON_BODY, errorCode('OVER_PICK')],
    }),
    request({
      name: 'Pick 3 from the picking bin',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}/picks',
      body: { lineNo: 1, bin: '{{pickBin}}', qty: 3, sku: '{{barcode}}' },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('order is PICKING', 'body.status', "'PICKING'"),
        expectEq('bin now holds 3', 'body.binQtyAfter', '3'),
        expectEq('all lines picked', 'body.allLinesPicked', 'true'),
      ],
    }),
    request({
      name: 'Complete the pick',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}/complete-pick',
      body: {},
      tests: [
        status(200),
        JSON_BODY,
        expectEq('PICKED', 'body.status', "'PICKED'"),
        expectEq('not short', 'body.short', 'false'),
      ],
    }),
    request({
      name: 'Shipping suggestion for 6 lb',
      method: 'GET',
      url: '{{baseUrl}}/api/shipping/suggest?weightLb=6&country=US&priority=STANDARD',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('UPS', 'body.carrier', "'UPS'"),
        expectEq('Ground', 'body.service', "'Ground'"),
      ],
    }),
    request({
      name: 'Shipping suggestion for 200 lb to Canada',
      method: 'GET',
      url: '{{baseUrl}}/api/shipping/suggest?weightLb=200&country=CA',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('international wins over freight', 'body.carrier', "'DHL'"),
      ],
    }),
    request({
      name: 'Ship the order',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}/ship',
      body: {},
      tests: [
        status(200),
        JSON_BODY,
        expectEq('SHIPPED', 'body.status', "'SHIPPED'"),
        expectEq('UPS by rule', 'body.carrier', "'UPS'"),
        expectEq('weight from the picked lines', 'body.weightLb', '6'),
        "pm.test('UPS-shaped tracking number', () => pm.expect(body.trackingNumber).to.match(/^1Z[A-Z0-9]{16}$/));",
        set('trackingNumber', 'body.trackingNumber'),
      ],
    }),
    request({
      name: 'Shipping twice is 409',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}/ship',
      body: {},
      tests: [status(409), JSON_BODY, errorCode('SO_NOT_PICKED')],
    }),
    request({
      name: 'Shipped orders cannot be cancelled',
      method: 'POST',
      url: '{{baseUrl}}/api/sales-orders/{{soNumber}}/cancel',
      body: {},
      tests: [status(409), JSON_BODY, errorCode('SO_NOT_CANCELLABLE')],
    }),
  ],
);

const transfers = folder(
  '05 Transfers',
  'Bin-to-bin moves and their ledger rows (REQ-019, REQ-023).',
  [
    request({
      name: 'Move 2 from storage to picking',
      method: 'POST',
      url: '{{baseUrl}}/api/transfers',
      body: { sku: '{{sku}}', fromBin: '{{bin}}', toBin: '{{pickBin}}', qty: 2 },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('storage now 2', 'body.from.qtyAfter', '2'),
        expectEq('picking now 5', 'body.to.qtyAfter', '5'),
        "pm.test('reference looks like TRF-n', () => pm.expect(body.reference).to.match(/^TRF-\\d+$/));",
        set('transferRef', 'body.reference'),
      ],
    }),
    request({
      name: 'Same bin is 400',
      method: 'POST',
      url: '{{baseUrl}}/api/transfers',
      body: { sku: '{{sku}}', fromBin: '{{bin}}', toBin: '{{bin}}', qty: 1 },
      tests: [status(400), JSON_BODY, errorCode('SAME_BIN')],
    }),
    request({
      name: 'More than the bin holds is 409',
      method: 'POST',
      url: '{{baseUrl}}/api/transfers',
      body: { sku: '{{sku}}', fromBin: '{{bin}}', toBin: '{{pickBin}}', qty: 99 },
      tests: [
        status(409),
        JSON_BODY,
        errorCode('INSUFFICIENT_STOCK'),
        expectEq('details say 2 available', 'body.error.details.available', '2'),
      ],
    }),
    request({
      name: 'Ledger has an OUT and an IN row for the transfer',
      method: 'GET',
      url: '{{baseUrl}}/api/transactions?reference={{transferRef}}',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('two rows', 'body.data.length', '2'),
        "pm.test('one TRANSFER_OUT and one TRANSFER_IN', () => pm.expect(body.data.map(t => t.type).sort()).to.eql(['TRANSFER_IN', 'TRANSFER_OUT']));",
      ],
    }),
  ],
);

const counts = folder(
  '06 Cycle counts',
  'Snapshot, blind-free count by the operator, approval by the admin (REQ-020..021).',
  [
    request({
      name: 'Create count for the storage bin',
      method: 'POST',
      url: '{{baseUrl}}/api/cycle-counts',
      body: { bin: '{{bin}}', assignedTo: '{{operatorUser}}' },
      tests: [
        status(201),
        JSON_BODY,
        expectEq('OPEN', 'body.status', "'OPEN'"),
        expectEq(
          'assigned to the operator',
          'body.assignedTo',
          "pm.collectionVariables.get('operatorName')",
        ),
        "const mine = body.lines.find(l => l.sku === pm.collectionVariables.get('sku'));",
        expectEq('expected 2 of our item', 'mine.expectedQty', '2'),
        set('countId', 'body.id'),
      ],
    }),
    request({
      name: 'Second count for the same bin is 409',
      method: 'POST',
      url: '{{baseUrl}}/api/cycle-counts',
      body: { bin: '{{bin}}' },
      tests: [status(409), JSON_BODY, errorCode('COUNT_ALREADY_OPEN')],
    }),
    request({
      name: 'Operator submits the count (finds 1, not 2)',
      method: 'POST',
      url: '{{baseUrl}}/api/cycle-counts/{{countId}}/submit',
      auth: 'operator',
      body: {
        lines: [
          { sku: '{{sku}}', countedQty: 1 },
          { sku: '{{lotSku}}', lot: 'LOT-{{runId}}', countedQty: 5 },
        ],
      },
      tests: [
        status(200),
        JSON_BODY,
        expectEq('SUBMITTED', 'body.status', "'SUBMITTED'"),
        "const mine = body.lines.find(l => l.sku === pm.collectionVariables.get('sku'));",
        expectEq('variance -1', 'mine.variance', '-1'),
        expectEq('one line with variance', 'body.summary.linesWithVariance', '1'),
      ],
    }),
    request({
      name: 'Operator cannot approve (403)',
      method: 'POST',
      url: '{{baseUrl}}/api/cycle-counts/{{countId}}/approve',
      auth: 'operator',
      body: {},
      tests: [status(403)],
    }),
    request({
      name: 'Admin approves: adjustment posted',
      method: 'POST',
      url: '{{baseUrl}}/api/cycle-counts/{{countId}}/approve',
      body: { notes: 'Approved from Postman' },
      tests: [
        status(200),
        JSON_BODY,
        expectEq('APPROVED', 'body.status', "'APPROVED'"),
        expectEq('one adjustment', 'body.adjustments.length', '1'),
        expectEq('adjustment of -1', 'body.adjustments[0].qtyDelta', '-1'),
        expectEq('ERP document queued', 'body.erpQueued', 'true'),
      ],
    }),
    request({
      name: 'Storage bin now holds 1',
      method: 'GET',
      url: '{{baseUrl}}/api/inventory/bin/{{bin}}',
      tests: [
        status(200),
        JSON_BODY,
        "const mine = body.rows.find(r => r.sku === pm.collectionVariables.get('sku'));",
        expectEq('qty 1', 'mine.qtyOnHand', '1'),
      ],
    }),
    request({
      name: 'Ledger has the ADJUSTMENT row',
      method: 'GET',
      url: '{{baseUrl}}/api/transactions?reference=CC-{{countId}}',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('one row', 'body.data.length', '1'),
        expectEq('type ADJUSTMENT', 'body.data[0].type', "'ADJUSTMENT'"),
        expectEq('delta -1', 'body.data[0].qtyDelta', '-1'),
        expectEq('posted by the admin', 'body.data[0].user', "'Ada Admin'"),
      ],
    }),
  ],
);

const erp = folder(
  '07 ERP sync',
  'Outbox delivery and idempotent pulls against the Nimbus ERP mock (REQ-024..025).',
  [
    request({
      name: 'ERP status',
      method: 'GET',
      url: '{{baseUrl}}/api/erp/status',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('reachable', 'body.reachable', 'true'),
        "pm.test('outbox counters present', () => pm.expect(body.outbox).to.have.all.keys('pending', 'failed', 'sent'));",
      ],
    }),
    request({
      name: 'Sync now',
      method: 'POST',
      url: '{{baseUrl}}/api/erp/sync',
      body: {},
      tests: [
        status(200),
        JSON_BODY,
        "pm.test('nothing failed to push', () => pm.expect(body.pushed.failed).to.eql(0));",
        "pm.test('pull result has counts', () => pm.expect(body.pulled).to.include.keys('purchaseOrders', 'salesOrders', 'skipped'));",
      ],
    }),
    request({
      name: 'Our documents are SENT',
      method: 'GET',
      url: '{{baseUrl}}/api/erp/outbox',
      tests: [
        status(200),
        JSON_BODY,
        "const po = pm.collectionVariables.get('poNumber'); const so = pm.collectionVariables.get('soNumber'); const cc = 'CC-' + pm.collectionVariables.get('countId');",
        'const mine = body.data.filter(o => o.reference.startsWith(po) || o.reference === so || o.reference === cc);',
        "pm.test('receipts, fulfillment and adjustment were queued', () => pm.expect(mine.length).to.be.at.least(4));",
        "pm.test('all of them are SENT with an ERP reference', () => mine.forEach(o => { pm.expect(o.status).to.eql('SENT'); pm.expect(o.erpRef).to.be.a('string'); }));",
      ],
    }),
    request({
      name: 'ERP received the fulfillment',
      method: 'GET',
      url: '{{erpUrl}}/erp/item-fulfillments',
      auth: 'none',
      tests: [
        status(200),
        JSON_BODY,
        "const mine = body.find(f => f.payload.soNumber === pm.collectionVariables.get('soNumber'));",
        "pm.test('fulfillment is there with our tracking number', () => pm.expect(mine.payload.trackingNumber).to.eql(pm.collectionVariables.get('trackingNumber')));",
        "pm.test('quantity matches the pick', () => pm.expect(mine.payload.lines).to.eql([{ sku: pm.collectionVariables.get('sku'), qty: 3 }]));",
      ],
    }),
    request({
      name: 'Create an order in the ERP',
      method: 'POST',
      url: '{{erpUrl}}/erp/sales-orders',
      auth: 'none',
      body: {
        soNumber: 'ESO-{{runId}}',
        customer: 'ERP Customer',
        shipToCountry: 'CA',
        priority: 'RUSH',
        lines: [{ sku: '{{sku}}', qty: 1 }],
      },
      tests: [status(201), JSON_BODY, set('erpSo', 'body.soNumber')],
    }),
    request({
      name: 'Sync pulls it once',
      method: 'POST',
      url: '{{baseUrl}}/api/erp/sync',
      body: {},
      tests: [status(200)],
    }),
    request({
      name: 'The ERP order is now a warehouse order',
      method: 'GET',
      url: '{{baseUrl}}/api/sales-orders/{{erpSo}}',
      tests: [
        status(200),
        JSON_BODY,
        "pm.test('linked to the ERP id', () => pm.expect(body.erpId).to.match(/^NIMBUS-SO-/));",
        expectEq('country and priority copied', 'body.country + body.priority', "'CARUSH'"),
        expectEq('DHL suggested for Canada', 'body.shippingSuggestion.carrier', "'DHL'"),
      ],
    }),
    request({
      name: 'Second sync does not duplicate it',
      method: 'POST',
      url: '{{baseUrl}}/api/erp/sync',
      body: {},
      tests: [status(200)],
    }),
    request({
      name: 'Still exactly one order with that number',
      method: 'GET',
      url: '{{baseUrl}}/api/sales-orders?q={{erpSo}}',
      tests: [status(200), JSON_BODY, expectEq('total 1', 'body.total', '1')],
    }),
  ],
);

const reports = folder(
  '08 Reports, labels, settings',
  'Read models and cross-checks (REQ-023, REQ-026..028).',
  [
    request({
      name: 'Dashboard KPIs',
      method: 'GET',
      url: '{{baseUrl}}/api/reports/dashboard',
      tests: [
        status(200),
        JSON_BODY,
        "['openPurchaseOrders','ordersToPick','ordersToShip','unitsOnHand','lowStockItems'].forEach(k => pm.test(k + ' is a number', () => pm.expect(body[k]).to.be.a('number')));",
        expectEq('ERP reachable', 'body.erpReachable', 'true'),
      ],
    }),
    request({
      name: 'Ledger invariant holds',
      method: 'GET',
      url: '{{baseUrl}}/api/inventory/invariants',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('ok', 'body.ok', 'true'),
        expectEq('no mismatches', 'body.mismatches.length', '0'),
        expectEq('no negative stock', 'body.negatives.length', '0'),
      ],
    }),
    request({
      name: 'Transactions for our item',
      method: 'GET',
      url: '{{baseUrl}}/api/transactions?sku={{sku}}',
      tests: [
        status(200),
        JSON_BODY,
        expectEq('receipt x2, pick, transfer out/in, adjustment = 6 rows', 'body.data.length', '6'),
        "pm.test('newest first', () => pm.expect(body.data[0].id).to.be.above(body.data[5].id));",
      ],
    }),
    request({
      name: 'Bin label (ZPL)',
      method: 'GET',
      url: '{{baseUrl}}/api/labels/bin/{{bin}}',
      tests: [
        status(200),
        JSON_BODY,
        "pm.test('ZPL starts with ^XA and holds the bin code', () => { pm.expect(body.zpl).to.match(/^\\^XA/); pm.expect(body.zpl).to.include('^FD' + pm.collectionVariables.get('bin') + '^FS'); });",
      ],
    }),
    request({
      name: 'Item label (UPC-A)',
      method: 'GET',
      url: '{{baseUrl}}/api/labels/item/{{sku}}?lot=L1',
      tests: [
        status(200),
        JSON_BODY,
        "pm.test('uses the UPC-A command with 11 data digits', () => pm.expect(body.zpl).to.include('^BUN'));",
        "pm.test('lot printed', () => pm.expect(body.zpl).to.include('Lot: L1'));",
      ],
    }),
    request({
      name: 'Settings',
      method: 'GET',
      url: '{{baseUrl}}/api/settings',
      tests: [
        status(200),
        JSON_BODY,
        "pm.test('exactly the four warehouse settings', () => pm.expect(Object.keys(body).sort()).to.eql(['allowNegativeInventory', 'allowOverReceipt', 'allowShortPick', 'blindCounts']));",
      ],
    }),
  ],
);

const users = folder(
  '09 Users',
  'User administration and its effect on sessions (REQ-002, REQ-033).',
  [
    request({
      name: 'Create user',
      method: 'POST',
      url: '{{baseUrl}}/api/users',
      body: {
        username: 'pm{{runId}}',
        displayName: 'Postman Person',
        role: 'operator',
        pin: '2468',
      },
      tests: [
        status(201),
        JSON_BODY,
        "pm.test('username lower-cased', () => pm.expect(body.username).to.eql(('pm' + pm.collectionVariables.get('runId')).toLowerCase()));",
        set('newUserId', 'body.id'),
        set('newUser', 'body.username'),
      ],
    }),
    request({
      name: 'New user can sign in',
      method: 'POST',
      url: '{{baseUrl}}/api/auth/login',
      auth: 'none',
      body: { username: '{{newUser}}', pin: '2468' },
      tests: [status(200)],
    }),
    request({
      name: 'Deactivate the user',
      method: 'PATCH',
      url: '{{baseUrl}}/api/users/{{newUserId}}',
      body: { active: false },
      tests: [status(200), JSON_BODY, expectEq('inactive', 'body.active', 'false')],
    }),
    request({
      name: 'Deactivated user cannot sign in',
      method: 'POST',
      url: '{{baseUrl}}/api/auth/login',
      auth: 'none',
      body: { username: '{{newUser}}', pin: '2468' },
      tests: [status(403), JSON_BODY, errorCode('USER_INACTIVE')],
    }),
    request({
      name: 'Admin cannot deactivate themselves',
      method: 'PATCH',
      url: '{{baseUrl}}/api/users/1',
      body: { active: false },
      tests: [status(409), JSON_BODY, errorCode('CANNOT_DEACTIVATE_SELF')],
    }),
  ],
);

const variables = [
  'token',
  'operatorToken',
  'operatorName',
  'runId',
  'sku',
  'barcode',
  'lotSku',
  'bin',
  'pickBin',
  'poNumber',
  'receiptId',
  'lotPo',
  'soNumber',
  'trackingNumber',
  'transferRef',
  'countId',
  'erpSo',
  'newUserId',
  'newUser',
];

const collection = {
  info: {
    name: 'ScanDock WMS API',
    _postman_id: 'a9c7f3e2-5d1b-4c8e-9f0a-scandock0001',
    description:
      'Regression collection for the ScanDock warehouse API. Run it top to bottom (Collection Runner or Newman): ' +
      '"00 Setup" signs in and stores tokens, later folders chain ids through collection variables. ' +
      'Generated from scripts/build-postman.ts; edit that file, not this one.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          '// Make single requests runnable out of order: give them a run id if the setup folder has not.',
          "if (!pm.collectionVariables.get('runId')) pm.collectionVariables.set('runId', Date.now().toString(36).toUpperCase().slice(-6));",
        ],
      },
    },
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          "pm.test('answers within 1500 ms', () => pm.expect(pm.response.responseTime).to.be.below(1500));",
          "if (pm.response.code !== 204) pm.test('JSON content type', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'));",
        ],
      },
    },
  ],
  variable: variables.map((key) => ({ key, value: '' })),
  item: [setup, access, master, receiving, picking, transfers, counts, erp, reports, users],
};

const environment = {
  name: 'ScanDock local',
  _postman_variable_scope: 'environment',
  values: [
    { key: 'baseUrl', value: 'http://localhost:4000', enabled: true },
    { key: 'erpUrl', value: 'http://localhost:4100', enabled: true },
    { key: 'adminUser', value: 'admin', enabled: true },
    { key: 'adminPin', value: '1234', enabled: true },
    { key: 'operatorUser', value: 'picker1', enabled: true },
    { key: 'operatorPin', value: '1234', enabled: true },
  ],
};

mkdirSync(out, { recursive: true });
writeFileSync(
  path.join(out, 'ScanDock-WMS.postman_collection.json'),
  JSON.stringify(collection, null, 2) + '\n',
);
writeFileSync(
  path.join(out, 'ScanDock-local.postman_environment.json'),
  JSON.stringify(environment, null, 2) + '\n',
);
const leaked = JSON.stringify(collection.item).match(/exec":\[[^\]]*\{\{/);
if (leaked)
  throw new Error(
    'a test script contains a {{placeholder}}; Postman does not expand variables inside scripts, use pm.variables.get()',
  );
const count = collection.item.reduce((n, f) => n + f.item.length, 0);
console.log(
  `wrote postman/ScanDock-WMS.postman_collection.json (${collection.item.length} folders, ${count} requests) and the local environment`,
);
