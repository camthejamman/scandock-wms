/** In-memory state for Nimbus ERP (the stand-in for NetSuite). */
export interface ErpLine {
  lineNo: number;
  sku: string;
  qty: number;
}

export interface ErpPurchaseOrder {
  id: string;
  poNumber: string;
  vendor: string;
  expectedDate: string;
  status: 'OPEN' | 'RECEIVED' | 'CLOSED';
  lines: ErpLine[];
  createdAt: string;
}

export interface ErpSalesOrder {
  id: string;
  soNumber: string;
  customer: string;
  shipToCountry: string;
  priority: 'STANDARD' | 'RUSH';
  status: 'OPEN' | 'FULFILLED' | 'CANCELLED';
  lines: ErpLine[];
  createdAt: string;
}

export interface ErpDocument {
  id: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface Chaos {
  down: boolean;
  latencyMs: number;
  failNextPosts: number;
}

export interface ErpState {
  purchaseOrders: ErpPurchaseOrder[];
  salesOrders: ErpSalesOrder[];
  itemReceipts: ErpDocument[];
  itemFulfillments: ErpDocument[];
  inventoryAdjustments: ErpDocument[];
  chaos: Chaos;
  seq: number;
  startedAt: string;
}

function lines(...pairs: Array<[string, number]>): ErpLine[] {
  return pairs.map(([sku, qty], i) => ({ lineNo: i + 1, sku, qty }));
}

export function freshState(): ErpState {
  const now = new Date().toISOString();
  return {
    purchaseOrders: [
      {
        id: 'NIMBUS-PO-2001',
        poNumber: 'PO-2001',
        vendor: 'Pacific Toy Imports',
        expectedDate: '2026-11-12',
        status: 'OPEN',
        lines: lines(['TOY-ROBOT-BLU', 24], ['PUZ-500-CASTLE', 48]),
        createdAt: now,
      },
      {
        id: 'NIMBUS-PO-2002',
        poNumber: 'PO-2002',
        vendor: 'Giant Fun Outdoor',
        expectedDate: '2026-11-14',
        status: 'OPEN',
        lines: lines(['KITE-DELTA', 50], ['YOYO-PRO', 60]),
        createdAt: now,
      },
    ],
    salesOrders: [
      {
        id: 'NIMBUS-SO-6001',
        soNumber: 'SO-6001',
        customer: 'Riverbend Toy Shop',
        shipToCountry: 'US',
        priority: 'STANDARD',
        status: 'OPEN',
        lines: lines(['GAME-CARDS-CLASH', 6], ['PLUSH-OCTO-RAIN', 2]),
        createdAt: now,
      },
      {
        id: 'NIMBUS-SO-6002',
        soNumber: 'SO-6002',
        customer: 'Maple & Co (Toronto)',
        shipToCountry: 'CA',
        priority: 'RUSH',
        status: 'OPEN',
        lines: lines(['KIT-ROCKET-A', 1]),
        createdAt: now,
      },
    ],
    itemReceipts: [],
    itemFulfillments: [],
    inventoryAdjustments: [],
    chaos: { down: false, latencyMs: 0, failNextPosts: 0 },
    seq: 100,
    startedAt: now,
  };
}
