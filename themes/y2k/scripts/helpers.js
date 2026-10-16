/* global hexo */
'use strict';

// 模板里用到的小工具。Hexo 会自动加载主题 scripts/ 目录下的文件。

var cache = {};
hexo.on('generateBefore', function () { cache = {}; });

var util = require('../lib/util');
var esc = util.esc, stripHTML = util.stripHTML, isExternal = util.isExternal;

function latestPost(site) {
  if (!('latest' in cache)) cache.latest = site.posts.sort('-date').first() || null;
  return cache.latest;
}

// 分页地址：第 1 页就是 base，其余是 base/page/N/
hexo.extend.helper.register('y2k_page_url', function (n) {
  var base = this.page.base || '';
  var dir = this.config.pagination_dir || 'page';
  return this.url_for(n <= 1 ? base : base + dir + '/' + n + '/');
});

// 菜单、页脚等配置里的地址：站内路径走 url_for，外链、mailto 和 #锚点原样
function href(ctx, url) {
  url = String(url == null ? '' : url);
  if (!url || url.charAt(0) === '#' || isExternal(url)) return url;
  return ctx.url_for(url);
}
hexo.extend.helper.register('y2k_href', function (url) { return href(this, url); });

hexo.extend.helper.register('y2k_latest_post', function () {
  return latestPost(this.site);
});

// 与最新一篇相差 new_days 天以内的文章算 NEW!
hexo.extend.helper.register('y2k_is_new', function (post) {
  var days = (this.theme.recent && this.theme.recent.new_days) || 0;
  var latest = latestPost(this.site);
  if (!days || !latest || !post || !post.date) return false;
  return latest.date.diff(post.date, 'days', true) < days;
});

hexo.extend.helper.register('y2k_excerpt', function (post) {
  var len = (this.theme.post && this.theme.post.excerpt_length) || 150;
  if (post.excerpt) return post.excerpt;
  var text = stripHTML(post.content);
  if (text.length > len) text = text.slice(0, len) + '……';
  return '<p>' + esc(text) + '</p>';
});

hexo.extend.helper.register('y2k_categories', function (post) {
  return post.categories && post.categories.length ? post.categories.toArray() : [];
});

hexo.extend.helper.register('y2k_tags', function (post) {
  return post.tags && post.tags.length ? post.tags.toArray() : [];
});

// 按年月分组：[{ key: '2000-10', label: '2000年10月', posts: [...] }]
hexo.extend.helper.register('y2k_group_by_month', function (posts) {
  var groups = [], map = {};
  posts.forEach(function (p) {
    var key = p.date.format('YYYY-MM');
    if (!map[key]) {
      map[key] = { key: key, year: p.date.format('YYYY'), month: p.date.format('MM'), label: p.date.format('YYYY年M月'), posts: [] };
      groups.push(map[key]);
    }
    map[key].posts.push(p);
  });
  return groups;
});

// 侧栏归档：全部文章按月计数（缓存，避免每页都重新排序）
hexo.extend.helper.register('y2k_month_list', function () {
  if (!cache.months) {
    var list = [], map = {};
    this.site.posts.sort('-date').forEach(function (p) {
      var key = p.date.format('YYYY-MM');
      if (!map[key]) { map[key] = { year: p.date.format('YYYY'), month: p.date.format('MM'), label: p.date.format('YYYY年M月'), count: 0 }; list.push(map[key]); }
      map[key].count++;
    });
    cache.months = list;
  }
  return cache.months;
});

// 版权年份：since 与最新文章年份
hexo.extend.helper.register('y2k_copyright_years', function () {
  var since = this.theme.footer && this.theme.footer.since;
  var latest = latestPost(this.site);
  var last = latest ? parseInt(latest.date.format('YYYY'), 10) : new Date().getFullYear();
  if (!since) return String(last);
  since = parseInt(since, 10);
  return since >= last ? String(since) : since + '-' + last;
});

// 88×31 友情链接按钮
hexo.extend.helper.register('y2k_button', function (item, link) {
  item = item || {};
  var url = link || item.url || '#';
  var attrs = ' href="' + esc(href(this, url)) + '" title="' + esc(item.name || '') + '"';
  if (isExternal(url) && !/^mailto:/i.test(url)) attrs += ' target="_blank" rel="noopener"';
  if (item.image) {
    return '<a class="b88 b88-img"' + attrs + '><img src="' + esc(this.url_for(item.image)) + '" width="88" height="31" alt="' + esc(item.name || '') + '"></a>';
  }
  var style = item.button || 'grad';
  var text = item.text == null ? [item.name || ''] : (Array.isArray(item.text) ? item.text : [item.text]);
  if (/^split/.test(style)) {
    if (text.length < 2) { var t = String(text[0] || ''); var h = Math.ceil(t.length / 2); text = [t.slice(0, h), t.slice(h)]; }
    return '<a class="b88 b88-split b88-' + esc(style) + '"' + attrs + '><i>' + esc(text[0]) + '</i><i>' + esc(text[1]) + '</i></a>';
  }
  return '<a class="b88 b88-' + esc(style) + '"' + attrs + '>' + esc(text.join(' ')) + '</a>';
});

// 浏览器标签上的标题
hexo.extend.helper.register('y2k_title', function () {
  var page = this.page, site = this.config.title, t = page.title;
  if (this.is_home()) return String(this.theme.home_title || '{title}').replace('{title}', site);
  if (this.is_category()) t = '栏目：' + page.category;
  else if (this.is_tag()) t = '标签：' + page.tag;
  else if (this.is_month()) t = page.year + '年' + page.month + '月 文章目录';
  else if (this.is_year()) t = page.year + '年 文章目录';
  else if (this.is_archive()) t = '文章目录';
  if (page.current > 1) t += '（第 ' + page.current + ' 页）';
  return t ? t + ' - ' + site : site;
});

// 安全地把对象写进 <script>
hexo.extend.helper.register('y2k_json', function (obj) {
  return JSON.stringify(obj == null ? null : obj)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
});

hexo.extend.helper.register('y2k_strip', stripHTML);

// 后端地址（去掉结尾的 /），没配置时为空串
function backendUrl(theme) {
  return String((theme.backend && theme.backend.url) || '').trim().replace(/\/+$/, '');
}
hexo.extend.helper.register('y2k_backend', function () { return backendUrl(this.theme); });

// comments / counter 的实际提供方：auto 时有后端就用 backend，否则 local
hexo.extend.helper.register('y2k_provider', function (kind) {
  var p = String((this.theme[kind] && this.theme[kind].provider) || 'auto');
  if (p === 'auto') return backendUrl(this.theme) ? 'backend' : 'local';
  return p;
});

// 留言和计数用的页面键：front-matter 的 comment_key 优先，否则用路径（去掉 index.html）
hexo.extend.helper.register('y2k_key', function (p) {
  p = p || this.page;
  if (p.comment_key) return String(p.comment_key);
  return String(p.path || '').replace(/^\/+/, '').replace(/index\.html$/, '');
});
