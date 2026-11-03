import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  hint?: string;
  testId?: string;
}

export function QtyInput({ label, value, onChange, min = 0, max, hint, testId }: Props) {
  const id = useId();
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="qty-input" data-testid={testId}>
        <button
          type="button"
          className="btn"
          aria-label="Decrease quantity"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
        >
          −
        </button>
        <input
          id={id}
          className="input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) =>
            onChange(e.target.value === '' ? Number.NaN : clamp(Number(e.target.value)))
          }
        />
        <button
          type="button"
          className="btn"
          aria-label="Increase quantity"
          onClick={() => onChange(clamp((Number.isNaN(value) ? 0 : value) + 1))}
          disabled={max !== undefined && value >= max}
        >
          +
        </button>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
