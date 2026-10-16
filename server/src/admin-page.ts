// 站长管理中心：后端自带的审核页面（/admin），调用 /api/admin/*

import { Hono } from 'hono';
import type { AppEnv } from './types.ts';

const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>站长管理中心</title>
<style>
:root { color-scheme: light; }
html, body { margin: 0; padding: 0; background: #008080; color: #000; }
body, td, th, input, select, textarea, button { font-family: SimSun, "宋体", "Songti SC", "Noto Serif CJK SC", serif; font-size: 12px; }
td { line-height: 18px; }
a { color: #0000FF; }
.page { width: 960px; max-width: calc(100% - 16px); margin: 12px auto; }
.win { background: #C0C0C0; padding: 3px; box-shadow: inset -1px -1px #0A0A0A, inset 1px 1px #DFDFDF, inset -2px -2px #808080, inset 2px 2px #FFFFFF; }
.title { background: linear-gradient(90deg, #000080, #1084D0); color: #FFF; font: bold 12px Tahoma, SimSun, sans-serif; padding: 3px 6px; display: flex; justify-content: space-between; align-items: center; }
.body { padding: 8px; }
.btn { background: #C0C0C0; color: #000; border: 0; padding: 2px 8px; cursor: pointer; margin: 1px;
  box-shadow: inset -1px -1px #0A0A0A, inset 1px 1px #FFFFFF, inset -2px -2px #808080, inset 2px 2px #DFDFDF; }
.btn:active, .btn.on { box-shadow: inset -1px -1px #FFFFFF, inset 1px 1px #0A0A0A, inset -2px -2px #DFDFDF, inset 2px 2px #808080; }
.btn.on { font-weight: bold; }
.field { background: #FFF; border: 0; padding: 2px 3px; box-shadow: inset -1px -1px #FFFFFF, inset 1px 1px #808080, inset -2px -2px #DFDFDF, inset 2px 2px #0A0A0A; }
.thin { border-collapse: separate; border-spacing: 1px; background: #808080; width: 100%; }
.thin th { background: #000080; color: #FFF; padding: 3px 4px; white-space: nowrap; }
.thin td { background: #FFF; padding: 3px 4px; vertical-align: top; }
.thin tr:hover td { background: #FFFFCC; }
.msg { white-space: pre-wrap; word-break: break-word; }
.reply { margin-top: 4px; padding: 2px 4px; border: 1px dashed #808080; background: #F4F4F4; color: #000080; white-space: pre-wrap; }
.muted { color: #555; }
.tag { display: inline-block; padding: 0 3px; margin: 1px; background: #FFFFCC; border: 1px solid #C0A000; font-size: 11px; white-space: nowrap; }
.st-approved { color: #008000; } .st-pending { color: #C06000; } .st-spam { color: #CC0000; }
.bar { margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.status { margin-top: 6px; padding: 2px 4px; box-shadow: inset 1px 1px #808080, inset -1px -1px #FFFFFF; }
[hidden] { display: none !important; }
@media (max-width: 700px) { .thin .opt-col { display: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="win" id="login">
    <div class="title"><span>站长管理中心 - 登录</span></div>
    <div class="body" align="center">
      <p>请输入管理口令（ADMIN_TOKEN）：</p>
      <p><input type="password" id="token" class="field" size="30" autocomplete="current-password"> <button class="btn" id="loginBtn">登　录</button></p>
      <p class="muted">口令只保存在本窗口，关闭浏览器后需要重新登录。</p>
    </div>
  </div>

  <div class="win" id="main" hidden>
    <div class="title"><span>站长管理中心</span><span id="summary"></span></div>
    <div class="body">
      <div class="bar" id="tabs">
        <button class="btn" data-tab="pending">待审核</button>
        <button class="btn" data-tab="approved">已通过</button>
        <button class="btn" data-tab="spam">垃圾箱</button>
        <button class="btn" data-tab="">全部留言</button>
        <button class="btn" data-tab="bans">封禁名单</button>
        <span style="flex:1"></span>
        <input type="text" id="q" class="field" size="16" placeholder="搜索昵称/内容/位置"> <button class="btn" id="searchBtn">搜索</button>
        <button class="btn" id="logoutBtn">退出</button>
      </div>
      <div id="commentsView">
        <div class="bar">
          <label><input type="checkbox" id="checkAll"> 全选</label>
          <button class="btn" data-bulk="approved">通过所选</button>
          <button class="btn" data-bulk="spam">标为垃圾</button>
          <button class="btn" data-bulk="delete">删除所选</button>
        </div>
        <table class="thin">
          <thead><tr><th width="20"></th><th width="110">时间</th><th width="120">位置</th><th width="90">昵称</th><th>留言</th><th class="opt-col" width="110">判定</th><th width="170">操作</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <div class="bar" id="pager"></div>
      </div>
      <div id="bansView" hidden>
        <table class="thin">
          <thead><tr><th>IP 哈希</th><th>备注</th><th width="130">时间</th><th width="60">操作</th></tr></thead>
          <tbody id="banRows"></tbody>
        </table>
      </div>
      <div class="status" id="status">就绪</div>
    </div>
  </div>
</div>
<script src="/admin/app.js"></script>
</body>
</html>`;

const JS = `(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { tab: 'pending', page: 1, size: 20, q: '', siteUrl: '', items: [] };
  var REASONS = {
    'banned': '已封禁', 'duplicate-content': '重复内容', 'bot-ua': '机器 UA', 'no-timing': '无填写时长', 'too-fast': '填写太快',
    'forbidden-word': '违禁词', 'no-cjk': '不含汉字', 'akismet': 'Akismet 判为垃圾', 'akismet-error': 'Akismet 无响应',
    'captcha-unavailable': '验证服务无响应'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() { try { return sessionStorage.getItem('y2k-admin') || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? sessionStorage.setItem('y2k-admin', t) : sessionStorage.removeItem('y2k-admin'); } catch (e) {} }
  function status(t) { $('status').textContent = t; }
  function fmt(ms) { var d = new Date(ms), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function reason(r) { var m = /^links:(\\d+)$/.exec(r); return m ? '链接 ' + m[1] + ' 个' : (REASONS[r] || r); }

  function api(path, opts) {
    opts = opts || {};
    return fetch('/api/admin' + path, {
      method: opts.method || 'GET',
      headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) { setToken(''); show(false); }
        if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
        return d;
      });
    });
  }

  function show(loggedIn) { $('login').hidden = loggedIn; $('main').hidden = !loggedIn; }

  function loadSummary() {
    return api('/summary').then(function (s) {
      state.siteUrl = s.siteUrl || '';
      var c = s.comments;
      $('summary').textContent = '审核模式：' + ({ auto: '自动', all: '全部人工审核', off: '不审核' }[s.moderation] || s.moderation) + '　网站总访问：' + s.sitePv;
      var labels = { pending: '待审核 (' + c.pending + ')', approved: '已通过 (' + c.approved + ')', spam: '垃圾箱 (' + c.spam + ')', bans: '封禁名单 (' + s.bans + ')' };
      Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
        var t = b.getAttribute('data-tab'); if (labels[t]) b.textContent = labels[t];
        b.className = 'btn' + (t === state.tab ? ' on' : '');
      });
    });
  }

  function where(key) {
    var label = key === 'guestbook' ? '留言本' : key;
    if (!state.siteUrl) return esc(label);
    return '<a href="' + esc(state.siteUrl + '/' + (key === 'guestbook' ? 'guestbook/' : key)) + '" target="_blank" rel="noopener">' + esc(label) + '</a>';
  }

  function render() {
    $('rows').innerHTML = state.items.length ? state.items.map(function (it) {
      return '<tr data-id="' + it.id + '">' +
        '<td><input type="checkbox" class="pick" value="' + it.id + '"></td>' +
        '<td>' + esc(fmt(it.createdAt)) + '<br><span class="st-' + esc(it.status) + '">' + ({ approved: '已通过', pending: '待审核', spam: '垃圾' }[it.status] || esc(it.status)) + '</span></td>' +
        '<td>' + where(it.key) + '</td>' +
        '<td>' + esc(it.face) + ' <b>' + esc(it.name) + '</b>' + (it.oicq ? '<br><span class="muted">OICQ：' + esc(it.oicq) + '</span>' : '') + '</td>' +
        '<td><div class="msg">' + esc(it.message) + '</div>' + (it.reply ? '<div class="reply">站长回复：' + esc(it.reply) + '</div>' : '') + '</td>' +
        '<td class="opt-col">' + (it.reasons.length ? it.reasons.map(function (r) { return '<span class="tag">' + esc(reason(r)) + '</span>'; }).join('') : '<span class="muted">—</span>') +
          '<br><span class="muted" title="' + esc(it.ua) + '">IP#' + esc(it.ipHash.slice(0, 8)) + '</span></td>' +
        '<td>' + (it.status !== 'approved' ? '<button class="btn" data-act="approved">通过</button>' : '') +
          (it.status !== 'spam' ? '<button class="btn" data-act="spam">垃圾</button>' : '') +
          '<button class="btn" data-act="reply">回复</button><button class="btn" data-act="delete">删除</button><button class="btn" data-act="ban">封 IP</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7" align="center" class="muted">这里没有留言。</td></tr>';
    $('checkAll').checked = false;
  }

  function loadComments() {
    status('正在读取……');
    var qs = '?page=' + state.page + '&size=' + state.size + (state.tab ? '&status=' + state.tab : '') + (state.q ? '&q=' + encodeURIComponent(state.q) : '');
    return api('/comments' + qs).then(function (d) {
      state.items = d.items; render();
      var pages = Math.max(1, Math.ceil(d.total / d.size));
      $('pager').innerHTML = '共 ' + d.total + ' 条　第 ' + d.page + '/' + pages + ' 页　' +
        (d.page > 1 ? '<button class="btn" data-page="' + (d.page - 1) + '">上一页</button>' : '') +
        (d.page < pages ? '<button class="btn" data-page="' + (d.page + 1) + '">下一页</button>' : '');
      status('就绪');
    });
  }

  function loadBans() {
    return api('/bans').then(function (d) {
      $('banRows').innerHTML = d.items.length ? d.items.map(function (b) {
        return '<tr><td><code>' + esc(b.ipHash.slice(0, 16)) + '…</code></td><td>' + esc(b.note) + '</td><td>' + esc(fmt(b.createdAt)) + '</td>' +
          '<td><button class="btn" data-unban="' + esc(b.ipHash) + '">解封</button></td></tr>';
      }).join('') : '<tr><td colspan="4" align="center" class="muted">没有封禁的 IP。</td></tr>';
      status('就绪');
    });
  }

  function refresh() {
    var bans = state.tab === 'bans';
    $('commentsView').hidden = bans; $('bansView').hidden = !bans;
    return loadSummary().then(bans ? loadBans : loadComments).catch(function (e) { status('出错了：' + e.message); });
  }

  function act(id, action) {
    var it = state.items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    var p;
    if (action === 'approved' || action === 'spam') p = api('/comments/' + id, { method: 'POST', body: { status: action } });
    else if (action === 'delete') { if (!confirm('确定要删除这条留言吗？')) return; p = api('/comments/' + id, { method: 'DELETE' }); }
    else if (action === 'reply') {
      var text = prompt('站长回复（留空则删除回复）：', it.reply || ''); if (text === null) return;
      p = api('/comments/' + id, { method: 'POST', body: { reply: text, status: it.status === 'pending' ? 'approved' : undefined } });
    } else if (action === 'ban') {
      if (!confirm('封禁这位访客的 IP，并把他所有待审核的留言丢进垃圾箱？')) return;
      p = api('/bans', { method: 'POST', body: { ipHash: it.ipHash, note: it.name + '：' + it.message.slice(0, 20), spamPending: true } });
    }
    p.then(function () { status('操作成功'); return refresh(); }).catch(function (e) { alert('操作失败：' + e.message); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'loginBtn') {
      setToken($('token').value.trim());
      api('/summary').then(function () { show(true); refresh(); }).catch(function (err) { alert(err.message); });
    } else if (t.id === 'logoutBtn') { setToken(''); show(false); }
    else if (t.id === 'searchBtn') { state.q = $('q').value.trim(); state.page = 1; refresh(); }
    else if (t.hasAttribute('data-tab')) { state.tab = t.getAttribute('data-tab'); state.page = 1; refresh(); }
    else if (t.hasAttribute('data-page')) { state.page = parseInt(t.getAttribute('data-page'), 10); refresh(); }
    else if (t.hasAttribute('data-act')) { act(parseInt(t.closest('tr').getAttribute('data-id'), 10), t.getAttribute('data-act')); }
    else if (t.hasAttribute('data-unban')) {
      api('/bans/' + t.getAttribute('data-unban'), { method: 'DELETE' }).then(refresh).catch(function (err) { alert(err.message); });
    } else if (t.hasAttribute('data-bulk')) {
      var ids = Array.prototype.map.call(document.querySelectorAll('.pick:checked'), function (c) { return parseInt(c.value, 10); });
      if (!ids.length) { alert('请先选择留言！'); return; }
      var action = t.getAttribute('data-bulk');
      if (action === 'delete' && !confirm('确定要删除选中的 ' + ids.length + ' 条留言吗？')) return;
      api('/comments-bulk', { method: 'POST', body: { ids: ids, action: action } }).then(refresh).catch(function (err) { alert(err.message); });
    }
  });
  $('checkAll').addEventListener('change', function () {
    var on = this.checked;
    Array.prototype.forEach.call(document.querySelectorAll('.pick'), function (c) { c.checked = on; });
  });
  $('token').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('loginBtn').click(); });
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('searchBtn').click(); });

  if (token()) api('/summary').then(function () { show(true); refresh(); }).catch(function () { show(false); });
})();
`;

export function adminPageRoutes() {
  const app = new Hono<AppEnv>();
  const headers = {
    'Content-Security-Policy': CSP,
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache'
  };
  app.get('/', c => c.html(HTML, 200, headers));
  app.get('/app.js', c => c.body(JS, 200, { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' }));
  return app;
}
