// 人机验证：Cloudflare Turnstile / hCaptcha / Google reCAPTCHA v3，都用各家官方的 siteverify 接口

import type { Check } from './types.ts';

const ENDPOINTS = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify'
} as const;

interface VerifyResponse { success?: boolean; score?: number; action?: string }

export const captcha: Check = async (input, { deps, ip }) => {
  const cfg = deps.config.captcha;
  if (!cfg) return;
  if (!input.captcha) return { kind: 'reject', status: 403, message: '请先完成人机验证。', reason: 'captcha-missing' };

  const body = new URLSearchParams({ secret: cfg.secret, response: input.captcha });
  if (ip) body.set('remoteip', ip);
  if (cfg.provider === 'hcaptcha' && cfg.siteKey) body.set('sitekey', cfg.siteKey);

  let data: VerifyResponse;
  try {
    const res = await deps.fetch(ENDPOINTS[cfg.provider], { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    data = await res.json() as VerifyResponse;
  } catch {
    // 验证服务连不上时不拦人，交给审核队列
    return { kind: 'pending', reason: 'captcha-unavailable' };
  }

  const ok = !!data.success &&
    (cfg.provider !== 'recaptcha' || ((data.score ?? 0) >= cfg.minScore && (!data.action || data.action === 'comment')));
  if (!ok) return { kind: 'reject', status: 403, message: '人机验证没有通过，请刷新页面再试。', reason: 'captcha-failed' };
};
