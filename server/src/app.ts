// 组装 Hono 应用

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { adminPageRoutes } from './admin-page.ts';
import { LIMITS } from './config.ts';
import { adminRoutes } from './routes/admin.ts';
import { commentRoutes } from './routes/comments.ts';
import { counterRoutes } from './routes/counter.ts';
import { pollRoutes } from './routes/poll.ts';
import type { AppEnv, Deps } from './types.ts';
import { clientIp, getSalt, sha256 } from './util.ts';

export function createApp(deps: Deps) {
  const { config } = deps;
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    console.error('[error]', c.req.method, c.req.path, err);
    return c.json({ error: '服务器忙，请稍后再试。' }, 500);
  });
  app.notFound(c => c.json({ error: '找不到这个地址。' }, 404));

  // 配置了 CORS_ORIGINS 才由后端处理跨域；管理接口只给同源的 /admin 页面用，不开跨域
  if (config.corsOrigins.length) {
    const any = config.corsOrigins.includes('*');
    const allowed = (origin: string) => any || config.corsOrigins.includes(origin.replace(/\/+$/, ''));
    const isAdmin = (path: string) => path === '/api/admin' || path.startsWith('/api/admin/');
    const publicCors = cors({
      origin: origin => (any ? '*' : origin && allowed(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86400
    });
    app.use('/api/*', async (c, next) => {
      if (isAdmin(c.req.path)) return next();
      const origin = c.req.header('origin');
      if (c.req.method === 'POST' && origin && !allowed(origin)) return c.json({ error: '不允许从这个网站提交。' }, 403);
      return publicCors(c, next);
    });
  }

  // 访客身份：IP 只在内存里用，落库的是加盐哈希
  app.use('*', async (c, next) => {
    const ip = clientIp(c, config, deps.remoteAddr?.(c));
    const salt = await getSalt(deps.db, config.hashSalt);
    c.set('ip', ip);
    c.set('ipHash', await sha256(`${salt}|ip|${ip}`));
    c.set('ua', (c.req.header('user-agent') || '').slice(0, 300));
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });

  app.use('/api/*', bodyLimit({ maxSize: 16 * 1024, onError: c => c.json({ error: '提交的内容太长了。' }, 413) }));

  app.get('/', c => c.text('y2k-server 正在运行。管理后台：/admin\n'));
  app.get('/healthz', async c => {
    await deps.db.first('SELECT 1 AS ok');
    return c.json({ ok: true });
  });

  // 前端需要知道的公开配置：验证码的 site key、审核模式、长度限制
  app.get('/api/config', c => {
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({
      moderation: config.moderation,
      captcha: config.captcha ? { provider: config.captcha.provider, siteKey: config.captcha.siteKey } : null,
      limits: { name: LIMITS.name, message: LIMITS.message }
    });
  });

  app.route('/api/comments', commentRoutes(deps));
  app.route('/api', counterRoutes(deps));
  app.route('/api/poll', pollRoutes(deps));
  app.route('/api/admin', adminRoutes(deps));
  app.route('/admin', adminPageRoutes());

  return app;
}
