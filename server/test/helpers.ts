import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { migrate, openSqlite } from '../src/sqlite.ts';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

export interface FetchCall { url: string; body: string }

/** 建一个用内存数据库的测试实例；时间可以手动拨，外部请求由 fetchImpl 假装 */
export function setup(env: Record<string, string> = {}, fetchImpl?: (url: string, body: string) => Response | Promise<Response>) {
  const { db, raw } = openSqlite(':memory:');
  migrate(raw, MIGRATIONS);
  const clock = { now: Date.UTC(2026, 9, 16, 6, 0, 0) };
  const calls: FetchCall[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body == null ? '' : String(init.body);
    calls.push({ url, body });
    if (!fetchImpl) throw new Error('unexpected fetch ' + url);
    return fetchImpl(url, body);
  }) as typeof fetch;

  const app = createApp({
    db,
    config: loadConfig({ HASH_SALT: 'test-salt', MIN_FILL_SECONDS: '0', ...env }),
    fetch: fakeFetch,
    now: () => clock.now,
    remoteAddr: c => c.req.header('x-test-ip') || '198.51.100.1'
  });

  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(path, {
      method,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  const post = (path: string, body: unknown, headers?: Record<string, string>) => call('POST', path, body, headers);
  const get = (path: string, headers?: Record<string, string>) => call('GET', path, undefined, headers);
  const comment = (fields: Record<string, unknown> = {}, headers?: Record<string, string>) =>
    post('/api/comments', { key: 'guestbook', name: '阿飞', face: ':-)', message: '你的 Flash 做得真酷！', elapsed: 8000, ...fields }, headers);
  const admin = (method: string, path: string, body?: unknown, token = 'admin-secret') =>
    call(method, '/api/admin' + path, body, { Authorization: 'Bearer ' + token });

  return { app, db, raw, clock, calls, call, post, get, comment, admin };
}

export const advance = (clock: { now: number }, seconds: number) => { clock.now += seconds * 1000; };
