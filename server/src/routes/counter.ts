// 访客计数器、文章阅读次数、今日访问、在线人数

import { Hono } from 'hono';
import { isbot } from 'isbot';
import { background, type AppEnv, type Deps } from '../types.ts';
import { bump, cleanKey, dayString, getSalt, sha256 } from '../util.ts';

export function counterRoutes(deps: Deps) {
  const { db, config } = deps;
  const app = new Hono<AppEnv>();

  async function readStats(key: string, day: string, now: number) {
    const keys = ['site', 'page:' + key, 'pv:' + day, 'uv:' + day];
    const [rows, online] = await Promise.all([
      db.all<{ k: string; n: number }>(`SELECT k, n FROM counters WHERE k IN (?, ?, ?, ?)`, keys),
      db.first<{ n: number }>('SELECT COUNT(*) AS n FROM online WHERE seen > ?', [now - config.onlineWindowSeconds * 1000])
    ]);
    const get = (k: string) => rows.find(r => r.k === k)?.n ?? 0;
    return {
      site: { pv: get('site') + config.counterOffset, todayPv: get('pv:' + day), todayUv: get('uv:' + day) },
      page: { key, pv: get('page:' + key) },
      online: Math.max(online?.n ?? 0, 0)
    };
  }

  // 记一次访问并返回最新数字。爬虫、刷新太快、同一 IP 一分钟内访问太多次的只读不计
  app.post('/hit', async c => {
    const now = deps.now();
    let body: { path?: unknown } = {};
    try { body = await c.req.json(); } catch { /* 空 body 当作首页 */ }
    const key = cleanKey(body.path ?? '');
    if (key == null) return c.json({ error: '参数不正确。' }, 400);

    const day = dayString(now, config.timezone);
    const ua = c.get('ua');
    const salt = await getSalt(db, config.hashSalt);
    // 访客哈希每天换一次盐（日期参与哈希），跨天无法把同一个人关联起来
    const visitor = await sha256(`${salt}|visitor|${day}|${c.get('ip')}|${ua}`);

    const human = !!ua && !isbot(ua);
    if (human) {
      await db.run('INSERT INTO online (hash, seen) VALUES (?, ?) ON CONFLICT(hash) DO UPDATE SET seen = excluded.seen', [visitor, now]);

      let count = !config.hitRatePerMinute || (await bump(db, 'hit:' + c.get('ipHash'), 60 * 1000, now)) <= config.hitRatePerMinute;
      if (count && config.counterDedupeSeconds > 0) {
        const prev = await db.first<{ at: number }>('SELECT at FROM recent_hits WHERE hash = ? AND path = ?', [visitor, key]);
        count = !prev || now - prev.at >= config.counterDedupeSeconds * 1000;
        if (count) await db.run('INSERT INTO recent_hits (hash, path, at) VALUES (?, ?, ?) ON CONFLICT(hash, path) DO UPDATE SET at = excluded.at', [visitor, key, now]);
      }

      if (count) {
        const inc = 'INSERT INTO counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1';
        const fresh = await db.run('INSERT OR IGNORE INTO visitors (day, hash) VALUES (?, ?)', [day, visitor]);
        await db.batch([
          [inc, ['site']],
          [inc, ['page:' + key]],
          [inc, ['pv:' + day]],
          ...(fresh.changes ? [[inc, ['uv:' + day]] as [string, string[]]] : [])
        ]);
      }

      // 偶尔顺手清理过期数据
      if (Math.random() < 0.02) background(c, cleanup(deps, now, day));
    }

    c.header('Cache-Control', 'no-store');
    return c.json(await readStats(key, day, now));
  });

  // 只读
  app.get('/stats', async c => {
    const key = cleanKey(c.req.query('path') ?? '');
    if (key == null) return c.json({ error: '参数不正确。' }, 400);
    const now = deps.now();
    c.header('Cache-Control', 'no-store');
    return c.json(await readStats(key, dayString(now, config.timezone), now));
  });

  return app;
}

export async function cleanup(deps: Deps, now: number, today: string) {
  const { db, config } = deps;
  const twoDaysAgo = dayString(now - 2 * 86400 * 1000, config.timezone);
  await db.batch([
    ['DELETE FROM online WHERE seen < ?', [now - config.onlineWindowSeconds * 1000]],
    ['DELETE FROM recent_hits WHERE at < ?', [now - Math.max(config.counterDedupeSeconds, 60) * 1000]],
    ['DELETE FROM visitors WHERE day < ? AND day <> ?', [twoDaysAgo, today]],
    ['DELETE FROM rate WHERE reset_at < ?', [now]]
  ]);
}
