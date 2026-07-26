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
    '.rj-header { display:flex; justify-content:space-between; align-items:center; margin:0 0 16px 0; }' +
    '.rj-title { font-family:Inter,sans-serif; font-size:18px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; margin:0; }' +
    '.rj-toggle { font-family:Inter,sans-serif; font-size:18px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; cursor:pointer; opacity:0.5; background:none; border:none; color:inherit; padding:0; }' +
    '.rj-toggle:hover { opacity:1; }' +
    '.rj-fields { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }' +
    '@media (max-width:480px) { .rj-fields { grid-template-columns:1fr; } }' +
    '.rj-fields > input { font-family:Inter,sans-serif; font-size:16px; font-weight:500; padding:12px 0; background:none; border:none; border-bottom:3px solid currentColor; color:inherit; outline:none; width:100%; border-radius:0; -webkit-appearance:none; }' +
    '.rj-fields > input::placeholder { color:inherit; opacity:0.35; }' +
    '.rj-fields > input:focus { opacity:1; }' +
    '.rj-phone-row { display:flex; align-items:baseline; gap:6px; border-bottom:3px solid currentColor; grid-column:1 / -1; }' +
    '.rj-phone-prefix { font-family:Inter,sans-serif; font-size:16px; font-weight:700; white-space:nowrap; }' +
    '.rj-phone-row input { font-family:Inter,sans-serif; font-size:16px; font-weight:500; padding:12px 0; background:none; border:none; color:inherit; outline:none; width:100%; border-radius:0; -webkit-appearance:none; flex:1; }' +
    '.rj-phone-row input::placeholder { color:inherit; opacity:0.35; }' +
    '.rj-meta { display:flex; justify-content:space-between; align-items:center; margin:8px 0 12px 0; }' +
    '.rj-hint { font-family:Inter,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; opacity:0.4; }' +
    '.rj-mode-toggle { font-family:Inter,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; cursor:pointer; opacity:0.7; background:none; border:none; color:inherit; padding:0; }' +
    '.rj-btn { font-family:Inter,sans-serif; font-size:18px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; border:none; padding:12px 48px; cursor:pointer; border-radius:0; }' +
    '.rj-btn:hover { opacity:0.8; }' +
    '.rj-btn:disabled { opacity:0.4; cursor:default; }' +
    '.rj-otp-hint { font-family:Inter,sans-serif; font-size:18px; opacity:0.5; margin:0 0 12px 0; }' +
    '.rj-disclosure { font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; opacity:1; margin:12px 0 0 0; line-height:1.4; }' +
    '.rj-disclosure a { color:inherit; text-decoration:underline; }' +
    '.rj-success { font-size:18px; font-weight:700; margin:0; padding:8px 0; }';
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

  function init(panelEl, opts) {
    _panel = panelEl;
    _opts = opts || {};
    _mode = 'join';
    _loginMode = 'phone';
    render();
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
    return _opts.linkBase || (location.hostname === 'reset.club' ? '/n' : '/v5');
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

    if (_mode === 'join') {
      _panel.innerHTML =
        '<div class="rj-header">' +
          '<span class="rj-title">SIGN-UP</span>' +
          '<button class="rj-toggle" id="rj-toggle">LOGIN</button>' +
        '</div>' +
        '<div class="rj-fields">' +
          '<input type="text" id="rj-fn" placeholder="First Name">' +
          '<input type="text" id="rj-ln" placeholder="Last Name">' +
          '<input type="email" id="rj-em" placeholder="Email">' +
          '<input type="tel" id="rj-ph" placeholder="Phone">' +
        '</div>' +
        '<button class="rj-btn" id="rj-btn" style="background-color:' + t.text + ';color:' + t.bg + '">JOIN</button>' +
        '<p class="rj-disclosure">By joining, you agree to our ' +
          '<a href="' + linkBase() + '/terms">Terms</a> and ' +
          '<a href="' + linkBase() + '/privacy">Privacy Policy</a>. ' +
          'You may receive texts\u2009—\u2009reply STOP to opt out.</p>';
      _panel.querySelector('#rj-toggle').onclick = function() { _mode = 'login'; _loginMode = 'phone'; render(); };
      _panel.querySelector('#rj-btn').onclick = submitJoin;
    } else if (_mode === 'login') {
      var isPhone = _loginMode === 'phone';
      _panel.innerHTML =
        '<div class="rj-header">' +
          '<span class="rj-title">LOGIN</span>' +
          '<button class="rj-toggle" id="rj-toggle">SIGN-UP</button>' +
        '</div>' +
        '<div class="rj-fields" style="grid-template-columns:1fr">' +
          (isPhone
            ? '<div class="rj-phone-row"><span class="rj-phone-prefix">+1</span><input type="tel" id="rj-ph" placeholder="(555) 555-5555" autocomplete="tel"></div>'
            : '<input type="email" id="rj-em" placeholder="Email" autocomplete="email">') +
        '</div>' +
        '<div class="rj-meta">' +
          '<span class="rj-hint">' + (isPhone ? 'US NUMBERS ONLY' : '') + '</span>' +
          '<button class="rj-mode-toggle" id="rj-mt">' + (isPhone ? 'USE EMAIL INSTEAD' : 'USE PHONE INSTEAD') + '</button>' +
        '</div>' +
        '<button class="rj-btn" id="rj-btn" style="background-color:' + t.text + ';color:' + t.bg + '">SEND CODE</button>';
      _panel.querySelector('#rj-toggle').onclick = function() { _mode = 'join'; render(); };
      _panel.querySelector('#rj-mt').onclick = function() { _loginMode = _loginMode === 'phone' ? 'email' : 'phone'; render(); };
      _panel.querySelector('#rj-btn').onclick = submitLogin;
      var inp = _panel.querySelector(isPhone ? '#rj-ph' : '#rj-em');
      if (inp) { inp.focus(); inp.onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); submitLogin(); } }; }
    } else if (_mode === 'otp') {
      _panel.innerHTML =
        '<div class="rj-header"><span class="rj-title">ENTER CODE</span></div>' +
        '<p class="rj-otp-hint">Sent to ' + (_loginModeUsed === 'phone' ? _loginPhone : _loginEmail) + '</p>' +
        '<div class="rj-fields" style="grid-template-columns:1fr">' +
          '<input type="text" id="rj-otp" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code" style="letter-spacing:0.2em;text-align:center">' +
        '</div>' +
        '<button class="rj-btn" id="rj-btn" style="background-color:' + t.text + ';color:' + t.bg + '">VERIFY</button>';
      _panel.querySelector('#rj-btn').onclick = submitOTP;
      var otp = _panel.querySelector('#rj-otp');
      otp.focus();
      otp.oninput = function() { if (otp.value.length === 6) submitOTP(); };
    }
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
    if (!fn || !em) { btn.textContent = 'NAME + EMAIL REQUIRED'; setTimeout(function() { btn.textContent = 'JOIN'; }, 1500); return; }
    btn.disabled = true; btn.textContent = 'JOINING...';
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
        showSuccess(fn ? 'Welcome, ' + fn + '.' : 'Welcome to the club.');
        if (window.gtag) gtag('event', 'sign_up', { method: 'join_form' });
        if (window.fbq) fbq('track', 'Lead');
        try {
          if (window.posthog && posthog.capture) {
            posthog.capture('email_signup', { source: 'join_panel', method: 'email' });
          }
        } catch (e) {}
      } else { btn.textContent = 'TRY AGAIN'; btn.disabled = false; }
    } catch(e) { btn.textContent = 'TRY AGAIN'; btn.disabled = false; }
  }

  async function submitLogin() {
    var btn = _panel.querySelector('#rj-btn');
    btn.disabled = true; btn.textContent = 'SENDING...';
    _loginModeUsed = _loginMode;
    var payload;
    if (_loginMode === 'phone') {
      var raw = _panel.querySelector('#rj-ph').value.trim();
      var digits = raw.replace(/\D/g, '');
      if (digits.length < 10) { btn.textContent = 'SEND CODE'; btn.disabled = false; return; }
      _loginPhone = normalizePhone(raw);
      payload = { phone: _loginPhone };
    } else {
      _loginEmail = _panel.querySelector('#rj-em').value.trim().toLowerCase();
      if (!_loginEmail) { btn.textContent = 'SEND CODE'; btn.disabled = false; return; }
      payload = { email: _loginEmail };
    }
    try {
      var res = await fetch(apiBase() + '/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.success) { _mode = 'otp'; render(); }
      else if (data.hint === 'join') {
        btn.textContent = 'NOT FOUND';
        setTimeout(function() { _mode = 'join'; render(); }, 1500);
      } else { btn.textContent = 'TRY AGAIN'; btn.disabled = false; }
    } catch(e) { btn.textContent = 'TRY AGAIN'; btn.disabled = false; }
  }

  async function submitOTP() {
    var btn = _panel.querySelector('#rj-btn');
    var token = _panel.querySelector('#rj-otp').value.trim();
    if (!token || token.length < 6) return;
    btn.disabled = true; btn.textContent = 'VERIFYING...';
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
        if (_opts.onLogin) _opts.onLogin(name);
        showSuccess(name ? 'Welcome back, ' + name + '.' : 'Welcome back.');
        try {
          if (window.posthog && posthog.capture) {
            posthog.capture('email_signup', { source: 'join_panel', method: _loginModeUsed });
          }
        } catch (e) {}
      } else { btn.textContent = 'TRY AGAIN'; btn.disabled = false; }
    } catch(e) { btn.textContent = 'TRY AGAIN'; btn.disabled = false; }
  }

  return { init: init, setTheme: setTheme, render: render };
})();
