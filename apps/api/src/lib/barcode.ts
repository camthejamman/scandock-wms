/**
 * UPC-A helpers. A UPC-A barcode is 11 data digits + 1 check digit.
 * Check digit: 3 x (sum of digits in odd positions, 1-based) + (sum of even positions),
 * then the amount needed to reach the next multiple of 10.
 */
export function upcCheckDigit(body: string): number {
  if (!/^\d{11}$/.test(body)) {
    throw new Error('UPC-A body must be exactly 11 digits');
  }
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(body[i]);
    if (i % 2 === 0) odd += d;
    else even += d;
  }
  return (10 - ((odd * 3 + even) % 10)) % 10;
}

export function makeUpcA(body: string): string {
  return body + String(upcCheckDigit(body));
}

export function isValidUpcA(code: string): boolean {
  if (!/^\d{12}$/.test(code)) return false;
  return upcCheckDigit(code.slice(0, 11)) === Number(code[11]);
}

/** Deterministic barcode for seed data: company prefix + 5-digit item reference. */
export function upcFromIndex(index: number, prefix = '041234'): string {
  if (!Number.isInteger(index) || index < 0 || index > 99_999) {
    throw new Error('index must be an integer between 0 and 99999');
  }
  if (!/^\d{6}$/.test(prefix)) throw new Error('prefix must be 6 digits');
  return makeUpcA(prefix + String(index).padStart(5, '0'));
}

/** Random (but valid) UPC-A for items created at runtime without a barcode. */
export function randomUpcA(): string {
  let body = '';
  for (let i = 0; i < 11; i++) body += Math.floor(Math.random() * 10);
  return makeUpcA(body);
}
