import { accuracyPct, lineVariance, summarizeCount } from './variance.js';

describe('lineVariance', () => {
  it('is counted minus expected', () => {
    expect(lineVariance({ expectedQty: 10, countedQty: 8 })).toBe(-2);
    expect(lineVariance({ expectedQty: 10, countedQty: 12 })).toBe(2);
    expect(lineVariance({ expectedQty: 10, countedQty: 10 })).toBe(0);
  });

  it('treats an uncounted line as zero (the operator found nothing)', () => {
    expect(lineVariance({ expectedQty: 4, countedQty: null })).toBe(-4);
  });
});

describe('accuracyPct', () => {
  it('returns null when nothing was counted', () => {
    expect(accuracyPct(0, 0)).toBeNull();
  });

  it('rounds to one decimal', () => {
    expect(accuracyPct(2, 3)).toBe(66.7);
    expect(accuracyPct(1, 1)).toBe(100);
    expect(accuracyPct(0, 5)).toBe(0);
  });
});

describe('summarizeCount', () => {
  it('summarizes an empty count', () => {
    expect(summarizeCount([])).toEqual({
      lines: 0,
      linesWithVariance: 0,
      netVariance: 0,
      absVariance: 0,
      accuracyPct: null,
    });
  });

  it('nets positive and negative variances but sums their magnitudes', () => {
    const s = summarizeCount([
      { expectedQty: 10, countedQty: 7 },
      { expectedQty: 5, countedQty: 8 },
      { expectedQty: 3, countedQty: 3 },
      { expectedQty: 0, countedQty: 2 },
    ]);
    expect(s.lines).toBe(4);
    expect(s.linesWithVariance).toBe(3);
    expect(s.netVariance).toBe(2);
    expect(s.absVariance).toBe(8);
    expect(s.accuracyPct).toBe(25);
  });
});
