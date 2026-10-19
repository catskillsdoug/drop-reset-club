// Strict opt-in consent. Trackers are written as <script type="text/plain" data-consent="analytics">
// so the browser holds them; Accept swaps each for a live script, in document order.
(function () {
  var CONSENT_COOKIE = 'rc_consent';
  var defaultDoc = typeof document !== 'undefined' ? document : null;

  function readConsent(cookieString) {
    var m = /(?:^|;\s*)rc_consent=(granted|denied)(?:;|$)/.exec(cookieString || '');
    return m ? m[1] : null;
  }

  function consentCookie(value, hostname) {
    var domain = hostname === 'reset.club' || /\.reset\.club$/.test(hostname) ? ' Domain=reset.club;' : '';
    return CONSENT_COOKIE + '=' + value + ';' + domain + ' Path=/; Max-Age=31536000; SameSite=Lax; Secure';
  }

  function activateDeferred(doc) {
    doc = doc || defaultDoc;
    var held = doc.querySelectorAll('script[type="text/plain"][data-consent]');
    var n = 0;
    for (var i = 0; i < held.length; i++) {
      var old = held[i];
      var live = doc.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) {
        var a = old.attributes[j];
        if (a.name !== 'type' && a.name !== 'data-consent') live.setAttribute(a.name, a.value);
      }
      live.textContent = old.textContent;
      old.parentNode.replaceChild(live, old);
      n++;
    }
    return n;
  }

  function state(doc) {
    doc = doc || defaultDoc;
    try { return readConsent(doc.cookie); } catch (e) { return null; }
  }

  function write(value, doc) {
    try {
      doc.cookie = consentCookie(value, doc.location ? doc.location.hostname : '');
    } catch (e) { /* cookies blocked: the choice just does not persist */ }
  }

  // Every rule is scoped under #rc-consent so nothing leaks into drops, content or OwnerRez pages
  // #rc-consent is doubled on child rules so host rules like ".page p" cannot out-rank them
  var BANNER_CSS = [
    '#rc-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;box-sizing:border-box;background:#fcf6e9;color:#000;border-top:3px solid #000;padding:10px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:400;line-height:1.35;text-align:left}',
    '#rc-consent:focus{outline:none}',
    '#rc-consent#rc-consent .rc-consent-msg{margin:0;padding:0;flex:1 1 280px;color:#000;font-family:inherit;font-size:14px;font-weight:400;line-height:1.35;letter-spacing:normal;text-transform:none}',
    '#rc-consent#rc-consent a{color:#000;font-family:inherit;font-size:14px;font-weight:400;line-height:1.35;text-decoration:underline}',
    '#rc-consent#rc-consent .rc-consent-actions{display:flex;gap:10px;flex:0 0 auto}',
    '#rc-consent#rc-consent button{box-sizing:border-box;width:104px;min-height:44px;margin:0;padding:8px 16px;background:#fcf6e9;color:#000;border:3px solid #000;border-radius:0;font-family:inherit;font-size:14px;font-weight:600;line-height:1.2;cursor:pointer;text-transform:none;letter-spacing:normal;box-shadow:none}',
    '#rc-consent#rc-consent button:focus-visible{outline:2px solid #000;outline-offset:2px}'
  ].join('');

  function hideBanner(doc) {
    doc = doc || defaultDoc;
    try {
      var box = doc.getElementById('rc-consent');
      if (box) box.remove();
    } catch (e) { /* nothing to hide */ }
  }

  function el(doc, tag, text, attrs) {
    var e = doc.createElement(tag);
    if (text) e.textContent = text;
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  }

  function open(doc) {
    doc = doc || defaultDoc;
    if (doc.getElementById('rc-consent')) return;
    var box = el(doc, 'div', '', { id: 'rc-consent', role: 'dialog', 'aria-label': 'Cookie choice', tabindex: '-1' });
    box.appendChild(el(doc, 'style', BANNER_CSS));
    // a div, not a p: reset.club content pages style p with !important
    var msg = el(doc, 'div', 'We use cookies for analytics, ads measurement and remembering your choices. ', { class: 'rc-consent-msg' });
    msg.appendChild(el(doc, 'a', 'Privacy', { href: 'https://reset.club/privacy' }));
    box.appendChild(msg);
    var actions = el(doc, 'div', '', { class: 'rc-consent-actions' });
    var yes = el(doc, 'button', 'Accept', { type: 'button', class: 'rc-consent-btn' });
    var no = el(doc, 'button', 'Decline', { type: 'button', class: 'rc-consent-btn' });
    yes.addEventListener('click', function () { accept(doc); });
    no.addEventListener('click', function () { decline(doc); });
    actions.appendChild(yes);
    actions.appendChild(no);
    box.appendChild(actions);
    doc.body.appendChild(box);
    box.focus();
  }

  // False when no footer exists yet; safe to call repeatedly
  function appendSettingsLink(doc) {
    doc = doc || defaultDoc;
    var row = doc.querySelector('.footer-links');
    var host = row || doc.querySelector('footer');
    if (!host) return false;
    // The drops link row does not wrap, so one more link would run off a phone screen
    if (row && row.style) row.style.flexWrap = 'wrap';
    if (doc.querySelector('[data-consent-settings]')) return true;
    var a = el(doc, 'a', 'Cookie settings', { href: '#', 'data-consent-settings': '' });
    a.addEventListener('click', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      open(doc);
    });
    host.appendChild(a);
    return true;
  }

  function accept(doc) {
    doc = doc || defaultDoc;
    write('granted', doc);
    activateDeferred(doc);
    hideBanner(doc);
    try {
      if (typeof window !== 'undefined' && window.posthog) window.posthog.capture('consent_accepted');
    } catch (e) { /* analytics must never break the page */ }
  }

  // Declining is not recorded anywhere, since recording it would itself be tracking.
  function decline(doc) {
    doc = doc || defaultDoc;
    write('denied', doc);
    hideBanner(doc);
  }

  var api = {
    CONSENT_COOKIE: CONSENT_COOKIE,
    readConsent: readConsent,
    consentCookie: consentCookie,
    activateDeferred: activateDeferred,
    state: state,
    accept: accept,
    decline: decline,
    open: open,
    appendSettingsLink: appendSettingsLink,
    boot: boot
  };

  function tryLink(doc) {
    try { appendSettingsLink(doc); } catch (e) { /* the link is a convenience */ }
  }

  function boot(doc) {
    doc = doc || defaultDoc;
    var s = state(doc);
    whenParsed(doc, function (d) {
      tryLink(d);
      if (s === null) open(d);
      else if (s === 'granted') activateDeferred(d);
    });
    // Drops fetch their footer late, so try the link once more on load
    var win = doc.defaultView;
    if (win && doc.readyState !== 'complete') win.addEventListener('load', function () { tryLink(doc); });
  }

  // Held trackers can sit anywhere on the page, so wait until it is parsed
  function whenParsed(doc, fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { fn(doc); });
    else fn(doc);
  }

  if (typeof module === 'object' && module.exports) module.exports = api; else { window.resetConsent = api; boot(); }
})();
