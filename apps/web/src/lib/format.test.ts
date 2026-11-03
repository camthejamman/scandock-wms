import { describe, expect, it } from 'vitest';
import { formatPct, formatQty, normalizeScan, signed, titleCase } from './format';

describe('normalizeScan', () => {
  it('trims whitespace and control characters a keyboard-wedge scanner may add', () => {
    expect(normalizeScan('  a-01-02\r\n')).toBe('A-01-02');
    expect(normalizeScan('\t041234000016\n')).toBe('041234000016');
  });
  it('upper-cases SKUs so case never matters on the floor', () => {
    expect(normalizeScan('toy-robot-red')).toBe('TOY-ROBOT-RED');
  });
  it('returns an empty string for blank input', () => {
    expect(normalizeScan('   ')).toBe('');
  });
});

describe('formatQty', () => {
  it('formats numbers with an optional unit of measure', () => {
    expect(formatQty(1234)).toBe('1,234');
    expect(formatQty(5, 'EA')).toBe('5 EA');
  });
  it('shows a dash for missing values', () => {
    expect(formatQty(null)).toBe('—');
    expect(formatQty(undefined)).toBe('—');
    expect(formatQty(Number.NaN)).toBe('—');
  });
});

describe('formatPct', () => {
  it('keeps one decimal', () => {
    expect(formatPct(99.95)).toBe('100.0%');
    expect(formatPct(66.666)).toBe('66.7%');
    expect(formatPct(null)).toBe('—');
  });
});

describe('signed', () => {
  it('prefixes positive numbers with a plus sign', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(-2)).toBe('-2');
    expect(signed(0)).toBe('0');
  });
});

describe('titleCase', () => {
  it('turns status codes into labels', () => {
    expect(titleCase('TRANSFER_OUT')).toBe('Transfer Out');
    expect(titleCase('PICKING')).toBe('Picking');
  });
});
