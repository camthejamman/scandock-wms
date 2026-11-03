import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { normalizeScan } from '../lib/format';

interface Props {
  label: string;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Called with the normalised value when Enter is pressed (what a keyboard-wedge scanner sends). */
  onScan: (value: string) => void | Promise<void>;
  /** Clear the box after a scan (default true). */
  clearOnScan?: boolean;
  buttonLabel?: string;
  testId?: string;
  /** Increment to programmatically refocus the input. */
  focusKey?: number;
}

/**
 * The one input every warehouse screen is built around. Real barcode scanners act like a
 * keyboard: they type the code and press Enter, so this is a form with a single text field.
 */
export function ScanInput({
  label,
  placeholder = 'Scan or type, then Enter',
  hint,
  autoFocus = true,
  disabled,
  onScan,
  clearOnScan = true,
  buttonLabel = 'Go',
  testId,
  focusKey,
}: Props) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoFocus || focusKey) ref.current?.focus();
  }, [autoFocus, focusKey]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = normalizeScan(value);
    if (!v || busy) return;
    setBusy(true);
    try {
      await onScan(v);
      if (clearOnScan) setValue('');
    } finally {
      setBusy(false);
      ref.current?.focus();
    }
  }

  return (
    <form className="field scan-field" onSubmit={submit} data-testid={testId}>
      <label htmlFor={id}>{label}</label>
      <div className="scan-row">
        <input
          id={id}
          ref={ref}
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled || busy}
          enterKeyHint="go"
        />
        <button type="submit" className="btn" disabled={disabled || busy || !value.trim()}>
          {buttonLabel}
        </button>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </form>
  );
}
