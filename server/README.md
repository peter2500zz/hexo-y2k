# y2k-server

hexo-theme-y2k 的后端：留言本（带站长回复）、访客计数器、文章阅读次数、今日访问、在线人数、小调查，带反垃圾和站长管理后台。

## 部署：docker compose

```bash
cd server
cp .env.example .env    # 至少填 ADMIN_TOKEN 和 SITE_URL
docker compose up -d
curl http://127.0.0.1:8787/healthz    # {"ok":true}
```

服务只监听 `127.0.0.1:8787`（端口可用 `.env` 里的 `Y2K_PORT` 改），由 nginx 反代过来。访客 IP 默认取自 `X-Forwarded-For`，所以 nginx 要转发这个头：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

数据保存在名为 `y2k-data` 的 volume 里。升级时运行 `docker compose up -d --build`，数据库迁移会在启动时自动执行。

所有配置项都在 [`.env.example`](.env.example) 里，改完 `.env` 后运行 `docker compose up -d` 生效。

## 部署：Cloudflare Workers（可选）

数据库换成 D1，代码和功能都一样：

```bash
cd server
npm ci
npx wrangler login
npx wrangler d1 create y2k        # 把输出的 database_id 填进 wrangler.jsonc
npm run cf:migrate
npx wrangler secret put ADMIN_TOKEN
npm run cf:deploy
```

Workers 前面没有 nginx，跨域由后端自己处理：在 `wrangler.jsonc` 的 `vars` 里把 `CORS_ORIGINS` 设成博客地址，多个地址用逗号分隔。其余配置项和 `.env.example` 相同，写在 `vars` 里；密钥类的（`HASH_SALT`、`AKISMET_KEY`、`CAPTCHA_SECRET`）用 `npx wrangler secret put` 设置。

## 接到博客

博客根目录的 `_config.y2k.yml`：

```yaml
backend:
  url: https://y2k-api.example.com
```

主题的留言和计数器默认是 `auto`，填了地址就自动改用后端。侧栏想显示最新留言，就在 `sidebar` 里加上 `messages`。人机验证的 site key 由前端从后端读取，主题这边不用配。

## 管理后台

打开 `https://后端地址/admin`，输入 `ADMIN_TOKEN` 登录。可以：

- 按待审核、已通过、垃圾箱筛选留言，也可以搜索
- 批量通过、标为垃圾、删除
- 写站长回复（待审核的留言回复后自动通过）
- 封禁 IP（他所有待审核的留言会一起进垃圾箱）

每条留言都标着被拦下的原因。

## 反垃圾

一条留言按顺序经过这些检查：

1. 陷阱输入框（直接丢弃）
2. 封禁名单
3. 留言间隔和每日上限
4. 重复内容
5. 人机验证（可选：Turnstile、hCaptcha、reCAPTCHA v3）
6. 脚本和爬虫的 UA
7. 填写太快
8. 违禁词
9. 链接数
10. 不含汉字
11. Akismet（可选）

判为垃圾的留言进垃圾箱，访客看到的只是「待审核」。哪些情况直接显示、哪些先审核，由 `MODERATION` 决定。

数据库里不存原始 IP，只存加盐哈希。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/config` | 审核模式、人机验证 site key |
| GET / POST | `/api/comments` | 读取 / 发表留言 |
| GET | `/api/comments/count?keys=` | 多个页面的留言数 |
| GET | `/api/comments/recent` | 最新留言 |
| POST | `/api/hit` | 记一次访问并返回统计 |
| GET | `/api/stats` | 只读统计 |
| GET / POST | `/api/poll` | 查看 / 投票 |
| * | `/api/admin/*` | 管理接口（`Authorization: Bearer <ADMIN_TOKEN>`） |
| GET | `/admin` | 管理后台 |
| GET | `/healthz` | 健康检查 |

## 开发

需要 Node 22.18 或更新版本：

```bash
npm install
npm run dev          # 本地运行，改代码自动重启；配置从 .env 读取
npm test
npm run typecheck
```
