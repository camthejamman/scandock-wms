/**
 * The "shipping rules engine" (a very small one). Deterministic so it can be unit tested
 * at every boundary: 1 lb, 70 lb, 150 lb, US vs international, rush vs standard.
 */
export type Priority = 'STANDARD' | 'RUSH';

export interface ShipmentInput {
  weightLb: number;
  country: string;
  priority?: Priority;
}

export interface CarrierSuggestion {
  carrier: string;
  service: string;
  rule: string;
}

export function suggestCarrier({
  weightLb,
  country,
  priority = 'STANDARD',
}: ShipmentInput): CarrierSuggestion {
  if (!Number.isFinite(weightLb) || weightLb <= 0) {
    throw new RangeError('weightLb must be a positive number');
  }
  const dest = country.trim().toUpperCase();
  if (dest !== 'US') return { carrier: 'DHL', service: 'Express Worldwide', rule: 'INTERNATIONAL' };
  if (weightLb > 150)
    return { carrier: 'Estes', service: 'LTL Freight', rule: 'FREIGHT_OVER_150LB' };
  if (priority === 'RUSH') return { carrier: 'UPS', service: 'Next Day Air', rule: 'RUSH' };
  if (weightLb <= 1)
    return { carrier: 'USPS', service: 'Ground Advantage', rule: 'LIGHT_UP_TO_1LB' };
  if (weightLb <= 70) return { carrier: 'UPS', service: 'Ground', rule: 'PARCEL_UP_TO_70LB' };
  return { carrier: 'FedEx', service: 'Ground (Heavy)', rule: 'HEAVY_70_TO_150LB' };
}

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

function pseudoRandom(seed: string): () => number {
  // xmur3 + mulberry32: tiny deterministic PRNG so tracking numbers are stable per order.
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(rand: () => number, alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

/** Carrier-shaped tracking numbers (format only; they are not real). */
export function makeTrackingNumber(carrier: string, seed: string): string {
  const rand = pseudoRandom(`${carrier}:${seed}`);
  switch (carrier) {
    case 'UPS':
      return '1Z' + draw(rand, ALNUM, 16);
    case 'USPS':
      return '9400' + draw(rand, '0123456789', 18);
    case 'FedEx':
      return draw(rand, '0123456789', 12);
    case 'DHL':
      return draw(rand, '0123456789', 10);
    case 'Estes':
      return 'PRO' + draw(rand, '0123456789', 9);
    default:
      return 'TRK' + draw(rand, ALNUM, 12);
  }
}
