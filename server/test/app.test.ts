import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup } from './helpers.ts';

test('没配 CORS_ORIGINS 时不发跨域响应头，也不校验来源', async () => {
  const t = setup();
  const r = await t.get('/api/config', { Origin: 'https://blog.example' });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal((await t.comment({}, { Origin: 'https://anything.example' })).status, 200);
});

test('配了 CORS_ORIGINS：只给这些来源跨域许可，别的来源不能提交', async () => {
  const t = setup({ CORS_ORIGINS: 'https://blog.example/, http://localhost:4000' });
  const ok = await t.call('OPTIONS', '/api/comments', undefined, { Origin: 'https://blog.example', 'Access-Control-Request-Method': 'POST' });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://blog.example');
  const no = await t.call('OPTIONS', '/api/comments', undefined, { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
  assert.equal((await t.comment({}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await t.comment({}, { Origin: 'http://localhost:4000' })).status, 200);
});

test('CORS_ORIGINS=* 允许任何来源；管理接口始终不开跨域', async () => {
  const t = setup({ CORS_ORIGINS: '*', ADMIN_TOKEN: 'admin-secret' });
  assert.equal((await t.get('/api/config', { Origin: 'https://x.example' })).headers.get('access-control-allow-origin'), '*');
  const pre = await t.call('OPTIONS', '/api/admin/summary', undefined, { Origin: 'https://x.example', 'Access-Control-Request-Method': 'GET' });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
});

test('请求体大小限制', async () => {
  const t = setup();
  assert.equal((await t.comment({ message: '长'.repeat(20000) })).status, 413);
});

test('访客 IP：默认取 X-Forwarded-For 最右一项，客户端伪造的左边几项不算', async () => {
  const t = setup({ BLOCK_IPS: '9.9.9.9' });
  assert.equal((await t.comment({}, { 'X-Forwarded-For': '9.9.9.9, 1.2.3.4' })).status, 200);
  assert.equal((await t.comment({ message: '换个内容' }, { 'X-Forwarded-For': '1.2.3.4, 9.9.9.9' })).status, 403);
});

test('访客 IP：没有 X-Forwarded-For 时用 X-Real-IP', async () => {
  const t = setup({ BLOCK_IPS: '9.9.9.9' });
  assert.equal((await t.comment({}, { 'X-Real-IP': '9.9.9.9' })).status, 403);
});

test('健康检查', async () => {
  const t = setup();
  assert.deepEqual((await t.get('/healthz')).json, { ok: true });
});
