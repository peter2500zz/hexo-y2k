/* global hexo */
'use strict';

// 站内搜索：生成 /search.json（文章索引）和 /search/ 页面，检索在浏览器里完成，不依赖外部服务。

var stripHTML = require('../lib/util').stripHTML;

hexo.extend.generator.register('y2k_search', function (locals) {
  var cfg = this.theme.config.search || {};
  if (cfg.enable === false) return [];
  var len = cfg.content_length || 3000;
  var urlFor = hexo.extend.helper.get('url_for').bind(hexo);

  var index = locals.posts.sort('-date').filter(function (p) { return p.published !== false; }).map(function (p) {
    return {
      title: p.title || '',
      url: urlFor(p.path),
      date: p.date.format('YYYY-MM-DD'),
      categories: p.categories.map(function (c) { return c.name; }),
      tags: p.tags.map(function (t) { return t.name; }),
      text: stripHTML(p.content).slice(0, len)
    };
  });

  return [
    { path: 'search.json', data: JSON.stringify(index) },
    { path: 'search/index.html', layout: ['search'], data: { title: '站内搜索', type: 'search', __search: true } }
  ];
});
