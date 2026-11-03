import { useState } from 'react';
import { ApiError, api, errorMessage } from '../../lib/api';
import type { Label } from '../../lib/types';
import { useToast } from '../../state/toast';
import { ScanInput } from '../../components/ScanInput';

export function LabelPage() {
  const toast = useToast();
  const [label, setLabel] = useState<Label | null>(null);

  async function lookup(code: string) {
    try {
      setLabel(await api<Label>(`/labels/item/${encodeURIComponent(code)}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        try {
          setLabel(await api<Label>(`/labels/bin/${encodeURIComponent(code)}`));
        } catch (err2) {
          toast.error(
            err2 instanceof ApiError && err2.status === 404
              ? `Nothing found for ${code}`
              : errorMessage(err2),
          );
        }
      } else {
        toast.error(errorMessage(err));
      }
    }
  }

  async function copy() {
    if (!label) return;
    try {
      await navigator.clipboard.writeText(label.zpl);
      toast.success('ZPL copied to the clipboard');
    } catch {
      toast.error('Clipboard is not available here');
    }
  }

  return (
    <>
      <ScanInput
        label="Scan item or bin to label"
        placeholder="SKU, barcode or bin code"
        onScan={lookup}
        testId="scan-label"
      />
      {label && (
        <section className="card" data-testid="label-result">
          <div className="card-title">
            <h2>{label.type === 'item' ? label.sku : label.code}</h2>
            <span className="badge badge-brand">{label.type} label</span>
          </div>
          <div className="label-preview" aria-label="Label preview">
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>
              {label.type === 'item' ? label.sku : label.code}
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              {label.type === 'item' ? label.name : `Zone: ${label.zone}`}
            </div>
            <div className="bars" aria-hidden="true" />
            <div style={{ fontSize: '0.8rem', letterSpacing: '0.15em' }}>
              {label.type === 'item' ? label.barcode : label.code}
            </div>
          </div>
          <div className="row" style={{ margin: '0.75rem 0' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => toast.success('Sent to printer ZEBRA-DOCK-1 (simulated)')}
              data-testid="print-label"
            >
              Print
            </button>
            <button type="button" className="btn" onClick={copy}>
              Copy ZPL
            </button>
          </div>
          <pre className="zpl" data-testid="zpl" tabIndex={0}>
            {label.zpl}
          </pre>
        </section>
      )}
    </>
  );
}
