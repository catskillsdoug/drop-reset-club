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

  // Task 2 fills in the banner
  function hideBanner() {}
  function open() {}

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
    boot: boot
  };

  function boot(doc) {
    doc = doc || defaultDoc;
    var s = state(doc);
    if (s === null) whenParsed(doc, open);
    else if (s === 'granted') whenParsed(doc, activateDeferred);
  }

  // Held trackers can sit anywhere on the page, so wait until it is parsed
  function whenParsed(doc, fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { fn(doc); });
    else fn(doc);
  }

  if (typeof module === 'object' && module.exports) module.exports = api; else { window.resetConsent = api; boot(); }
})();
