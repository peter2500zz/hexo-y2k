# hexo-theme-y2k · 千禧年中文个人主页

让你的 Hexo 博客看起来像 2000 年前后的中文个人主页，比如“小雨的星空小屋”：12px 宋体、760 宽的表格排版、艺术字标题、跑马灯欢迎词、LED 访客计数器、88×31 友情链接按钮、Win98 斜面按钮、留言本，还有点了才响的方波“MIDI”背景音乐。

这些味道来自当年的技术限制，不是贴上去的复古贴纸：800×600 屏幕、56K 拨号、IE5、FrontPage 和网页三剑客。外观照当年的样子做，实现换成今天浏览器能用的写法。

## 特性

- **五套配色**：`stars` 星空（默认）、`pink` 粉色少女、`green` 清新绿、`hacker` 黑客黑、`classic` 经典灰（Win98）
- **当年的版式**：首页左中右三栏（也可改成两栏），文章页左栏加正文；固定 760/778 宽；1px 细线表格；“您现在的位置：首页 > 栏目 > 正文”
- **侧栏挂件**：站长档案、访客计数器、背景音乐、站内搜索、栏目分类、最近更新（闪烁 NEW!）、文章归档、标签、友情链接按钮墙、网站联盟、小调查、“建设中”黄黑条纹
- **文章页**：【字号：大 中 小】（会记住访客的选择）、上一篇/下一篇、【打印本页】【返回顶部】【返回上页】、文末版权声明；代码框做成凹陷的白色输入框，配色学 EditPlus
- **特殊页面**：栏目总览（论坛版块表样式）、标签总览、友情链接、留言本、IE 风格的 404 错误页、站内搜索
- **站内搜索**：构建时生成 `search.json`，在浏览器里检索，不用任何外部服务
- **留言**：接上配套的 [y2k-server](../../server/) 后所有人可见，带反垃圾、站长审核和站长回复；不接后端时是仿当年留言本的本机留言（只有访客自己能看到）；也能接 giscus 或 utterances
- **计数器**：接上 y2k-server 后是真实的全站访问量、文章阅读次数、今日访问和当前在线人数；不接后端时是本机计数；也能接不蒜子（busuanzi）
- **小调查**：接上 y2k-server 后每个 IP 一票、所有人共享结果；否则只记在本机
- **可选特效**：鼠标跟随星星、标题栏滚动、飘雪（黑客黑配色下飘 0 和 1）、Win98 欢迎窗口、漂浮广告、千年虫“19126 年”彩蛋、“穿越”到 2000 年的日期（附农历）、彩色滚动条

现代底线：不自动播放声音，不禁用右键，不弹真窗口；系统开了“减少动态效果”时所有动画都会停；触屏设备不启用鼠标跟随；窄于 800px 的屏幕上各栏会堆叠起来，手机上先显示正文，不会出现横向滚动。

## 安装

需要 Hexo 7 或更新版本（在 Hexo 8.1 上测试过），以及 EJS 渲染器：

```bash
npm install hexo-renderer-ejs --save   # 用 hexo init 建的站点一般已经装了
```

把本目录复制到博客的 `themes/y2k`，然后改站点的 `_config.yml`：

```yaml
theme: y2k
language: zh-CN
```

建议同时加上这几项：

```yaml
# 没写 updated 的文章，更新时间按发表时间算（不然页脚会显示文件修改时间）
updated_option: 'date'

# 代码高亮：主题的配色认的是 hljs: false 时输出的类名
syntax_highlighter: highlight.js
highlight:
  line_number: true
  hljs: false

# 中文栏目名映射成英文网址
category_map:
  文学天地: wenxue
  电脑技巧: diannao
```

## 建几个特殊页面

导航栏默认会链接到这些页面，用 `hexo new page` 建好后，在 front-matter 里加 `type`：

| 页面 | 文件 | front-matter |
| --- | --- | --- |
| 关于我 | `source/about/index.md` | 普通页面，不用加 |
| 栏目分类 | `source/categories/index.md` | `type: categories` |
| 文章标签 | `source/tags/index.md` | `type: tags` |
| 友情链接 | `source/links/index.md` | `type: links` |
| 留言本 | `source/guestbook/index.md` | `type: guestbook` |
| 404 | `source/404.md` | `type: 404` 和 `permalink: /404.html` |

站内搜索页 `/search/` 由主题自动生成，不用建。

## 后端（可选）

留言本、计数器、在线人数、小调查要让所有人共享，需要一个后端。本仓库的 [`server/`](../../server/) 就是配套的 y2k-server，部署方法见它的 README。部署好以后，在 `_config.y2k.yml` 里填上地址：

```yaml
backend:
  url: https://y2k-api.example.com
```

`comments.provider` 和 `counter.provider` 默认是 `auto`，填了地址就自动改用后端，不填就是纯静态模式，主题照样能部署到任何静态空间。

后端连不上时，页面会显示"服务器忙，请稍后再试"，其他部分不受影响。

## 配置

所有选项和默认值都写在主题的 `_config.yml` 里，每一项都有中文注释。别直接改那个文件，在**站点根目录**新建 `_config.y2k.yml`，只写你想改的项，Hexo 会自动合并：

```yaml
scheme: pink

profile:
  nickname: 小雨
  oicq: 12345678
  email: xiaoyu@example.net

menu:
  首　页: /
  关于我: /about/
  文学天地: /categories/wenxue/
  留言本: /guestbook/

links:
  - name: 千禧在线
    url: https://example.com/
    desc: 免费邮箱、免费主页
    button: split-a
    text: [千禧, 在线]

effects:
  era_year: 2000      # 页头日期“穿越”到 2000 年
  title_scroll: true
```

> Hexo 合并配置时，数组会被“取并集”，对象会被“合并键”。为了让你真正能**替换**列表，主题对下面这些选项做了特殊处理：你写了就整个替换默认值，不会和默认值混在一起。
> `menu`、`topbar.links`、`footer.links`、`marquee.items`、`sidebar.left / right / two_column`、`profile.items`、`links`、`site_button.text`、`poll.options`、`poll.votes`、`comments.local.guestbook_seed`

常用的几项：

| 选项 | 作用 |
| --- | --- |
| `scheme` | 配色方案 |
| `layout.width` / `layout.index_columns` | 主体宽度（760 / 778），首页三栏还是两栏 |
| `sidebar.left` / `right` / `two_column` | 各栏显示哪些挂件、什么顺序 |
| `notice` | 首页第一页顶部的寄语框 |
| `backend.url` | y2k-server 地址，留空为纯静态模式 |
| `counter.provider` | `auto`（默认）/ `backend` / `local` / `busuanzi` |
| `comments.provider` | `auto`（默认）/ `backend` / `local` / `giscus` / `utterances` / `none` |
| `bgm.src` | 留空用内置合成旋律，填 mp3/ogg 地址就播放你的文件 |
| `post.font_size` / `post.indent` | 正文默认字号、段首空两格 |
| `header.wordart_font_css` | 给艺术字标题加载网络字体（可选，异步加载不卡页面） |

单篇文章的 front-matter：`comments: false` 关掉留言，`comment_key: 旧路径` 在改了永久链接后保留原来的留言和阅读数，`copyright: false` 不显示版权声明，`sticky: 1` 置顶（需要 hexo-generator-index 2.0 以上），`author: 某某` 改署名。

## 文件结构

```
themes/y2k
├── _config.yml            主题配置与默认值
├── layout/                EJS 模板（index / post / page / archive / category / tag / search）
│   └── _partial/          页头、页脚、文章、列表、分页、留言、特殊页面
│       └── widget/        侧栏挂件
├── scripts/               Hexo 扩展：模板 helper、搜索索引生成器、配置合并修正
├── lib/util.js            scripts 共用的小函数
└── source/
    ├── css/y2k.css        全部样式（配色用 CSS 变量切换）
    └── js/y2k.js          计数器、农历、背景音乐、留言本、调查、搜索、各种特效
```

## 关于素材

主题里没有任何外部图片：星空背景、像素头像、88×31 按钮、“建设中”条纹、404 图标都是用 CSS 或内联 SVG 画的；背景音乐是原创的五声音阶小调，由 Web Audio 实时合成。
