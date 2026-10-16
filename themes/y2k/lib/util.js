'use strict';

// 主题脚本共用的小函数（放在 scripts/ 之外，免得被 Hexo 当插件重复加载）

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function stripHTML(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<figure class="highlight[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExternal(url) {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^mailto:/i.test(url);
}

module.exports = { esc: esc, stripHTML: stripHTML, isExternal: isExternal };
