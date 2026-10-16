// Akismet：WordPress 用了十几年的反垃圾服务，Waline 也默认接它。填了 AKISMET_KEY 才启用
// 注意：启用后访客的 IP、UA 和留言内容会发给 Akismet

import type { Check } from './types.ts';

export const akismet: Check = async (input, { deps, ip, ua }) => {
  const key = deps.config.akismetKey;
  if (!key) return;
  const body = new URLSearchParams({
    blog: deps.config.siteUrl || 'http://localhost',
    user_ip: ip,
    user_agent: ua,
    referrer: deps.config.siteUrl,
    permalink: input.permalink,
    comment_type: 'comment',
    comment_author: input.name,
    comment_content: input.message,
    blog_lang: 'zh_cn',
    blog_charset: 'UTF-8'
  });
  try {
    const res = await deps.fetch(`https://${encodeURIComponent(key)}.rest.akismet.com/1.1/comment-check`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000)
    });
    const text = (await res.text()).trim();
    if (text === 'true') return { kind: 'spam', reason: 'akismet' };
    if (text !== 'false') return { kind: 'pending', reason: 'akismet-error' };
  } catch {
    return { kind: 'pending', reason: 'akismet-error' };
  }
};
