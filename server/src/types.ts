import type { Context } from 'hono';
import type { Config } from './config.ts';
import type { DB } from './db.ts';

export interface Deps {
  db: DB;
  config: Config;
  /** 外部请求（验证码、Akismet、通知）走这里，测试时可以替换 */
  fetch: typeof fetch;
  now: () => number;
  /** TCP 连接的对端地址（没有代理头时用） */
  remoteAddr?: (c: Context) => string | undefined;
}

export type AppEnv = {
  Variables: {
    ip: string;
    /** 盐 + IP 的哈希：限流、封禁、投票去重都用它，数据库里不存原始 IP */
    ipHash: string;
    ua: string;
  };
};

/** 让通知之类的收尾工作不阻塞响应：Workers 交给 waitUntil，Node 直接放后台 */
export function background(c: Context, task: Promise<unknown>): void {
  const safe = task.catch(err => console.error('[background]', err));
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    // Node 下没有 executionCtx
  }
}
