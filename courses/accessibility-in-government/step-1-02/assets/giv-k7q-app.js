/* GIV.UK – Claim 20% off work. Fictional training service. Build k7q.
   Vanilla JavaScript, no dependencies. Answers are kept in sessionStorage (this tab only) and never sent anywhere. */
(function () {
  'use strict';

  var KEY = 'givK7qState';
  var LIMIT_MS = 60000;
  var PAGES = {
    start: 'giv-k7q-01-start.html',
    details: 'giv-k7q-02-details.html',
    pattern: 'giv-k7q-03-pattern.html',
    coupon: 'giv-k7q-04-coupon.html',
    submit: 'giv-k7q-05-submit.html',
    confirmation: 'giv-k7q-06-confirmation.html',
    expired: 'giv-k7q-expired.html',
    about: 'giv-k7q-about.html'
  };
  var PATTERNS = {
    'full-time': 'Full time',
    'part-time': 'Part time',
    'compressed': 'Compressed hours',
    'unsure': 'I’m not sure'
  };
  var COUPON = 'GIV-20-FREE';

  /* ---------- State ---------- */
  var memoryFallback = null;
  function blank() {
    return { route: null, deadline: null, timerOff: false, a11y: {}, name: '', staff: '', pattern: '',
      coupon: '', startDate: '', declare: false, reference: '', submitted: false, lastPage: '' };
  }
  function load() {
    try {
      var raw = window.sessionStorage.getItem(KEY);
      if (raw) { var s = JSON.parse(raw); var b = blank(); for (var k in b) { if (!(k in s)) s[k] = b[k]; } return s; }
    } catch (e) { if (memoryFallback) return memoryFallback; }
    return blank();
  }
  function save() {
    try { window.sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { memoryFallback = state; }
  }
  function reset() {
    try { window.sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    state = blank();
  }
  var state = load();

  /* ---------- Helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function go(page, extra) { window.location.href = PAGES[page] + (extra || ''); }
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function next(defaultPage) {
    if (param('return') === 'submit') { go('submit'); } else { go(defaultPage); }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normStaff(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
  function validStaff(v) { return /^GIV\d{6}$/.test(normStaff(v)); }
  function normCoupon(v) { return String(v || '').replace(/[\s\-–—_]+/g, '').toUpperCase(); }
  function parseDate(v) {
    var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(v || '');
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  function isFuture(dt) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return dt.getTime() > t.getTime();
  }

  /* ---------- Journey guard: pages must be reached in order ---------- */
  function firstIncomplete() {
    if (!state.name || !validStaff(state.staff)) return 'details';
    if (!state.pattern) return 'pattern';
    if (normCoupon(state.coupon) !== normCoupon(COUPON)) return 'coupon';
    if (!state.submitted) return 'submit';
    return 'confirmation';
  }
  var ORDER = ['details', 'pattern', 'coupon', 'submit', 'confirmation'];
  function guard(page) {
    var need = firstIncomplete();
    if (ORDER.indexOf(page) > ORDER.indexOf(need)) { go(need); return false; }
    if (state.submitted && page !== 'confirmation') { go('confirmation'); return false; }
    return true;
  }

  /* ---------- Versions: barrier vs accessible ---------- */
  function isAccessible(page) { return state.route === 'accessible' || !!state.a11y[page]; }

  function applyVersion(page, moveFocus) {
    var acc = isAccessible(page);
    $all('[data-version]').forEach(function (el) {
      el.hidden = (el.getAttribute('data-version') === 'accessible') ? !acc : acc;
    });
    var btn = $('#giv-toggle');
    if (btn) {
      btn.textContent = acc ? 'Show the original version (with the barrier)' : 'Show the accessible version of this page';
      btn.setAttribute('aria-pressed', acc ? 'true' : 'false');
    }
    var mode = $('#giv-mode');
    if (mode) {
      mode.textContent = acc ? 'You are viewing the accessible version of this page.' :
        'You are viewing the original version, which includes the barrier.';
    }
    var explain = $('#giv-explain');
    if (explain && acc) explain.open = true;
    if (moveFocus) {
      var h = $('[data-version="' + (acc ? 'accessible' : 'barrier') + '"] h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    }
  }

  function initTraining(page) {
    var btn = $('#giv-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var acc = isAccessible(page);
        if (state.route === 'accessible' && acc) {
          // Accessible-route learners can still inspect the barrier on a single page.
          state.route = 'accessible-page-override';
          state.a11y = { details: true, pattern: true, coupon: true, submit: true, confirmation: true };
          state.a11y[page] = false;
        } else {
          state.a11y[page] = !acc;
        }
        save();
        syncAllFields();
        applyVersion(page, true);
      });
    }
    var untime = $('#giv-untime');
    if (untime) {
      untime.addEventListener('click', function () {
        state.timerOff = true; save();
        stopTimer();
        untime.hidden = true;
        var st = $('#giv-tr-status');
        if (st) st.textContent = 'Time limit removed. Take as long as you need.';
      });
    }
  }

  /* ---------- Countdown (deliberate barrier: no way to pause, extend or turn off within the service) ---------- */
  var timerId = null;
  function timerActive() { return !!state.deadline && !state.timerOff && !state.submitted; }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    var slot = $('#giv-timer-slot'); if (slot) slot.innerHTML = '';
  }
  function startTimer(page) {
    var slot = $('#giv-timer-slot');
    var untime = $('#giv-untime');
    if (!slot || !timerActive()) { if (untime) untime.hidden = true; return; }
    if (untime) untime.hidden = false;
    slot.innerHTML =
      '<div class="giv-timer"><div class="giv-width giv-timer__inner">' +
      '<span>This offer ends in</span><span class="giv-timer__clock" id="giv-clock">1:00</span>' +
      '<span class="giv-timer__bar" aria-hidden="true"><span class="giv-timer__fill" id="giv-fill"></span></span>' +
      '</div></div>';
    function tick() {
      var left = state.deadline - Date.now();
      if (left <= 0) {
        clearInterval(timerId); timerId = null;
        state.lastPage = page; state.deadline = null; state.expired = true; save();
        go('expired');
        return;
      }
      var secs = Math.ceil(left / 1000);
      var clock = $('#giv-clock'), fill = $('#giv-fill');
      if (clock) clock.textContent = Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
      if (fill) fill.style.width = Math.max(0, Math.min(100, (left / LIMIT_MS) * 100)) + '%';
      slot.firstChild.classList.toggle('giv-timer--urgent', secs <= 10);
    }
    tick();
    timerId = setInterval(tick, 250);
  }

  /* ---------- Shared error helpers (accessible versions) ---------- */
  function showSummary(summaryEl, errors) {
    var list = $('ul', summaryEl);
    list.innerHTML = errors.map(function (e) {
      return '<li><a href="#' + e.id + '">' + esc(e.msg) + '</a></li>';
    }).join('');
    summaryEl.hidden = false;
    $all('a', list).forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var t = document.getElementById(a.getAttribute('href').slice(1));
        if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); }
      });
    });
    summaryEl.focus();
  }
  function setFieldError(groupEl, inputEl, msgEl, msg) {
    var hintId = inputEl.getAttribute('data-hint');
    if (msg) {
      groupEl.classList.add('giv-form-group--error');
      if (inputEl.classList.contains('giv-input')) inputEl.classList.add('giv-input--error');
      msgEl.innerHTML = '<span class="giv-visually-hidden">Error:</span> ' + esc(msg);
      msgEl.hidden = false;
      inputEl.setAttribute('aria-describedby', (hintId ? hintId + ' ' : '') + msgEl.id);
      inputEl.setAttribute('aria-invalid', 'true');
    } else {
      groupEl.classList.remove('giv-form-group--error');
      inputEl.classList.remove('giv-input--error');
      msgEl.hidden = true; msgEl.textContent = '';
      if (hintId) inputEl.setAttribute('aria-describedby', hintId); else inputEl.removeAttribute('aria-describedby');
      inputEl.removeAttribute('aria-invalid');
    }
  }
  var baseTitle = document.title;
  function titleError(on) { document.title = (on ? 'Error: ' : '') + baseTitle; }

  /* Keep barrier and accessible versions of each field in sync with stored state */
  function bind(selectors, key, transform) {
    selectors.forEach(function (sel) {
      var el = $(sel); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!state[key]; else el.value = state[key] || '';
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', function () {
        state[key] = el.type === 'checkbox' ? el.checked : (transform ? transform(el.value) : el.value);
        save();
        selectors.forEach(function (other) {
          var o = $(other); if (!o || o === el) return;
          if (o.type === 'checkbox') o.checked = !!state[key]; else o.value = el.value;
        });
      });
    });
  }
  var syncHooks = [];
  function syncAllFields() { syncHooks.forEach(function (f) { f(); }); }

  /* ---------- Page: start ---------- */
  function pageStart() {
    var timed = $('#giv-start-timed');
    var acc = $('#giv-start-accessible');
    if (timed) timed.addEventListener('click', function () {
      reset();
      state.route = 'timed'; state.deadline = Date.now() + LIMIT_MS; save();
      go('details');
    });
    if (acc) acc.addEventListener('click', function () {
      reset();
      state.route = 'accessible'; state.timerOff = true; save();
      go('details');
    });
  }

  /* ---------- Page: details ---------- */
  function pageDetails() {
    bind(['#x-name', '#a-name'], 'name');
    bind(['#x-staff', '#a-staff'], 'staff');

    function validate(name, staff) {
      var errs = [];
      if (!name.trim()) errs.push({ f: 'name', msg: 'Enter your full name' });
      else if (name.trim().length > 60) errs.push({ f: 'name', msg: 'Full name must be 60 characters or fewer' });
      if (!staff.trim()) errs.push({ f: 'staff', msg: 'Enter your staff number' });
      else if (!validStaff(staff)) errs.push({ f: 'staff', msg: 'Enter a staff number in the correct format, like GIV123456' });
      return errs;
    }

    // Barrier version: placeholder-only fields, no programmatic labels
    $('#x-details-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = validate($('#x-name').value, $('#x-staff').value);
      ['name', 'staff'].forEach(function (f) {
        var m = $('#x-' + f + '-err'); var e = errs.filter(function (x) { return x.f === f; })[0];
        m.hidden = !e; m.textContent = e ? e.msg : '';
      });
      if (!errs.length) { state.name = $('#x-name').value.trim(); state.staff = normStaff($('#x-staff').value); save(); next('pattern'); }
    });

    // Accessible version
    $('#a-details-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = validate($('#a-name').value, $('#a-staff').value);
      ['name', 'staff'].forEach(function (f) {
        var e = errs.filter(function (x) { return x.f === f; })[0];
        setFieldError($('#a-' + f + '-group'), $('#a-' + f), $('#a-' + f + '-err'), e ? e.msg : '');
      });
      titleError(!!errs.length);
      if (errs.length) { showSummary($('#a-details-summary'), errs.map(function (e) { return { id: 'a-' + e.f, msg: e.msg }; })); return; }
      state.name = $('#a-name').value.trim(); state.staff = normStaff($('#a-staff').value); save();
      next('pattern');
    });
  }

  /* ---------- Page: pattern ---------- */
  function pagePattern() {
    var cards = $all('.giv-x-card');
    function paint() {
      cards.forEach(function (c) { c.classList.toggle('is-selected', c.getAttribute('data-value') === state.pattern); });
      $all('input[name="a-pattern"]').forEach(function (r) { r.checked = (r.value === state.pattern); });
    }
    syncHooks.push(paint);
    paint();

    // Barrier version: mouse/touch only. <div>s have no role, no tabindex and no key handling.
    cards.forEach(function (c) {
      c.addEventListener('click', function () {
        state.pattern = c.getAttribute('data-value'); save(); paint();
        $('#x-pattern-err').hidden = true;
      });
    });
    $('#x-continue').addEventListener('click', function () {
      if (!state.pattern) { $('#x-pattern-err').hidden = false; return; }
      next('coupon');
    });

    // Accessible version
    $all('input[name="a-pattern"]').forEach(function (r) {
      r.addEventListener('change', function () { state.pattern = r.value; save(); paint(); });
    });
    $('#a-pattern-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var ok = !!state.pattern && PATTERNS[state.pattern];
      setFieldError($('#a-pattern-group'), $('#a-pattern-first'), $('#a-pattern-err'), ok ? '' : 'Select your working pattern');
      $('#a-pattern-first').removeAttribute('aria-describedby');
      titleError(!ok);
      if (!ok) { showSummary($('#a-pattern-summary'), [{ id: 'a-pattern-first', msg: 'Select your working pattern' }]); return; }
      next('coupon');
    });
  }

  /* ---------- Page: coupon ---------- */
  function pageCoupon() {
    bind(['#x-coupon', '#a-coupon'], 'coupon');
    function check(v) {
      if (!String(v).trim()) return 'Enter your coupon code';
      if (normCoupon(v) !== normCoupon(COUPON)) return 'wrong';
      return '';
    }
    $('#x-coupon-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var r = check($('#x-coupon').value);
      var m = $('#x-coupon-err');
      if (r) {
        m.textContent = r === 'wrong' ? 'That coupon code is not yours. Enter the code shown in pink.' : 'Enter the code shown in pink';
        m.hidden = false; return;
      }
      m.hidden = true; state.coupon = COUPON; save(); next('submit');
    });
    $('#a-coupon-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var r = check($('#a-coupon').value);
      var msg = r === 'wrong' ? 'Coupon code must be GIV-20-FREE. Check the code and try again' : r;
      setFieldError($('#a-coupon-group'), $('#a-coupon'), $('#a-coupon-err'), msg);
      titleError(!!msg);
      if (msg) { showSummary($('#a-coupon-summary'), [{ id: 'a-coupon', msg: msg }]); return; }
      state.coupon = COUPON; save(); next('submit');
    });
  }

  /* ---------- Page: submit ---------- */
  function renderSummary() {
    var rows = [
      ['Full name', state.name, 'details', 'full name'],
      ['Staff number', state.staff, 'details', 'staff number'],
      ['Working pattern', PATTERNS[state.pattern] || '', 'pattern', 'working pattern'],
      ['Coupon code', state.coupon, 'coupon', 'coupon code']
    ];
    var html = rows.map(function (r) {
      return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd><dd class="giv-summary__act"><a href="' +
        PAGES[r[2]] + '?return=submit">Change<span class="giv-visually-hidden"> ' + r[3] + '</span></a></dd></div>';
    }).join('');
    $all('.giv-js-summary').forEach(function (dl) { dl.innerHTML = html; });
  }
  function makeRef() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    var buf = new Uint32Array(8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
    else for (var i = 0; i < 8; i++) buf[i] = Math.floor(Math.random() * 1e9);
    for (var j = 0; j < 8; j++) out += chars[buf[j] % chars.length] + (j === 3 ? '-' : '');
    return 'GIV-' + out;
  }
  function pageSubmit() {
    renderSummary();
    bind(['#x-date', '#a-date'], 'startDate');
    bind(['#x-declare', '#a-declare'], 'declare');
    function problems(dateV, declared) {
      var errs = [];
      var d = parseDate(dateV);
      if (!String(dateV).trim()) errs.push({ f: 'date', msg: 'Enter the date your 20% off should start' });
      else if (!d) errs.push({ f: 'date', msg: 'Start date must be a real date in the format DD/MM/YYYY, for example 01/04/2027' });
      else if (!isFuture(d)) errs.push({ f: 'date', msg: 'Start date must be in the future' });
      if (!declared) errs.push({ f: 'declare', msg: 'Select the box to confirm you would like to work less' });
      return errs;
    }
    function finish() {
      state.reference = makeRef(); state.submitted = true; save();
      stopTimer(); go('confirmation');
    }
    // Barrier version: one vague message, far from the fields, not announced, focus not moved.
    $('#x-submit-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = problems($('#x-date').value, $('#x-declare').checked);
      var m = $('#x-submit-err');
      if (errs.length) { m.hidden = false; return; }
      m.hidden = true; finish();
    });
    // Accessible version
    $('#a-submit-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = problems($('#a-date').value, $('#a-declare').checked);
      ['date', 'declare'].forEach(function (f) {
        var e = errs.filter(function (x) { return x.f === f; })[0];
        setFieldError($('#a-' + f + '-group'), $('#a-' + f), $('#a-' + f + '-err'), e ? e.msg : '');
      });
      titleError(!!errs.length);
      if (errs.length) { showSummary($('#a-submit-summary'), errs.map(function (e) { return { id: 'a-' + e.f, msg: e.msg }; })); return; }
      finish();
    });
  }

  /* ---------- Page: confirmation ---------- */
  function pageConfirmation() {
    $all('.giv-js-ref').forEach(function (el) { el.textContent = state.reference; });
    $all('.giv-js-name').forEach(function (el) { el.textContent = state.name; });
    $all('.giv-js-again').forEach(function (b) {
      b.addEventListener('click', function () { reset(); go('start'); });
    });
  }

  /* ---------- Page: expired ---------- */
  function pageExpired() {
    var cont = $('#giv-continue-untimed');
    if (cont) cont.addEventListener('click', function () {
      state.timerOff = true; state.deadline = null; save();
      go(state.lastPage && PAGES[state.lastPage] ? state.lastPage : firstIncomplete());
    });
    $all('.giv-js-again').forEach(function (b) {
      b.addEventListener('click', function () { reset(); go('start'); });
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    var page = document.body.getAttribute('data-page');
    if (ORDER.indexOf(page) !== -1) {
      if (!guard(page)) return;
      initTraining(page);
      applyVersion(page, false);
    }
    var handlers = { start: pageStart, details: pageDetails, pattern: pagePattern, coupon: pageCoupon,
      submit: pageSubmit, confirmation: pageConfirmation, expired: pageExpired };
    if (handlers[page]) handlers[page]();
    if (ORDER.indexOf(page) !== -1 && page !== 'confirmation') startTimer(page);
    $all('.giv-js-reset-link').forEach(function (a) {
      a.addEventListener('click', function () { reset(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
