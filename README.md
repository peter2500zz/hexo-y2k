# hexo-y2k

千禧年（约 2000 年）中文个人主页风格的 Hexo 主题，以及它的配套后端。

| 目录 | 内容 |
| --- | --- |
| [`themes/y2k/`](themes/y2k/) | 主题 |
| [`server/`](server/) | 后端（可选）：留言本、计数器、在线人数、小调查、站长管理后台 |

## 主题

1. 把 `themes/y2k` 放进你博客的 `themes/` 目录。可以直接复制，也可以用软链接，这样本仓库更新后博客能直接用上：

   ```bash
   ln -s /path/to/hexo-y2k/themes/y2k /path/to/blog/themes/y2k
   ```

2. 在博客里安装 EJS 渲染器：`npm install hexo-renderer-ejs`
3. 在博客的 `_config.yml` 里设置 `theme: y2k` 和 `language: zh-CN`
4. 在博客根目录新建 `_config.y2k.yml`，只写想改的主题选项。全部选项和说明见 [`themes/y2k/_config.yml`](themes/y2k/_config.yml)
5. 按需建好栏目分类、标签、友情链接、留言本、404 这几个特殊页面

详细说明见 [themes/y2k/README.md](themes/y2k/README.md)。

不接后端也能用。这时留言只存在访客自己的浏览器里，计数器也只统计访客本机的访问。

## 后端

```bash
cd server
cp .env.example .env    # 至少填 ADMIN_TOKEN 和 SITE_URL
docker compose up -d
```

用 nginx 反代到 `127.0.0.1:8787`，再在博客的 `_config.y2k.yml` 里填上后端地址：

```yaml
backend:
  url: https://y2k-api.example.com
```

管理后台在 `https://后端地址/admin`。nginx 配置示例、Cloudflare Workers 部署方法和接口说明见 [server/README.md](server/README.md)。

## 本地联调

本地没有 nginx，跨域由后端自己处理：

```bash
cd server && npm install && cp .env.example .env
# 在 .env 里加上 CORS_ORIGINS=http://localhost:4000，再填一个 ADMIN_TOKEN
npm run dev                    # http://localhost:8787
```

然后在博客的 `_config.y2k.yml` 里写上 `backend: { url: http://localhost:8787 }`，在博客目录运行 `npx hexo server`。
