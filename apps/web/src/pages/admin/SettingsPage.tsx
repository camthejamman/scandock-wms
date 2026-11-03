import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { Settings } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { ErrorState, Loading } from '../../components/Loading';

const OPTIONS: Array<{ key: keyof Settings; label: string; help: string }> = [
  {
    key: 'allowShortPick',
    label: 'Allow short picks',
    help: 'Operators may complete an order with lines not fully picked, with a reason.',
  },
  {
    key: 'blindCounts',
    label: 'Blind cycle counts',
    help: 'Operators do not see the expected quantity while counting.',
  },
  {
    key: 'allowNegativeInventory',
    label: 'Allow negative inventory',
    help: 'Picks and transfers may drive a bin below zero (not recommended).',
  },
  {
    key: 'allowOverReceipt',
    label: 'Allow over-receipt',
    help: 'Receive more than the purchase order quantity.',
  },
];

export function SettingsPage() {
  const toast = useToast();
  const settings = useApi(() => api<Settings>('/settings'), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await api<Settings>('/settings', { method: 'PATCH', body: draft });
      settings.setData(saved);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    !!draft && !!settings.data && OPTIONS.some((o) => draft[o.key] !== settings.data![o.key]);

  return (
    <>
      <div className="admin-topbar">
        <h1>Settings</h1>
      </div>
      {settings.error && <ErrorState message={settings.error} onRetry={settings.reload} />}
      {!draft && settings.loading && <Loading />}
      {draft && (
        <section className="card" style={{ maxWidth: 640 }}>
          <div className="stack">
            {OPTIONS.map((o) => (
              <label key={o.key} className="checkbox" style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={draft[o.key]}
                  onChange={(e) => setDraft({ ...draft, [o.key]: e.target.checked })}
                  data-testid={`setting-${o.key}`}
                />
                <span>
                  <strong>{o.label}</strong>
                  <div className="hint">{o.help}</div>
                </span>
              </label>
            ))}
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={save}
                disabled={busy || !dirty}
                data-testid="save-settings"
              >
                Save settings
              </button>
              {dirty && <span className="muted small">Unsaved changes</span>}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
