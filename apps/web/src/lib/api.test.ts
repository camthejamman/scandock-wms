import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, buildQuery, errorMessage, setToken } from './api';

describe('buildQuery', () => {
  it('drops empty values and encodes the rest', () => {
    expect(buildQuery({ q: 'a b', page: 2, lowStock: true, zone: undefined, lot: '' })).toBe(
      '?q=a+b&page=2&lowStock=true',
    );
  });
  it('returns an empty string when there is nothing to send', () => {
    expect(buildQuery()).toBe('');
    expect(buildQuery({ a: undefined })).toBe('');
  });
});

describe('api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setToken(null);
  });

  it('sends the bearer token and parses JSON', async () => {
    setToken('tok');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await api<{ ok: number }>('/health');
    expect(out.ok).toBe(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/health');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('turns an API error envelope into an ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'OVER_PICK', message: 'too many', details: { qtyRemaining: 1 } },
        }),
        { status: 409 },
      ),
    );
    await expect(api('/x', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      code: 'OVER_PICK',
      message: 'too many',
    });
  });

  it('raises the unauthorized event when a token is rejected', async () => {
    setToken('stale');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }),
    );
    const handler = vi.fn();
    window.addEventListener('scandock:unauthorized', handler);
    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('scandock:unauthorized', handler);
  });

  it('maps network failures to a friendly message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/health')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(
      errorMessage(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the ScanDock server')),
    ).toMatch(/cannot reach/i);
  });
});
