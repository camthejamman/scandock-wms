/** ZPL II label builders (the language Zebra printers speak). Text only: nothing is printed here. */

/** ^ and ~ are ZPL command prefixes; strip them from free text so a name can't inject commands. */
export function escapeZpl(text: string): string {
  return text
    .replace(/[\^~]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

export function binLabelZpl(code: string, zone: string): string {
  const c = escapeZpl(code);
  return [
    '^XA',
    '^PW609^LL406',
    '^CF0,70',
    `^FO40,40^FD${c}^FS`,
    '^CF0,30',
    `^FO40,130^FDZone: ${escapeZpl(zone)}^FS`,
    `^FO40,190^BY3^BCN,120,Y,N,N^FD${c}^FS`,
    '^XZ',
  ].join('\n');
}

export interface ItemLabelInput {
  sku: string;
  name: string;
  barcode: string;
  lot?: string;
}

export function itemLabelZpl({ sku, name, barcode, lot }: ItemLabelInput): string {
  const lines = [
    '^XA',
    '^PW609^LL406',
    '^CF0,40',
    `^FO40,30^FD${escapeZpl(sku)}^FS`,
    '^CF0,26',
    `^FO40,80^FB530,2,0,L^FD${escapeZpl(name)}^FS`,
  ];
  if (lot) lines.push(`^FO40,150^FDLot: ${escapeZpl(lot)}^FS`);
  if (/^\d{12}$/.test(barcode)) {
    // ^BU prints UPC-A from the 11 data digits and computes the check digit itself.
    lines.push(`^FO60,200^BY3^BUN,120,Y,N,Y^FD${barcode.slice(0, 11)}^FS`);
  } else {
    lines.push(`^FO60,200^BY2^BCN,120,Y,N,N^FD${escapeZpl(barcode)}^FS`);
  }
  lines.push('^XZ');
  return lines.join('\n');
}
