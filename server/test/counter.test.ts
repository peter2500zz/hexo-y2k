import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, setup } from './helpers.ts';

const hit = (t: ReturnType<typeof setup>, path: string, headers?: Record<string, string>) => t.post('/api/hit', { path }, headers);

test('第一次访问计入全站、本页、今日浏览和今日访客', async () => {
  const t = setup();
  const r = await hit(t, '/2000/10/12/stars-dont-talk/');
  assert.deepEqual(r.json, { site: { pv: 1, todayPv: 1, todayUv: 1 }, page: { key: '2000/10/12/stars-dont-talk/', pv: 1 }, online: 1 });
});

test('同一访客短时间内刷新同一页不重复计数，换一页照算', async () => {
  const t = setup({ COUNTER_DEDUPE_SECONDS: '600' });
  await hit(t, 'a/');
  assert.equal((await hit(t, 'a/')).json.site.pv, 1);
  const b = await hit(t, 'b/');
  assert.equal(b.json.site.pv, 2);
  assert.equal(b.json.site.todayUv, 1);
  advance(t.clock, 601);
  assert.equal((await hit(t, 'a/')).json.page.pv, 2);
});

test('COUNTER_DEDUPE_SECONDS=0：和当年一样，每刷新一次都算', async () => {
  const t = setup({ COUNTER_DEDUPE_SECONDS: '0' });
  await hit(t, '');
  await hit(t, '');
  assert.equal((await hit(t, '')).json.site.pv, 3);
});

test('爬虫只读不计；起始值 COUNTER_OFFSET 加在全站总数上', async () => {
  const t = setup({ COUNTER_OFFSET: '12345' });
  const bot = await hit(t, '', { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  assert.equal(bot.json.site.pv, 12345);
  assert.equal(bot.json.online, 0);
  assert.equal((await hit(t, '')).json.site.pv, 12346);
});

test('今日访客按天去重，在线人数按时间窗口', async () => {
  const t = setup({ COUNTER_DEDUPE_SECONDS: '0', ONLINE_WINDOW_SECONDS: '300' });
  await hit(t, '', { 'x-test-ip': '10.0.0.1' });
  await hit(t, '', { 'x-test-ip': '10.0.0.1' });
  const r = await hit(t, '', { 'x-test-ip': '10.0.0.2' });
  assert.equal(r.json.site.todayUv, 2);
  assert.equal(r.json.online, 2);
  advance(t.clock, 301);
  const later = await t.get('/api/stats?path=');
  assert.equal(later.json.online, 0);
  advance(t.clock, 24 * 3600);
  const tomorrow = await hit(t, '', { 'x-test-ip': '10.0.0.1' });
  assert.equal(tomorrow.json.site.todayUv, 1);
  assert.equal(tomorrow.json.site.todayPv, 1);
  assert.equal(tomorrow.json.site.pv, 4);
});

test('同一 IP 每分钟计数次数有上限', async () => {
  const t = setup({ COUNTER_DEDUPE_SECONDS: '0', HIT_RATE_PER_MINUTE: '5' });
  for (let i = 0; i < 8; i++) await hit(t, 'p' + i + '/');
  assert.equal((await t.get('/api/stats')).json.site.pv, 5);
});

test('数据库里不存原始 IP', async () => {
  const t = setup();
  await hit(t, '', { 'x-test-ip': '192.0.2.55' });
  await t.comment({}, { 'x-test-ip': '192.0.2.55' });
  const dump = JSON.stringify([
    await t.db.all('SELECT * FROM online'), await t.db.all('SELECT * FROM visitors'),
    await t.db.all('SELECT * FROM comments'), await t.db.all('SELECT * FROM rate')
  ]);
  assert.ok(!dump.includes('192.0.2.55'));
});
