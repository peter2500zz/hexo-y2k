// 小调查：每个 IP 每个调查一票

import { Hono } from 'hono';
import { LIMITS } from '../config.ts';
import type { AppEnv, Deps } from '../types.ts';
import { bump, cleanText } from '../util.ts';

export function pollRoutes(deps: Deps) {
  const { db } = deps;
  const app = new Hono<AppEnv>();

  async function result(poll: string, ipHash: string) {
    const [rows, mine] = await Promise.all([
      db.all<{ option: number; n: number }>('SELECT option, COUNT(*) AS n FROM poll_votes WHERE poll = ? GROUP BY option', [poll]),
      db.first<{ option: number }>('SELECT option FROM poll_votes WHERE poll = ? AND ip_hash = ?', [poll, ipHash])
    ]);
    const counts: number[] = [];
    for (const r of rows) counts[r.option] = r.n;
    for (let i = 0; i < counts.length; i++) counts[i] = counts[i] ?? 0;
    return { id: poll, counts, total: rows.reduce((s, r) => s + r.n, 0), voted: mine ? mine.option : null };
  }

  app.get('/', async c => {
    const poll = cleanText(c.req.query('id'), 100);
    if (!poll) return c.json({ error: '参数不正确。' }, 400);
    c.header('Cache-Control', 'no-store');
    return c.json(await result(poll, c.get('ipHash')));
  });

  app.post('/', async c => {
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { return c.json({ error: '参数不正确。' }, 400); }
    const poll = cleanText(body?.id, 100);
    const option = Number(body?.option);
    if (!poll || !Number.isInteger(option) || option < 0 || option >= LIMITS.pollOptions) return c.json({ error: '请先选择一项！' }, 400);

    const ipHash = c.get('ipHash');
    if (await bump(db, 'poll:' + ipHash, 3600 * 1000, deps.now()) > 30) {
      return c.json({ error: '您投票太频繁了，请过一会儿再来。' }, 429);
    }
    const res = await db.run('INSERT OR IGNORE INTO poll_votes (poll, ip_hash, option, created_at) VALUES (?, ?, ?, ?)', [poll, ipHash, option, deps.now()]);
    return c.json({ ...(await result(poll, ipHash)), already: res.changes === 0 });
  });

  return app;
}
