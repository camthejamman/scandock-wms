import type { ApiClient } from './api-client';
import { uid } from './env';

/**
 * Test data factory. Everything goes through the public API (black box), and every
 * record gets a unique code so tests can run in parallel against one database.
 */
export class Factory {
  constructor(private readonly api: ApiClient) {}

  async item(
    overrides: Partial<{
      sku: string;
      name: string;
      lotTracked: boolean;
      weightLb: number;
      reorderPoint: number;
      barcode: string;
      category: string;
      unitCost: number;
    }> = {},
  ) {
    const sku = overrides.sku ?? uid('SKU');
    return this.api.postOk<{
      id: number;
      sku: string;
      barcode: string;
      name: string;
      lotTracked: boolean;
      weightLb: number;
      reorderPoint: number;
    }>('/items', {
      sku,
      name: overrides.name ?? `Test item ${sku}`,
      lotTracked: overrides.lotTracked ?? false,
      weightLb: overrides.weightLb ?? 1,
      reorderPoint: overrides.reorderPoint ?? 0,
      barcode: overrides.barcode,
      category: overrides.category ?? 'Test',
      unitCost: overrides.unitCost ?? 1,
    });
  }

  async bin(
    zone: 'RECEIVING' | 'STORAGE' | 'PICKING' | 'SHIPPING' | 'QUARANTINE' = 'STORAGE',
    code = uid('TB'),
  ) {
    return this.api.postOk<{ id: number; code: string; zone: string; active: boolean }>('/bins', {
      code,
      zone,
    });
  }

  async purchaseOrder(
    lines: Array<{ sku: string; qty: number }>,
    overrides: Partial<{ poNumber: string; vendor: string; expectedDate: string }> = {},
  ) {
    return this.api.postOk<{
      id: number;
      poNumber: string;
      status: string;
      lines: Array<{
        lineNo: number;
        sku: string;
        qtyOrdered: number;
        qtyRemaining: number;
        lotTracked: boolean;
      }>;
    }>('/purchase-orders', {
      poNumber: overrides.poNumber ?? uid('PO'),
      vendor: overrides.vendor ?? 'Test Vendor',
      expectedDate: overrides.expectedDate,
      lines,
    });
  }

  async salesOrder(
    lines: Array<{ sku: string; qty: number }>,
    overrides: Partial<{
      soNumber: string;
      customer: string;
      country: string;
      priority: 'STANDARD' | 'RUSH';
    }> = {},
  ) {
    return this.api.postOk<{
      id: number;
      soNumber: string;
      status: string;
      lines: Array<{ lineNo: number; sku: string; qtyOrdered: number }>;
    }>('/sales-orders', {
      soNumber: overrides.soNumber ?? uid('SO'),
      customer: overrides.customer ?? 'Test Customer',
      country: overrides.country ?? 'US',
      priority: overrides.priority ?? 'STANDARD',
      lines,
    });
  }

  /** Put stock on a shelf the way the warehouse does it: a PO received into a bin. */
  async stock(sku: string, bin: string, qty: number, lot?: string) {
    const po = await this.purchaseOrder([{ sku, qty }], { vendor: 'Stocking vendor' });
    await this.api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
      lines: [{ lineNo: 1, qty, bin, lot }],
    });
    return po;
  }

  /** A fresh item already sitting in a fresh picking bin: the most common test precondition. */
  async stockedItem(
    qty = 10,
    overrides: Parameters<Factory['item']>[0] = {},
    zone: 'STORAGE' | 'PICKING' = 'PICKING',
  ) {
    const item = await this.item(overrides);
    const bin = await this.bin(zone);
    const lot = item.lotTracked ? uid('LOT') : undefined;
    await this.stock(item.sku, bin.code, qty, lot);
    return { item, bin, lot, qty };
  }

  async cycleCount(bin: string, assignedTo?: string) {
    return this.api.postOk<{
      id: number;
      bin: string;
      status: string;
      lines: Array<{ sku: string; lot: string; expectedQty: number }>;
    }>('/cycle-counts', { bin, assignedTo });
  }

  async user(
    overrides: Partial<{
      username: string;
      displayName: string;
      role: 'admin' | 'supervisor' | 'operator';
      pin: string;
    }> = {},
  ) {
    const username = (overrides.username ?? uid('u')).toLowerCase();
    return this.api.postOk<{ id: number; username: string; role: string; active: boolean }>(
      '/users',
      {
        username,
        displayName: overrides.displayName ?? `Test ${username}`,
        role: overrides.role ?? 'operator',
        pin: overrides.pin ?? '1234',
      },
    );
  }
}
