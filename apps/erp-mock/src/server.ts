/**
 * Nimbus ERP: a deliberately small HTTP service that behaves like the ERP a warehouse
 * system syncs with. Orders live here first; receipts, fulfillments and adjustments
 * are posted back. The `/erp/_chaos` endpoint lets tests simulate outages and latency.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { freshState, type ErpLine, type ErpState } from './data.js';

const PORT = Number(process.env.PORT ?? 4100);
let state: ErpState = freshState();

const app = express();
app.use(express.json({ limit: '1mb' }));

// Chaos middleware: everything except the control endpoints honours "down" and latency.
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/erp/_') || req.path === '/') return next();
  if (state.chaos.latencyMs > 0) await new Promise((r) => setTimeout(r, state.chaos.latencyMs));
  if (state.chaos.down) {
    res.status(503).json({ error: 'Nimbus ERP is down for maintenance' });
    return;
  }
  next();
});

function nextId(prefix: string): string {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

function badLines(lines: unknown): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return 'lines must be a non-empty array';
  for (const l of lines as Array<Partial<ErpLine>>) {
    if (typeof l.sku !== 'string' || !l.sku.trim()) return 'every line needs a sku';
    if (typeof l.qty !== 'number' || !Number.isInteger(l.qty) || l.qty <= 0)
      return 'every line needs a positive integer qty';
  }
  return null;
}

function normalizeLines(lines: Array<Partial<ErpLine>>): ErpLine[] {
  return lines.map((l, i) => ({
    lineNo: l.lineNo ?? i + 1,
    sku: String(l.sku).trim().toUpperCase(),
    qty: Number(l.qty),
  }));
}

app.get('/erp/health', (_req, res) => {
  res.json({ status: 'ok', system: 'Nimbus ERP', startedAt: state.startedAt, documents: counts() });
});

function counts() {
  return {
    purchaseOrders: state.purchaseOrders.length,
    salesOrders: state.salesOrders.length,
    itemReceipts: state.itemReceipts.length,
    itemFulfillments: state.itemFulfillments.length,
    inventoryAdjustments: state.inventoryAdjustments.length,
  };
}

// ---- orders (the WMS pulls these) ----
app.get('/erp/purchase-orders', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
  res.json(state.purchaseOrders.filter((po) => !status || po.status === status));
});

app.get('/erp/purchase-orders/:poNumber', (req, res) => {
  const po = state.purchaseOrders.find(
    (p) => p.poNumber.toUpperCase() === String(req.params.poNumber).toUpperCase(),
  );
  if (!po) return void res.status(404).json({ error: 'purchase order not found' });
  res.json(po);
});

app.post('/erp/purchase-orders', (req, res) => {
  const { poNumber, vendor, expectedDate, lines } = req.body ?? {};
  if (typeof vendor !== 'string' || !vendor.trim())
    return void res.status(400).json({ error: 'vendor is required' });
  const problem = badLines(lines);
  if (problem) return void res.status(400).json({ error: problem });
  const number =
    typeof poNumber === 'string' && poNumber.trim()
      ? poNumber.trim().toUpperCase()
      : `PO-${2000 + state.seq + 1}`;
  if (state.purchaseOrders.some((p) => p.poNumber === number))
    return void res.status(409).json({ error: `${number} already exists` });
  const po = {
    id: nextId('NIMBUS-PO'),
    poNumber: number,
    vendor: vendor.trim(),
    expectedDate:
      typeof expectedDate === 'string'
        ? expectedDate
        : new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
    status: 'OPEN' as const,
    lines: normalizeLines(lines),
    createdAt: new Date().toISOString(),
  };
  state.purchaseOrders.push(po);
  res.status(201).json(po);
});

app.get('/erp/sales-orders', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
  res.json(state.salesOrders.filter((so) => !status || so.status === status));
});

app.get('/erp/sales-orders/:soNumber', (req, res) => {
  const so = state.salesOrders.find(
    (s) => s.soNumber.toUpperCase() === String(req.params.soNumber).toUpperCase(),
  );
  if (!so) return void res.status(404).json({ error: 'sales order not found' });
  res.json(so);
});

app.post('/erp/sales-orders', (req, res) => {
  const { soNumber, customer, shipToCountry, priority, lines } = req.body ?? {};
  if (typeof customer !== 'string' || !customer.trim())
    return void res.status(400).json({ error: 'customer is required' });
  const problem = badLines(lines);
  if (problem) return void res.status(400).json({ error: problem });
  const number =
    typeof soNumber === 'string' && soNumber.trim()
      ? soNumber.trim().toUpperCase()
      : `SO-${6000 + state.seq + 1}`;
  if (state.salesOrders.some((s) => s.soNumber === number))
    return void res.status(409).json({ error: `${number} already exists` });
  const so = {
    id: nextId('NIMBUS-SO'),
    soNumber: number,
    customer: customer.trim(),
    shipToCountry:
      typeof shipToCountry === 'string' && shipToCountry.length === 2
        ? shipToCountry.toUpperCase()
        : 'US',
    priority: priority === 'RUSH' ? ('RUSH' as const) : ('STANDARD' as const),
    status: 'OPEN' as const,
    lines: normalizeLines(lines),
    createdAt: new Date().toISOString(),
  };
  state.salesOrders.push(so);
  res.status(201).json(so);
});

// ---- documents (the WMS pushes these) ----
function failNextPost(res: Response): boolean {
  if (state.chaos.failNextPosts > 0) {
    state.chaos.failNextPosts -= 1;
    res.status(500).json({ error: 'Nimbus ERP: simulated failure' });
    return true;
  }
  return false;
}

app.post('/erp/item-receipts', (req, res) => {
  if (failNextPost(res)) return;
  const body = req.body ?? {};
  if (typeof body.poNumber !== 'string')
    return void res.status(400).json({ error: 'poNumber is required' });
  const problem = badLines(body.lines);
  if (problem) return void res.status(400).json({ error: problem });
  const doc = { id: nextId('IR'), receivedAt: new Date().toISOString(), payload: body };
  state.itemReceipts.push(doc);
  const po = state.purchaseOrders.find((p) => p.poNumber === body.poNumber);
  if (po && body.poStatus === 'RECEIVED') po.status = 'RECEIVED';
  res.status(201).json({ id: doc.id, status: 'accepted' });
});

app.post('/erp/item-fulfillments', (req, res) => {
  if (failNextPost(res)) return;
  const body = req.body ?? {};
  if (typeof body.soNumber !== 'string')
    return void res.status(400).json({ error: 'soNumber is required' });
  const problem = badLines(body.lines);
  if (problem) return void res.status(400).json({ error: problem });
  const doc = { id: nextId('IF'), receivedAt: new Date().toISOString(), payload: body };
  state.itemFulfillments.push(doc);
  const so = state.salesOrders.find((s) => s.soNumber === body.soNumber);
  if (so) so.status = 'FULFILLED';
  res.status(201).json({ id: doc.id, status: 'accepted' });
});

app.post('/erp/inventory-adjustments', (req, res) => {
  if (failNextPost(res)) return;
  const body = req.body ?? {};
  if (!Array.isArray(body.lines) || body.lines.length === 0)
    return void res.status(400).json({ error: 'lines must be a non-empty array' });
  const doc = { id: nextId('IA'), receivedAt: new Date().toISOString(), payload: body };
  state.inventoryAdjustments.push(doc);
  res.status(201).json({ id: doc.id, status: 'accepted' });
});

app.get('/erp/item-receipts', (_req, res) => res.json(state.itemReceipts));
app.get('/erp/item-fulfillments', (_req, res) => res.json(state.itemFulfillments));
app.get('/erp/inventory-adjustments', (_req, res) => res.json(state.inventoryAdjustments));

// ---- test controls ----
app.get('/erp/_chaos', (_req, res) => res.json(state.chaos));
app.post('/erp/_chaos', (req, res) => {
  const { down, latencyMs, failNextPosts } = req.body ?? {};
  if (typeof down === 'boolean') state.chaos.down = down;
  if (typeof latencyMs === 'number' && latencyMs >= 0 && latencyMs <= 30_000)
    state.chaos.latencyMs = latencyMs;
  if (typeof failNextPosts === 'number' && failNextPosts >= 0)
    state.chaos.failNextPosts = Math.floor(failNextPosts);
  res.json(state.chaos);
});
app.post('/erp/_reset', (_req, res) => {
  state = freshState();
  res.json({ ok: true, documents: counts() });
});

app.get('/', (_req, res) => {
  const row = (label: string, n: number) => `<tr><td>${label}</td><td>${n}</td></tr>`;
  const c = counts();
  res.type('html').send(`<!doctype html><title>Nimbus ERP</title>
<style>body{font:15px system-ui;margin:2rem;color:#222}table{border-collapse:collapse}td{padding:.3rem .8rem;border:1px solid #ddd}</style>
<h1>Nimbus ERP (mock)</h1><p>Stand-in for the ERP that ScanDock syncs with. ${state.chaos.down ? '<strong style="color:#b00">DOWN (chaos)</strong>' : 'Healthy.'}</p>
<table>${row('Purchase orders', c.purchaseOrders)}${row('Sales orders', c.salesOrders)}${row('Item receipts', c.itemReceipts)}${row('Item fulfillments', c.itemFulfillments)}${row('Inventory adjustments', c.inventoryAdjustments)}</table>
<p>Try <code>GET /erp/purchase-orders</code>, <code>GET /erp/item-receipts</code>, <code>POST /erp/_chaos {"down":true}</code>.</p>`);
});

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

app.use(
  (
    err: Error & { status?: number; type?: string },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (err.type === 'entity.parse.failed')
      return void res.status(400).json({ error: 'invalid JSON' });
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message || 'internal error' });
  },
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nimbus ERP mock listening on :${PORT}`);
});
