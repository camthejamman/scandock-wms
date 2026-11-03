import { makeTrackingNumber, suggestCarrier } from './shipping.js';

describe('suggestCarrier (shipping rules)', () => {
  it('sends international shipments with DHL regardless of weight or priority', () => {
    expect(suggestCarrier({ weightLb: 0.5, country: 'CA' }).carrier).toBe('DHL');
    expect(suggestCarrier({ weightLb: 500, country: 'gb', priority: 'RUSH' }).carrier).toBe('DHL');
    expect(suggestCarrier({ weightLb: 2, country: ' ca ' }).rule).toBe('INTERNATIONAL');
  });

  it('uses freight above 150 lb even for rush orders', () => {
    expect(suggestCarrier({ weightLb: 150.01, country: 'US', priority: 'RUSH' })).toEqual({
      carrier: 'Estes',
      service: 'LTL Freight',
      rule: 'FREIGHT_OVER_150LB',
    });
  });

  it('upgrades US rush orders to UPS Next Day Air', () => {
    expect(suggestCarrier({ weightLb: 0.3, country: 'US', priority: 'RUSH' }).service).toBe(
      'Next Day Air',
    );
    expect(suggestCarrier({ weightLb: 150, country: 'US', priority: 'RUSH' }).service).toBe(
      'Next Day Air',
    );
  });

  describe('weight boundaries (US, standard)', () => {
    const cases: Array<[number, string]> = [
      [0.01, 'USPS'],
      [0.99, 'USPS'],
      [1, 'USPS'],
      [1.01, 'UPS'],
      [69.99, 'UPS'],
      [70, 'UPS'],
      [70.01, 'FedEx'],
      [150, 'FedEx'],
      [150.01, 'Estes'],
      [2000, 'Estes'],
    ];
    for (const [weightLb, carrier] of cases) {
      it(`${weightLb} lb -> ${carrier}`, () => {
        expect(suggestCarrier({ weightLb, country: 'US' }).carrier).toBe(carrier);
      });
    }
  });

  it('rejects non-positive or non-finite weights', () => {
    expect(() => suggestCarrier({ weightLb: 0, country: 'US' })).toThrowError(RangeError);
    expect(() => suggestCarrier({ weightLb: -1, country: 'US' })).toThrowError(RangeError);
    expect(() => suggestCarrier({ weightLb: Number.NaN, country: 'US' })).toThrowError(RangeError);
    expect(() =>
      suggestCarrier({ weightLb: Number.POSITIVE_INFINITY, country: 'US' }),
    ).toThrowError(RangeError);
  });
});

describe('makeTrackingNumber', () => {
  it('is deterministic for the same carrier and seed', () => {
    expect(makeTrackingNumber('UPS', 'SO-1')).toBe(makeTrackingNumber('UPS', 'SO-1'));
    expect(makeTrackingNumber('UPS', 'SO-1')).not.toBe(makeTrackingNumber('UPS', 'SO-2'));
  });

  it('matches each carrier format', () => {
    expect(makeTrackingNumber('UPS', 'x')).toMatch(/^1Z[A-Z0-9]{16}$/);
    expect(makeTrackingNumber('USPS', 'x')).toMatch(/^9400\d{18}$/);
    expect(makeTrackingNumber('FedEx', 'x')).toMatch(/^\d{12}$/);
    expect(makeTrackingNumber('DHL', 'x')).toMatch(/^\d{10}$/);
    expect(makeTrackingNumber('Estes', 'x')).toMatch(/^PRO\d{9}$/);
    expect(makeTrackingNumber('Other', 'x')).toMatch(/^TRK[A-Z0-9]{12}$/);
  });
});
