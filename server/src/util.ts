import type { Context } from 'hono';
import type { Config } from './config.ts';
import type { DB } from './db.ts';

const enc = new TextEncoder();

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/** 常量时间比较，用于核对管理口令 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256('cmp:' + a), sha256('cmp:' + b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

const saltCache = new WeakMap<DB, string>();

/** 取哈希盐：优先用配置的 HASH_SALT，否则首次使用时随机生成并存进数据库 */
export async function getSalt(db: DB, configured: string): Promise<string> {
  if (configured) return configured;
  const cached = saltCache.get(db);
  if (cached) return cached;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const fresh = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  await db.run('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)', ['salt', fresh]);
  const row = await db.first<{ v: string }>('SELECT v FROM meta WHERE k = ?', ['salt']);
  const salt = row?.v ?? fresh;
  saltCache.set(db, salt);
  return salt;
}

/** 按配置的时区取 YYYY-MM-DD */
export function dayString(ms: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** 访客 IP：按 TRUST_PROXY 决定信任哪个请求头 */
export function clientIp(c: Context, config: Config, remote?: string): string {
  const h = (name: string) => c.req.header(name)?.trim() || '';
  switch (config.trustProxy) {
    case 'cf-connecting-ip': return h('cf-connecting-ip') || remote || '';
    case 'x-real-ip': return h('x-real-ip') || remote || '';
    case 'x-forwarded-for': {
      // 取最右边一项：那是你自己的反向代理看到的地址，左边的可以被客户端伪造
      const parts = h('x-forwarded-for').split(',').map(s => s.trim()).filter(Boolean);
      return parts[parts.length - 1] || h('x-real-ip') || remote || '';
    }
    default: return remote || h('cf-connecting-ip') || '';
  }
}

/** 统一的文字清洗：去掉控制字符、规范换行、裁剪长度 */
export function cleanText(value: unknown, max: number, multiline = false): string {
  let s = typeof value === 'string' ? value : '';
  s = s.normalize('NFC').replace(/\r\n?/g, '\n');
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g : /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '');
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  return Array.from(s).slice(0, max).join('');
}

/** 页面键：'guestbook' 或站内路径，去掉开头的 / 和结尾的 index.html */
export function cleanKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let k = value.trim().replace(/[?#].*$/, '').replace(/^\/+/, '').replace(/index\.html$/, '');
  try { k = decodeURIComponent(k); } catch { /* 保持原样 */ }
  if (k.length > 300 || /[\u0000-\u001F\u007F<>"'\\\s]/.test(k)) return null;
  return k;
}

/** 用来匹配违禁词：全角转半角、转小写、去掉空白和常见分隔符 */
export function foldForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[\s\-_.·•*|/\\~`'"，。、！？,!?]+/g, '');
}

const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|cn|top|xyz|info|cc|io|me|vip|shop|club|site|online|tk|ru)\b/gi;
export function countLinks(s: string): number {
  return (s.match(LINK_RE) || []).length;
}

export function hasCjk(s: string): boolean {
  return /[㐀-鿿豈-﫿]/.test(s);
}

/** 固定窗口限流：返回本窗口内的第几次 */
export async function bump(db: DB, key: string, windowMs: number, now: number): Promise<number> {
  const row = await db.first<{ n: number }>(
    `INSERT INTO rate (k, n, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN rate.reset_at <= ? THEN 1 ELSE rate.n + 1 END,
       reset_at = CASE WHEN rate.reset_at <= ? THEN excluded.reset_at ELSE rate.reset_at END
     RETURNING n`,
    [key, now + windowMs, now, now]
  );
  return row?.n ?? 1;
}

export function clampInt(value: unknown, min: number, max: number, def: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
