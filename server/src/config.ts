// 把环境变量整理成配置对象

export type Moderation = 'auto' | 'all' | 'off';
export type CaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha';
export type TrustProxy = 'none' | 'x-forwarded-for' | 'x-real-ip' | 'cf-connecting-ip';

export interface CaptchaConfig {
  provider: CaptchaProvider;
  siteKey: string;
  secret: string;
  minScore: number;
}

export interface Config {
  /** 后端自己处理跨域时允许的来源；空数组 = 不发跨域响应头 */
  corsOrigins: string[];
  /** 管理后台口令，留空则关闭后台 */
  adminToken: string;
  /** IP 哈希用的盐，留空则首次启动时自动生成并存进数据库 */
  hashSalt: string;
  /** 博客地址，用于 Akismet 和通知里的链接 */
  siteUrl: string;
  /** "今日访问"按哪个时区算 */
  timezone: string;
  /** 从哪里取访客真实 IP */
  trustProxy: TrustProxy;
  /** auto：可疑的进审核队列，其余直接显示 | all：全部先审核 | off：除了垃圾都直接显示 */
  moderation: Moderation;
  /** 同一 IP 两次留言的最短间隔（秒） */
  commentInterval: number;
  /** 同一 IP 每 24 小时最多留言几条 */
  commentDailyLimit: number;
  /** 留言里超过这么多链接就进审核队列 */
  maxLinks: number;
  /** 不含汉字的留言进审核队列 */
  requireCjk: boolean;
  /** 从打开表单到提交少于这么多秒，视为机器填写，进审核队列 */
  minFillSeconds: number;
  /** 命中即判为垃圾的词 */
  forbiddenWords: string[];
  /** 禁止留言的 IP，支持前缀（如 "203.0.113."） */
  blockIps: string[];
  akismetKey: string;
  captcha: CaptchaConfig | null;
  /** 计数器起始值，比如从别的统计迁移过来 */
  counterOffset: number;
  /** 同一访客多少秒内重复打开同一页不重复计数，0 为每次刷新都算（和当年一样） */
  counterDedupeSeconds: number;
  /** 多少秒内有访问算"在线" */
  onlineWindowSeconds: number;
  /** 同一 IP 每分钟最多计数几次，超出的访问只读不计 */
  hitRatePerMinute: number;
  /** 有新留言时 POST 一段 JSON 到这个地址 */
  notifyWebhook: string;
}

export const LIMITS = {
  name: 16,
  message: 500,
  oicq: 12,
  reply: 1000,
  key: 300,
  pollOptions: 20
} as const;

export const FACES = ['^_^', ':-)', '^o^', 'T_T', '-_-'];

type Env = Record<string, unknown>;

function str(env: Env, key: string, def = ''): string {
  const v = env[key];
  return v == null ? def : String(v).trim();
}

function num(env: Env, key: string, def: number): number {
  const v = str(env, key);
  if (v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

function bool(env: Env, key: string, def: boolean): boolean {
  const v = str(env, key).toLowerCase();
  if (v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v);
}

function list(env: Env, key: string): string[] {
  return str(env, key).split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
}

function oneOf<T extends string>(value: string, allowed: readonly T[], def: T): T {
  return (allowed as readonly string[]).includes(value) ? value as T : def;
}

export function loadConfig(env: Env): Config {
  const provider = str(env, 'CAPTCHA_PROVIDER').toLowerCase();
  const captcha: CaptchaConfig | null =
    (provider === 'turnstile' || provider === 'hcaptcha' || provider === 'recaptcha') && str(env, 'CAPTCHA_SECRET')
      ? { provider, siteKey: str(env, 'CAPTCHA_SITE_KEY'), secret: str(env, 'CAPTCHA_SECRET'), minScore: num(env, 'RECAPTCHA_MIN_SCORE', 0.5) }
      : null;

  return {
    corsOrigins: list(env, 'CORS_ORIGINS').map(o => o.replace(/\/+$/, '')),
    adminToken: str(env, 'ADMIN_TOKEN'),
    hashSalt: str(env, 'HASH_SALT'),
    siteUrl: str(env, 'SITE_URL').replace(/\/+$/, ''),
    timezone: str(env, 'TIMEZONE', 'Asia/Shanghai'),
    trustProxy: oneOf(str(env, 'TRUST_PROXY', 'x-forwarded-for').toLowerCase(), ['none', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'] as const, 'x-forwarded-for'),
    moderation: oneOf(str(env, 'MODERATION', 'auto').toLowerCase(), ['auto', 'all', 'off'] as const, 'auto'),
    commentInterval: num(env, 'COMMENT_INTERVAL', 30),
    commentDailyLimit: num(env, 'COMMENT_DAILY_LIMIT', 20),
    maxLinks: num(env, 'MAX_LINKS', 1),
    requireCjk: bool(env, 'REQUIRE_CJK', true),
    minFillSeconds: num(env, 'MIN_FILL_SECONDS', 3),
    forbiddenWords: list(env, 'FORBIDDEN_WORDS'),
    blockIps: list(env, 'BLOCK_IPS'),
    akismetKey: str(env, 'AKISMET_KEY'),
    captcha,
    counterOffset: num(env, 'COUNTER_OFFSET', 0),
    counterDedupeSeconds: num(env, 'COUNTER_DEDUPE_SECONDS', 600),
    onlineWindowSeconds: num(env, 'ONLINE_WINDOW_SECONDS', 300) || 300,
    hitRatePerMinute: num(env, 'HIT_RATE_PER_MINUTE', 120),
    notifyWebhook: str(env, 'NOTIFY_WEBHOOK')
  };
}
