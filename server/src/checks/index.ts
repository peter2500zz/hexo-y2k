// 留言检查流水线：先做便宜、确定的检查，再做要联网的检查，最后按审核模式定状态

import { akismet } from './akismet.ts';
import { banned, botAgent, duplicate, honeypot, rate, timing } from './basic.ts';
import { captcha } from './captcha.ts';
import { cjk, forbiddenWords, links } from './content.ts';
import type { Check, CheckContext, CommentInput } from './types.ts';

export type { CheckContext, CommentInput } from './types.ts';

export type Verdict =
  | { kind: 'reject'; status: 400 | 403 | 409 | 429; message: string; reason: string }
  | { kind: 'drop'; reason: string }
  | { kind: 'store'; status: 'approved' | 'pending' | 'spam'; reasons: string[] };

/** 按顺序执行；Akismet 放最后，已经判成垃圾的就不再花这次请求 */
const PIPELINE: Check[] = [honeypot, banned, rate, duplicate, captcha, botAgent, timing, forbiddenWords, links, cjk];

export async function runChecks(input: CommentInput, ctx: CheckContext): Promise<Verdict> {
  const spam: string[] = [];
  const pending: string[] = [];

  const apply = async (check: Check) => {
    const r = await check(input, ctx);
    if (!r) return null;
    if (r.kind === 'reject' || r.kind === 'drop') return r;
    (r.kind === 'spam' ? spam : pending).push(r.reason);
    return null;
  };

  for (const check of PIPELINE) {
    const stop = await apply(check);
    if (stop) return stop;
  }
  if (!spam.length) await apply(akismet);

  const reasons = [...spam, ...pending];
  const mode = ctx.deps.config.moderation;
  if (spam.length) return { kind: 'store', status: 'spam', reasons };
  if (mode === 'all') return { kind: 'store', status: 'pending', reasons };
  if (mode === 'off') return { kind: 'store', status: 'approved', reasons };
  return { kind: 'store', status: pending.length ? 'pending' : 'approved', reasons };
}
