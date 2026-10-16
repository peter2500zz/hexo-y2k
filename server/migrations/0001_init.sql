-- hexo-theme-y2k 后端初始表结构，时间一律存 Unix 毫秒

-- 杂项键值：自动生成的哈希盐等
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- 留言。page_key 为 'guestbook' 或文章路径（如 2000/10/12/stars-dont-talk/）
-- status: approved 已通过 | pending 待审核 | spam 垃圾
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key TEXT NOT NULL,
  name TEXT NOT NULL,
  face TEXT NOT NULL DEFAULT '^_^',
  oicq TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  reasons TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL DEFAULT '',
  reply_at INTEGER,
  ip_hash TEXT NOT NULL,
  ua TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at DESC);

-- 计数器：site 全站 | page:<路径> | pv:<日期> 当日浏览 | uv:<日期> 当日访客
CREATE TABLE IF NOT EXISTS counters (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);

-- 当日访客去重（hash 每天换盐，跨天无法关联同一个人）
CREATE TABLE IF NOT EXISTS visitors (
  day TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (day, hash)
);

-- 同一访客短时间内重复刷新同一页不重复计数
CREATE TABLE IF NOT EXISTS recent_hits (
  hash TEXT NOT NULL,
  path TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (hash, path)
);

-- 在线人数：最近几分钟内有访问的访客
CREATE TABLE IF NOT EXISTS online (
  hash TEXT PRIMARY KEY,
  seen INTEGER NOT NULL
);

-- 小调查，每个 IP 每个调查一票
CREATE TABLE IF NOT EXISTS poll_votes (
  poll TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  option INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll, ip_hash)
);

-- 封禁的 IP（只存哈希）
CREATE TABLE IF NOT EXISTS bans (
  ip_hash TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 固定窗口限流计数
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
