import type { Context } from 'hono';
import type { AppEnv, Deps } from '../types.ts';

export interface CommentInput {
  key: string;
  name: string;
  face: string;
  oicq: string;
  message: string;
  /** 隐藏的陷阱输入框，真人看不见也不会填 */
  website: string;
  /** 从打开表单到提交经过的毫秒数（前端上报） */
  elapsed: number | null;
  /** 验证码令牌 */
  captcha: string;
  /** 来源页面，给 Akismet 用 */
  permalink: string;
}

export interface CheckContext {
  deps: Deps;
  c: Context<AppEnv>;
  ip: string;
  ipHash: string;
  ua: string;
  now: number;
}

/**
 * 每个检查返回一种结论（或什么都不返回表示通过）：
 *   reject  直接拒绝，把 message 告诉访客（参数不对、太频繁、被封禁、验证码没过）
 *   drop    悄悄丢弃，假装成功（陷阱输入框被填了，明显是机器）
 *   spam    存进垃圾箱，访客看到的是"待审核"
 *   pending 存进审核队列
 */
export type CheckResult =
  | { kind: 'reject'; status: 400 | 403 | 409 | 429; message: string; reason: string }
  | { kind: 'drop'; reason: string }
  | { kind: 'spam'; reason: string }
  | { kind: 'pending'; reason: string };

export type Check = (input: CommentInput, ctx: CheckContext) => Promise<CheckResult | void> | CheckResult | void;
