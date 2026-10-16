// Node 入口：node src/node.ts（Node 22.18+ 直接运行 TypeScript，无需编译）

import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, openSqlite } from './sqlite.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig(process.env);
const dbPath = process.env.DB_PATH || './data/y2k.db';
const { db, raw } = openSqlite(dbPath);
const applied = migrate(raw, fileURLToPath(new URL('../migrations', import.meta.url)));
if (applied.length) console.log('[db] 已执行迁移：', applied.join(', '));

const app = createApp({
  db,
  config,
  fetch: globalThis.fetch.bind(globalThis),
  now: Date.now,
  remoteAddr: c => getConnInfo(c).remote.address
});

if (!config.adminToken) console.warn('[warn] ADMIN_TOKEN 未设置，管理后台已关闭。');

const port = Number(process.env.PORT) || 8787;
const hostname = process.env.HOST || '0.0.0.0';
const server = serve({ fetch: app.fetch, port, hostname }, info => {
  console.log(`[y2k-server] 已启动：http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${info.port}  数据库：${dbPath}`);
});

function shutdown() {
  server.close(() => {
    raw.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
