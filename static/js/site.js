/* PL Deadlines — renders the countdown, conference and calendar pages from
   window.PLD (data embedded by _includes/data.html). No dependencies. */
(function () {
  'use strict';

  var D = window.PLD || { confs: [], types: [], baseurl: '', domain: '' };
  var PAGE = window.PLD_PAGE;
  var BASE = D.baseurl || '';
  var DAY = 86400000;
  var LOCAL_TZ = (function () {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
  })();

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICON_EXT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5h6.5V10M12.5 3.5L4 12"></path></svg>';
  var ICON_CAL = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2"></rect><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3M8 8.5v3M6.5 10h3"></path></svg>';

  /* ——— time ——— */

  // Offset (ms) of an IANA zone at a given instant.
  function zoneOffset(tz, ms) {
    var f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    });
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = +p.value; });
    return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - ms;
  }
  function utcOffsetHours(tz) {
    var m = /^UTC([+-]\d{1,2})?$/.exec(tz || '');
    return m ? +(m[1] || 0) : null;
  }
  // "2027-01-14 23:59:59" in `tz` ("UTC-12" style or an IANA name) -> epoch ms.
  function parseDeadline(str, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(str || ''));
    if (!m) return null;
    var naive = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var h = utcOffsetHours(tz);
    if (h !== null) return naive - h * 3600000;
    try {
      var off = zoneOffset(tz, naive);
      return naive - zoneOffset(tz, naive - off);
    } catch (e) { return naive; }
  }
  function parseDay(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? new Date(+m[1], m[2] - 1, +m[3]) : null;
  }
  function parts(ms, tz) {
    var h = utcOffsetHours(tz);
    var f = new Intl.DateTimeFormat('en-GB', {
      timeZone: h !== null ? 'UTC' : tz, weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short'
    });
    var o = {};
    f.formatToParts(new Date(h !== null ? ms + h * 3600000 : ms)).forEach(function (p) { o[p.type] = p.value; });
    o.month = MON[+o.month - 1];
    o.day = String(+o.day);
    return o;
  }
  function fmtDate(ms, tz, withYear) {
    var p = parts(ms, tz);
    return p.weekday + ' ' + p.day + ' ' + p.month + (withYear === false ? '' : ' ' + p.year);
  }
  function fmtTime(ms, tz) { var p = parts(ms, tz); return p.hour + ':' + p.minute; }
  function tzLabel(tz) {
    var h = utcOffsetHours(tz);
    if (h === null) return tz;
    var s = 'UTC' + (h === 0 ? '' : (h < 0 ? '−' : '+') + Math.abs(h));
    return h === -12 ? s + ', anywhere on Earth' : s;
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function fmtRange(c) {
    var a = c.start, b = c.end;
    if (!a || !b) return /^tba$/i.test(c.date || '') || !c.date ? 'Dates TBA' : c.date;
    if (+a === +b) return a.getDate() + ' ' + MON[a.getMonth()] + ' ' + a.getFullYear();
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
      return a.getDate() + '–' + b.getDate() + ' ' + MON[a.getMonth()] + ' ' + a.getFullYear();
    return a.getDate() + ' ' + MON[a.getMonth()] + (a.getFullYear() !== b.getFullYear() ? ' ' + a.getFullYear() : '') +
      ' – ' + b.getDate() + ' ' + MON[b.getMonth()] + ' ' + b.getFullYear();
  }
  function left(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: pad(Math.floor(s % 86400 / 3600)), m: pad(Math.floor(s % 3600 / 60)), s: pad(s % 60) };
  }

  /* ——— data ——— */

  var subName = {};
  D.types.forEach(function (t) { subName[t.sub] = t.name; });
  var ALL_SUBS = D.types.map(function (t) { return t.sub; });

  var confs = D.confs.map(function (c) {
    var subs = (Array.isArray(c.sub) ? c.sub : String(c.sub || '').split(',')).map(function (s) { return String(s).trim(); }).filter(Boolean);
    var tz = c.timezone || 'America/New_York';
    return {
      id: c.id, name: c.title + ' ' + c.year, title: String(c.title), year: c.year,
      note: c.note || '', full: c.full_name || '', link: c.link || '', place: c.place || '', date: c.date || '',
      start: parseDay(c.start), end: parseDay(c.end), subs: subs, cls: 'c-' + (subs[0] || ''),
      tz: tz, t: parseDeadline(c.deadline, tz),
      url: BASE + '/conference/?id=' + encodeURIComponent(c.id)
    };
  });
  function subjects(c) { return c.subs.map(function (s) { return subName[s] || s; }).join(', '); }
  function hasPlace(c) { return c.place && !/^tba$/i.test(c.place); }

  /* ——— subject filter (kept in the URL and in localStorage, as before) ——— */

  var STORE_KEY = D.domain + '-subs';
  var active = (function () {
    var fromUrl = new URL(window.location).searchParams.get('sub'), v = null;
    if (fromUrl) v = fromUrl.toUpperCase().split(',');
    else { try { v = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { v = null; } }
    if (!Array.isArray(v)) return ALL_SUBS.slice();
    return ALL_SUBS.filter(function (s) { return v.indexOf(s) >= 0; });
  })();
  function visible(c) { return c.subs.some(function (s) { return active.indexOf(s) >= 0; }); }
  function saveFilter() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(active)); } catch (e) { /* private mode */ }
    var u = new URL(window.location);
    if (active.length === ALL_SUBS.length) u.searchParams.delete('sub');
    else u.searchParams.set('sub', active.join(','));
    window.history.replaceState('', '', u.pathname + u.search.replace(/%2C/g, ','));
  }
  function mountChips(onChange) {
    var box = $('#chips');
    if (!box) return;
    box.innerHTML = D.types.map(function (t) {
      return '<button class="chip c-' + esc(t.sub) + '" type="button" data-sub="' + esc(t.sub) + '" aria-pressed="' +
        (active.indexOf(t.sub) >= 0) + '"><span class="dot"></span>' + esc(t.name) + '</button>';
    }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      var s = b.dataset.sub, i = active.indexOf(s);
      if (i >= 0) active.splice(i, 1); else active = ALL_SUBS.filter(function (x) { return x === s || active.indexOf(x) >= 0; });
      b.setAttribute('aria-pressed', String(i < 0));
      saveFilter();
      onChange();
    });
  }

  /* ——— add to calendar ——— */

  function stamp(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function calLinks(c) {
    var title = c.name + ' deadline', a = c.t, b = c.t + 3600000;
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + D.domain + '//deadlines//EN', 'BEGIN:VEVENT',
      'UID:' + c.id + '@' + D.domain, 'DTSTAMP:' + stamp(Date.now()), 'DTSTART:' + stamp(a), 'DTEND:' + stamp(b),
      'SUMMARY:' + title, 'URL:' + c.link, 'DESCRIPTION:' + c.link, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var file = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    return [
      { label: 'Google Calendar', href: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
          '&dates=' + stamp(a) + '/' + stamp(b) + '&details=' + encodeURIComponent(c.link) },
      { label: 'Apple Calendar', href: file, download: c.id + '.ics' },
      { label: 'Outlook', href: 'https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=' +
          encodeURIComponent(title) + '&startdt=' + new Date(a).toISOString() + '&enddt=' + new Date(b).toISOString() + '&body=' + encodeURIComponent(c.link) },
      { label: '.ics', href: file, download: c.id + '.ics' }
    ];
  }
  function linkAttrs(l) {
    return 'href="' + esc(l.href) + '"' + (l.download ? ' download="' + esc(l.download) + '"' : ' target="_blank" rel="noopener"');
  }

  // One floating panel shared by the calendar menu and the calendar-page popover.
  var floating = null, floatOwner = null;
  function closeFloat() {
    if (floating) floating.remove();
    if (floatOwner) floatOwner.removeAttribute('aria-expanded');
    floating = floatOwner = null;
  }
  function openFloat(owner, cls, html, align) {
    closeFloat();
    floating = document.createElement('div');
    floating.className = cls;
    floating.innerHTML = html;
    document.body.appendChild(floating);
    var r = owner.getBoundingClientRect(), w = floating.offsetWidth, h = floating.offsetHeight;
    var x = align === 'right' ? r.right - w : r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(x, document.documentElement.clientWidth - w - 8));
    var y = r.bottom + 6;
    if (y + h > window.innerHeight - 8 && r.top - h - 6 > 8) y = r.top - h - 6;
    floating.style.left = (x + window.scrollX) + 'px';
    floating.style.top = (y + window.scrollY) + 'px';
    floatOwner = owner;
    owner.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cal]');
    if (b) {
      if (floatOwner === b) return closeFloat();
      var c = confs.filter(function (x) { return x.id === b.dataset.cal; })[0];
      if (c) openFloat(b, 'menu', calLinks(c).slice(0, 3).map(function (l) {
        return '<a ' + linkAttrs(l) + '>' + esc(l.label === 'Apple Calendar' ? 'Apple Calendar (.ics)' : l.label) + '</a>';
      }).join(''), 'right');
      return;
    }
    if (floating && !floating.contains(e.target) && !(floatOwner && floatOwner.contains(e.target))) closeFloat();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeFloat(); });

  /* ——— ticking ——— */

  // Any element with data-t (epoch ms) gets its [data-u] children kept current.
  var onExpire = null;
  function tick() {
    var now = Date.now(), expired = false;
    $$('[data-t]').forEach(function (el) {
      var ms = +el.dataset.t - now;
      if (ms <= 0) expired = true;
      var v = left(ms);
      $$('[data-u]', el).forEach(function (u) { if (u.textContent !== String(v[u.dataset.u])) u.textContent = v[u.dataset.u]; });
    });
    if (expired && onExpire) onExpire();
  }

  /* ——— timeline ——— */

  function shortLabel(c) {
    var n = c.note.replace(/\(.*?\)/g, '').split(/[;,]/)[0].replace(/\bsubmission\b/i, '').replace(/^round\s*(\d+)/i, 'R$1').trim();
    return c.title + (n && n.length <= 10 ? ' ' + n : '');
  }
  function monthTicks(from, to) {
    var out = [], d = new Date(from);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    for (; +d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(new Date(d));
    return out;
  }
  function tickLabel(d) { return MON[d.getMonth()] + (d.getMonth() === 0 ? ' ' + d.getFullYear() : ''); }

  function drawTimeline(up) {
    var box = $('#tl'), axis = $('#axis');
    var items = up.filter(function (c) { return c.t !== null; });
    box.hidden = !items.length;
    if (!items.length) return;
    var now = Date.now(), n = new Date(now);
    var ref = Math.max(items[items.length - 1].t, +new Date(n.getFullYear(), n.getMonth() + 5, n.getDate()));
    var r = new Date(ref), end = +new Date(r.getFullYear(), r.getMonth() + 1, 1), span = end - now;
    var ticks = monthTicks(now, end), step = Math.ceil(ticks.length / 9);
    var p = parts(now, LOCAL_TZ);
    axis.innerHTML = '<div class="today"><span>Today, ' + p.day + ' ' + p.month + '</span></div>' +
      ticks.map(function (d, i) {
        return '<div class="tick" style="left: ' + ((d - now) / span * 100).toFixed(2) + '%">' +
          ((ticks.length - 1 - i) % step === 0 ? '<span>' + tickLabel(d) + '</span>' : '') + '</div>';
      }).join('') +
      items.map(function (c) {
        return '<a class="mk ' + esc(c.cls) + '" href="' + esc(c.url) + '" data-t="' + c.t + '" style="left: ' +
          ((c.t - now) / span * 100).toFixed(2) + '%" title="' + esc(c.name + (c.note ? ' · ' + c.note : '')) + '"><i></i><b></b><span><strong>' +
          esc(shortLabel(c)) + '</strong> <em data-u="d" style="font-style: normal">' + left(c.t - now).d + '</em> d</span></a>';
      }).join('');
    layoutTimeline();
  }
  // Labels that would run into the next marker are stacked: within a cluster the
  // earliest sits highest, so no stem ever crosses a label.
  function layoutTimeline() {
    var box = $('#tl'), axis = $('#axis');
    if (!axis || box.hidden) return;
    var W = axis.offsetWidth, mks = $$('.mk', axis), GAP = 10, MAX = 6;
    var info = mks.map(function (m) {
      var s = $('span', m);
      s.classList.remove('l');
      return { m: m, s: s, x: parseFloat(m.style.left) / 100 * W, w: s.offsetWidth };
    });
    var top = 0, i = info.length - 1;
    while (i >= 0) {
      var level = 0;
      info[i].level = 0;
      while (i > 0 && info[i - 1].x + 9 + info[i - 1].w + GAP > info[i].x) {
        i--; level++;
        info[i].level = level % MAX;
      }
      i--;
    }
    info.forEach(function (o, k) {
      var h = 34 + 28 * o.level;
      o.m.style.setProperty('--h', h + 'px');
      top = Math.max(top, h);
      // Flip the label to the left of its stem when it would leave the panel.
      var room = k === 0 || info[k - 1].x + 9 + info[k - 1].w + GAP < o.x - 9 - o.w || info[k - 1].level !== o.level;
      if (o.x + 9 + o.w > W + 44 && room) o.s.classList.add('l');
    });
    box.style.setProperty('--pt', (top + 38) + 'px');
  }

  /* ——— home ——— */

  function home() {
    var sortRecent = true, showAll = false, PAST_SHOWN = 8, lastUp = '';
    $$('[data-tz]').forEach(function (e) { e.textContent = LOCAL_TZ; });

    function upcomingRow(c, i, now) {
      var v = c.t === null ? null : left(c.t - now);
      return '<div class="row ' + esc(c.cls) + '"' + (v ? ' data-t="' + c.t + '"' : '') + '>' +
        '<div class="cd">' + (v ? '<b data-u="d">' + v.d + '</b><span>days</span>' : '<b class="tba">TBA</b>') + '</div>' +
        '<div class="nm"><b><span class="dot"></span><a href="' + esc(c.url) + '"' + (c.full ? ' title="' + esc(c.full) + '"' : '') + '>' + esc(c.name) + '</a>' +
          (i === 0 && v ? '<span class="nx">Next</span>' : '') + '</b>' +
          '<span class="s">' + esc([c.note, subjects(c)].filter(Boolean).join(' · ')) + '</span></div>' +
        '<div class="two">' + (v
          ? '<span>' + fmtDate(c.t, LOCAL_TZ) + ', ' + fmtTime(c.t, LOCAL_TZ) + '</span><span class="s mono"><span data-u="h">' + v.h +
            '</span>h <span data-u="m">' + v.m + '</span>m <span data-u="s">' + v.s + '</span>s left</span>'
          : '<span>Deadline TBA</span>') + '</div>' +
        '<div class="two where"><span>' + esc(hasPlace(c) ? c.place : 'Location TBA') + '</span><span class="s">' + esc(fmtRange(c)) + '</span></div>' +
        '<div class="ibs">' +
          (c.link ? '<a class="ib" href="' + esc(c.link) + '" target="_blank" rel="noopener" title="Conference website" aria-label="Conference website">' + ICON_EXT + '</a>' : '') +
          (v ? '<button class="ib" type="button" data-cal="' + esc(c.id) + '" title="Add to calendar" aria-label="Add to calendar" aria-haspopup="true">' + ICON_CAL + '</button>' : '') +
        '</div></div>';
    }
    function pastRow(c) {
      var p = parts(c.t, LOCAL_TZ);
      return '<div class="prow ' + esc(c.cls) + '"><span class="dot"></span><b><a href="' + esc(c.url) + '"' + (c.full ? ' title="' + esc(c.full) + '"' : '') + '>' +
        esc(c.name) + '</a></b><span class="s">' + esc(c.note) + '</span><span class="dt">' + p.day + ' ' + p.month + ' ' + p.year + '</span>' +
        '<span class="pl">' + esc([hasPlace(c) ? c.place : '', fmtRange(c)].filter(Boolean).join(' · ')) + '</span></div>';
    }
    function render() {
      closeFloat();
      var now = Date.now(), shown = confs.filter(visible);
      var up = shown.filter(function (c) { return c.t === null || c.t > now; })
        .sort(function (a, b) { return (a.t === null) - (b.t === null) || a.t - b.t; });
      var past = shown.filter(function (c) { return c.t !== null && c.t <= now; })
        .sort(function (a, b) { return sortRecent ? b.t - a.t : a.t - b.t; });
      lastUp = up.map(function (c) { return c.id; }).join();
      drawTimeline(up);
      $('#upcoming').innerHTML = up.length ? up.map(function (c, i) { return upcomingRow(c, i, now); }).join('')
        : '<div class="empty">' + (active.length ? 'No upcoming deadlines right now.' : 'No subjects selected.') + '</div>';
      var list = showAll ? past : past.slice(0, PAST_SHOWN);
      $('#past').innerHTML = list.length ? list.map(pastRow).join('') : '<div class="empty">No past deadlines.</div>';
      var more = $('#more'), rest = past.length - list.length;
      more.hidden = rest <= 0;
      $('button', more).textContent = 'Show ' + rest + (sortRecent ? ' earlier' : ' later') + ' deadline' + (rest === 1 ? '' : 's');
    }
    $('#sort').addEventListener('click', function () {
      sortRecent = !sortRecent;
      this.textContent = sortRecent ? 'Most recent first' : 'Oldest first';
      render();
    });
    $('#more button').addEventListener('click', function () { showAll = true; render(); });
    mountChips(render);
    render();
    onExpire = render;
    setInterval(tick, 1000);
    setInterval(function () { drawTimeline(confs.filter(visible).filter(function (c) { return c.t !== null && c.t > Date.now(); }).sort(function (a, b) { return a.t - b.t; })); }, 600000);
    window.addEventListener('resize', layoutTimeline);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutTimeline);
  }

  /* ——— conference page ——— */

  function conference() {
    var box = $('#conf'), id = new URL(window.location).searchParams.get('id');
    var c = confs.filter(function (x) { return x.id === id; })[0];
    if (!c) {
      box.innerHTML = '<section class="chead"><h1>Not found</h1><div class="full">There is no conference with this id.</div></section>';
      return;
    }
    document.title = c.name + ' · ' + document.title;
    var links = c.t === null ? [] : calLinks(c);
    function panel() {
      var now = Date.now();
      if (c.t === null) return '<section class="cpanel past"><div class="cnum"><b class="closed">TBA</b><span>The deadline has not been announced</span></div></section>';
      if (c.t <= now) {
        var ago = Math.floor((now - c.t) / DAY);
        return '<section class="cpanel past"><div class="cnum"><b class="closed">Closed</b><span>The deadline passed ' +
          (ago === 0 ? 'today' : ago + ' day' + (ago === 1 ? '' : 's') + ' ago') + '</span></div></section>';
      }
      var v = left(c.t - now), span = c.t - now, ticks = monthTicks(now, c.t), step = Math.ceil(ticks.length / 6), p = parts(now, LOCAL_TZ);
      return '<section class="cpanel ' + esc(c.cls) + '" data-t="' + c.t + '">' +
        '<div class="cnum"><b data-u="d">' + v.d + '</b><span>days <span class="mono"><span data-u="h">' + v.h + '</span>h <span data-u="m">' + v.m +
          '</span>m <span data-u="s">' + v.s + '</span>s</span></span></div>' +
        '<div class="tl small"><div class="axis"><div class="today"><span>Today, ' + p.day + ' ' + p.month + '</span></div>' +
          ticks.map(function (d, i) {
            var x = (d - now) / span * 100;
            return x > 4 && x < 92 ? '<div class="tick" style="left: ' + x.toFixed(2) + '%">' + (i % step === 0 ? '<span>' + tickLabel(d) + '</span>' : '') + '</div>' : '';
          }).join('') +
          '<div class="mk ' + esc(c.cls) + '" style="left: 100%; --h: 34px"><i></i><b></b><span class="l"><strong>Deadline</strong> ' +
            fmtDate(c.t, LOCAL_TZ, false) + ', ' + fmtTime(c.t, LOCAL_TZ) + '</span></div>' +
        '</div></div></section>';
    }
    var site = c.link.replace(/^https?:\/\//, '').replace(/\/$/, '');
    box.innerHTML =
      '<section class="chead ' + esc(c.cls) + '"><span class="sub"><span class="dot"></span>' + esc([subjects(c), c.note ? c.note.charAt(0).toUpperCase() + c.note.slice(1) : ''].filter(Boolean).join(' · ')) + '</span>' +
        '<h1>' + esc(c.name) + '</h1>' + (c.full ? '<div class="full">' + esc(c.full) + '</div>' : '') + '</section>' +
      '<div id="cpanel">' + panel() + '</div>' +
      '<div class="facts">' +
        (c.t === null ? '<div><span class="k">Deadline</span><span>TBA</span></div>' :
          '<div><span class="k">Deadline, your time</span><span>' + fmtDate(c.t, LOCAL_TZ) + ', ' + fmtTime(c.t, LOCAL_TZ) + '</span><span class="s">' +
            esc(LOCAL_TZ) + ' (' + esc(parts(c.t, LOCAL_TZ).timeZoneName) + ')</span></div>' +
          '<div><span class="k">Deadline, conference time</span><span>' + fmtDate(c.t, c.tz) + ', ' + fmtTime(c.t, c.tz) + '</span><span class="s">' + esc(tzLabel(c.tz)) + '</span></div>') +
        '<div><span class="k">Conference</span><span>' + esc(fmtRange(c)) + '</span>' +
          (hasPlace(c) ? '<span class="s tx">' + (/^online$/i.test(c.place) ? esc(c.place) : '<a href="https://maps.google.com/?q=' + encodeURIComponent(c.place) + '" target="_blank" rel="noopener">' + esc(c.place) + '</a>') + '</span>' : '<span class="s">Location TBA</span>') + '</div>' +
        (c.link ? '<div><span class="k">Website</span><span class="tx"><a href="' + esc(c.link) + '" target="_blank" rel="noopener">' + esc(site) + '</a></span></div>' : '') +
      '</div>' +
      (links.length && c.t > Date.now() ? '<div class="acts">' + links.map(function (l, i) {
        return '<a class="btn' + (i === 0 ? ' pri' : '') + '" ' + linkAttrs(l) + '>' + (i === 0 ? ICON_CAL : '') + esc(l.label) + '</a>';
      }).join('') + '</div>' : '');
    onExpire = function () { $('#cpanel').innerHTML = panel(); var a = $('.acts', box); if (a) a.remove(); };
    setInterval(tick, 1000);
  }

  /* ——— calendar page ——— */

  function calendar() {
    $$('[data-tz]').forEach(function (e) { e.textContent = LOCAL_TZ; });
    var today = new Date(), year = today.getFullYear();
    var key = function (d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
    var days = {};

    function index() {
      days = {};
      var slot = function (d) { var k = key(d); return days[k] || (days[k] = { dl: [], cf: [] }); };
      confs.filter(visible).forEach(function (c) {
        if (c.t !== null) slot(new Date(c.t)).dl.push(c);
        if (c.start && c.end && c.end >= c.start && c.end - c.start < 60 * DAY)
          for (var d = new Date(c.start); d <= c.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
            slot(d).cf.push({ c: c, s: +d === +c.start, e: +d === +c.end });
      });
    }
    function render() {
      closeFloat();
      index();
      $('#year').textContent = year;
      var html = '';
      for (var m = 0; m < 12; m++) {
        var first = new Date(year, m, 1), blanks = (first.getDay() + 6) % 7, count = new Date(year, m + 1, 0).getDate();
        html += '<section class="month"><h3>' + MONTHS[m] + '</h3><div class="dow">' +
          ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="days">';
        for (var b = 0; b < blanks; b++) html += '<span class="day"></span>';
        for (var d = 1; d <= count; d++) {
          var date = new Date(year, m, d), e = days[key(date)], isToday = key(date) === key(today);
          var cls = 'day' + (isToday ? ' is-today' : '');
          if (!e) { html += '<span class="' + cls + '"><span class="n">' + d + '</span></span>'; continue; }
          if (e.cf.length) cls += ' cf ' + esc(e.cf[0].c.cls) + (e.cf[0].s ? ' s' : '') + (e.cf[0].e ? ' e' : '');
          var n = 'n' + (e.dl.length ? ' dl ' + esc(e.dl[0].cls) + (e.dl.length > 1 ? ' multi' : '') : '');
          html += '<button type="button" class="' + cls + '" data-day="' + key(date) + '" aria-label="' + d + ' ' + MONTHS[m] + ', ' +
            (e.dl.length + e.cf.length) + ' event' + (e.dl.length + e.cf.length === 1 ? '' : 's') + '"><span class="' + n + '">' + d + '</span></button>';
        }
        html += '</div></section>';
      }
      $('#months').innerHTML = html;
    }
    function popover(btn) {
      var k = btn.dataset.day.split('-'), e = days[btn.dataset.day];
      var d = new Date(+k[0], +k[1], +k[2]);
      openFloat(btn, 'pop', '<div class="dh">' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + '</div>' +
        e.dl.map(function (c) {
          return '<a class="' + esc(c.cls) + '" href="' + esc(c.url) + '"><span class="dot"></span><b>' + esc(c.name) + '</b><span class="s">Deadline ' +
            fmtTime(c.t, LOCAL_TZ) + (c.note ? ' · ' + esc(c.note) : '') + '</span></a>';
        }).join('') +
        e.cf.map(function (x) {
          return '<a class="' + esc(x.c.cls) + '" href="' + esc(x.c.url) + '"><span class="dot"></span><b>' + esc(x.c.name) + '</b><span class="s">Conference · ' +
            esc([hasPlace(x.c) ? x.c.place : '', fmtRange(x.c)].filter(Boolean).join(' · ')) + '</span></a>';
        }).join(''));
      floating.addEventListener('mouseleave', function () { if (!pinned) closeFloat(); });
    }
    var months = $('#months'), pinned = false;
    months.addEventListener('mouseover', function (e) {
      var b = e.target.closest('button.day');
      if (b && !pinned && floatOwner !== b) popover(b);
    });
    months.addEventListener('mouseout', function (e) {
      var b = e.target.closest('button.day');
      if (b && !pinned && !(e.relatedTarget && floating && floating.contains(e.relatedTarget))) closeFloat();
    });
    months.addEventListener('click', function (e) {
      var b = e.target.closest('button.day');
      if (!b) return;
      e.stopPropagation();
      if (pinned && floatOwner === b) { pinned = false; return closeFloat(); }
      popover(b);
      pinned = true;
    });
    document.addEventListener('click', function () { pinned = false; });
    $('#prev').addEventListener('click', function () { year--; render(); });
    $('#next').addEventListener('click', function () { year++; render(); });
    mountChips(render);
    render();
  }

  if (PAGE === 'home') home();
  else if (PAGE === 'conference') conference();
  else if (PAGE === 'calendar') calendar();
})();
