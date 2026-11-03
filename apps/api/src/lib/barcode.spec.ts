import { isValidUpcA, makeUpcA, randomUpcA, upcCheckDigit, upcFromIndex } from './barcode.js';

describe('UPC-A check digit', () => {
  it('matches the textbook example 03600029145 -> 2', () => {
    expect(upcCheckDigit('03600029145')).toBe(2);
    expect(makeUpcA('03600029145')).toBe('036000291452');
  });

  it('returns 0 when the weighted sum is already a multiple of 10', () => {
    // 00000000000 -> sum 0 -> check digit 0
    expect(upcCheckDigit('00000000000')).toBe(0);
  });

  it('rejects bodies that are not 11 digits', () => {
    expect(() => upcCheckDigit('123')).toThrowError(/11 digits/);
    expect(() => upcCheckDigit('0360002914A')).toThrowError(/11 digits/);
    expect(() => upcCheckDigit('036000291452')).toThrowError(/11 digits/);
  });
});

describe('isValidUpcA', () => {
  it('accepts a valid code and rejects a single-digit typo', () => {
    expect(isValidUpcA('036000291452')).toBeTrue();
    expect(isValidUpcA('036000291453')).toBeFalse();
  });

  it('rejects wrong lengths and non-digits', () => {
    expect(isValidUpcA('03600029145')).toBeFalse();
    expect(isValidUpcA('0360002914521')).toBeFalse();
    expect(isValidUpcA('03600029145X')).toBeFalse();
    expect(isValidUpcA('')).toBeFalse();
  });

  it('round-trips every generated seed barcode', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidUpcA(upcFromIndex(i)))
        .withContext(`index ${i}`)
        .toBeTrue();
    }
    for (let i = 0; i < 50; i++) expect(isValidUpcA(randomUpcA())).toBeTrue();
  });
});

describe('upcFromIndex', () => {
  it('is deterministic and zero-pads the item reference', () => {
    expect(upcFromIndex(1)).toBe(upcFromIndex(1));
    expect(upcFromIndex(1).startsWith('04123400001')).toBeTrue();
    expect(upcFromIndex(99999).startsWith('04123499999')).toBeTrue();
  });

  it('rejects out-of-range indexes and bad prefixes', () => {
    expect(() => upcFromIndex(-1)).toThrow();
    expect(() => upcFromIndex(100000)).toThrow();
    expect(() => upcFromIndex(1.5)).toThrow();
    expect(() => upcFromIndex(1, '12')).toThrow();
  });
});
