/**
 * Deterministic demo data for "Riverbend Toy Distribution", a fictional toy wholesaler
 * running ScanDock in its Jacksonville DC. Everything here is invented.
 */
import { upcFromIndex } from '../lib/barcode.js';

export type Role = 'admin' | 'supervisor' | 'operator';

export interface SeedUser {
  username: string;
  displayName: string;
  role: Role;
  pin: string;
  active?: boolean;
}

export const SEED_USERS: SeedUser[] = [
  { username: 'admin', displayName: 'Ada Admin', role: 'admin', pin: '1234' },
  { username: 'super', displayName: 'Sam Supervisor', role: 'supervisor', pin: '1234' },
  { username: 'picker1', displayName: 'Pat Picker', role: 'operator', pin: '1234' },
  { username: 'receiver1', displayName: 'Rae Receiver', role: 'operator', pin: '1234' },
  {
    username: 'inactive',
    displayName: 'Ivy Inactive',
    role: 'operator',
    pin: '1234',
    active: false,
  },
];

export const SEED_WAREHOUSE = { code: 'JAX', name: 'Jacksonville Distribution Center' };

export type Zone = 'RECEIVING' | 'STORAGE' | 'PICKING' | 'SHIPPING' | 'QUARANTINE';

export interface SeedBin {
  code: string;
  zone: Zone;
}

function grid(prefix: string, aisles: number, slots: number, zone: Zone): SeedBin[] {
  const out: SeedBin[] = [];
  for (let a = 1; a <= aisles; a++) {
    for (let s = 1; s <= slots; s++) {
      out.push({
        code: `${prefix}-${String(a).padStart(2, '0')}-${String(s).padStart(2, '0')}`,
        zone,
      });
    }
  }
  return out;
}

export const SEED_BINS: SeedBin[] = [
  { code: 'RECV-01', zone: 'RECEIVING' },
  { code: 'RECV-02', zone: 'RECEIVING' },
  { code: 'QA-01', zone: 'QUARANTINE' },
  ...grid('A', 4, 4, 'STORAGE'),
  ...grid('B', 2, 4, 'STORAGE'),
  ...grid('P', 2, 4, 'PICKING'),
  { code: 'SHIP-01', zone: 'SHIPPING' },
  { code: 'SHIP-02', zone: 'SHIPPING' },
];

export interface SeedItem {
  sku: string;
  name: string;
  category: string;
  unitCost: number;
  weightLb: number;
  lotTracked?: boolean;
  reorderPoint: number;
  active?: boolean;
  description?: string;
}

// prettier-ignore
export const SEED_ITEMS: SeedItem[] = [
  { sku: 'TOY-ROBOT-RED',    name: 'Robo Rex Walking Robot (Red)',      category: 'Electronic Toys', unitCost: 14.5,  weightLb: 1.8,  reorderPoint: 12 },
  { sku: 'TOY-ROBOT-BLU',    name: 'Robo Rex Walking Robot (Blue)',     category: 'Electronic Toys', unitCost: 14.5,  weightLb: 1.8,  reorderPoint: 12 },
  { sku: 'PUZ-1000-OCEAN',   name: '1000-Piece Puzzle: Ocean Reef',     category: 'Puzzles',         unitCost: 6.2,   weightLb: 1.6,  reorderPoint: 20 },
  { sku: 'PUZ-500-CASTLE',   name: '500-Piece Puzzle: Castle',          category: 'Puzzles',         unitCost: 4.1,   weightLb: 1.1,  reorderPoint: 20 },
  { sku: 'GAME-CHESS-WD',    name: 'Wooden Chess Set',                  category: 'Games',           unitCost: 18,    weightLb: 3.2,  reorderPoint: 6 },
  { sku: 'GAME-CARDS-CLASH', name: 'Card Game: Color Clash',            category: 'Games',           unitCost: 2.3,   weightLb: 0.3,  reorderPoint: 40 },
  { sku: 'PLUSH-BEAR-LG',    name: 'Plush Bear 24 in',                  category: 'Plush',           unitCost: 9.9,   weightLb: 2,    reorderPoint: 10 },
  { sku: 'PLUSH-BEAR-SM',    name: 'Plush Bear 10 in',                  category: 'Plush',           unitCost: 4.4,   weightLb: 0.6,  reorderPoint: 24 },
  { sku: 'PLUSH-OCTO-RAIN',  name: 'Rainbow Octopus Plush',             category: 'Plush',           unitCost: 5.1,   weightLb: 0.7,  reorderPoint: 12 },
  { sku: 'KIT-ROCKET-A',     name: 'Model Rocket Kit A',                category: 'Science Kits',    unitCost: 22,    weightLb: 1.4,  reorderPoint: 6 },
  { sku: 'KIT-VOLCANO',      name: 'Volcano Science Kit',               category: 'Science Kits',    unitCost: 12.75, weightLb: 2.4,  reorderPoint: 8,  lotTracked: true, description: 'Contains chemicals; lot tracked for recalls.' },
  { sku: 'SLIME-GLOW-4OZ',   name: 'Glow Slime 4 oz',                   category: 'Crafts',          unitCost: 1.8,   weightLb: 0.4,  reorderPoint: 48, lotTracked: true },
  { sku: 'BATT-AA-24PK',     name: 'AA Batteries 24-pack',              category: 'Consumables',     unitCost: 7.6,   weightLb: 1.3,  reorderPoint: 20, lotTracked: true },
  { sku: 'BATT-AAA-24PK',    name: 'AAA Batteries 24-pack',             category: 'Consumables',     unitCost: 7.1,   weightLb: 0.9,  reorderPoint: 20, lotTracked: true },
  { sku: 'RC-CAR-MONSTER',   name: 'RC Monster Truck 1:16',             category: 'Electronic Toys', unitCost: 34,    weightLb: 4.5,  reorderPoint: 5 },
  { sku: 'RC-DRONE-MINI',    name: 'Mini Camera Drone',                 category: 'Electronic Toys', unitCost: 29,    weightLb: 0.9,  reorderPoint: 5 },
  { sku: 'DOLL-ASTRO',       name: 'Astronaut Doll 12 in',              category: 'Dolls',           unitCost: 11.2,  weightLb: 1,    reorderPoint: 10 },
  { sku: 'DOLL-CHEF',        name: 'Chef Doll 12 in',                   category: 'Dolls',           unitCost: 11.2,  weightLb: 1,    reorderPoint: 10 },
  { sku: 'BLOCK-SET-200',    name: 'Building Blocks 200 pc',            category: 'Building',        unitCost: 15,    weightLb: 3.8,  reorderPoint: 10 },
  { sku: 'BLOCK-SET-1000',   name: 'Building Blocks 1000 pc',           category: 'Building',        unitCost: 48,    weightLb: 12,   reorderPoint: 4 },
  { sku: 'ART-CRAYON-64',    name: 'Crayons 64 ct',                     category: 'Arts & Crafts',   unitCost: 3.2,   weightLb: 0.9,  reorderPoint: 30 },
  { sku: 'ART-MARKER-24',    name: 'Washable Markers 24 ct',            category: 'Arts & Crafts',   unitCost: 4.6,   weightLb: 0.8,  reorderPoint: 30 },
  { sku: 'ART-PAINT-SET',    name: 'Watercolor Paint Set',              category: 'Arts & Crafts',   unitCost: 5.5,   weightLb: 1.1,  reorderPoint: 15 },
  { sku: 'BOOK-DINO-ABC',    name: 'Board Book: Dino ABC',              category: 'Books',           unitCost: 3.9,   weightLb: 0.7,  reorderPoint: 12 },
  { sku: 'BOOK-SPACE-FACTS', name: 'Book: 1001 Space Facts',            category: 'Books',           unitCost: 6.8,   weightLb: 1.5,  reorderPoint: 8 },
  { sku: 'TRAIN-STARTER',    name: 'Wooden Train Starter Set',          category: 'Vehicles',        unitCost: 27,    weightLb: 5.5,  reorderPoint: 4 },
  { sku: 'TRAIN-TRACK-EXP',  name: 'Train Track Expansion 40 pc',       category: 'Vehicles',        unitCost: 13,    weightLb: 2.2,  reorderPoint: 6 },
  { sku: 'BALL-SOCCER-3',    name: 'Soccer Ball Size 3',                category: 'Outdoor',         unitCost: 8,     weightLb: 0.8,  reorderPoint: 10 },
  { sku: 'BALL-FOAM-6',      name: 'Foam Balls 6-pack',                 category: 'Outdoor',         unitCost: 6.3,   weightLb: 1,    reorderPoint: 10 },
  { sku: 'KITE-DELTA',       name: 'Delta Kite 60 in',                  category: 'Outdoor',         unitCost: 9.4,   weightLb: 0.9,  reorderPoint: 10 },
  { sku: 'YOYO-PRO',         name: 'Pro Yo-Yo',                         category: 'Classic Toys',    unitCost: 5.9,   weightLb: 0.3,  reorderPoint: 20 },
  { sku: 'TRAMP-36',         name: '36 in Mini Trampoline',             category: 'Outdoor',         unitCost: 59,    weightLb: 24,   reorderPoint: 2 },
  { sku: 'POOL-INFL-8FT',    name: 'Inflatable Pool 8 ft',              category: 'Outdoor',         unitCost: 44,    weightLb: 18,   reorderPoint: 2 },
  { sku: 'BIKE-BAL-12',      name: 'Balance Bike 12 in',                category: 'Ride-On',         unitCost: 65,    weightLb: 9.5,  reorderPoint: 3 },
  { sku: 'SCOOTER-3W',       name: '3-Wheel Kick Scooter',              category: 'Ride-On',         unitCost: 52,    weightLb: 7.8,  reorderPoint: 3 },
  { sku: 'WAGON-FOLD',       name: 'Folding Wagon',                     category: 'Ride-On',         unitCost: 78,    weightLb: 22,   reorderPoint: 2 },
  { sku: 'TENT-PLAY-CASTLE', name: 'Play Tent Castle',                  category: 'Pretend Play',    unitCost: 24,    weightLb: 3,    reorderPoint: 4 },
  { sku: 'SAND-KINETIC-2LB', name: 'Kinetic Sand 2 lb',                 category: 'Crafts',          unitCost: 7.2,   weightLb: 2.1,  reorderPoint: 12, lotTracked: true },
  { sku: 'BUBBLE-SOL-1GAL',  name: 'Bubble Solution 1 gal',             category: 'Outdoor',         unitCost: 6,     weightLb: 9,    reorderPoint: 6,  lotTracked: true },
  { sku: 'GIFT-BAG-ASST',    name: 'Gift Bags Assorted 12 pk',          category: 'Packaging',       unitCost: 2.1,   weightLb: 0.5,  reorderPoint: 24 },
  { sku: 'TOY-DISC-OLD',     name: 'Discontinued Flying Disc',          category: 'Outdoor',         unitCost: 1,     weightLb: 0.3,  reorderPoint: 0,  active: false },
];

/** Barcode for a seed item: company prefix 041234 + its 1-based position. */
export function seedBarcode(sku: string): string {
  const idx = SEED_ITEMS.findIndex((i) => i.sku === sku);
  if (idx < 0) throw new Error(`unknown seed sku ${sku}`);
  return upcFromIndex(idx + 1);
}

export interface SeedStock {
  sku: string;
  bin: string;
  qty: number;
  lot?: string;
}

// Opening balances. Low-stock on purpose: KITE-DELTA (3 <= 10), BOOK-DINO-ABC (5 <= 12),
// YOYO-PRO (nothing on hand) and RC-DRONE-MINI (4 <= 5).
// prettier-ignore
export const SEED_STOCK: SeedStock[] = [
  { sku: 'TOY-ROBOT-RED',    bin: 'P-01-01', qty: 8 },  { sku: 'TOY-ROBOT-RED',  bin: 'A-01-01', qty: 36 },
  { sku: 'TOY-ROBOT-BLU',    bin: 'P-01-01', qty: 6 },  { sku: 'TOY-ROBOT-BLU',  bin: 'A-01-01', qty: 24 },
  { sku: 'PUZ-1000-OCEAN',   bin: 'P-01-02', qty: 10 }, { sku: 'PUZ-1000-OCEAN', bin: 'A-01-02', qty: 48 },
  { sku: 'PUZ-500-CASTLE',   bin: 'P-01-02', qty: 12 }, { sku: 'PUZ-500-CASTLE', bin: 'A-01-02', qty: 60 },
  { sku: 'GAME-CHESS-WD',    bin: 'P-01-03', qty: 4 },  { sku: 'GAME-CHESS-WD',  bin: 'A-01-03', qty: 14 },
  { sku: 'GAME-CARDS-CLASH', bin: 'P-01-03', qty: 30 }, { sku: 'GAME-CARDS-CLASH', bin: 'A-01-03', qty: 120 },
  { sku: 'PLUSH-BEAR-LG',    bin: 'P-01-04', qty: 5 },  { sku: 'PLUSH-BEAR-LG',  bin: 'A-01-04', qty: 20 },
  { sku: 'PLUSH-BEAR-SM',    bin: 'P-01-04', qty: 12 }, { sku: 'PLUSH-BEAR-SM',  bin: 'A-01-04', qty: 40 },
  { sku: 'PLUSH-OCTO-RAIN',  bin: 'P-02-01', qty: 6 },  { sku: 'PLUSH-OCTO-RAIN', bin: 'A-02-01', qty: 18 },
  { sku: 'KIT-ROCKET-A',     bin: 'P-02-01', qty: 3 },  { sku: 'KIT-ROCKET-A',   bin: 'A-02-01', qty: 9 },
  { sku: 'KIT-VOLCANO',      bin: 'P-02-02', qty: 4, lot: 'LOT-2409A' }, { sku: 'KIT-VOLCANO', bin: 'A-02-02', qty: 10, lot: 'LOT-2409A' }, { sku: 'KIT-VOLCANO', bin: 'A-02-02', qty: 6, lot: 'LOT-2410B' },
  { sku: 'SLIME-GLOW-4OZ',   bin: 'P-02-02', qty: 20, lot: 'LOT-2410B' }, { sku: 'SLIME-GLOW-4OZ', bin: 'A-02-03', qty: 80, lot: 'LOT-2410B' },
  { sku: 'BATT-AA-24PK',     bin: 'P-02-03', qty: 10, lot: 'LOT-2409A' }, { sku: 'BATT-AA-24PK', bin: 'A-02-03', qty: 40, lot: 'LOT-2409A' }, { sku: 'BATT-AA-24PK', bin: 'A-02-04', qty: 24, lot: 'LOT-2410B' },
  { sku: 'BATT-AAA-24PK',    bin: 'P-02-03', qty: 8, lot: 'LOT-2410B' },  { sku: 'BATT-AAA-24PK', bin: 'A-02-04', qty: 32, lot: 'LOT-2410B' },
  { sku: 'RC-CAR-MONSTER',   bin: 'P-02-04', qty: 2 },  { sku: 'RC-CAR-MONSTER', bin: 'A-03-01', qty: 6 },
  { sku: 'RC-DRONE-MINI',    bin: 'P-02-04', qty: 4 },
  { sku: 'DOLL-ASTRO',       bin: 'P-01-01', qty: 6 },  { sku: 'DOLL-ASTRO',     bin: 'A-03-02', qty: 18 },
  { sku: 'DOLL-CHEF',        bin: 'P-01-01', qty: 6 },  { sku: 'DOLL-CHEF',      bin: 'A-03-02', qty: 18 },
  { sku: 'BLOCK-SET-200',    bin: 'P-01-02', qty: 4 },  { sku: 'BLOCK-SET-200',  bin: 'A-03-03', qty: 16 },
  { sku: 'BLOCK-SET-1000',   bin: 'A-03-03', qty: 7 },
  { sku: 'ART-CRAYON-64',    bin: 'P-01-03', qty: 24 }, { sku: 'ART-CRAYON-64',  bin: 'A-03-04', qty: 96 },
  { sku: 'ART-MARKER-24',    bin: 'P-01-03', qty: 18 }, { sku: 'ART-MARKER-24',  bin: 'A-03-04', qty: 72 },
  { sku: 'ART-PAINT-SET',    bin: 'P-01-04', qty: 9 },  { sku: 'ART-PAINT-SET',  bin: 'A-04-01', qty: 27 },
  { sku: 'BOOK-DINO-ABC',    bin: 'P-02-01', qty: 5 },
  { sku: 'BOOK-SPACE-FACTS', bin: 'P-02-01', qty: 7 },  { sku: 'BOOK-SPACE-FACTS', bin: 'A-04-01', qty: 21 },
  { sku: 'TRAIN-STARTER',    bin: 'A-04-02', qty: 10 },
  { sku: 'TRAIN-TRACK-EXP',  bin: 'A-04-02', qty: 20 },
  { sku: 'BALL-SOCCER-3',    bin: 'P-02-02', qty: 8 },  { sku: 'BALL-SOCCER-3',  bin: 'A-04-03', qty: 24 },
  { sku: 'BALL-FOAM-6',      bin: 'P-02-02', qty: 6 },  { sku: 'BALL-FOAM-6',    bin: 'A-04-03', qty: 18 },
  { sku: 'KITE-DELTA',       bin: 'P-02-03', qty: 3 },
  { sku: 'TRAMP-36',         bin: 'B-01-01', qty: 3 },
  { sku: 'POOL-INFL-8FT',    bin: 'B-01-02', qty: 5 },
  { sku: 'BIKE-BAL-12',      bin: 'B-01-03', qty: 6 },
  { sku: 'SCOOTER-3W',       bin: 'B-01-04', qty: 6 },
  { sku: 'WAGON-FOLD',       bin: 'B-02-01', qty: 4 },
  { sku: 'TENT-PLAY-CASTLE', bin: 'B-02-02', qty: 8 },
  { sku: 'SAND-KINETIC-2LB', bin: 'P-02-04', qty: 10, lot: 'LOT-2408C' }, { sku: 'SAND-KINETIC-2LB', bin: 'B-02-03', qty: 30, lot: 'LOT-2408C' },
  { sku: 'BUBBLE-SOL-1GAL',  bin: 'B-02-04', qty: 12, lot: 'LOT-2410B' },
  { sku: 'GIFT-BAG-ASST',    bin: 'P-01-04', qty: 20 }, { sku: 'GIFT-BAG-ASST',  bin: 'A-04-04', qty: 100 },
];

export interface SeedPoLine {
  sku: string;
  qty: number;
  received?: number;
  bin?: string;
  lot?: string;
}
export interface SeedPo {
  poNumber: string;
  vendor: string;
  status: 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CLOSED';
  expectedDate: string;
  lines: SeedPoLine[];
}

export const SEED_POS: SeedPo[] = [
  {
    poNumber: 'PO-1001',
    vendor: 'Pacific Toy Imports',
    status: 'OPEN',
    expectedDate: '2026-11-04',
    lines: [
      { sku: 'TOY-ROBOT-RED', qty: 24 },
      { sku: 'PUZ-1000-OCEAN', qty: 36 },
      { sku: 'GAME-CHESS-WD', qty: 12 },
    ],
  },
  {
    poNumber: 'PO-1002',
    vendor: 'BrightSpark Supply',
    status: 'OPEN',
    expectedDate: '2026-11-05',
    lines: [
      { sku: 'BATT-AA-24PK', qty: 48 },
      { sku: 'SLIME-GLOW-4OZ', qty: 60 },
    ],
  },
  {
    poNumber: 'PO-1003',
    vendor: 'Pacific Toy Imports',
    status: 'PARTIAL',
    expectedDate: '2026-10-30',
    lines: [
      { sku: 'PLUSH-BEAR-LG', qty: 40, received: 15, bin: 'A-01-04' },
      { sku: 'PLUSH-OCTO-RAIN', qty: 30 },
    ],
  },
  {
    poNumber: 'PO-1004',
    vendor: 'Nordic Wood Toys',
    status: 'RECEIVED',
    expectedDate: '2026-10-28',
    lines: [
      { sku: 'TRAIN-STARTER', qty: 10, received: 10, bin: 'A-04-02' },
      { sku: 'TRAIN-TRACK-EXP', qty: 20, received: 20, bin: 'A-04-02' },
    ],
  },
  {
    poNumber: 'PO-1005',
    vendor: 'Giant Fun Outdoor',
    status: 'OPEN',
    expectedDate: '2026-11-10',
    lines: [
      { sku: 'TRAMP-36', qty: 4 },
      { sku: 'POOL-INFL-8FT', qty: 6 },
      { sku: 'BIKE-BAL-12', qty: 8 },
      { sku: 'SCOOTER-3W', qty: 8 },
      { sku: 'WAGON-FOLD', qty: 5 },
    ],
  },
  {
    poNumber: 'PO-1006',
    vendor: 'BrightSpark Supply',
    status: 'CLOSED',
    expectedDate: '2026-10-15',
    lines: [{ sku: 'ART-CRAYON-64', qty: 100, received: 100, bin: 'A-03-04' }],
  },
];

export interface SeedSoLine {
  sku: string;
  qty: number;
  picked?: number;
  bin?: string;
  lot?: string;
}
export interface SeedSo {
  soNumber: string;
  customer: string;
  country?: string;
  priority?: 'STANDARD' | 'RUSH';
  status: 'OPEN' | 'PICKING' | 'PICKED' | 'SHIPPED' | 'CANCELLED';
  lines: SeedSoLine[];
  carrier?: string;
  service?: string;
  weightLb?: number;
}

export const SEED_SOS: SeedSo[] = [
  {
    soNumber: 'SO-5001',
    customer: 'Sunny Days Daycare',
    status: 'OPEN',
    lines: [
      { sku: 'PUZ-500-CASTLE', qty: 2 },
      { sku: 'ART-CRAYON-64', qty: 6 },
    ],
  },
  {
    soNumber: 'SO-5002',
    customer: 'Riverbend Toy Shop',
    status: 'OPEN',
    lines: [
      { sku: 'TOY-ROBOT-RED', qty: 3 },
      { sku: 'BATT-AA-24PK', qty: 2 },
      { sku: 'PLUSH-BEAR-SM', qty: 4 },
    ],
  },
  {
    soNumber: 'SO-5003',
    customer: 'Maple & Co (Toronto)',
    country: 'CA',
    status: 'OPEN',
    lines: [{ sku: 'BLOCK-SET-1000', qty: 2 }],
  },
  {
    soNumber: 'SO-5004',
    customer: 'Harbor Gifts',
    status: 'PICKING',
    lines: [
      { sku: 'DOLL-ASTRO', qty: 2, picked: 2, bin: 'P-01-01' },
      { sku: 'DOLL-CHEF', qty: 2 },
    ],
  },
  {
    soNumber: 'SO-5005',
    customer: 'Little Lanterns Bookshop',
    status: 'PICKED',
    lines: [
      { sku: 'BOOK-DINO-ABC', qty: 3, picked: 3, bin: 'P-02-01' },
      { sku: 'BOOK-SPACE-FACTS', qty: 2, picked: 2, bin: 'P-02-01' },
    ],
  },
  {
    soNumber: 'SO-5006',
    customer: 'Riverbend Toy Shop',
    status: 'SHIPPED',
    carrier: 'UPS',
    service: 'Ground',
    weightLb: 3.4,
    lines: [{ sku: 'ART-MARKER-24', qty: 4, picked: 4, bin: 'P-01-03' }],
  },
  {
    soNumber: 'SO-5007',
    customer: 'Big Box Buyers',
    status: 'OPEN',
    lines: [{ sku: 'KITE-DELTA', qty: 20 }],
  },
  {
    soNumber: 'SO-5008',
    customer: 'Harbor Gifts',
    priority: 'RUSH',
    status: 'OPEN',
    lines: [{ sku: 'RC-DRONE-MINI', qty: 1 }],
  },
  {
    soNumber: 'SO-5009',
    customer: 'Former Customer LLC',
    status: 'CANCELLED',
    lines: [{ sku: 'BALL-FOAM-6', qty: 2 }],
  },
];

export interface SeedCount {
  bin: string;
  status: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  assignedTo?: string;
  submittedBy?: string;
  daysAgo: number;
  /** counted overrides per sku (default = expected) */
  counted?: Record<string, number>;
  notes?: string;
}

export const SEED_COUNTS: SeedCount[] = [
  { bin: 'A-01-01', status: 'OPEN', assignedTo: 'picker1', daysAgo: 0 },
  {
    bin: 'A-02-01',
    status: 'SUBMITTED',
    assignedTo: 'receiver1',
    submittedBy: 'receiver1',
    daysAgo: 1,
    counted: { 'PLUSH-OCTO-RAIN': 16 },
  },
  {
    bin: 'P-01-01',
    status: 'APPROVED',
    assignedTo: 'picker1',
    submittedBy: 'picker1',
    daysAgo: 20,
  },
  {
    bin: 'A-03-02',
    status: 'APPROVED',
    assignedTo: 'picker1',
    submittedBy: 'picker1',
    daysAgo: 10,
    counted: { 'DOLL-CHEF': 17 },
  },
  {
    bin: 'A-01-02',
    status: 'REJECTED',
    assignedTo: 'receiver1',
    submittedBy: 'receiver1',
    daysAgo: 5,
    counted: { 'PUZ-500-CASTLE': 0 },
    notes: 'Recount requested: operator counted the wrong shelf.',
  },
];

export const DEFAULT_SETTINGS = {
  allowShortPick: true,
  blindCounts: false,
  allowNegativeInventory: false,
  allowOverReceipt: false,
};
export type Settings = typeof DEFAULT_SETTINGS;
