import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup } from './helpers.ts';

const ENV = { ADMIN_TOKEN: 'admin-secret', COMMENT_INTERVAL: '0' };

test('没设 ADMIN_TOKEN 时后台关闭', async () => {
  const t = setup();
  assert.equal((await t.admin('GET', '/summary')).status, 404);
});

test('口令错误 10 次后锁定 15 分钟', async () => {
  const t = setup(ENV);
  for (let i = 0; i < 10; i++) assert.equal((await t.admin('GET', '/summary', undefined, 'wrong')).status, 401);
  assert.equal((await t.admin('GET', '/summary')).status, 429, '锁定期间正确口令也不行');
  t.clock.now += 15 * 60 * 1000 + 1;
  assert.equal((await t.admin('GET', '/summary')).status, 200);
});

test('审核：通过、回复、标垃圾、删除', async () => {
  const t = setup(ENV);
  await t.comment({ message: 'english only' });
  const pending = await t.admin('GET', '/comments?status=pending');
  assert.equal(pending.json.total, 1);
  const item = pending.json.items[0];
  assert.deepEqual(item.reasons, ['no-cjk']);
  assert.equal(item.ipHash.length, 64);

  const ok = await t.admin('POST', '/comments/' + item.id, { status: 'approved', reply: '欢迎常来 ^_^' });
  assert.equal(ok.json.item.status, 'approved');
  const pub = await t.get('/api/comments?key=guestbook');
  assert.equal(pub.json.items[0].reply, '欢迎常来 ^_^');
  assert.ok(pub.json.items[0].replyAt);

  assert.equal((await t.admin('POST', '/comments/' + item.id, { status: 'nope' })).status, 400);
  await t.admin('POST', '/comments/' + item.id, { status: 'spam' });
  assert.equal((await t.get('/api/comments?key=guestbook')).json.total, 0);
  assert.equal((await t.admin('DELETE', '/comments/' + item.id)).status, 200);
  assert.equal((await t.admin('DELETE', '/comments/' + item.id)).status, 404);
});

test('批量操作与搜索', async () => {
  const t = setup(ENV);
  await t.comment({ message: '第一条' });
  await t.comment({ message: '第二条' });
  await t.comment({ message: '第三条' });
  const all = await t.admin('GET', '/comments');
  const ids = all.json.items.slice(0, 2).map((i: { id: number }) => i.id);
  await t.admin('POST', '/comments-bulk', { ids, action: 'spam' });
  const summary = await t.admin('GET', '/summary');
  assert.deepEqual(summary.json.comments, { pending: 0, approved: 1, spam: 2 });
  assert.equal((await t.admin('GET', '/comments?q=' + encodeURIComponent('第三'))).json.total, 1);
  await t.admin('POST', '/comments-bulk', { ids, action: 'delete' });
  assert.equal((await t.admin('GET', '/comments')).json.total, 1);
});

test('封禁 IP：之后的留言被拒，待审核的一并丢进垃圾箱', async () => {
  const t = setup(ENV);
  await t.comment({ message: 'spam one' }, { 'x-test-ip': '6.6.6.6' });
  const item = (await t.admin('GET', '/comments')).json.items[0];
  await t.admin('POST', '/bans', { ipHash: item.ipHash, note: '广告', spamPending: true });
  assert.equal((await t.admin('GET', '/comments?status=spam')).json.total, 1);
  const r = await t.comment({ message: '换个说法再来' }, { 'x-test-ip': '6.6.6.6' });
  assert.equal(r.status, 403);
  assert.equal((await t.admin('GET', '/bans')).json.items.length, 1);
  await t.admin('DELETE', '/bans/' + item.ipHash);
  assert.equal((await t.comment({ message: '解封了' }, { 'x-test-ip': '6.6.6.6' })).status, 200);
});

test('管理页带 CSP', async () => {
  const t = setup(ENV);
  const page = await t.get('/admin');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.equal((await t.get('/admin/app.js')).status, 200);
});
