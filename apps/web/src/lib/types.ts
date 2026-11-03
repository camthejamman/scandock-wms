export type Role = 'admin' | 'supervisor' | 'operator';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt?: string;
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Item {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  uom: string;
  unitCost: number;
  weightLb: number;
  lotTracked: boolean;
  reorderPoint: number;
  active: boolean;
  qtyOnHand?: number;
  lowStock?: boolean;
}

export interface StockRow {
  bin: string;
  zone: string;
  lot: string;
  qtyOnHand: number;
  updatedAt?: string;
}

export interface ItemDetail extends Item {
  qtyOnHand: number;
  stock: StockRow[];
}

export interface Bin {
  id: number;
  code: string;
  zone: string;
  active: boolean;
  warehouse: string;
  itemCount?: number;
  unitsOnHand?: number;
}

export interface BinContentRow {
  sku: string;
  name: string;
  barcode: string;
  lotTracked: boolean;
  lot: string;
  qtyOnHand: number;
}

export interface BinDetail extends Bin {
  contents: BinContentRow[];
  unitsOnHand: number;
}

export interface InventoryRow {
  sku: string;
  name: string;
  barcode: string;
  lotTracked: boolean;
  reorderPoint: number;
  bin: string;
  zone: string;
  lot: string;
  qtyOnHand: number;
  itemQtyOnHand: number;
  lowStock: boolean;
  updatedAt: string;
}

export type PoStatus = 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CLOSED';

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  vendor: string;
  status: PoStatus;
  expectedDate: string | null;
  erpId: string | null;
  createdAt: string;
  lineCount?: number;
  qtyOrdered?: number;
  qtyReceived?: number;
}

export interface PoLine {
  id: number;
  lineNo: number;
  sku: string;
  name: string;
  barcode: string;
  lotTracked: boolean;
  qtyOrdered: number;
  qtyReceived: number;
  qtyRemaining: number;
}

export interface Receipt {
  id: number;
  receivedAt: string;
  receivedBy: string | null;
  lines: Array<{ lineNo: number; sku: string; qty: number; bin: string; lot: string }>;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PoLine[];
  receipts: Receipt[];
}

export type SoStatus = 'OPEN' | 'PICKING' | 'PICKED' | 'SHIPPED' | 'CANCELLED';

export interface SalesOrder {
  id: number;
  soNumber: string;
  customer: string;
  country: string;
  priority: 'STANDARD' | 'RUSH';
  status: SoStatus;
  erpId: string | null;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  weightLb: number | null;
  shortReason: string | null;
  pickedAt: string | null;
  shippedAt: string | null;
  pickedBy: string | null;
  shippedBy: string | null;
  createdAt: string;
  lineCount?: number;
  qtyOrdered?: number;
  qtyPicked?: number;
}

export interface PickSuggestion {
  bin: string;
  zone: string;
  lot: string;
  qtyOnHand: number;
}

export interface SoLine {
  id: number;
  lineNo: number;
  sku: string;
  name: string;
  barcode: string;
  lotTracked: boolean;
  weightLb: number;
  qtyOrdered: number;
  qtyPicked: number;
  qtyRemaining: number;
  available: number;
  suggestions: PickSuggestion[];
}

export interface Pick {
  id: number;
  lineNo: number;
  sku: string;
  bin: string;
  lot: string;
  qty: number;
  pickedBy: string | null;
  pickedAt: string;
}

export interface CarrierSuggestion {
  carrier: string;
  service: string;
  rule: string;
}

export interface SalesOrderDetail extends SalesOrder {
  lines: SoLine[];
  picks: Pick[];
  estimatedWeightLb: number;
  shippingSuggestion: CarrierSuggestion;
}

export type CountStatus = 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface CycleCount {
  id: number;
  bin: string;
  zone: string;
  status: CountStatus;
  assignedToId: number | null;
  assignedTo: string | null;
  assignedToUsername: string | null;
  createdBy: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  notes: string;
  lineCount?: number;
  varianceLines?: number;
}

export interface CountLine {
  sku: string;
  name: string;
  lot: string;
  expectedQty: number | null;
  countedQty: number | null;
  variance: number | null;
}

export interface CountSummary {
  lines: number;
  linesWithVariance: number;
  netVariance: number;
  absVariance: number;
  accuracyPct: number | null;
}

export interface CycleCountDetail extends CycleCount {
  blind: boolean;
  lines: CountLine[];
  summary: CountSummary | null;
}

export interface Settings {
  allowShortPick: boolean;
  blindCounts: boolean;
  allowNegativeInventory: boolean;
  allowOverReceipt: boolean;
}

export interface Transaction {
  id: number;
  type: string;
  sku: string;
  name: string;
  bin: string;
  lot: string;
  qtyDelta: number;
  qtyAfter: number;
  reference: string;
  user: string | null;
  createdAt: string;
}

export interface Dashboard {
  openPurchaseOrders: number;
  ordersToPick: number;
  ordersToShip: number;
  shippedToday: number;
  openCounts: number;
  countsPendingApproval: number;
  unitsOnHand: number;
  skusInStock: number;
  lowStockItems: number;
  transactionsToday: number;
  erpOutboxPending: number;
  inventoryAccuracyPct: number | null;
  countedLines30d: number;
  erpReachable: boolean;
  generatedAt: string;
}

export interface ErpStatus {
  erpName: string;
  erpUrl: string;
  reachable: boolean;
  error: string | null;
  lastSyncAt: string | null;
  outbox: { pending: number; failed: number; sent: number };
  lastFailure: { message: string; createdAt: string } | null;
}

export interface ErpLogRow {
  id: number;
  direction: string;
  entity: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface OutboxRow {
  id: number;
  kind: string;
  reference: string;
  status: string;
  attempts: number;
  lastError: string | null;
  erpRef: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface Label {
  type: 'bin' | 'item';
  code?: string;
  zone?: string;
  sku?: string;
  name?: string;
  barcode?: string;
  lot?: string | null;
  zpl: string;
}

export interface TransferResult {
  id: number;
  reference: string;
  sku: string;
  lot: string;
  qty: number;
  from: { bin: string; qtyAfter: number };
  to: { bin: string; qtyAfter: number };
}
