import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

/** Native <dialog>: focus trapping, Escape and backdrop come for free, and it is announced as a dialog. */
export function Modal({ open, title, onClose, children, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onClose={onClose}
      onCancel={onClose}
    >
      {open && (
        <>
          <div className="modal-body">
            <h2 id="modal-title">{title}</h2>
            {children}
          </div>
          <div className="modal-actions">
            {actions ?? (
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
