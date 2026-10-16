// 不看内容的检查：陷阱输入框、封禁、频率、重复、机器特征

import { isbot } from 'isbot';
import type { Check } from './types.ts';

const DAY = 24 * 3600 * 1000;

/** 陷阱输入框：表单里藏一个真人看不见的"网址"栏，机器会顺手填上 */
export const honeypot: Check = input => {
  if (input.website) return { kind: 'drop', reason: 'honeypot' };
};

/** 封禁名单：配置里的 IP（支持前缀）和后台封禁的 IP 哈希 */
export const banned: Check = async (_input, { deps, ip, ipHash }) => {
  const hit = deps.config.blockIps.some(rule => rule === ip || (/[.:]$/.test(rule) && ip.startsWith(rule)));
  const row = hit ? null : await deps.db.first('SELECT 1 AS x FROM bans WHERE ip_hash = ?', [ipHash]);
  if (hit || row) return { kind: 'reject', status: 403, message: '对不起，您已被禁止留言。', reason: 'banned' };
};

/** 频率限制：同一 IP 两次留言要隔一会儿，一天也有上限 */
export const rate: Check = async (_input, { deps, ipHash, now }) => {
  const { commentInterval, commentDailyLimit } = deps.config;
  const row = await deps.db.first<{ last: number | null; n: number }>(
    'SELECT MAX(created_at) AS last, COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?',
    [ipHash, now - DAY]
  );
  if (row?.last && commentInterval && now - row.last < commentInterval * 1000) {
    const wait = Math.ceil((commentInterval * 1000 - (now - row.last)) / 1000);
    return { kind: 'reject', status: 429, message: `您发言太快了，请休息 ${wait} 秒再来～`, reason: 'too-frequent' };
  }
  if (commentDailyLimit && (row?.n ?? 0) >= commentDailyLimit) {
    return { kind: 'reject', status: 429, message: '您今天的留言太多了，明天再来吧！', reason: 'daily-limit' };
  }
};

/** 重复内容：自己重复发直接拒绝；不同 IP 发一模一样的话多半是群发广告 */
export const duplicate: Check = async (input, { deps, ipHash, now }) => {
  const row = await deps.db.first<{ ip_hash: string }>(
    'SELECT ip_hash FROM comments WHERE message = ? AND created_at > ? ORDER BY ip_hash = ? DESC LIMIT 1',
    [input.message, now - DAY, ipHash]
  );
  if (!row) return;
  if (row.ip_hash === ipHash) return { kind: 'reject', status: 409, message: '请不要重复留言哦！', reason: 'duplicate' };
  return { kind: 'spam', reason: 'duplicate-content' };
};

/** 机器特征：curl、python-requests、无头浏览器等常见爬虫/脚本的 User-Agent */
export const botAgent: Check = (_input, { ua }) => {
  if (!ua || isbot(ua)) return { kind: 'spam', reason: 'bot-ua' };
};

/** 填表太快：真人从打开页面到写完留言至少要几秒 */
export const timing: Check = (input, { deps }) => {
  const min = deps.config.minFillSeconds * 1000;
  if (!min) return;
  if (input.elapsed == null) return { kind: 'pending', reason: 'no-timing' };
  if (input.elapsed < min) return { kind: 'pending', reason: 'too-fast' };
};
