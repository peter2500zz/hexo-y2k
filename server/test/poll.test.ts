import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup } from './helpers.ts';

test('每个 IP 每个调查一票', async () => {
  const t = setup();
  const id = '你最喜欢本站哪个栏目？';
  const first = await t.post('/api/poll', { id, option: 1 });
  assert.deepEqual(first.json, { id, counts: [0, 1], total: 1, voted: 1, already: false });
  const again = await t.post('/api/poll', { id, option: 3 });
  assert.equal(again.json.already, true);
  assert.equal(again.json.voted, 1);
  await t.post('/api/poll', { id, option: 3 }, { 'x-test-ip': '10.1.1.1' });
  const view = await t.get('/api/poll?id=' + encodeURIComponent(id));
  assert.deepEqual(view.json.counts, [0, 1, 0, 1]);
  assert.equal(view.json.total, 2);
});

test('选项越界或没选', async () => {
  const t = setup();
  assert.equal((await t.post('/api/poll', { id: 'x', option: 99 })).status, 400);
  assert.equal((await t.post('/api/poll', { id: 'x' })).status, 400);
  assert.equal((await t.post('/api/poll', { option: 1 })).status, 400);
});
