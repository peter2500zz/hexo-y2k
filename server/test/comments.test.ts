import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, setup } from './helpers.ts';

const statusOf = async (t: ReturnType<typeof setup>, message: string) =>
  (await t.db.first<{ status: string; reasons: string }>('SELECT status, reasons FROM comments WHERE message = ?', [message]));

test('普通留言直接通过，并出现在列表里', async () => {
  const t = setup();
  const r = await t.comment();
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'approved');
  assert.equal(r.json.item.name, '阿飞');
  const list = await t.get('/api/comments?key=guestbook');
  assert.equal(list.json.total, 1);
  assert.equal(list.json.items[0].message, '你的 Flash 做得真酷！');
  assert.equal(list.json.items[0].oicq, undefined, 'OICQ 不对外公开');
});

test('参数校验', async () => {
  const t = setup();
  assert.equal((await t.comment({ name: '  ' })).json.error, '昵称不能为空！');
  assert.equal((await t.comment({ message: '' })).json.error, '留言内容不能为空！');
  assert.equal((await t.comment({ key: '<script>' })).status, 400);
  assert.equal((await t.post('/api/comments', 'not json')).status, 400);
});

test('文字清洗：去掉控制字符、裁剪长度，HTML 原样保存（由前端转义）', async () => {
  const t = setup();
  const r = await t.comment({ name: '一二三四五六七八九十一二三四五六七八', message: '<b>你好</b>\u0000‮世界' });
  assert.equal(r.json.item.name.length, 16);
  assert.equal(r.json.item.message, '<b>你好</b>世界');
  assert.equal(r.json.item.face, ':-)');
  const bad = await t.comment({ face: '<img>', message: '换个表情试试' }, { 'x-test-ip': '198.51.100.9' });
  assert.equal(bad.json.item.face, '^_^');
});

test('陷阱输入框被填：假装成功，但不入库', async () => {
  const t = setup();
  const r = await t.comment({ website: 'http://spam.example' });
  assert.equal(r.json.status, 'pending');
  assert.equal((await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM comments'))!.n, 0);
});

test('不含汉字、链接太多、填得太快 → 待审核', async () => {
  const t = setup({ MIN_FILL_SECONDS: '3' });
  assert.equal((await t.comment({ message: 'nice post thanks' }, { 'x-test-ip': '1.1.1.1' })).json.status, 'pending');
  assert.equal((await t.comment({ message: '看看这里 http://a.example 和 www.b.example' }, { 'x-test-ip': '1.1.1.2' })).json.status, 'pending');
  assert.equal((await t.comment({ message: '一秒就写完了', elapsed: 500 }, { 'x-test-ip': '1.1.1.3' })).json.status, 'pending');
  assert.equal((await t.comment({ message: '没有上报时长', elapsed: undefined }, { 'x-test-ip': '1.1.1.4' })).json.status, 'pending');
  assert.equal((await statusOf(t, 'nice post thanks'))!.reasons, 'no-cjk');
  assert.equal((await statusOf(t, '一秒就写完了'))!.reasons, 'too-fast');
  assert.equal((await t.get('/api/comments?key=guestbook')).json.total, 0);
});

test('违禁词：变形写法也能认出，判为垃圾但只告诉访客待审核', async () => {
  const t = setup({ FORBIDDEN_WORDS: '加微信,代开发票' });
  const r = await t.comment({ message: '想要资源请 加 微-信 abc' });
  assert.equal(r.json.status, 'pending');
  assert.equal((await statusOf(t, '想要资源请 加 微-信 abc'))!.status, 'spam');
  const r2 = await t.comment({ message: '代开ＦＡ票不算' }, { 'x-test-ip': '2.2.2.2' });
  assert.equal(r2.json.status, 'approved');
});

test('脚本 User-Agent 判为垃圾', async () => {
  const t = setup();
  await t.comment({ message: '我是 curl 发的' }, { 'User-Agent': 'curl/8.4.0' });
  assert.equal((await statusOf(t, '我是 curl 发的'))!.status, 'spam');
});

test('频率限制：间隔和每日上限', async () => {
  const t = setup({ COMMENT_INTERVAL: '30', COMMENT_DAILY_LIMIT: '3' });
  assert.equal((await t.comment({ message: '第一条' })).status, 200);
  const r = await t.comment({ message: '第二条' });
  assert.equal(r.status, 429);
  assert.match(r.json.error, /请休息 30 秒/);
  advance(t.clock, 31);
  assert.equal((await t.comment({ message: '第二条' })).status, 200);
  advance(t.clock, 31);
  assert.equal((await t.comment({ message: '第三条' })).status, 200);
  advance(t.clock, 31);
  assert.equal((await t.comment({ message: '第四条' })).json.error, '您今天的留言太多了，明天再来吧！');
  advance(t.clock, 24 * 3600);
  assert.equal((await t.comment({ message: '第二天又来了' })).status, 200);
});

test('重复内容：自己重复发被拒绝，别人发一样的判为垃圾', async () => {
  const t = setup({ COMMENT_INTERVAL: '0' });
  await t.comment({ message: '一模一样的话' });
  assert.equal((await t.comment({ message: '一模一样的话' })).status, 409);
  await t.comment({ message: '一模一样的话' }, { 'x-test-ip': '3.3.3.3' });
  const rows = await t.db.all<{ status: string }>('SELECT status FROM comments WHERE message = ? ORDER BY id', ['一模一样的话']);
  assert.deepEqual(rows.map(r => r.status), ['approved', 'spam']);
});

test('审核模式 all / off', async () => {
  const all = setup({ MODERATION: 'all' });
  assert.equal((await all.comment()).json.status, 'pending');
  const off = setup({ MODERATION: 'off' });
  assert.equal((await off.comment({ message: 'english only' })).json.status, 'approved');
});

test('封禁：配置里的 IP 前缀', async () => {
  const t = setup({ BLOCK_IPS: '203.0.113.' });
  const r = await t.comment({}, { 'x-test-ip': '203.0.113.7' });
  assert.equal(r.status, 403);
  assert.equal((await t.comment({}, { 'x-test-ip': '203.0.114.7' })).status, 200);
});

test('提交次数过多（含被拒绝的）也会被挡', async () => {
  const t = setup();
  for (let i = 0; i < 30; i++) await t.comment({ name: '' });
  assert.equal((await t.comment()).status, 429);
});

test('Turnstile 人机验证', async () => {
  let answer: object | Error = { success: true };
  const t = setup({ CAPTCHA_PROVIDER: 'turnstile', CAPTCHA_SITE_KEY: 'site', CAPTCHA_SECRET: 'sec', COMMENT_INTERVAL: '0' },
    () => { if (answer instanceof Error) throw answer; return Response.json(answer); });
  assert.deepEqual((await t.get('/api/config')).json.captcha, { provider: 'turnstile', siteKey: 'site' });
  assert.equal((await t.comment({ message: '没有令牌' })).status, 403);
  assert.equal((await t.comment({ message: '令牌有效', captcha: 'tok' })).json.status, 'approved');
  assert.match(t.calls[0].url, /challenges\.cloudflare\.com/);
  assert.match(t.calls[0].body, /secret=sec/);
  assert.match(t.calls[0].body, /remoteip=198\.51\.100\.1/);
  answer = { success: false };
  assert.equal((await t.comment({ message: '令牌无效', captcha: 'bad' })).status, 403);
  answer = new Error('network down');
  assert.equal((await t.comment({ message: '验证服务连不上', captcha: 'tok' })).json.status, 'pending');
});

test('reCAPTCHA v3 看分数', async () => {
  let score = 0.9;
  const t = setup({ CAPTCHA_PROVIDER: 'recaptcha', CAPTCHA_SECRET: 'sec', COMMENT_INTERVAL: '0' },
    () => Response.json({ success: true, score, action: 'comment' }));
  assert.equal((await t.comment({ message: '高分', captcha: 't' })).json.status, 'approved');
  score = 0.1;
  assert.equal((await t.comment({ message: '低分', captcha: 't' })).status, 403);
});

test('Akismet', async () => {
  let verdict = 'false';
  const t = setup({ AKISMET_KEY: 'k123', SITE_URL: 'https://blog.example', COMMENT_INTERVAL: '0' }, () => new Response(verdict));
  assert.equal((await t.comment({ message: '正常留言' })).json.status, 'approved');
  assert.match(t.calls[0].url, /^https:\/\/k123\.rest\.akismet\.com\/1\.1\/comment-check$/);
  assert.match(t.calls[0].body, /permalink=https%3A%2F%2Fblog\.example%2Fguestbook%2F/);
  verdict = 'true';
  await t.comment({ message: '广告留言' });
  assert.equal((await statusOf(t, '广告留言'))!.status, 'spam');
  verdict = 'invalid';
  assert.equal((await t.comment({ message: 'Key 不对' })).json.status, 'pending');
});

test('新留言通知 webhook', async () => {
  const t = setup({ NOTIFY_WEBHOOK: 'https://hook.example/x', SITE_URL: 'https://blog.example' }, () => new Response('ok'));
  await t.comment();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(t.calls.length, 1);
  const payload = JSON.parse(t.calls[0].body);
  assert.equal(payload.event, 'comment.created');
  assert.equal(payload.status, 'approved');
  assert.equal(payload.url, 'https://blog.example/guestbook/');
  assert.match(payload.text, /阿飞 在「留言本」留言/);
});

test('留言数统计与最新留言', async () => {
  const t = setup({ COMMENT_INTERVAL: '0' });
  await t.comment({ key: '2000/10/12/stars-dont-talk/', message: '写得真好' });
  await t.comment({ key: '/2000/10/12/stars-dont-talk/index.html', message: '同一篇文章' });
  await t.comment({ key: 'guestbook', message: '留言本里的话' });
  await t.comment({ key: 'guestbook', message: 'english spam' });
  const counts = await t.get('/api/comments/count?keys=' + encodeURIComponent('2000/10/12/stars-dont-talk/,guestbook,nothing/'));
  assert.deepEqual(counts.json.counts, { '2000/10/12/stars-dont-talk/': 2, guestbook: 1, 'nothing/': 0 });
  const recent = await t.get('/api/comments/recent?limit=2');
  assert.deepEqual(recent.json.items.map((i: { message: string }) => i.message), ['留言本里的话', '同一篇文章']);
});

test('分页', async () => {
  const t = setup({ COMMENT_INTERVAL: '0' });
  for (let i = 1; i <= 12; i++) { await t.comment({ message: '第' + i + '条留言' }); advance(t.clock, 1); }
  const p2 = await t.get('/api/comments?key=guestbook&size=5&page=3');
  assert.equal(p2.json.total, 12);
  assert.deepEqual(p2.json.items.map((i: { message: string }) => i.message), ['第2条留言', '第1条留言']);
});
