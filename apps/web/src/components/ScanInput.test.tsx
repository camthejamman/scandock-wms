import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScanInput } from './ScanInput';

describe('<ScanInput>', () => {
  it('submits the normalised value on Enter, like a keyboard-wedge scanner, then clears and refocuses', async () => {
    const onScan = vi.fn();
    render(<ScanInput label="Scan bin" onScan={onScan} />);
    const input = screen.getByLabelText('Scan bin');
    expect(input).toHaveFocus();
    await userEvent.type(input, '  a-01-02 {Enter}');
    expect(onScan).toHaveBeenCalledWith('A-01-02');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('ignores empty scans and disables the Go button until something was typed', async () => {
    const onScan = vi.fn();
    render(<ScanInput label="Scan item" onScan={onScan} />);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Scan item'), '   {Enter}');
    expect(onScan).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Scan item'), 'x');
    expect(button).toBeEnabled();
  });

  it('keeps the value when clearOnScan is off and shows the hint', async () => {
    const onScan = vi.fn();
    render(
      <ScanInput label="Scan PO" onScan={onScan} clearOnScan={false} hint="Tap a line instead" />,
    );
    await userEvent.type(screen.getByLabelText('Scan PO'), 'po-1001{Enter}');
    expect(onScan).toHaveBeenCalledWith('PO-1001');
    expect(screen.getByLabelText('Scan PO')).toHaveValue('po-1001');
    expect(screen.getByText('Tap a line instead')).toBeInTheDocument();
  });

  it('blocks a second submit while the first one is still running', async () => {
    let release!: () => void;
    const onScan = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<ScanInput label="Scan" onScan={onScan} />);
    const input = screen.getByLabelText('Scan');
    await userEvent.type(input, 'ONE{Enter}');
    expect(input).toBeDisabled();
    release();
    await screen.findByDisplayValue('');
    expect(input).toBeEnabled();
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});
