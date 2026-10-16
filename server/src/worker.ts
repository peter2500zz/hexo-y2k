// Cloudflare Workers 入口：数据库用 D1（绑定名 DB），配置来自 wrangler 的 vars 和 secrets

import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { d1, type D1Database } from './db.ts';

interface Env { DB: D1Database; [key: string]: unknown }

let app: ReturnType<typeof createApp> | null = null;

export default {
  fetch(request: Request, env: Env, ctx: unknown) {
    app ??= createApp({
      db: d1(env.DB),
      config: { ...loadConfig(env), trustProxy: 'cf-connecting-ip' },
      fetch: globalThis.fetch.bind(globalThis),
      now: Date.now
    });
    return app.fetch(request, env, ctx as never);
  }
};
