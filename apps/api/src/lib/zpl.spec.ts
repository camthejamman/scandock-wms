import { binLabelZpl, escapeZpl, itemLabelZpl } from './zpl.js';

describe('escapeZpl', () => {
  it('strips ZPL command prefixes and newlines', () => {
    expect(escapeZpl('A^XZ~JA\nB')).toBe('AXZJA B');
    expect(escapeZpl('  plain  ')).toBe('plain');
  });
});

describe('binLabelZpl', () => {
  it('wraps the label in ^XA/^XZ and encodes the bin code as Code 128', () => {
    const zpl = binLabelZpl('A-01-02', 'STORAGE');
    expect(zpl.startsWith('^XA')).toBeTrue();
    expect(zpl.endsWith('^XZ')).toBeTrue();
    expect(zpl).toContain('^FDA-01-02^FS');
    expect(zpl).toContain('^BCN');
    expect(zpl).toContain('Zone: STORAGE');
  });

  it('cannot be broken out of by a hostile bin code', () => {
    const zpl = binLabelZpl('X^XZ^XA', 'STORAGE');
    expect(zpl.match(/\^XZ/g)?.length).toBe(1);
  });
});

describe('itemLabelZpl', () => {
  it('uses the UPC-A command with the 11 data digits for a 12-digit barcode', () => {
    const zpl = itemLabelZpl({ sku: 'TOY-1', name: 'Robot', barcode: '036000291452' });
    expect(zpl).toContain('^BUN');
    expect(zpl).toContain('^FD03600029145^FS');
    expect(zpl).not.toContain('Lot:');
  });

  it('falls back to Code 128 for non-UPC barcodes and prints the lot when given', () => {
    const zpl = itemLabelZpl({ sku: 'TOY-1', name: 'Robot', barcode: 'ABC-123', lot: 'L42' });
    expect(zpl).toContain('^BCN');
    expect(zpl).toContain('^FDABC-123^FS');
    expect(zpl).toContain('Lot: L42');
  });
});
