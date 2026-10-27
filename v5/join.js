/**
 * Shared JOIN/LOGIN/OTP panel logic.
 * Used by both the drops page (app.js) and content pages (middleware).
 *
 * Usage:
 *   ResetJoin.init(panelElement, {
 *     bg: '#000',           // panel background color
 *     text: '#fcf6e9',      // panel text color
 *     linkBase: '/v5',      // prefix for Terms/Privacy links
 *     onClose: () => {},    // called after login success or join success
 *     onLogin: (name) => {} // called with first name after OTP verify
 *   });
 *   ResetJoin.setTheme(bg, text); // update colors (e.g. on scroll)
 */
// Inject shared CSS once
(function() {
  if (document.getElementById('rj-styles')) return;
  var s = document.createElement('style');
  s.id = 'rj-styles';
  s.textContent =
    // the menu's language (Doug, 27 Oct): sentence case, every word in the text colour, labels over 1px underlines,
    // the menu's 44px button; inputs at 16px so iPhone never zooms into a field
    '.rj-header { display:flex; justify-content:space-between; align-items:baseline; gap:16px; margin:0 0 12px 0; }' +
    '.rj-title { font-family:Inter,sans-serif; font-size:18px; font-weight:700; margin:0; }' +
    '.rj-toggle, .rj-word, .rj-mode-toggle { font-family:Inter,sans-serif; font-size:13px; font-weight:700; background:none; border:none; color:inherit; padding:0; cursor:pointer; min-height:44px; }' +
    '.rj-fields { display:grid; grid-template-columns:1fr 1fr; gap:0 16px; }' +
    '.rj-field { grid-column:1 / -1; margin:0 0 12px 0; }' +
    '.rj-field--half { grid-column:auto; }' +
    '.rj-label { display:block; font-family:Inter,sans-serif; font-size:13px; font-weight:600; margin:0 0 2px 0; }' +
    '.rj-fields input { font-family:Inter,sans-serif; font-size:16px; font-weight:500; height:44px; padding:0; background:none; border:none; border-bottom:1px solid currentColor; color:inherit; outline:none; width:100%; border-radius:0; -webkit-appearance:none; }' +
    '.rj-fields input:focus { box-shadow:0 1px 0 0 currentColor; }' +
    '.rj-phone-row { display:flex; align-items:center; gap:8px; height:44px; border-bottom:1px solid currentColor; }' +
    '.rj-phone-row:focus-within { box-shadow:0 1px 0 0 currentColor; }' +
    '.rj-phone-prefix { font-family:Inter,sans-serif; font-size:16px; font-weight:600; white-space:nowrap; }' +
    '.rj-fields .rj-phone-row input { border-bottom:none; height:42px; flex:1; box-shadow:none; }' +
    '.rj-meta { display:flex; justify-content:space-between; align-items:center; margin:-8px 0 4px 0; }' +
    '.rj-hint { font-family:Inter,sans-serif; font-size:12px; font-weight:400; }' +
    '.rj-actions { display:flex; align-items:center; gap:22px; margin-top:8px; }' +
    '.rj-btn { font-family:Inter,sans-serif; height:44px; padding:0 16px; font-size:13px; font-weight:700; border:2px solid currentColor; cursor:pointer; border-radius:0; }' +
    '@media (hover:hover) { .rj-btn:hover { opacity:0.85; } }' +
    '.rj-btn:disabled { cursor:default; }' +
    '.rj-otp-hint { font-family:Inter,sans-serif; font-size:13px; font-weight:400; margin:0 0 4px 0; }' +
    '.rj-fields .rj-otp { font-size:22px; font-weight:700; letter-spacing:0.3em; text-align:center; }' +
    '.rj-disclosure { font-family:Inter,sans-serif; font-size:12px; font-weight:400; line-height:1.45; margin:14px 0 0 0; }' +
    '.rj-disclosure a { color:inherit; text-decoration:underline; }' +
    '.rj-switch { font-family:Inter,sans-serif; font-size:13px; margin:18px 0 0 0; }' +
    '.rj-switch .rj-word { min-height:0; text-decoration:underline; font-weight:400; }' +
    '.rj-success { font-family:Inter,sans-serif; font-size:18px; font-weight:700; margin:0; padding:8px 0; }';
  document.head.appendChild(s);
})();

window.ResetJoin = (function() {
  let _panel = null;
  let _opts = {};
  let _mode = 'join'; // join | login | otp
  let _loginMode = 'phone'; // phone | email
  let _loginPhone = '';
  let _loginEmail = '';
  let _loginModeUsed = 'phone';

  // Funnel events. PostHog loads only after consent, so guard every call.
  // Properties are limited to surface and method. Never names, emails or phones.
  function track(name, method) {
    try {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        var p = { surface: (location.pathname === '/' || location.pathname === '/v5' || location.pathname === '/v5/') ? 'homepage' : 'content' };
        if (method) p.method = method;
        window.posthog.capture(name, p);
      }
    } catch (e) {}
  }

  function init(panelEl, opts) {
    _panel = panelEl;
    _opts = opts || {};
    _mode = window.__loggedInName ? 'account' : 'join';
    // opts.mode (join, login, account) overrides the default, used by the slide-over menu
    if (_opts.mode === 'join' || _opts.mode === 'login' || _opts.mode === 'account') _mode = _opts.mode;
    _loginMode = 'phone';
    render();
    if (_mode === 'join') track('join_opened');
    else if (_mode === 'login') track('login_opened');
  }

  function setTheme(bg, text) {
    _opts.bg = bg;
    _opts.text = text;
    if (_panel) {
      _panel.style.backgroundColor = bg;
      _panel.style.color = text;
      // Update button colors
      var btns = _panel.querySelectorAll('.rj-btn');
      btns.forEach(function(b) { b.style.backgroundColor = text; b.style.color = bg; });
    }
  }

  function getTheme() {
    return { bg: _opts.bg || '#000', text: _opts.text || '#fcf6e9' };
  }

  function linkBase() {
    // '' is a valid base (apex) — only fall back when linkBase was never passed.
    if (_opts.linkBase != null) return _opts.linkBase;
    return location.hostname === 'reset.club' ? '' : '/v5';
  }

  function normalizePhone(raw) {
    var digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    return '+' + digits;
  }

  function apiBase() {
    return linkBase() + '/api/auth';
  }

  function render() {
    if (!_panel) return;
    var t = getTheme();
    _panel.style.backgroundColor = t.bg;
    _panel.style.color = t.text;

    // In the menu, Sign in opens in place under YOU (its slot says data-menu-inline) and Join has a view of its own
    // (data-menu-inline-login: the menu can open Sign in from it). Anywhere else the form switches itself, as before.
    var ds = _panel.dataset || {};
    var inline = ds.menuInline === '1', menuLogin = ds.menuInlineLogin === '1';
    var btn = function(label) { return '<button type="button" class="rj-btn" id="rj-btn" style="background-color:' + t.text + ';color:' + t.bg + ';border-color:' + t.text + '">' + label + '</button>'; };
    var field = function(id, label, input, cls) { return '<div class="rj-field' + (cls ? ' ' + cls : '') + '"><label class="rj-label" for="' + id + '">' + label + '</label>' + input + '</div>'; };
    var phone = '<div class="rj-phone-row"><span class="rj-phone-prefix">+1</span><input type="tel" id="rj-ph" autocomplete="tel" inputmode="tel"></div>';

    if (_mode === 'join') {
      _panel.innerHTML =
        '<div class="rj-header"><span class="rj-title">Join</span>' +
          (menuLogin ? '' : '<button type="button" class="rj-toggle" id="rj-toggle">Sign in instead</button>') + '</div>' +
        '<div class="rj-fields">' +
          field('rj-fn', 'First name', '<input type="text" id="rj-fn" autocomplete="given-name">', 'rj-field--half') +
          field('rj-ln', 'Last name', '<input type="text" id="rj-ln" autocomplete="family-name">', 'rj-field--half') +
          field('rj-em', 'Email', '<input type="email" id="rj-em" autocomplete="email">', 'rj-field--wide') +
          field('rj-ph', 'Mobile number', phone, 'rj-field--wide') +
        '</div>' +
        '<div class="rj-actions">' + btn('Join') + '</div>' +
        '<p class="rj-disclosure">By joining you agree to our ' +
          '<a href="' + linkBase() + '/terms">Terms</a> and ' +
          '<a href="' + linkBase() + '/privacy">Privacy Policy</a>. ' +
          'You may receive texts, reply STOP to opt out.</p>' +
        (menuLogin ? '<p class="rj-switch">Have an account? <button type="button" class="rj-word" data-menu-login>Sign in</button></p>' : '');
      var tj = _panel.querySelector('#rj-toggle');
      if (!menuLogin && tj) tj.onclick = function() { _mode = 'login'; _loginMode = 'phone'; render(); track('login_opened'); };
      _panel.querySelector('#rj-btn').onclick = submitJoin;
    } else if (_mode === 'login') {
      var isPhone = _loginMode === 'phone';
      _panel.innerHTML =
        '<div class="rj-header"><span class="rj-title">Sign in</span>' +
          (inline ? '<button type="button" class="rj-word" data-join>Join instead</button>' : '<button type="button" class="rj-toggle" id="rj-toggle">Join instead</button>') + '</div>' +
        '<div class="rj-fields">' +
          (isPhone ? field('rj-ph', 'Mobile number', phone) : field('rj-em', 'Email', '<input type="email" id="rj-em" autocomplete="email">')) +
        '</div>' +
        '<div class="rj-meta"><span class="rj-hint">' + (isPhone ? 'US numbers only' : '') + '</span>' +
          '<button type="button" class="rj-mode-toggle" id="rj-mt">' + (isPhone ? 'Use email instead' : 'Use phone instead') + '</button></div>' +
        '<div class="rj-actions">' + btn('Send code') + (inline ? '<button type="button" class="rj-word" data-menu-back>Cancel</button>' : '') + '</div>';
      var tl = _panel.querySelector('#rj-toggle');
      if (!inline && tl) tl.onclick = function() { _mode = 'join'; render(); };
      _panel.querySelector('#rj-mt').onclick = function() { _loginMode = _loginMode === 'phone' ? 'email' : 'phone'; render(); };
      _panel.querySelector('#rj-btn').onclick = submitLogin;
      // no focus here: on a phone it opens the keyboard before anyone asked and the page jumps (Doug, 27 Oct)
      var inp = _panel.querySelector(isPhone ? '#rj-ph' : '#rj-em');
      if (inp) inp.onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); submitLogin(); } };
    } else if (_mode === 'otp') {
      _panel.innerHTML =
        '<div class="rj-header"><span class="rj-title">Enter the code</span></div>' +
        '<p class="rj-otp-hint">We sent a code to ' + (_loginModeUsed === 'phone' ? _loginPhone : _loginEmail) + '.</p>' +
        '<div class="rj-fields">' + field('rj-otp', 'Code', '<input type="text" class="rj-otp" id="rj-otp" maxlength="6" inputmode="numeric" autocomplete="one-time-code">') + '</div>' +
        '<div class="rj-actions">' + btn('Sign in') + (inline ? '<button type="button" class="rj-word" data-menu-back>Cancel</button>' : '') + '</div>';
      _panel.querySelector('#rj-btn').onclick = submitOTP;
      var otp = _panel.querySelector('#rj-otp');
      // the guest just tapped Send code, so the keyboard is theirs already; the page must not scroll for it
      otp.focus({ preventScroll: true });
      otp.oninput = function() { if (otp.value.length === 6) submitOTP(); };
    } else if (_mode === 'account') {
      _panel.innerHTML =
        '<div class="rj-header"><span class="rj-title">Account</span></div>' +
        '<p class="rj-otp-hint">Signed in as ' + (window.__loggedInName || 'member') + '.</p>' +
        '<div class="rj-actions">' + btn('Sign out') + '</div>';
      _panel.querySelector('#rj-btn').onclick = submitLogout;
    }
  }

  async function submitLogout() {
    var btn = _panel.querySelector('#rj-btn');
    btn.disabled = true; btn.textContent = 'Signing out…';
    try {
      await fetch(apiBase() + '/logout', { method: 'POST', credentials: 'include' });
    } catch(e) { /* cookie clear is server-side; reload regardless */ }
    window.__loggedInName = null;
    location.reload();
  }

  function showSuccess(msg) {
    if (!_panel) return;
    var t = getTheme();
    _panel.innerHTML = '<p class="rj-success">' + msg + '</p>';
    setTimeout(function() {
      if (_opts.onClose) _opts.onClose();
    }, 3000);
  }

  async function submitJoin() {
    var btn = _panel.querySelector('#rj-btn');
    var fn = _panel.querySelector('#rj-fn').value.trim();
    var ln = _panel.querySelector('#rj-ln').value.trim();
    var em = _panel.querySelector('#rj-em').value.trim();
    var ph = _panel.querySelector('#rj-ph').value.trim();
    if (!fn || !em) { btn.textContent = 'Name and email, please'; setTimeout(function() { btn.textContent = 'Join'; }, 1500); return; }
    btn.disabled = true; btn.textContent = 'Joining…';
    var fp = ph;
    if (ph && !ph.startsWith('+')) {
      var d = ph.replace(/\D/g, '');
      if (d.length === 10) fp = '+1' + d;
      else if (d.length === 11 && d[0] === '1') fp = '+' + d;
    }
    try {
      var profileAttrs = { email: em, first_name: fn, last_name: ln };
      if (fp) profileAttrs.phone_number = fp;
      var res = await fetch('https://a.klaviyo.com/client/subscriptions/?company_id=NCFGAB', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'revision': '2024-10-15' },
        body: JSON.stringify({ data: { type: 'subscription', attributes: {
          custom_source: 'reset.club join form',
          profile: { data: { type: 'profile', attributes: profileAttrs } }
        }, relationships: { list: { data: { type: 'list', id: 'UpNBQ7' } } } } })
      });
      if (res.ok || res.status === 202) {
        track('signup_completed');
        showSuccess(fn ? 'Welcome, ' + fn + '.' : 'Welcome to the club.');
        if (window.gtag) gtag('event', 'sign_up', { method: 'join_form' });
        if (window.fbq) fbq('track', 'Lead');
        try {
          if (window.posthog && posthog.capture) {
            posthog.capture('email_signup', { source: 'join_panel', method: 'email' });
          }
        } catch (e) {}
      } else { btn.textContent = 'Try again'; btn.disabled = false; }
    } catch(e) { btn.textContent = 'Try again'; btn.disabled = false; }
  }

  async function submitLogin() {
    var btn = _panel.querySelector('#rj-btn');
    btn.disabled = true; btn.textContent = 'Sending…';
    _loginModeUsed = _loginMode;
    var payload;
    if (_loginMode === 'phone') {
      var raw = _panel.querySelector('#rj-ph').value.trim();
      var digits = raw.replace(/\D/g, '');
      if (digits.length < 10) { btn.textContent = 'Send code'; btn.disabled = false; return; }
      _loginPhone = normalizePhone(raw);
      payload = { phone: _loginPhone };
    } else {
      _loginEmail = _panel.querySelector('#rj-em').value.trim().toLowerCase();
      if (!_loginEmail) { btn.textContent = 'Send code'; btn.disabled = false; return; }
      payload = { email: _loginEmail };
    }
    try {
      var res = await fetch(apiBase() + '/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.success) { track('login_code_requested', _loginModeUsed); _mode = 'otp'; render(); }
      else if (data.hint === 'join') {
        btn.textContent = 'No account yet';
        setTimeout(function() { _mode = 'join'; render(); }, 1500);
      } else { btn.textContent = 'Try again'; btn.disabled = false; }
    } catch(e) { btn.textContent = 'Try again'; btn.disabled = false; }
  }

  async function submitOTP() {
    var btn = _panel.querySelector('#rj-btn');
    var token = _panel.querySelector('#rj-otp').value.trim();
    if (!token || token.length < 6) return;
    btn.disabled = true; btn.textContent = 'Checking…';
    var verifyPayload = _loginModeUsed === 'phone'
      ? { phone: _loginPhone, token: token }
      : { email: _loginEmail, token: token };
    try {
      var res = await fetch(apiBase() + '/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(verifyPayload)
      });
      var data = await res.json();
      if (data.success) {
        var name = data.user && data.user.name ? data.user.name.split(' ')[0] : '';
        track('login_completed', _loginModeUsed);
        if (_opts.onLogin) _opts.onLogin(name);
        showSuccess(name ? 'Welcome back, ' + name + '.' : 'Welcome back.');
        try {
          if (window.posthog && posthog.capture) {
            posthog.capture('email_signup', { source: 'join_panel', method: _loginModeUsed });
          }
        } catch (e) {}
      } else { btn.textContent = 'Try again'; btn.disabled = false; }
    } catch(e) { btn.textContent = 'Try again'; btn.disabled = false; }
  }

  return { init: init, setTheme: setTheme, render: render };
})();
