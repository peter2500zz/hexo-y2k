// 留言本 / 读者留言

import { Hono } from 'hono';
import { FACES, LIMITS } from '../config.ts';
import { runChecks, type CommentInput } from '../checks/index.ts';
import { background, type AppEnv, type Deps } from '../types.ts';
import { bump, cleanKey, cleanText, clampInt } from '../util.ts';

interface Row {
  id: number;
  page_key: string;
  name: string;
  face: string;
  message: string;
  reply: string;
  reply_at: number | null;
  created_at: number;
}

export function publicComment(r: Row) {
  return {
    id: r.id,
    key: r.page_key,
    name: r.name,
    face: r.face,
    message: r.message,
    reply: r.reply || '',
    replyAt: r.reply_at ?? null,
    createdAt: r.created_at
  };
}

export function commentRoutes(deps: Deps) {
  const { db, config } = deps;
  const app = new Hono<AppEnv>();

  // 某一页的已通过留言，新的在前
  app.get('/', async c => {
    const key = cleanKey(c.req.query('key'));
    if (key == null) return c.json({ error: '参数不正确。' }, 400);
    const size = clampInt(c.req.query('size'), 1, 50, 10);
    const page = clampInt(c.req.query('page'), 1, 10000, 1);
    const [rows, total] = await Promise.all([
      db.all<Row>(
        `SELECT id, page_key, name, face, message, reply, reply_at, created_at FROM comments
         WHERE page_key = ? AND status = 'approved' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [key, size, (page - 1) * size]
      ),
      db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM comments WHERE page_key = ? AND status = 'approved'`, [key])
    ]);
    c.header('Cache-Control', 'no-cache');
    return c.json({ key, page, size, total: total?.n ?? 0, moderation: config.moderation, items: rows.map(publicComment) });
  });

  // 首页摘要后面的"留言(N)"，一次查多篇
  app.get('/count', async c => {
    const keys = [...new Set((c.req.query('keys') || '').split(',').map(cleanKey).filter((k): k is string => k != null))].slice(0, 50);
    const counts: Record<string, number> = Object.fromEntries(keys.map(k => [k, 0]));
    if (keys.length) {
      const rows = await db.all<{ page_key: string; n: number }>(
        `SELECT page_key, COUNT(*) AS n FROM comments WHERE status = 'approved' AND page_key IN (${keys.map(() => '?').join(',')}) GROUP BY page_key`,
        keys
      );
      for (const r of rows) counts[r.page_key] = r.n;
    }
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ counts });
  });

  // 侧栏"最新留言"
  app.get('/recent', async c => {
    const limit = clampInt(c.req.query('limit'), 1, 20, 5);
    const rows = await db.all<Row>(
      `SELECT id, page_key, name, face, message, reply, reply_at, created_at FROM comments
       WHERE status = 'approved' ORDER BY created_at DESC, id DESC LIMIT ?`,
      [limit]
    );
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ items: rows.map(r => ({ ...publicComment(r), message: Array.from(r.message).slice(0, 60).join('') })) });
  });

  // 发表留言
  app.post('/', async c => {
    const now = deps.now();
    const ip = c.get('ip'), ipHash = c.get('ipHash'), ua = c.get('ua');

    // 先挡住疯狂提交（包括验证码没过、被拒绝的那些）
    if (await bump(db, 'post:' + ipHash, 10 * 60 * 1000, now) > 30) {
      return c.json({ error: '您提交得太频繁了，请过一会儿再来。' }, 429);
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
      if (!body || typeof body !== 'object') throw new Error('bad body');
    } catch {
      return c.json({ error: '参数不正确。' }, 400);
    }

    const key = cleanKey(body.key);
    const name = cleanText(body.name, LIMITS.name);
    const message = cleanText(body.message, LIMITS.message, true);
    if (key == null) return c.json({ error: '参数不正确。' }, 400);
    if (!name) return c.json({ error: '昵称不能为空！' }, 400);
    if (!message) return c.json({ error: '留言内容不能为空！' }, 400);

    const input: CommentInput = {
      key,
      name,
      message,
      face: FACES.includes(String(body.face)) ? String(body.face) : FACES[0],
      oicq: String(body.oicq ?? '').replace(/\D/g, '').slice(0, LIMITS.oicq),
      website: typeof body.website === 'string' ? body.website.trim() : '',
      elapsed: typeof body.elapsed === 'number' && Number.isFinite(body.elapsed) ? body.elapsed : null,
      captcha: typeof body.captcha === 'string' ? body.captcha.slice(0, 4096) : '',
      permalink: config.siteUrl ? `${config.siteUrl}/${key === 'guestbook' ? 'guestbook/' : key}` : ''
    };

    const verdict = await runChecks(input, { deps, c, ip, ipHash, ua, now });
    if (verdict.kind === 'reject') return c.json({ error: verdict.message }, verdict.status);
    // 陷阱被触发：不存，假装成功，别让机器知道
    if (verdict.kind === 'drop') return c.json({ status: 'pending' });

    const res = await db.run(
      `INSERT INTO comments (page_key, name, face, oicq, message, status, reasons, ip_hash, ua, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [key, input.name, input.face, input.oicq, input.message, verdict.status, verdict.reasons.join(','), ipHash, ua, now]
    );

    if (verdict.status !== 'spam' && config.notifyWebhook) {
      background(c, notify(deps, c.req.url, { id: res.lastId, key, status: verdict.status, name: input.name, message: input.message, reasons: verdict.reasons, createdAt: now }));
    }

    // 判成垃圾的也只告诉访客"待审核"
    if (verdict.status !== 'approved') return c.json({ status: 'pending' });
    return c.json({
      status: 'approved',
      item: publicComment({ id: res.lastId, page_key: key, name: input.name, face: input.face, message: input.message, reply: '', reply_at: null, created_at: now })
    });
  });

  return app;
}

interface NotifyPayload { id: number; key: string; status: string; name: string; message: string; reasons: string[]; createdAt: number }

/** 新留言通知：通用 JSON，顺带 text/content 字段，可以直接接 Slack、Discord 之类的 webhook */
async function notify(deps: Deps, requestUrl: string, p: NotifyPayload) {
  const admin = new URL('/admin', requestUrl).toString();
  const where = p.key === 'guestbook' ? '留言本' : p.key;
  const url = deps.config.siteUrl ? `${deps.config.siteUrl}/${p.key === 'guestbook' ? 'guestbook/' : p.key}` : '';
  const summary = `【${p.status === 'pending' ? '待审核' : '新留言'}】${p.name} 在「${where}」留言：${Array.from(p.message).slice(0, 100).join('')}`;
  await deps.fetch(deps.config.notifyWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'comment.created', ...p, url, admin, text: `${summary}\n${admin}`, content: `${summary}\n${admin}` }),
    signal: AbortSignal.timeout(5000)
  });
}
