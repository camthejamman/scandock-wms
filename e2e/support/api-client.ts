import type { APIRequestContext, APIResponse, PlaywrightWorkerArgs } from '@playwright/test';

type Playwright = PlaywrightWorkerArgs['playwright'];
import { API_URL, type Role, USERS } from './env';

export interface ApiResult<T = any> {
  status: number;
  body: T;
  response: APIResponse;
}

const tokenCache = new Map<string, string>();

/** Login through the public API and cache the token per worker. */
export async function loginToken(
  request: APIRequestContext,
  role: Role | { username: string; pin: string },
): Promise<string> {
  const creds = typeof role === 'string' ? USERS[role] : role;
  const key = `${creds.username}:${creds.pin}`;
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { username: creds.username, pin: creds.pin },
  });
  if (!res.ok())
    throw new Error(`login failed for ${creds.username}: ${res.status()} ${await res.text()}`);
  const { token } = (await res.json()) as { token: string };
  tokenCache.set(key, token);
  return token;
}

/**
 * Thin typed wrapper around Playwright's request context for the ScanDock API.
 * Every call returns { status, body } so tests can assert on error envelopes too.
 */
export class ApiClient {
  private constructor(
    readonly ctx: APIRequestContext,
    readonly token: string | null,
    readonly role: string,
  ) {}

  static async create(
    playwright: Playwright,
    role: Role | 'anonymous' | { username: string; pin: string },
  ): Promise<ApiClient> {
    const bootstrap = await playwright.request.newContext({ baseURL: API_URL });
    const token = role === 'anonymous' ? null : await loginToken(bootstrap, role);
    await bootstrap.dispose();
    const ctx = await playwright.request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: token ? { authorization: `Bearer ${token}` } : {},
    });
    return new ApiClient(ctx, token, typeof role === 'string' ? role : role.username);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async wrap<T>(p: Promise<APIResponse>): Promise<ApiResult<T>> {
    const response = await p;
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status(), body, response };
  }

  get<T = any>(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<ApiResult<T>> {
    return this.wrap<T>(this.ctx.get(`/api${path}`, { params }));
  }

  post<T = any>(path: string, data?: unknown): Promise<ApiResult<T>> {
    return this.wrap<T>(this.ctx.post(`/api${path}`, { data: data ?? {} }));
  }

  patch<T = any>(path: string, data: unknown): Promise<ApiResult<T>> {
    return this.wrap<T>(this.ctx.patch(`/api${path}`, { data }));
  }

  /** GET and throw unless 2xx: for setup steps where failure means a broken precondition. */
  async getOk<T = any>(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    const r = await this.get<T>(path, params);
    if (r.status < 200 || r.status >= 300)
      throw new Error(`GET ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }

  async postOk<T = any>(path: string, data?: unknown): Promise<T> {
    const r = await this.post<T>(path, data);
    if (r.status < 200 || r.status >= 300)
      throw new Error(`POST ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }

  async patchOk<T = any>(path: string, data: unknown): Promise<T> {
    const r = await this.patch<T>(path, data);
    if (r.status < 200 || r.status >= 300)
      throw new Error(`PATCH ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }
}

/** Client for the Nimbus ERP mock (no auth). */
export class ErpClient {
  constructor(readonly ctx: APIRequestContext) {}

  static async create(playwright: Playwright): Promise<ErpClient> {
    return new ErpClient(
      await playwright.request.newContext({
        baseURL: process.env.ERP_URL ?? 'http://localhost:4100',
      }),
    );
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  async json<T = any>(path: string): Promise<T> {
    const res = await this.ctx.get(path);
    if (!res.ok()) throw new Error(`ERP GET ${path} -> ${res.status()}`);
    return (await res.json()) as T;
  }

  async post<T = any>(path: string, data: unknown): Promise<{ status: number; body: T }> {
    const res = await this.ctx.post(path, { data });
    const text = await res.text();
    return { status: res.status(), body: text ? JSON.parse(text) : null };
  }

  /** Simulate an outage / latency / failures. Always reset in an afterEach. */
  chaos(opts: { down?: boolean; latencyMs?: number; failNextPosts?: number }) {
    return this.post('/erp/_chaos', opts);
  }

  reset() {
    return this.post('/erp/_reset', {});
  }
}
