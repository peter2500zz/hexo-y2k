// 站长管理后台的 API：审核、回复、删除、封禁。用 Authorization: Bearer <ADMIN_TOKEN> 认证

import { Hono } from 'hono';
import { LIMITS } from '../config.ts';
import type { AppEnv, Deps } from '../types.ts';
import { bump, cleanText, clampInt, safeEqual } from '../util.ts';

const STATUSES = ['pending', 'approved', 'spam'] as const;
type Status = typeof STATUSES[number];
const isStatus = (s: unknown): s is Status => (STATUSES as readonly unknown[]).includes(s);

interface AdminRow {
  id: number; page_key: string; name: string; face: string; oicq: string; message: string; status: string;
  reasons: string; reply: string; reply_at: number | null; ip_hash: string; ua: string; created_at: number;
}

function adminComment(r: AdminRow) {
  return {
    id: r.id, key: r.page_key, name: r.name, face: r.face, oicq: r.oicq, message: r.message, status: r.status,
    reasons: r.reasons ? r.reasons.split(',') : [], reply: r.reply, replyAt: r.reply_at, ipHash: r.ip_hash, ua: r.ua, createdAt: r.created_at
  };
}

export function adminRoutes(deps: Deps) {
  const { db, config } = deps;
  const app = new Hono<AppEnv>();

  // 认证；同一 IP 15 分钟内输错 10 次就先锁住
  app.use('*', async (c, next) => {
    if (!config.adminToken) return c.json({ error: '管理后台未启用：请设置 ADMIN_TOKEN。' }, 404);
    const now = deps.now();
    const failKey = 'auth-fail:' + c.get('ipHash');
    const fails = await db.first<{ n: number }>('SELECT n FROM rate WHERE k = ? AND reset_at > ?', [failKey, now]);
    if ((fails?.n ?? 0) >= 10) return c.json({ error: '口令错误次数太多，请 15 分钟后再试。' }, 429);
    const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || !(await safeEqual(token, config.adminToken))) {
      await bump(db, failKey, 15 * 60 * 1000, now);
      return c.json({ error: '口令不正确。' }, 401);
    }
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.get('/summary', async c => {
    const rows = await db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM comments GROUP BY status');
    const by = Object.fromEntries(STATUSES.map(s => [s, rows.find(r => r.status === s)?.n ?? 0]));
    const site = await db.first<{ n: number }>("SELECT n FROM counters WHERE k = 'site'");
    const bans = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM bans');
    return c.json({ comments: by, sitePv: (site?.n ?? 0) + config.counterOffset, bans: bans?.n ?? 0, moderation: config.moderation, siteUrl: config.siteUrl });
  });

  app.get('/comments', async c => {
    const status = c.req.query('status');
    const size = clampInt(c.req.query('size'), 1, 100, 20);
    const page = clampInt(c.req.query('page'), 1, 100000, 1);
    const q = cleanText(c.req.query('q'), 50);
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (isStatus(status)) { where.push('status = ?'); params.push(status); }
    if (q) { where.push('(name LIKE ? OR message LIKE ? OR page_key LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows, total] = await Promise.all([
      db.all<AdminRow>(`SELECT * FROM comments ${sqlWhere} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]),
      db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM comments ${sqlWhere}`, params)
    ]);
    return c.json({ page, size, total: total?.n ?? 0, items: rows.map(adminComment) });
  });

  // 改状态和/或写站长回复
  app.post('/comments/:id', async c => {
    const id = clampInt(c.req.param('id'), 1, Number.MAX_SAFE_INTEGER, 0);
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { return c.json({ error: '参数不正确。' }, 400); }
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (body.status !== undefined) {
      if (!isStatus(body.status)) return c.json({ error: '状态不正确。' }, 400);
      sets.push('status = ?'); params.push(body.status);
    }
    if (body.reply !== undefined) {
      const reply = cleanText(body.reply, LIMITS.reply, true);
      sets.push('reply = ?', 'reply_at = ?'); params.push(reply, reply ? deps.now() : null);
    }
    if (!sets.length) return c.json({ error: '没有要修改的内容。' }, 400);
    const res = await db.run(`UPDATE comments SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    if (!res.changes) return c.json({ error: '找不到这条留言。' }, 404);
    return c.json({ item: adminComment((await db.first<AdminRow>('SELECT * FROM comments WHERE id = ?', [id]))!) });
  });

  app.delete('/comments/:id', async c => {
    const id = clampInt(c.req.param('id'), 1, Number.MAX_SAFE_INTEGER, 0);
    const res = await db.run('DELETE FROM comments WHERE id = ?', [id]);
    return res.changes ? c.json({ ok: true }) : c.json({ error: '找不到这条留言。' }, 404);
  });

  // 批量：通过 / 标为垃圾 / 删除
  app.post('/comments-bulk', async c => {
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { return c.json({ error: '参数不正确。' }, 400); }
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(v => clampInt(v, 1, Number.MAX_SAFE_INTEGER, 0)).filter(Boolean).slice(0, 200);
    if (!ids.length) return c.json({ error: '请先选择留言。' }, 400);
    const marks = ids.map(() => '?').join(',');
    if (body.action === 'delete') await db.run(`DELETE FROM comments WHERE id IN (${marks})`, ids);
    else if (isStatus(body.action)) await db.run(`UPDATE comments SET status = ? WHERE id IN (${marks})`, [body.action, ...ids]);
    else return c.json({ error: '操作不正确。' }, 400);
    return c.json({ ok: true, count: ids.length });
  });

  app.get('/bans', async c => {
    return c.json({ items: await db.all('SELECT ip_hash AS ipHash, note, created_at AS createdAt FROM bans ORDER BY created_at DESC LIMIT 500') });
  });

  // 封禁某个 IP 哈希；spamPending 为真时顺手把他的待审核留言都丢进垃圾箱
  app.post('/bans', async c => {
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { return c.json({ error: '参数不正确。' }, 400); }
    const ipHash = String(body.ipHash ?? '');
    if (!/^[0-9a-f]{64}$/.test(ipHash)) return c.json({ error: '参数不正确。' }, 400);
    const stmts: [string, (string | number)[]][] = [
      ['INSERT INTO bans (ip_hash, note, created_at) VALUES (?, ?, ?) ON CONFLICT(ip_hash) DO UPDATE SET note = excluded.note', [ipHash, cleanText(body.note, 100), deps.now()]]
    ];
    if (body.spamPending) stmts.push(["UPDATE comments SET status = 'spam' WHERE ip_hash = ? AND status = 'pending'", [ipHash]]);
    await db.batch(stmts);
    return c.json({ ok: true });
  });

  app.delete('/bans/:hash', async c => {
    const res = await db.run('DELETE FROM bans WHERE ip_hash = ?', [c.req.param('hash')]);
    return res.changes ? c.json({ ok: true }) : c.json({ error: '没有这条封禁。' }, 404);
  });

  return app;
}
