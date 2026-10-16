/* global hexo */
'use strict';

// Hexo 把 _config.y2k.yml（或站点 theme_config）深度合并进主题 _config.yml 时，
// 数组会被"并集"、对象会被"合并键"，于是用户没法真正替换菜单、侧栏、友情链接这类列表。
// 这里在生成前把下列选项改成"用户写了就整个替换"。

var REPLACE = [
  'menu',
  'topbar.links',
  'footer.links',
  'marquee.items',
  'sidebar.left',
  'sidebar.right',
  'sidebar.two_column',
  'profile.items',
  'links',
  'site_button.text',
  'poll.options',
  'poll.votes',
  'comments.local.guestbook_seed'
];

function get(obj, path) {
  return path.split('.').reduce(function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }, obj);
}

function set(obj, path, value) {
  var keys = path.split('.'), last = keys.pop();
  var target = keys.reduce(function (o, k) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

hexo.extend.filter.register('before_generate', function () {
  var user = this.config.theme_config;
  if (!user || !this.theme.config) return;
  var theme = this.theme.config;
  REPLACE.forEach(function (path) {
    var v = get(user, path);
    if (v !== undefined) set(theme, path, v);
  });
}, 1);
