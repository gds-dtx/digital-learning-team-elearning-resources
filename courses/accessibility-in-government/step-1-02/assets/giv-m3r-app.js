/* GIV.UK – Claim 20% off work. Fictional training service. Build m3r.
   Vanilla JavaScript, no dependencies. Answers stay in sessionStorage (this tab only). Nothing is sent anywhere. */
(function () {
  'use strict';

  var KEY = 'givM3rState';
  var LIMIT_MS = 60000;
  var PAGES = {
    start: 'index.html', details: 'giv-m3r-02-details.html', pattern: 'giv-m3r-03-pattern.html',
    coupon: 'giv-m3r-04-coupon.html', submit: 'giv-m3r-05-submit.html',
    confirmation: 'giv-m3r-06-confirmation.html', results: 'giv-m3r-07-results.html'
  };
  var ORDER = ['details', 'pattern', 'coupon', 'submit', 'confirmation', 'results'];
  var PATTERNS = { 'full-time': 'Full time', 'part-time': 'Part time', 'compressed': 'Compressed hours', 'unsure': 'I’m not sure' };
  var COUPON = 'GIV-20-FREE';

  /* ---------- State ---------- */
  var memory = null;
  function blank() {
    return { route: null, deadline: null, remaining: null, timerOff: false, fixed: {}, outcome: {}, explained: {}, fails: {},
      name: '', staff: '', pattern: '', coupon: '', startDate: '', declare: false, reference: '', submitted: false, activated: false };
  }
  function load() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (raw) { var s = JSON.parse(raw), b = blank(); for (var k in b) if (!(k in s)) s[k] = b[k]; return s; }
    } catch (e) { if (memory) return memory; }
    return blank();
  }
  var state = load();
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { memory = state; } }
  function reset() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } state = blank(); memory = null; }

  /* ---------- Helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function go(p) { window.location.href = PAGES[p]; }
  function returning() { return /[?&]return=submit/.test(window.location.search); }
  function next(p) { go(returning() ? 'submit' : p); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function normStaff(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
  function validStaff(v) { return /^GIV\d{6}$/.test(normStaff(v)); }
  function normCode(v) { return String(v || '').replace(/[\s\-–—_]+/g, '').toUpperCase(); }
  function parseDate(v) {
    var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(v || '');
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3], dt = new Date(y, mo - 1, d);
    return (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) ? dt : null;
  }
  function isFuture(dt) { var t = new Date(); t.setHours(0, 0, 0, 0); return dt.getTime() > t.getTime(); }
  function futureDate() {
    var d = new Date(); d.setDate(d.getDate() + 30);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  function fail(stage) { state.fails[stage] = (state.fails[stage] || 0) + 1; save(); return state.fails[stage]; }
  function setOutcome(stage, value) { if (!state.outcome[stage] || value !== 'ok') state.outcome[stage] = value; save(); }

  /* ---------- Journey guard ---------- */
  function firstIncomplete() {
    if (!state.name || !validStaff(state.staff)) return 'details';
    if (!state.pattern) return 'pattern';
    if (normCode(state.coupon) !== normCode(COUPON)) return 'coupon';
    if (!state.submitted) return 'submit';
    if (!state.activated) return 'confirmation';
    return 'results';
  }
  function guard(page) {
    var need = firstIncomplete();
    if (ORDER.indexOf(page) > ORDER.indexOf(need)) { go(need); return false; }
    if (state.submitted && ORDER.indexOf(page) < ORDER.indexOf('confirmation')) { go(need); return false; }
    return true;
  }

  /* ---------- Original vs fixed version of a page ---------- */
  function isFixed(page) { return state.route === 'fixed' || !!state.fixed[page]; }
  function applyVersion(page, focusHeading) {
    var fixed = isFixed(page);
    $all('[data-version]').forEach(function (el) {
      el.hidden = el.getAttribute('data-version') === 'fixed' ? !fixed : fixed;
    });
    var orig = $('#giv-show-original');
    if (orig) orig.hidden = state.route === 'fixed';
    if (focusHeading) {
      var h = $('[data-version="' + (fixed ? 'fixed' : 'original') + '"] h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    }
  }
  function showFixed(page, outcome) {
    state.fixed[page] = true; state.explained[page] = true;
    setOutcome(page, outcome || 'helped');
    syncFields(); applyVersion(page, true);
  }

  /* ---------- Training moment pop-up ---------- */
  var dialog = null, cancelFn = null, lastFocus = null;
  function buildDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'giv-moment';
    dialog.id = 'giv-moment';
    dialog.setAttribute('aria-labelledby', 'giv-moment-title');
    dialog.innerHTML = '<div class="giv-moment__top">Pause: training moment</div>' +
      '<div class="giv-moment__body"><h2 id="giv-moment-title" tabindex="-1"></h2><div id="giv-moment-content"></div></div>' +
      '<div class="giv-moment__actions" id="giv-moment-actions"></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', function (ev) { ev.preventDefault(); var f = cancelFn; closeMoment(); if (f) f(); });
  }
  function pauseTimer() {
    if (state.deadline) { state.remaining = Math.max(1000, state.deadline - Date.now()); state.deadline = null; save(); }
  }
  function resumeTimer() {
    if (state.remaining && !state.timerOff && !state.submitted) {
      state.deadline = Date.now() + state.remaining; state.remaining = null; save();
    }
  }
  function moment(opts) {
    if (!dialog) buildDialog();
    if (dialog.open) closeMoment(true);
    pauseTimer();
    lastFocus = document.activeElement;
    $('#giv-moment-title').textContent = opts.title;
    $('#giv-moment-content').innerHTML = opts.html + (opts.who ? '<p class="giv-moment__who">' + opts.who + '</p>' : '');
    var box = $('#giv-moment-actions');
    box.innerHTML = '';
    opts.actions.forEach(function (a, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'giv-button' + (i === 0 ? '' : ' giv-button--secondary');
      b.textContent = a.label;
      b.addEventListener('click', function () { closeMoment(); a.fn(); });
      box.appendChild(b);
    });
    cancelFn = opts.onCancel || opts.actions[opts.actions.length - 1].fn;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    $('#giv-moment-title').focus();
  }
  function closeMoment(silent) {
    if (!dialog) return;
    if (dialog.open) { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
    cancelFn = null;
    if (!silent) {
      resumeTimer();
      if (lastFocus && document.contains(lastFocus) && lastFocus.offsetParent !== null) lastFocus.focus();
    }
  }
  function momentOpen() { return !!(dialog && dialog.open); }

  /* Struggle pop-up: offered after the barrier gets in the way */
  function struggle(page, title, html, skipFn) {
    state.explained[page] = true; save();
    var actions = [{ label: 'Show me the fixed page', fn: function () { showFixed(page, 'helped'); } }];
    if (skipFn) actions.push({ label: 'Skip this step', fn: function () { setOutcome(page, 'skipped'); skipFn(); } });
    actions.push({ label: 'Keep trying', fn: function () {} });
    moment({ title: title, html: html, actions: actions });
  }
  /* Debrief pop-up: shown once the learner gets through a barrier */
  function debrief(page, d, nextFn) {
    var fixedRoute = state.route === 'fixed';
    if (state.explained[page] && !fixedRoute) { nextFn(); return; }
    state.explained[page] = true; save();
    var actions = [{ label: d.nextLabel || 'Next step', fn: nextFn }];
    if (!fixedRoute && !d.noFixedLink) actions.push({ label: 'See the fixed page', fn: function () { applyVersionAfterSuccess(page); } });
    moment({
      title: fixedRoute ? d.fixedTitle : d.title,
      html: (fixedRoute ? '<p>You used the fixed version. Here’s what the original page did.</p>' : '') + d.html,
      who: d.who, actions: actions, onCancel: nextFn
    });
  }
  function applyVersionAfterSuccess(page) { state.fixed[page] = true; save(); syncFields(); applyVersion(page, true); }

  /* ---------- Countdown ---------- */
  var timerId = null;
  function timerActive() { return (!!state.deadline || !!state.remaining) && !state.timerOff && !state.submitted; }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    var slot = $('#giv-timer-slot'); if (slot) slot.innerHTML = '';
  }
  function expire() {
    stopTimer();
    state.deadline = null; state.remaining = null; state.timerOff = true; state.outcome.timer = 'helped'; state.explained.timer = true; save();
    moment({
      title: 'Time’s up. The offer has expired.',
      html: '<p>Did 60 seconds feel like enough? You couldn’t pause the clock, and there was no way to ask for more time.</p>' +
        '<p>For lots of people, it’s nowhere near enough.</p>',
      who: 'Fixed time limits shut out people who use screen readers, people who read or type more slowly, people who need breaks, and anyone who gets interrupted.',
      actions: [
        { label: 'Carry on without a time limit', fn: function () {} },
        { label: 'Start again', fn: function () { reset(); go('start'); } }
      ]
    });
  }
  function startTimer() {
    var slot = $('#giv-timer-slot');
    if (!slot || !timerActive()) return;
    slot.innerHTML = '<div class="giv-timer"><div class="giv-width giv-timer__inner">' +
      '<span>This offer ends in</span><span class="giv-timer__clock" id="giv-clock">1:00</span>' +
      '<span class="giv-timer__bar" aria-hidden="true"><span class="giv-timer__fill" id="giv-fill"></span></span></div></div>';
    function tick() {
      if (state.timerOff || state.submitted) { stopTimer(); return; }
      var left = state.deadline ? state.deadline - Date.now() : state.remaining;
      if (left == null) return;
      if (left <= 0 && !momentOpen()) { expire(); return; }
      var secs = Math.max(0, Math.ceil(left / 1000));
      var clock = $('#giv-clock'), fill = $('#giv-fill');
      if (clock) clock.textContent = Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
      if (fill) fill.style.width = Math.max(0, Math.min(100, left / LIMIT_MS * 100)) + '%';
      if (slot.firstChild) slot.firstChild.classList.toggle('giv-timer--urgent', secs <= 10);
    }
    tick();
    timerId = setInterval(tick, 250);
  }

  /* ---------- Fixed-version errors ---------- */
  var baseTitle = document.title;
  function titleError(on) { document.title = (on ? 'Error: ' : '') + baseTitle; }
  function showSummary(el, errors) {
    $('ul', el).innerHTML = errors.map(function (e) { return '<li><a href="#' + e.id + '">' + esc(e.msg) + '</a></li>'; }).join('');
    el.hidden = false;
    $all('a', el).forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var t = document.getElementById(a.getAttribute('href').slice(1));
        if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); }
      });
    });
    el.focus();
  }
  function fieldError(group, input, msgEl, msg) {
    var hint = input.getAttribute('data-hint');
    if (msg) {
      group.classList.add('giv-form-group--error');
      if (input.classList.contains('giv-input')) input.classList.add('giv-input--error');
      msgEl.innerHTML = '<span class="giv-visually-hidden">Error:</span> ' + esc(msg);
      msgEl.hidden = false;
      input.setAttribute('aria-describedby', (hint ? hint + ' ' : '') + msgEl.id);
      input.setAttribute('aria-invalid', 'true');
    } else {
      group.classList.remove('giv-form-group--error');
      input.classList.remove('giv-input--error');
      msgEl.hidden = true; msgEl.textContent = '';
      if (hint) input.setAttribute('aria-describedby', hint); else input.removeAttribute('aria-describedby');
      input.removeAttribute('aria-invalid');
    }
  }

  /* Keep both versions of each field in step */
  var syncers = [];
  function syncFields() { syncers.forEach(function (f) { f(); }); }
  function bind(sels, key) {
    function put() {
      sels.forEach(function (s) { var el = $(s); if (!el) return; if (el.type === 'checkbox') el.checked = !!state[key]; else el.value = state[key] || ''; });
    }
    put(); syncers.push(put);
    sels.forEach(function (s) {
      var el = $(s); if (!el) return;
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', function () {
        state[key] = el.type === 'checkbox' ? el.checked : el.value; save();
        sels.forEach(function (o) { var x = $(o); if (x && x !== el) { if (x.type === 'checkbox') x.checked = el.checked; else x.value = el.value; } });
      });
    });
  }

  /* ---------- Start ---------- */
  function pageStart() {
    $('#giv-start').addEventListener('click', function () {
      reset(); state.route = 'timed'; state.deadline = Date.now() + LIMIT_MS; save(); go('details');
    });
    $('#giv-start-untimed').addEventListener('click', function (ev) {
      ev.preventDefault(); reset(); state.route = 'untimed'; state.timerOff = true; state.outcome.timer = 'avoided'; save(); go('details');
    });
    $('#giv-start-fixed').addEventListener('click', function (ev) {
      ev.preventDefault(); reset(); state.route = 'fixed'; state.timerOff = true; state.outcome.timer = 'avoided'; save(); go('details');
    });
  }

  /* ---------- Step 1: details (barrier: no labels) ---------- */
  function pageDetails() {
    bind(['#x-name', '#f-name'], 'name');
    bind(['#x-staff', '#f-staff'], 'staff');
    function check(name, staff) {
      var e = [];
      if (!name.trim()) e.push({ f: 'name', msg: 'Enter your full name' });
      else if (name.trim().length > 60) e.push({ f: 'name', msg: 'Full name must be 60 characters or fewer' });
      if (!staff.trim()) e.push({ f: 'staff', msg: 'Enter your staff number' });
      else if (!validStaff(staff)) e.push({ f: 'staff', msg: 'Enter a staff number in the correct format, like GIV123456' });
      return e;
    }
    function done() {
      var data = [state.name, state.staff];
      debrief('details', {
        title: 'Could you still see the questions?',
        fixedTitle: 'The questions disappeared as people typed',
        html: '<p>The instructions were grey text inside the boxes. As soon as you typed, they vanished.</p>' +
          '<div class="giv-demo"><span class="giv-demo__label">What the form looked like once you’d typed</span>' +
          data.map(function (v, i) { return '<div class="giv-input giv-input--w20" role="img" aria-label="Box ' + (i + 1) + ', no label, contains ' + esc(v) + '">' + esc(v) + '</div>'; }).join('') +
          '<p>Which box is which? What format did the staff number need?</p></div>' +
          '<p>There were no proper labels, so nothing told you, or your software, what each box was for.</p>',
        who: 'This trips up people who get interrupted, people with memory or concentration difficulties, and people who control their computer by voice. They need a label to say out loud.'
      }, function () { next('pattern'); });
    }
    $('#x-details-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      // Barrier: the format is only in the placeholder, so errors don't explain it.
      var errs = check($('#x-name').value, $('#x-staff').value);
      ['name', 'staff'].forEach(function (f) {
        var m = $('#x-' + f + '-err'), e = errs.filter(function (x) { return x.f === f; })[0];
        m.hidden = !e; m.textContent = e ? (f === 'staff' && e.msg.indexOf('format') > -1 ? 'Staff number is not valid' : e.msg) : '';
      });
      if (errs.length) {
        if (fail('details') >= 2 && !state.explained.details) {
          struggle('details', 'Stuck on this page?',
            '<p>The format for the staff number was only shown inside the box, and it disappeared when you started typing.</p>' +
            '<p>That’s the barrier on this page: no proper labels or hints.</p>',
            function () { state.name = state.name || 'Sam Sample'; state.staff = 'GIV123456'; save(); next('pattern'); });
        }
        return;
      }
      state.name = $('#x-name').value.trim(); state.staff = normStaff($('#x-staff').value);
      setOutcome('details', 'ok'); done();
    });
    $('#f-details-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = check($('#f-name').value, $('#f-staff').value);
      ['name', 'staff'].forEach(function (f) {
        var e = errs.filter(function (x) { return x.f === f; })[0];
        fieldError($('#f-' + f + '-group'), $('#f-' + f), $('#f-' + f + '-err'), e ? e.msg : '');
      });
      titleError(!!errs.length);
      if (errs.length) { showSummary($('#f-details-summary'), errs.map(function (e) { return { id: 'f-' + e.f, msg: e.msg }; })); return; }
      state.name = $('#f-name').value.trim(); state.staff = normStaff($('#f-staff').value); save();
      if (state.route === 'fixed') { setOutcome('details', 'avoided'); done(); } else next('pattern');
    });
  }

  /* ---------- Step 2: pattern (barrier: mouse only) ---------- */
  function pagePattern() {
    var cards = $all('.giv-x-card');
    function paint() {
      cards.forEach(function (c) { c.classList.toggle('is-selected', c.getAttribute('data-value') === state.pattern); });
      $all('input[name="f-pattern"]').forEach(function (r) { r.checked = r.value === state.pattern; });
    }
    syncers.push(paint); paint();
    cards.forEach(function (c) {
      c.addEventListener('click', function () { state.pattern = c.getAttribute('data-value'); save(); paint(); $('#x-pattern-err').hidden = true; });
    });
    function done() {
      debrief('pattern', {
        title: 'Did you try it without a mouse?',
        fixedTitle: 'The original page only worked with a mouse',
        html: '<p>These options only worked if you could click or tap them.</p>' +
          '<div class="giv-demo"><span class="giv-demo__label">What happened if you pressed the Tab key</span>' +
          '<ol class="giv-demo-tabs"><li>Skip to main content</li><li>GIV.UK</li><li>Claim 20% off work</li><li>Back</li>' +
          '<li>About this activity (at the bottom of the page)</li></ol>' +
          '<p class="giv-demo-tabs is-missed">Never reached: the 4 options and the Continue button.</p></div>',
        who: 'Many people don’t use a mouse: people with tremors or limited movement, blind people using screen readers, and people using voice control or switches. And anyone with a broken wrist.'
      }, function () { next('coupon'); });
    }
    $('#x-continue').addEventListener('click', function () {
      if (!state.pattern) { $('#x-pattern-err').hidden = false; return; }
      setOutcome('pattern', 'ok'); done();
    });
    // Struggle detection: repeated Tab presses on the original version without choosing an option.
    var tabs = 0;
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Tab' || isFixed('pattern') || momentOpen() || state.explained.pattern) return;
      tabs += 1;
      if (tabs >= 4 && !state.pattern) {
        struggle('pattern', 'Can’t choose an option?',
          '<p>These options only work with a mouse or touch screen. Pressing Tab skips right past them, and so does the Continue button.</p>' +
          '<p>That’s the barrier on this page.</p>',
          function () { state.pattern = 'unsure'; save(); next('coupon'); });
      }
    });
    $all('input[name="f-pattern"]').forEach(function (r) { r.addEventListener('change', function () { state.pattern = r.value; save(); paint(); }); });
    $('#f-pattern-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var ok = !!PATTERNS[state.pattern];
      fieldError($('#f-pattern-group'), $('#f-pattern-first'), $('#f-pattern-err'), ok ? '' : 'Select your working pattern');
      titleError(!ok);
      if (!ok) { showSummary($('#f-pattern-summary'), [{ id: 'f-pattern-first', msg: 'Select your working pattern' }]); return; }
      if (state.route === 'fixed') { setOutcome('pattern', 'avoided'); done(); } else next('coupon');
    });
  }

  /* ---------- Step 3: coupon (barrier: colour only) ---------- */
  var CODES = [['GIV-20-FEE', '#5C8199'], ['GIV-02-FREE', '#99685C'], ['GIV-20-FREE', '#DE00A5'], ['GIV-200-FREE', '#816BB2']];
  function codeList(cls) {
    return '<ul class="' + cls + '" aria-hidden="true">' + CODES.map(function (c) { return '<li style="color:' + c[1] + '">' + c[0] + '</li>'; }).join('') + '</ul>';
  }
  function pageCoupon() {
    bind(['#x-coupon', '#f-coupon'], 'coupon');
    function done() {
      debrief('coupon', {
        title: 'Could everyone spot the pink one?',
        fixedTitle: 'The original page used colour as the only clue',
        html: '<p>The page only told you which code was yours by its colour.</p>' +
          '<div class="giv-demo"><span class="giv-demo__label">The same 4 codes, seen differently</span><div class="giv-demo-codes">' +
          '<figure><figcaption>How it was designed</figcaption>' + codeList('') + '</figure>' +
          '<figure><figcaption>With red-green colour blindness (approximate)</figcaption>' + codeList('giv-cvd-deut') + '</figure>' +
          '<figure><figcaption>In black and white</figcaption>' + codeList('giv-cvd-grey') + '</figure>' +
          '</div><p class="giv-visually-hidden">In the colour blindness and black and white views, the 4 codes look much more alike.</p></div>' +
          '<p>A screen reader reads out the codes, but not their colours. The simple fix: say it in words. “Your code is GIV-20-FREE.”</p>',
        who: 'Around 1 in 12 men and 1 in 200 women are colour blind. Blind and partially sighted people are affected too.'
      }, function () { next('submit'); });
    }
    $('#x-coupon-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = $('#x-coupon').value, m = $('#x-coupon-err');
      if (normCode(v) !== normCode(COUPON)) {
        m.textContent = v.trim() ? 'That’s not your code. Use the one shown in pink.' : 'Enter the code shown in pink';
        m.hidden = false;
        if (fail('coupon') >= 2 && !state.explained.coupon) {
          struggle('coupon', 'Not sure which code is yours?',
            '<p>The only clue was colour. If you can’t tell the colours apart, or can’t see them, all 4 codes look equally likely.</p>' +
            '<p>That’s the barrier on this page.</p>',
            function () { state.coupon = COUPON; save(); next('submit'); });
        }
        return;
      }
      m.hidden = true; state.coupon = COUPON; setOutcome('coupon', 'ok'); done();
    });
    $('#f-coupon-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = $('#f-coupon').value;
      var msg = !v.trim() ? 'Enter your coupon code' : (normCode(v) !== normCode(COUPON) ? 'Coupon code must be GIV-20-FREE' : '');
      fieldError($('#f-coupon-group'), $('#f-coupon'), $('#f-coupon-err'), msg);
      titleError(!!msg);
      if (msg) { showSummary($('#f-coupon-summary'), [{ id: 'f-coupon', msg: msg }]); return; }
      state.coupon = COUPON; save();
      if (state.route === 'fixed') { setOutcome('coupon', 'avoided'); done(); } else next('submit');
    });
  }

  /* ---------- Step 4: submit (barrier: unclear errors) ---------- */
  function renderAnswers() {
    var rows = [['Full name', state.name, 'details', 'full name'], ['Staff number', state.staff, 'details', 'staff number'],
      ['Working pattern', PATTERNS[state.pattern] || '', 'pattern', 'working pattern'], ['Coupon code', state.coupon, 'coupon', 'coupon code']];
    var html = rows.map(function (r) {
      return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd><dd class="giv-summary__act"><a href="' + PAGES[r[2]] +
        '?return=submit">Change<span class="giv-visually-hidden"> ' + r[3] + '</span></a></dd></div>';
    }).join('');
    $all('.giv-js-answers').forEach(function (dl) { dl.innerHTML = html; });
  }
  function makeRef() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '', buf = new Uint32Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf); else for (var i = 0; i < 8; i++) buf[i] = Math.floor(Math.random() * 1e9);
    for (var j = 0; j < 8; j++) out += chars[buf[j] % chars.length] + (j === 3 ? '-' : '');
    return 'GIV-' + out;
  }
  function pageSubmit() {
    renderAnswers();
    bind(['#x-date', '#f-date'], 'startDate');
    bind(['#x-declare', '#f-declare'], 'declare');
    function problems(dateV, declared) {
      var e = [], d = parseDate(dateV);
      if (!String(dateV).trim()) e.push({ f: 'date', msg: 'Enter the date your 20% off should start' });
      else if (!d) e.push({ f: 'date', msg: 'Start date must be a real date in the format DD/MM/YYYY, for example 01/04/2027' });
      else if (!isFuture(d)) e.push({ f: 'date', msg: 'Start date must be in the future' });
      if (!declared) e.push({ f: 'declare', msg: 'Select the box to confirm you would like to work less' });
      return e;
    }
    function finish(showDebrief) {
      state.reference = makeRef(); state.submitted = true; state.deadline = null; state.remaining = null;
      if (!state.outcome.timer) state.outcome.timer = 'ok';
      save(); stopTimer();
      if (!showDebrief) { go('confirmation'); return; }
      var hadErrors = (state.fails.submit || 0) > 0;
      debrief('submit', {
        title: hadErrors ? 'That error message wasn’t much help, was it?' : 'You got through first time. Not everyone does.',
        fixedTitle: 'The original page had a useless error message',
        html: (hadErrors ? '<p>It didn’t say which answer was wrong, or how to fix it.</p>' : '<p>If anything had been wrong, this is all you’d have seen:</p>') +
          '<div class="giv-demo"><span class="giv-demo__label">The only error message</span><p class="giv-x-error">Something went wrong. Please try again.</p></div>' +
          '<p>The date only worked typed exactly like 01/04/2027, and nobody said so. A screen reader wouldn’t even announce the message.</p>',
        who: 'Vague errors hit hardest for people with learning disabilities or anxiety, people using screen readers, and anyone racing a clock.',
        nextLabel: 'See your confirmation', noFixedLink: true
      }, function () { go('confirmation'); });
    }
    $('#x-submit-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var m = $('#x-submit-err');
      if (problems($('#x-date').value, $('#x-declare').checked).length) {
        m.hidden = false; // Barrier: vague, not announced, focus stays on the button
        if (fail('submit') >= 2 && !state.explained.submit) {
          struggle('submit', 'Not sure what went wrong?',
            '<p>Neither is the service. The message didn’t say which answer was the problem, or how to fix it.</p>' +
            '<p>Here’s the secret: the date had to be typed exactly like 01/04/2027, in the future, and the box had to be ticked.</p>',
            function () { state.startDate = futureDate(); state.declare = true; finish(false); });
        }
        return;
      }
      m.hidden = true; setOutcome('submit', 'ok'); finish(true);
    });
    $('#f-submit-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = problems($('#f-date').value, $('#f-declare').checked);
      ['date', 'declare'].forEach(function (f) {
        var e = errs.filter(function (x) { return x.f === f; })[0];
        fieldError($('#f-' + f + '-group'), $('#f-' + f), $('#f-' + f + '-err'), e ? e.msg : '');
      });
      titleError(!!errs.length);
      if (errs.length) { showSummary($('#f-submit-summary'), errs.map(function (e) { return { id: 'f-' + e.f, msg: e.msg }; })); return; }
      if (state.route === 'fixed') { setOutcome('submit', 'avoided'); finish(true); } else finish(false);
    });
  }

  /* ---------- Confirmation (barrier: low contrast) ---------- */
  function pageConfirmation() {
    $all('.giv-js-ref').forEach(function (el) { el.textContent = state.reference; });
    $all('.giv-js-name').forEach(function (el) { el.textContent = state.name; });
    function done() {
      debrief('confirmation', {
        title: 'Was your reference easy to read?',
        fixedTitle: 'The original reference was very hard to read',
        html: '<p>It was pale pink on a pink background: the most important thing on the page, and the hardest to read.</p>' +
          '<div class="giv-demo"><span class="giv-demo__label">Your reference on a phone, outside</span><div class="giv-sun-row">' +
          '<div class="giv-sun" role="img" aria-label="Original: pale pink text washed out by glare">' + esc(state.reference) + '</div>' +
          '<div class="giv-sun giv-sun--fixed" role="img" aria-label="Fixed: white text, easy to read">' + esc(state.reference) + '</div></div></div>',
        who: 'Low contrast is hard for people with low vision, many older people, and anyone using a phone in sunlight.',
        nextLabel: 'See how you did', noFixedLink: true
      }, function () { go('results'); });
    }
    function attempt(input, errEl, fixed) {
      var ok = normCode(input.value) === normCode(state.reference);
      if (!ok) {
        errEl.textContent = input.value.trim() ? 'That reference doesn’t match. Check it and try again.' : 'Enter your coupon reference';
        errEl.hidden = false;
        if (!fixed && fail('confirmation') >= 2 && !state.explained.confirmation) {
          struggle('confirmation', 'Hard to read?',
            '<p>Your reference was pale pink on a pink background. Many people can’t read that at all.</p><p>That’s the barrier on this page.</p>',
            function () { state.activated = true; save(); go('results'); });
        }
        return;
      }
      state.activated = true;
      if (fixed) { setOutcome('confirmation', state.route === 'fixed' ? 'avoided' : 'helped'); save(); if (state.route === 'fixed') done(); else go('results'); }
      else { setOutcome('confirmation', 'ok'); done(); }
    }
    $('#x-activate-form').addEventListener('submit', function (ev) { ev.preventDefault(); attempt($('#x-ref'), $('#x-ref-err'), false); });
    $('#f-activate-form').addEventListener('submit', function (ev) { ev.preventDefault(); attempt($('#f-ref'), $('#f-ref-err'), true); });
  }

  /* ---------- Results ---------- */
  var BARRIERS = [
    ['timer', 'A countdown you couldn’t stop', 'You had 60 seconds, with no way to pause or ask for more time.', 'Let people turn off, pause or extend time limits.'],
    ['details', 'Questions that disappeared', 'The instructions were inside the boxes and vanished when you typed.', 'Use a visible label and hint above every box.'],
    ['pattern', 'Options you had to click', 'The options and Continue button didn’t work with a keyboard.', 'Use standard buttons and radio buttons. They work with any input.'],
    ['coupon', 'Colour as the only clue', 'Your code was only marked out by being pink.', 'Say it in words, too.'],
    ['submit', 'An unhelpful error message', '“Something went wrong” didn’t say what, where or how to fix it.', 'Say exactly what’s wrong and how to fix it, next to the answer.'],
    ['confirmation', 'Text you could barely see', 'Your reference was pale pink on pink.', 'Use strong contrast for all text.']
  ];
  var STATUS = { ok: 'You got past it', helped: 'You needed help', skipped: 'You skipped it', avoided: 'You avoided it' };
  function pageResults() {
    var got = 0;
    var html = BARRIERS.map(function (b) {
      var o = state.outcome[b[0]] || 'skipped';
      if (o === 'ok') got += 1;
      return '<li class="giv-card"><h3>' + b[1] + '</h3><p>' + b[2] + '</p><p><strong>The fix:</strong> ' + b[3] + '</p>' +
        '<span class="giv-card__status">' + STATUS[o] + '</span></li>';
    }).join('');
    $('#giv-cards').innerHTML = html;
    $('#giv-score').textContent = state.route === 'fixed'
      ? 'You used the accessible version, so you avoided all 6 barriers. Here’s what the original service did.'
      : 'You hit 6 barriers. You got past ' + got + ' of them on your own.';
    $all('.giv-js-again').forEach(function (b) { b.addEventListener('click', function () { reset(); go('start'); }); });
  }

  /* ---------- Boot ---------- */
  function boot() {
    var page = document.body.getAttribute('data-page');
    if (ORDER.indexOf(page) !== -1) {
      if (!state.route) { go('start'); return; }
      if (!guard(page)) return;
      applyVersion(page, false);
      var orig = $('#giv-show-original');
      if (orig) orig.addEventListener('click', function () { state.fixed[page] = false; save(); syncFields(); applyVersion(page, true); });
    }
    var h = { start: pageStart, details: pageDetails, pattern: pagePattern, coupon: pageCoupon, submit: pageSubmit, confirmation: pageConfirmation, results: pageResults };
    if (h[page]) h[page]();
    if (['details', 'pattern', 'coupon', 'submit'].indexOf(page) !== -1) startTimer();
    $all('.giv-js-reset-link').forEach(function (a) { a.addEventListener('click', function () { reset(); }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
