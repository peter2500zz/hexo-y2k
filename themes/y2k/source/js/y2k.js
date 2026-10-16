/* hexo-theme-y2k —— 页面上的小特效与小功能
 * 写法故意保持 2000 年代的朴素 JavaScript 味道，但只用今天浏览器都支持的 API。
 * 配置由模板写进 window.Y2K。
 */
(function () {
  'use strict';

  var Y = window.Y2K || {};
  var doc = document;
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function store(key, val) {
    try {
      if (arguments.length > 1) { localStorage.setItem(key, val); return val; }
      return localStorage.getItem(key);
    } catch (e) { return null; }
  }
  function now() {
    var d = new Date();
    if (Y.eraYear) d.setFullYear(Y.eraYear);
    return d;
  }
  /** 毫秒时间戳 → "2000-10-16 14:29"（开了 era_year 时年份也"穿越"） */
  function fmtTime(ms) {
    var d = new Date(ms);
    if (Y.eraYear) d.setFullYear(Y.eraYear);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function keyUrl(key) { return (Y.root || '/') + (key === 'guestbook' ? 'guestbook/' : key); }
  var T0 = Date.now();

  // ---------- 后端（y2k-server），可能跨域 ----------
  var BE = Y.backend && Y.backend.url ? Y.backend : null;
  function api(path, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, BE.timeout || 8000) : 0;
    return fetch(BE.url + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || 'HTTP ' + r.status); e.server = !!d.error; throw e; }
        return d;
      });
    }, function (e) { clearTimeout(timer); throw e; });
  }
  var beConfig = null;
  function backendConfig() {
    if (!beConfig) beConfig = api('/api/config').catch(function () { beConfig = null; return { moderation: 'auto', captcha: null }; });
    return beConfig;
  }

  // 跑马灯不受 CSS animation 控制，"减少动态效果"时用脚本停下
  if (REDUCED) $$('marquee').forEach(function (m) { if (m.stop) m.stop(); });

  // ---------- 今天的日期（可"穿越"到 2000 年），附农历 ----------
  (function () {
    var el = $('#y2k-today'); if (!el) return;
    var d = now();
    var s = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + '日一二三四五六'.charAt(d.getDay());
    try {
      var parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(d);
      var get = function (t) { var p = parts.filter(function (x) { return x.type === t; })[0]; return p ? p.value : ''; };
      var dn = parseInt(get('day'), 10);
      var days = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五',
                  '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
      if (get('yearName') && dn) s += '　农历' + get('yearName') + '年' + get('month') + days[dn - 1];
    } catch (e) {}
    el.textContent = s;
  })();

  // ---------- 千年虫彩蛋："19" + getYear() ----------
  (function () {
    var el = $('#y2k-updated'); if (!el || !Y.y2kBug) return;
    var y = parseInt(el.getAttribute('data-y'), 10);
    el.textContent = '本页最后更新于：19' + new Date(y, 0, 1).getYear() + '年' + el.getAttribute('data-md');
  })();

  // ---------- 访客计数器 ----------
  var digits = (Y.counter && Y.counter.digits) || 6;
  function renderCounter(n) {
    var s = String(n); while (s.length < digits) s = '0' + s;
    $$('[data-y2k-counter]').forEach(function (el) {
      el.innerHTML = s.split('').map(function (d) { return '<b>' + esc(d) + '</b>'; }).join('');
    });
  }
  function fillStat(sel, n) {
    $$(sel).forEach(function (el) { el.hidden = false; var v = el.querySelector('span'); if (v) v.textContent = n; });
  }
  (function () {
    var c = Y.counter || {};
    if (c.provider === 'backend' && BE) {
      api('/api/hit', { path: Y.pageKey || '' }).then(function (d) {
        renderCounter(d.site.pv);
        fillStat('[data-y2k-today]', d.site.todayPv);
        fillStat('[data-y2k-online]', d.online);
        if (d.page && d.page.pv) fillStat('[data-y2k-pagepv]', d.page.pv);
      }).catch(function () { /* 计数器失灵时保持全零，和当年图片裂了差不多 */ });
      return;
    }
    if (c.provider === 'busuanzi') {
      // 不蒜子把数字填进隐藏的 span，这里搬到 LED 计数器上
      var site = $('#busuanzi_value_site_pv'), page = $('#busuanzi_value_page_pv');
      var sync = function () {
        var n = site && parseInt(site.textContent.replace(/\D/g, ''), 10);
        if (n) renderCounter(n);
        var p = page && parseInt(page.textContent.replace(/\D/g, ''), 10);
        if (p) $$('[data-y2k-pagepv]').forEach(function (el) { el.hidden = false; el.querySelector('span').textContent = p; });
      };
      if (window.MutationObserver) {
        var mo = new MutationObserver(sync);
        if (site) mo.observe(site, { childList: true, characterData: true, subtree: true });
        if (page) mo.observe(page, { childList: true, characterData: true, subtree: true });
      }
      return;
    }
    // 本机计数：每次打开页面 +1，和当年一刷新就涨的计数器一样
    var v = (parseInt(store('y2k-visits'), 10) || 0) + 1;
    store('y2k-visits', v);
    renderCounter((c.base || 0) + v);
  })();

  // ---------- 欢迎窗口（同一次浏览只弹一次） ----------
  (function () {
    var w = $('#y2k-welcome'); if (!w || !Y.welcome) return;
    var seen = false;
    try { seen = sessionStorage.getItem('y2k-welcomed') === '1'; sessionStorage.setItem('y2k-welcomed', '1'); } catch (e) {}
    if (!seen) w.hidden = false;
  })();

  // ---------- 背景音乐：方波 + 三角波合成的原创旋律，点了才响 ----------
  var BGM = (function () {
    var F = { A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, F2: 87.31, G2: 98, A2: 110, C3: 130.81 };
    // 《星之歌》：原创五声音阶小调，旋律与低音都是 32 拍，循环才对得上
    var MELODY = [['E5', 1], ['G5', 1], ['A5', 2], ['G5', 1], ['E5', 1], ['D5', 2], ['C5', 1], ['D5', 1], ['E5', 1], ['G5', 1], ['D5', 4],
                  ['E5', 1], ['G5', 1], ['C6', 2], ['A5', 1], ['G5', 1], ['E5', 2], ['D5', 1], ['E5', 1], ['D5', 1], ['A4', 1], ['C5', 4]];
    var BASS = [['C3', 4], ['A2', 4], ['F2', 4], ['G2', 4], ['C3', 4], ['A2', 4], ['G2', 4], ['C3', 4]];
    var BEAT = 0.26, ctx = null, timer = null, audio = null;
    function voice(seq, type, vol, t0) {
      var t = t0;
      seq.forEach(function (n) {
        var o = ctx.createOscillator(), g = ctx.createGain(), len = n[1] * BEAT;
        o.type = type; o.frequency.value = F[n[0]];
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
        g.gain.setValueAtTime(vol, t + len * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + len * 0.95);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + len); t += len;
      });
      return t - t0;
    }
    function loop() {
      var t0 = ctx.currentTime + 0.05, d = voice(MELODY, 'square', 0.05, t0);
      voice(BASS, 'triangle', 0.12, t0);
      timer = setTimeout(loop, d * 1000);
    }
    function label(text) { $$('[data-y2k="bgm"]').forEach(function (b) { b.textContent = text; }); }
    function playing() { return !!ctx || !!(audio && !audio.paused); }
    return {
      toggle: function () {
        if (Y.bgm && Y.bgm.src) {
          if (!audio) { audio = new Audio(Y.bgm.src); audio.loop = true; }
          if (audio.paused) { audio.play().then(function () { label('停止'); }, function () { alert('对不起，背景音乐加载失败！'); }); }
          else { audio.pause(); label('播放'); }
          return;
        }
        if (playing()) { clearTimeout(timer); ctx.close(); ctx = null; label('播放'); return; }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { alert('您的浏览器不支持背景音乐，请升级到最新版本！'); return; }
        ctx = new AC(); loop(); label('停止');
      }
    };
  })();

  // ---------- 文章字号【大 中 小】 ----------
  (function () {
    var body = $('#y2k-post-body'); if (!body) return;
    function apply(fs) {
      body.className = body.className.replace(/\bfs\d+\b/, '') + ' fs' + fs;
      body.className = body.className.replace(/\s+/g, ' ').trim();
      $$('[data-fs]').forEach(function (a) { a.className = a.getAttribute('data-fs') === String(fs) ? 'on' : ''; });
    }
    var saved = parseInt(store('y2k-fs'), 10);
    apply([12, 14, 16].indexOf(saved) >= 0 ? saved : (Y.fontSize || 12));
    $$('[data-fs]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); var fs = a.getAttribute('data-fs'); store('y2k-fs', fs); apply(fs); });
    });
  })();

  // ---------- 留言本（存在访客本机，必须转义） ----------
  (function () {
    function key(k) { return 'y2k-gb:' + k; }
    function load(k) { try { return JSON.parse(store(key(k)) || '[]') || []; } catch (e) { return []; } }
    function render(k) {
      var list = load(k);
      if (k === 'guestbook' && Y.guestbookSeed) list = list.concat(Y.guestbookSeed);
      $$('.gb-list:not([data-backend])').forEach(function (box) {
        if (box.getAttribute('data-key') !== k) return;
        if (!list.length) { box.innerHTML = '<div class="gb-empty muted">还没有人留言，快来做第一个留言的人吧 ^_^</div>'; return; }
        box.innerHTML = list.map(function (e) {
          return '<div class="gbitem"><div class="h">' + esc(e.face || '^_^') + ' <b>' + esc(e.name) + '</b> 留言于 ' + esc(e.time) +
                 (e.oicq ? '　OICQ：' + esc(e.oicq) : '') + '</div><div class="m">' + esc(e.message).replace(/\n/g, '<br>') + '</div></div>';
        }).join('');
      });
    }
    $$('.gb-form:not([data-backend])').forEach(function (f) {
      var k = f.getAttribute('data-key');
      render(k);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var name = f.n.value.trim(), msg = f.m.value.trim();
        if (!name || !msg) { alert('昵称和留言内容不能为空！'); return; }
        var d = now();
        var entry = { name: name.slice(0, 16), face: f.f.value, oicq: f.q.value.replace(/\D/g, '').slice(0, 12), message: msg.slice(0, 500),
                      time: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) };
        var list = load(k); list.unshift(entry);
        store(key(k), JSON.stringify(list.slice(0, 50)));
        alert('留言成功！谢谢你的支持 ^_^');
        f.reset(); render(k);
      });
    });
  })();

  // ---------- 人机验证（后端配置了才加载，官方脚本按需异步载入） ----------
  var Captcha = (function () {
    var loading = null, widget = null, waiting = null;
    var SRC = {
      turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit',
      recaptcha: 'https://www.google.com/recaptcha/api.js?render='
    };
    function load(cfg) {
      if (loading) return loading;
      loading = new Promise(function (resolve, reject) {
        var s = doc.createElement('script');
        s.src = SRC[cfg.provider] + (cfg.provider === 'recaptcha' ? encodeURIComponent(cfg.siteKey) : '');
        s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { loading = null; reject(new Error('captcha')); };
        doc.head.appendChild(s);
      });
      return loading;
    }
    function token(cfg, box) {
      if (!cfg || !SRC[cfg.provider]) return Promise.resolve('');
      return load(cfg).then(function () {
        if (cfg.provider === 'recaptcha') {
          return new Promise(function (res) { window.grecaptcha.ready(function () { window.grecaptcha.execute(cfg.siteKey, { action: 'comment' }).then(res); }); });
        }
        if (cfg.provider === 'hcaptcha') {
          if (widget == null) widget = window.hcaptcha.render(box, { sitekey: cfg.siteKey, size: 'invisible' });
          else window.hcaptcha.reset(widget);
          return window.hcaptcha.execute(widget, { async: true }).then(function (r) { return r.response; });
        }
        return new Promise(function (res, rej) {
          waiting = { res: res, rej: rej };
          if (widget == null) {
            widget = window.turnstile.render(box, {
              sitekey: cfg.siteKey, appearance: 'interaction-only', execution: 'execute',
              callback: function (t) { if (waiting) waiting.res(t); },
              'error-callback': function () { if (waiting) waiting.rej(new Error('captcha')); }
            });
          } else {
            window.turnstile.reset(widget);
          }
          window.turnstile.execute(widget);
        });
      });
    }
    return { load: load, token: token };
  })();

  // ---------- 留言本（后端版：所有人可见，带站长回复） ----------
  (function () {
    if (!BE) return;
    var NOTES = {
      all: '（所有留言须经站长审核后才会显示，请耐心等待）',
      auto: '（请文明留言，不要灌水哦。部分留言需要站长审核后才会显示）',
      off: '（请文明留言，不要灌水哦）'
    };
    function item(e) {
      return '<div class="gbitem"><div class="h">' + esc(e.face || '^_^') + ' <b>' + esc(e.name) + '</b> 留言于 ' + esc(fmtTime(e.createdAt)) + '</div>' +
             '<div class="m">' + esc(e.message).replace(/\n/g, '<br>') + '</div>' +
             (e.reply ? '<div class="rp"><b>站长回复：</b>' + esc(e.reply).replace(/\n/g, '<br>') + '</div>' : '') + '</div>';
    }
    $$('.gb-form[data-backend]').forEach(function (f) {
      var box = f.parentNode;
      var key = f.getAttribute('data-key');
      var list = box.querySelector('.gb-list'), more = box.querySelector('.gb-more'), note = box.querySelector('.gb-note');
      var size = (Y.comments && Y.comments.pageSize) || 10, page = 0, shown = 0;
      var EMPTY = '<div class="gb-empty muted">还没有人留言，快来做第一个留言的人吧 ^_^</div>';

      function load() {
        page++;
        api('/api/comments?key=' + encodeURIComponent(key) + '&page=' + page + '&size=' + size).then(function (d) {
          if (page === 1) { list.innerHTML = ''; if (note && NOTES[d.moderation]) note.textContent = NOTES[d.moderation]; }
          list.insertAdjacentHTML('beforeend', d.items.map(item).join(''));
          shown += d.items.length;
          if (!d.total) list.innerHTML = EMPTY;
          if (more) more.hidden = shown >= d.total;
        }).catch(function () {
          page--;
          if (!shown) list.innerHTML = '<div class="gb-empty muted">对不起，服务器忙，留言暂时读不出来，请稍后再刷新试试。</div>';
        });
      }
      load();
      if (more) more.querySelector('button').addEventListener('click', load);

      // 用户开始填写时再加载验证码脚本，不拖慢页面
      f.addEventListener('focusin', function () {
        backendConfig().then(function (cfg) { if (cfg.captcha) Captcha.load(cfg.captcha).catch(function () {}); });
      }, { once: true });

      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var name = f.n.value.trim(), msg = f.m.value.trim();
        if (!name || !msg) { alert('昵称和留言内容不能为空！'); return; }
        var btn = f.querySelector('[type=submit]');
        btn.disabled = true; btn.value = '正在提交…';
        backendConfig().then(function (cfg) {
          return Captcha.token(cfg.captcha, f.querySelector('.gb-captcha')).catch(function () { return ''; });
        }).then(function (captcha) {
          return api('/api/comments', {
            key: key, name: name, message: msg, face: f.f.value, oicq: f.q.value,
            website: f.website ? f.website.value : '', elapsed: Date.now() - T0, captcha: captcha
          });
        }).then(function (d) {
          f.reset();
          if (d.status === 'approved' && d.item) {
            if (list.querySelector('.gb-empty')) list.innerHTML = '';
            list.insertAdjacentHTML('afterbegin', item(d.item));
            shown++;
            alert('留言成功！谢谢你的支持 ^_^');
          } else {
            alert('留言成功！您的留言需要站长审核后才会显示，请耐心等待 ^_^');
          }
        }).catch(function (e) {
          alert(e.server ? '对不起，' + e.message : '对不起，服务器忙，留言没有发出去，请稍后再试！');
        }).then(function () {
          btn.disabled = false; btn.value = '提交留言';
        });
      });
    });
  })();

  // ---------- 首页摘要后面的 [留言(N)] ----------
  (function () {
    var links = $$('[data-y2k-cc]'); if (!BE || !links.length) return;
    var keys = links.map(function (a) { return encodeURIComponent(a.getAttribute('data-y2k-cc')); });
    api('/api/comments/count?keys=' + encodeURIComponent(keys.join(','))).then(function (d) {
      links.forEach(function (a) {
        a.querySelector('span').textContent = (d.counts && d.counts[a.getAttribute('data-y2k-cc')]) || 0;
        a.hidden = false;
      });
    }).catch(function () {});
  })();

  // ---------- 侧栏"最新留言" ----------
  (function () {
    var boxes = $$('[data-y2k-messages]'); if (!BE || !boxes.length) return;
    var n = parseInt(boxes[0].getAttribute('data-count'), 10) || 5;
    api('/api/comments/recent?limit=' + n).then(function (d) {
      var html = d.items.length ? d.items.map(function (e) {
        var text = Array.from(e.message.replace(/\s+/g, ' '));
        return '<div class="msg-item">· <a href="' + esc(keyUrl(e.key)) + '#comments">' + esc(e.name) + '</a>：' +
               esc(text.slice(0, 24).join('')) + (text.length > 24 ? '…' : '') + '</div>';
      }).join('') : '<span class="muted">还没有留言，欢迎<a href="' + esc(keyUrl('guestbook')) + '">留言</a>！</span>';
      boxes.forEach(function (b) { b.innerHTML = html; });
    }).catch(function () {
      boxes.forEach(function (b) { b.innerHTML = '<span class="muted">服务器忙，请稍后再试。</span>'; });
    });
  })();

  // ---------- 小调查（有后端时票数存在后端，每个 IP 一票；否则只记在本机） ----------
  (function () {
    var f = $('[data-y2k-poll]'); if (!f) return;
    var box = f.parentNode.querySelector('.poll-result');
    var opts = $$('input[name="v"]', f).map(function (i) { return i.parentNode.textContent.trim(); });
    var remote = !!(BE && Y.pollId);

    function render(votes) {
      var sum = votes.reduce(function (a, b) { return a + b; }, 0);
      box.innerHTML = opts.map(function (o, i) {
        var pct = sum ? Math.round(votes[i] * 100 / sum) : 0;
        return esc(o) + ' <span class="muted">' + pct + '%（' + votes[i] + ' 票）</span><span class="poll-bar" style="width:' + Math.max(pct, 2) + '%"></span>';
      }).join('') + '<div class="muted">共 ' + sum + ' 人参与</div>';
      box.hidden = false;
    }
    function fromServer(d) { render(opts.map(function (_, i) { return (d.counts && d.counts[i]) || 0; })); }
    function fail() { alert('对不起，服务器忙，请稍后再试！'); }
    function showLocal() {
      var votes = opts.map(function (_, i) { return parseInt((Y.poll || [])[i], 10) || 0; });
      var mine = parseInt(store('y2k-poll'), 10);
      if (mine >= 0 && mine < votes.length) votes[mine]++;
      render(votes);
    }
    function show() {
      if (remote) api('/api/poll?id=' + encodeURIComponent(Y.pollId)).then(fromServer, fail);
      else showLocal();
    }

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var c = f.querySelector('input[name="v"]:checked');
      if (!c) { alert('请先选择一项！'); return; }
      if (remote) {
        api('/api/poll', { id: Y.pollId, option: parseInt(c.value, 10) }).then(function (d) {
          alert(d.already ? '您已经投过票了，谢谢参与！' : '投票成功！感谢您的参与。');
          fromServer(d);
        }, function (err) { if (err.server) alert('对不起，' + err.message); else fail(); });
        return;
      }
      if (store('y2k-poll') != null) { alert('您已经投过票了，谢谢参与！'); showLocal(); return; }
      store('y2k-poll', c.value); alert('投票成功！感谢您的参与。'); showLocal();
    });
    var view = f.querySelector('[data-y2k="poll-view"]');
    if (view) view.addEventListener('click', show);
  })();

  // ---------- 站内搜索 ----------
  (function () {
    var form = $('#y2k-search-form'), out = $('#y2k-search-result');
    if (!form || !out) return;
    var params = new URLSearchParams(location.search);
    var q = (params.get('q') || '').trim(), scope = params.get('in') === 'title' ? 'title' : 'all';
    form.q.value = q; form['in'].value = scope;
    if (!q) return;
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    function mark(text) {
      var s = esc(text);
      terms.forEach(function (t) {
        var re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        s = s.replace(re, function (m) { return '<em>' + m + '</em>'; });
      });
      return s;
    }
    out.textContent = '正在搜索，请稍候……';
    var t0 = (window.performance || Date).now();
    fetch(Y.searchIndex).then(function (r) { return r.json(); }).then(function (index) {
      var hits = [];
      index.forEach(function (p) {
        var title = (p.title || '').toLowerCase();
        var hay = scope === 'title' ? title : [title, (p.text || '').toLowerCase(), (p.tags || []).join(' ').toLowerCase(), (p.categories || []).join(' ').toLowerCase()].join(' ');
        if (!terms.every(function (t) { return hay.indexOf(t) >= 0; })) return;
        var score = terms.reduce(function (s, t) { return s + (title.indexOf(t) >= 0 ? 10 : 0) + hay.split(t).length - 1; }, 0);
        hits.push({ p: p, score: score });
      });
      hits.sort(function (a, b) { return b.score - a.score; });
      var secs = (((window.performance || Date).now() - t0) / 1000).toFixed(4);
      out.className = 'search-result';
      out.removeAttribute('align');
      if (!hits.length) {
        out.innerHTML = '<div align="center">对不起，没有找到与“<b class="hi1">' + esc(q) + '</b>”相关的内容。<br><span class="muted">建议：检查错别字，或者换个关键字试试。</span></div>';
        return;
      }
      out.innerHTML = '<div class="muted" style="margin-bottom:8px">共找到 <b class="hi1">' + hits.length + '</b> 条与“' + esc(q) + '”相关的内容（用时 ' + secs + ' 秒）</div>' +
        hits.slice(0, 50).map(function (h, i) {
          var p = h.p, text = p.text || '', low = text.toLowerCase(), at = -1;
          terms.forEach(function (t) { var i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
          var start = Math.max(0, at - 40), snip = text.slice(start, start + 120);
          return '<div class="search-item"><span class="t">' + (i + 1) + '. <a href="' + esc(p.url) + '">' + mark(p.title || '（无题）') + '</a></span><br>' +
                 (start > 0 ? '……' : '') + mark(snip) + (text.length > start + 120 ? '……' : '') + '<br>' +
                 '<span class="u">' + esc(p.url) + ' - ' + esc(p.date) + (p.categories && p.categories.length ? ' - [' + esc(p.categories.join('/')) + ']' : '') + '</span></div>';
        }).join('');
    }).catch(function () {
      out.textContent = '对不起，搜索索引加载失败，请稍后再试。';
    });
  })();

  // ---------- 各种按钮（事件委托） ----------
  doc.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-y2k]') : null;
    if (!a) return;
    var act = a.getAttribute('data-y2k');
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    if (act === 'homepage') { e.preventDefault(); alert('现在的浏览器不让网页自己设为首页啦～\n请在浏览器的设置里，把本页地址填到"启动时打开"或"主页"一栏。'); }
    else if (act === 'favorite') { e.preventDefault(); alert('请按 ' + (mac ? 'Command' : 'Ctrl') + '+D 将本站加入收藏夹！'); }
    else if (act === 'close') { e.preventDefault(); var w = a.closest('.win98'); if (w) w.hidden = true; }
    else if (act === 'bgm') { e.preventDefault(); BGM.toggle(); }
    else if (act === 'print') { e.preventDefault(); window.print(); }
    else if (act === 'back') { e.preventDefault(); if (history.length > 1) history.back(); else location.href = Y.root || '/'; }
  });

  // ---------- 漂浮广告 ----------
  (function () {
    var el = $('#y2k-float'); if (!el) return;
    var t = null;
    el.querySelector('.x').addEventListener('click', function () { clearInterval(t); el.parentNode.removeChild(el); });
    if (REDUCED) return;
    var x = 40, y = 120, dx = 1, dy = 1;
    function step() {
      var w = innerWidth - el.offsetWidth, h = innerHeight - el.offsetHeight;
      x += dx; y += dy;
      if (x <= 0 || x >= w) { dx = -dx; x = Math.max(0, Math.min(x, w)); }
      if (y <= 0 || y >= h) { dy = -dy; y = Math.max(0, Math.min(y, h)); }
      el.style.left = x + 'px'; el.style.top = y + 'px';
    }
    t = setInterval(step, 20);
    el.addEventListener('mouseover', function () { clearInterval(t); });
    el.addEventListener('mouseout', function () { clearInterval(t); t = setInterval(step, 20); });
  })();

  if (REDUCED) return;

  // ---------- 鼠标跟随星星 ----------
  (function () {
    if (!Y.mouseTrail || COARSE) return;
    var palette = {
      stars: ['#FFFF00', '#FF66CC', '#00FFFF', '#FFFFFF'],
      pink: ['#FF3399', '#9966CC', '#FF99CC', '#FFCC00'],
      green: ['#009900', '#FF9900', '#66CC00', '#0099CC'],
      hacker: ['#00FF00', '#00CC00', '#FFFFFF', '#99FF99'],
      classic: ['#FF0000', '#0000FF', '#FF9900', '#009900']
    };
    var colors = palette[Y.scheme] || palette.stars;
    var chars = ['★', '☆', '·', '+'], last = 0;
    doc.addEventListener('mousemove', function (e) {
      var t = Date.now(); if (t - last < 40) return; last = t;
      var s = doc.createElement('span'); s.className = 'trail';
      s.textContent = chars[Math.random() * chars.length | 0];
      s.style.color = colors[Math.random() * colors.length | 0];
      s.style.left = (e.pageX + 6) + 'px'; s.style.top = (e.pageY + 6) + 'px';
      doc.body.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 800);
    });
  })();

  // ---------- 标题栏文字滚动 ----------
  (function () {
    if (!Y.titleScroll) return;
    var t = doc.title + '　　';
    setInterval(function () { t = t.slice(1) + t.charAt(0); doc.title = t; }, 400);
  })();

  // ---------- 飘雪（黑客黑配色飘 0 和 1） ----------
  (function () {
    if (!Y.snow) return;
    var hacker = Y.scheme === 'hacker';
    var color = { stars: '#FFFFFF', hacker: '#00FF00' }[Y.scheme] || '#99CCFF';
    var N = 28, flakes = [];
    for (var i = 0; i < N; i++) {
      var f = doc.createElement('div');
      f.className = 'flake';
      f.textContent = hacker ? (Math.random() < 0.5 ? '0' : '1') : '*';
      f.style.color = color;
      f.style.fontSize = (10 + Math.random() * 14 | 0) + 'px';
      doc.body.appendChild(f);
      flakes.push({ el: f, x: Math.random() * innerWidth, y: Math.random() * innerHeight, s: 0.6 + Math.random() * 1.6, a: Math.random() * 6 });
    }
    // 20 帧/秒，故意不用 requestAnimationFrame，保留当年的顿挫感
    setInterval(function () {
      flakes.forEach(function (p) {
        p.y += p.s; p.a += 0.05;
        if (p.y > innerHeight) { p.y = -12; p.x = Math.random() * innerWidth; }
        p.el.style.transform = 'translate(' + (hacker ? p.x : p.x + Math.sin(p.a) * 12) + 'px,' + p.y + 'px)';
      });
    }, 50);
  })();
})();
