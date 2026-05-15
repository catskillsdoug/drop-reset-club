/**
 * Shared inline editor toolbar for content pages and news articles.
 *
 * Usage:
 *   ResetEditor.init({
 *     bodyId: 'article-body',      // ID of the editable body element
 *     titleId: 'article-title',    // ID of the editable title element (optional)
 *     supabaseKey: '...',          // Supabase anon key for media picker
 *     save: async function(data) { ... }, // { title, body } → save to API
 *     slug: 'about/story',         // for status display
 *   });
 */

// Inject editor CSS once
(function() {
  if (document.getElementById('re-styles')) return;
  var s = document.createElement('style');
  s.id = 're-styles';
  s.textContent =
    '.re-pencil { position:fixed; bottom:16px; right:16px; width:44px; height:44px; background:#000; color:#fcf6e9; border:none; cursor:pointer; z-index:999; font-size:18px; display:none; align-items:center; justify-content:center; }' +
    '.re-pencil.visible { display:flex; }' +
    '@media (hover:hover) { .re-pencil:hover { background:#019740; } }' +
    '.re-bar { position:fixed; bottom:0; left:0; right:0; background:#000; color:#fcf6e9; padding:12px 24px; display:none; align-items:center; gap:8px; z-index:999; font-family:Inter,system-ui,sans-serif; flex-wrap:wrap; }' +
    '.re-bar.active { display:flex; }' +
    '.re-bar button { font-family:Inter,system-ui,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:6px 12px; border:none; cursor:pointer; }' +
    '.re-bar .re-save { background:#019740; color:#fff; }' +
    '.re-bar .re-save:disabled { opacity:0.4; }' +
    '.re-bar .re-cancel { background:transparent; color:#fcf6e9; border:1px solid #fcf6e9; }' +
    '.re-bar .re-tool { background:transparent; color:#fcf6e9; border:1px solid rgba(252,246,233,0.3); }' +
    '@media (hover:hover) { .re-bar .re-tool:hover { border-color:#fcf6e9; } }' +
    '.re-bar .re-sep { width:1px; height:24px; background:rgba(252,246,233,0.2); }' +
    '.re-bar .re-status { margin-left:auto; font-size:11px; opacity:0.5; }' +
    'body.re-editing { padding-bottom:64px; }' +
    'body.re-editing .re-pencil { display:none !important; }' +
    '[contenteditable=true] { outline:2px dashed #019740; outline-offset:8px; min-height:50px; }' +
    '[contenteditable=true]:focus { outline-color:#3f65f6; }' +
    '.content img, .article-body img { max-width:100%; height:auto; margin:16px 0; display:block; border:2px solid #000; box-sizing:border-box; }' +
    '.content .image-block, .article-body .image-block { display:table; max-width:100%; margin:16px 0; }' +
    '.content .image-block img, .article-body .image-block img { margin:0; }' +
    '.content .image-block .image-caption, .article-body .image-block .image-caption { margin-top:8px; margin-bottom:0; }' +
    '@media (min-width:1200px) { .content .image-block, .article-body .image-block { display:block; width:max-content; max-width:calc(100vw - 96px); margin-left:-48px; margin-right:0; } .content .image-block .image-caption, .article-body .image-block .image-caption { margin-left:48px; width:calc(100% - 48px); padding-left:0; padding-right:0; box-sizing:border-box; } }' +
    '.link-row-wrap { margin:0; }' +
    '.link-row-wrap:first-of-type { margin-top:16px; }' +
    '.link-row { display:flex; width:100%; justify-content:space-between; align-items:center; padding:16px 0; border-bottom:3px solid #000; text-decoration:none; color:inherit; font-size:18px; font-weight:700; box-sizing:border-box; }' +
    '.link-row::after { content:"→"; flex-shrink:0; margin-left:16px; }' +
    '.link-row-wrap:first-of-type .link-row { border-top:3px solid #000; }' +
    '@media (hover:hover) { .link-row:hover { opacity:0.6; } }' +
    /* Nav panel */
    '.re-nav-panel { position:fixed; left:0; right:0; bottom:52px; background:#000; color:#fcf6e9; padding:16px 24px; z-index:1000; display:none; flex-direction:column; gap:8px; max-height:60vh; overflow-y:auto; border-top:1px solid rgba(252,246,233,0.2); font-family:Inter,system-ui,sans-serif; }' +
    '.re-nav-panel.active { display:flex; }' +
    '.re-nav-head { display:flex; align-items:center; gap:12px; padding-bottom:8px; }' +
    '.re-nav-head h3 { margin:0; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; }' +
    '.re-nav-head .spacer { flex:1; }' +
    '.re-nav-list { display:flex; flex-direction:column; gap:4px; }' +
    '.re-nav-row { display:flex; align-items:center; gap:8px; padding:8px; background:rgba(252,246,233,0.04); border:1px solid rgba(252,246,233,0.15); cursor:default; touch-action:none; }' +
    '.re-nav-row.dragging { opacity:0.4; }' +
    '.re-nav-row .grip { width:20px; cursor:grab; user-select:none; opacity:0.5; font-size:14px; line-height:1; text-align:center; }' +
    '.re-nav-row .grip:active { cursor:grabbing; }' +
    '.re-nav-row input { font-family:Inter,system-ui,sans-serif; font-size:12px; padding:6px 8px; background:transparent; border:1px solid rgba(252,246,233,0.3); color:#fcf6e9; border-radius:0; box-sizing:border-box; }' +
    '.re-nav-row input.label { flex:1; min-width:0; }' +
    '.re-nav-row input.url { flex:2; min-width:0; font-family:JetBrains Mono,monospace; }' +
    '.re-nav-row .del { background:transparent; border:1px solid rgba(255,85,30,0.5); color:#ff551e; padding:6px 8px; font-size:11px; cursor:pointer; }' +
    '.re-nav-add { background:transparent; color:#fcf6e9; border:1px dashed rgba(252,246,233,0.4); padding:10px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; cursor:pointer; margin-top:8px; }' +
    '@media (hover:hover) { .re-nav-add:hover { border-color:#fcf6e9; } }' +
    '.re-nav-row .pub { display:flex; align-items:center; gap:4px; font-size:10px; opacity:0.6; cursor:pointer; user-select:none; }' +
    /* Image module — only visible while editing, never on the live page */
    'body.re-editing .image-block { position:relative; outline:1px dashed rgba(0,0,0,0.15); outline-offset:4px; transition:outline-color 0.15s; }' +
    'body.re-editing .image-block:hover { outline-color:rgba(0,0,0,0.3); }' +
    'body.re-editing .image-block:focus-within { outline:1px solid #019740; }' +
    'body.re-editing .re-img-delete { position:absolute; top:8px; right:8px; width:32px; height:32px; padding:0; background:rgba(0,0,0,0.75); color:#fff; border:none; cursor:pointer; font-size:20px; line-height:32px; opacity:0; transition:opacity 0.15s, background 0.15s; z-index:2; font-family:inherit; }' +
    'body.re-editing .image-block:hover .re-img-delete, body.re-editing .image-block:focus-within .re-img-delete { opacity:1; }' +
    '@media (hover:hover) { body.re-editing .re-img-delete:hover { background:#ff551e; } }' +
    'body.re-editing .image-caption .caption:empty::before { content:"Caption"; opacity:0.3; }' +
    'body.re-editing .image-caption .credit:empty::before { content:"Credit"; opacity:0.3; }' +
    'body.re-editing .image-caption .caption, body.re-editing .image-caption .credit { min-width:60px; cursor:text; }' +
    'body.re-editing .image-caption .caption:focus, body.re-editing .image-caption .credit:focus { outline:1px solid #3f65f6; outline-offset:2px; }';
  document.head.appendChild(s);
})();

window.ResetEditor = (function() {
  var _bodyEl = null;
  var _titleEl = null;
  var _opts = {};
  var _imgPicker = null;
  var _imgDebounce = null;

  // Wrap an R2 URL through image.reset.club's thumb preset (200w, q80) so the
  // picker grid pulls ~10KB previews instead of full-size originals.
  function thumbUrl(r2Url) {
    if (!r2Url) return '';
    var R2_BASE = 'https://pub-e11155ba60cf4f258fb0e4e599e2ed1f.r2.dev/';
    if (r2Url.indexOf(R2_BASE) === 0) {
      return 'https://image.reset.club/thumb/' + r2Url.slice(R2_BASE.length);
    }
    return r2Url;
  }

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  // Strip contentEditable artifacts before save. When the browser deletes a
  // paragraph (e.g. when removing an image's surrounding markup), the runtime
  // sometimes leaves the adjacent text wrapped in <span style="font-size:Npx">
  // instead of a fresh <p>. That orphan span renders without paragraph
  // margins/weight, so the text looks "off" relative to its siblings. Convert
  // these back to <p> so the visual hierarchy is preserved.
  function normalizeBody(html) {
    html = html.replace(/<span\s+style="font-size:[^"]*"\s*>([\s\S]*?)<\/span>/gi, '<p>$1</p>');
    // Strip editor-only delete buttons.
    html = html.replace(/<button\b[^>]*class="re-img-delete"[^>]*>[\s\S]*?<\/button>/gi, '');
    // Strip editor-only contenteditable attributes — they're injected at edit
    // time to make the image-block atomic but have no meaning on the live page.
    html = html.replace(/\s+contenteditable="(?:true|false)"/gi, '');
    // Drop image-caption blocks where both fields are still empty.
    html = html.replace(/<div\s+class="image-caption">\s*<span\s+class="caption">\s*(?:<br\s*\/?>)?\s*<\/span>\s*<span\s+class="credit">\s*(?:<br\s*\/?>)?\s*<\/span>\s*<\/div>\s*/gi, '');
    // Unwrap image-block wrappers that contain only an <img> (no caption left).
    // The wrapper is re-added by injectImageBlocks on next edit, so the saved
    // HTML stays clean when the caption is empty.
    html = html.replace(/<div\s+class="image-block">\s*(<img\b[^>]*>)\s*<\/div>\s*/gi, '$1');
    return html;
  }

  // For every <img> in the editable body, ensure it's wrapped in a
  // contenteditable=false <div class="image-block"> with an editable caption
  // block following the image. New inserts get this structure from the picker;
  // legacy images (just <img>) get the wrapper added here so they're treated
  // as modular blocks too. Pure DOM mutation — does not trigger input events.
  function injectImageBlocks(root, onChange) {
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var parent = img.parentNode;
      var block;
      if (parent && parent.classList && parent.classList.contains('image-block')) {
        block = parent;
      } else {
        block = document.createElement('div');
        block.className = 'image-block';
        parent.insertBefore(block, img);
        block.appendChild(img);
        // Move an adjacent .image-caption (saved from a prior session) inside.
        var sib = block.nextSibling;
        while (sib && sib.nodeType === 3 && !sib.textContent.trim()) sib = sib.nextSibling;
        if (sib && sib.nodeType === 1 && sib.classList && sib.classList.contains('image-caption')) {
          block.appendChild(sib);
        }
      }
      block.setAttribute('contenteditable', 'false');
      var cap = block.querySelector('.image-caption');
      if (!cap) {
        cap = document.createElement('div');
        cap.className = 'image-caption';
        cap.innerHTML = '<span class="caption" contenteditable="true"></span><span class="credit" contenteditable="true"></span>';
        block.appendChild(cap);
      } else {
        var capSpan = cap.querySelector('.caption');
        var crdSpan = cap.querySelector('.credit');
        if (capSpan) capSpan.setAttribute('contenteditable', 'true');
        if (crdSpan) crdSpan.setAttribute('contenteditable', 'true');
      }
      // Add a hover-revealed delete button. Stripped on save by normalizeBody.
      if (!block.querySelector('.re-img-delete')) {
        var del = document.createElement('button');
        del.className = 're-img-delete';
        del.type = 'button';
        del.setAttribute('aria-label', 'Delete image');
        del.textContent = '×';
        (function(b) {
          del.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!window.confirm('Delete this image?')) return;
            b.parentNode.removeChild(b);
            if (onChange) onChange();
          });
        })(block);
        block.appendChild(del);
      }
    }
  }

  function init(opts) {
    _opts = opts;
    var API = location.hostname === 'reset.club' ? '/n/api/auth' : '/api/auth';

    // Create pencil
    var pencil = document.createElement('button');
    pencil.className = 're-pencil';
    pencil.title = 'Edit this page';
    pencil.innerHTML = '&#9998;';
    document.body.appendChild(pencil);

    // Create toolbar
    var bar = document.createElement('div');
    bar.className = 're-bar';
    bar.innerHTML =
      '<button class="re-save" id="re-save" disabled>Save</button>' +
      '<button class="re-cancel" id="re-cancel">Cancel</button>' +
      '<span class="re-sep"></span>' +
      '<button class="re-tool" id="re-link">Link</button>' +
      '<button class="re-tool" id="re-link-row">Link →</button>' +
      '<button class="re-tool" id="re-heading">H2</button>' +
      '<button class="re-tool" id="re-hr">—</button>' +
      '<button class="re-tool" id="re-img">Image</button>' +
      '<button class="re-tool" id="re-bold">B</button>' +
      (opts.navGroup ? '<span class="re-sep"></span><button class="re-tool" id="re-nav-toggle">Nav</button>' : '') +
      (opts.showPropertyPicker ? '<span class="re-sep"></span><select id="re-property" style="font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:4px 8px;background:#000;color:#fcf6e9;border:1px solid rgba(252,246,233,0.3);cursor:pointer;"><option value="">No Property</option><option value="COOK">Cook House</option><option value="ZINK">Zink Cabin</option><option value="HILL4">Hill Studio</option><option value="BARN">Barn Studio</option></select>' : '') +
      '<span class="re-status" id="re-status"></span>';
    document.body.appendChild(bar);

    var saveBtn = bar.querySelector('#re-save');
    var status = bar.querySelector('#re-status');

    // Check auth
    fetch(API + '/me', { credentials: 'include' }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.authenticated) pencil.classList.add('visible');
    }).catch(function() {});

    // Show pencil after login
    if (!window.__reEditorPropSet) {
      window.__reEditorPropSet = true;
      Object.defineProperty(window, '__loggedInName', {
        set: function(v) { if (v) pencil.classList.add('visible'); this._ln = v; },
        get: function() { return this._ln; },
        configurable: true,
      });
    }

    function markDirty() {
      saveBtn.disabled = false;
      status.textContent = 'Unsaved changes';
      status.style.opacity = '1';
      status.style.color = '#ff551e';
    }

    // Pencil click — start editing
    pencil.addEventListener('click', function() {
      _bodyEl = document.getElementById(opts.bodyId);
      if (opts.titleId) _titleEl = document.getElementById(opts.titleId);
      if (_titleEl) { _titleEl.contentEditable = true; _titleEl.addEventListener('input', markDirty); }
      _bodyEl.contentEditable = true;
      injectImageBlocks(_bodyEl, markDirty);
      _bodyEl.addEventListener('input', markDirty);
      bar.classList.add('active');
      document.body.classList.add('re-editing');
      status.textContent = 'Editing: ' + (opts.slug || '');
      // Set initial property value
      var propSelect = bar.querySelector('#re-property');
      if (propSelect && opts.propertyCode) propSelect.value = opts.propertyCode;
      if (propSelect) propSelect.addEventListener('change', markDirty);
      _bodyEl.focus();
    });

    // Inline link
    bar.querySelector('#re-link').addEventListener('click', function() {
      if (!_bodyEl) return;
      var sel = window.getSelection();
      var has = sel && sel.toString().trim().length > 0;
      var label = has ? sel.toString() : prompt('Link text');
      if (!label) return;
      var url = prompt('URL (e.g. /v5/about or https://...)');
      if (!url) return;
      var newWindow = confirm('Open in new window?');
      _bodyEl.focus();
      var target = newWindow ? ' target="_blank" rel="noopener"' : '';
      if (has && !newWindow) { document.execCommand('createLink', false, url); }
      else { document.execCommand('insertHTML', false, '<a href="' + url.replace(/"/g, '&quot;') + '"' + target + '>' + label.replace(/</g, '&lt;') + '</a>'); }
      markDirty();
    });

    // Arrow row link
    bar.querySelector('#re-link-row').addEventListener('click', function() {
      if (!_bodyEl) return;
      var label = prompt('Link label');
      if (!label) return;
      var url = prompt('URL (e.g. /v5/about or https://...)');
      if (!url) return;
      var newWindow = confirm('Open in new window?');
      _bodyEl.focus();
      var target = newWindow ? ' target="_blank" rel="noopener"' : '';
      document.execCommand('insertHTML', false, '<div class="link-row-wrap"><a href="' + url.replace(/"/g, '&quot;') + '" class="link-row"' + target + '>' + label.replace(/</g, '&lt;') + '</a></div><p><br></p>');
      markDirty();
    });

    // H2
    bar.querySelector('#re-heading').addEventListener('click', function() {
      if (!_bodyEl) return;
      _bodyEl.focus();
      document.execCommand('formatBlock', false, 'h2');
      markDirty();
    });

    // Divider
    bar.querySelector('#re-hr').addEventListener('click', function() {
      if (!_bodyEl) return;
      _bodyEl.focus();
      document.execCommand('insertHTML', false, '<hr style="border:none;border-top:3px solid #000;margin:24px 0;">');
      markDirty();
    });

    // Image picker (Library + Upload tabs)
    bar.querySelector('#re-img').addEventListener('click', function() {
      if (!_bodyEl) return;
      if (_imgPicker) { _imgPicker.remove(); _imgPicker = null; return; }
      var sel = window.getSelection();
      var savedRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

      var SB_URL = 'https://uakybfvpamxablrzzetn.supabase.co';
      var SB_KEY = opts.supabaseKey || '';

      _imgPicker = document.createElement('div');
      _imgPicker.style.cssText = 'position:fixed;bottom:52px;left:0;right:0;background:#000;color:#fcf6e9;padding:12px 24px;z-index:1000;max-height:60vh;display:flex;flex-direction:column;gap:8px;';

      // Header row: tabs + close
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;gap:8px;align-items:center;';
      var libTab = document.createElement('button');
      var upTab = document.createElement('button');
      function tabStyle(active) {
        return 'background:' + (active ? '#fcf6e9' : 'transparent') + ';color:' + (active ? '#000' : '#fcf6e9') + ';border:1px solid rgba(252,246,233,0.3);padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;cursor:pointer;font-family:Inter,sans-serif;';
      }
      libTab.textContent = 'Library';
      upTab.textContent = 'Upload new';
      libTab.style.cssText = tabStyle(true);
      upTab.style.cssText = tabStyle(false);
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'margin-left:auto;background:none;border:none;color:#fcf6e9;font-size:20px;cursor:pointer;opacity:0.5;padding:0 4px;';
      closeBtn.onclick = function() { _imgPicker.remove(); _imgPicker = null; };
      head.appendChild(libTab);
      head.appendChild(upTab);
      head.appendChild(closeBtn);
      _imgPicker.appendChild(head);

      // Pane containers
      var libPane = document.createElement('div');
      libPane.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;';
      var upPane = document.createElement('div');
      upPane.style.cssText = 'display:none;flex-direction:column;gap:8px;flex:1;overflow-y:auto;';
      _imgPicker.appendChild(libPane);
      _imgPicker.appendChild(upPane);
      document.body.appendChild(_imgPicker);

      function showLib() { libPane.style.display = 'flex'; upPane.style.display = 'none'; libTab.style.cssText = tabStyle(true); upTab.style.cssText = tabStyle(false); }
      function showUp() { libPane.style.display = 'none'; upPane.style.display = 'flex'; libTab.style.cssText = tabStyle(false); upTab.style.cssText = tabStyle(true); }
      libTab.onclick = showLib;
      upTab.onclick = showUp;

      // Insert an image+caption block from a media row at the saved cursor.
      function insertMedia(media) {
        if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
        _bodyEl.focus();
        var captionInner = '<div class="image-caption"><span class="caption" contenteditable="true">' + escapeAttr(media.caption || '') + '</span><span class="credit" contenteditable="true">' + escapeAttr(media.credit || '') + '</span></div>';
        var imgTag = '<img src="' + escapeAttr(media.r2_url) + '" alt="' + escapeAttr(media.alt_text || media.caption || '') + '">';
        var block = '<div class="image-block" contenteditable="false">' + imgTag + captionInner + '</div>';
        document.execCommand('insertHTML', false, block);
        markDirty();
        _imgPicker.remove(); _imgPicker = null;
      }

      // ----- Library pane -----
      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search images...';
      searchInput.style.cssText = 'padding:6px 8px;font-size:12px;font-family:Inter,sans-serif;border:1px solid rgba(252,246,233,0.3);background:transparent;color:#fcf6e9;border-radius:0;';
      libPane.appendChild(searchInput);
      var grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,80px);gap:4px;overflow-y:auto;flex:1;justify-content:start;';
      libPane.appendChild(grid);

      async function fetchImages(query) {
        var u = SB_URL + '/rest/v1/media?archived=eq.false&r2_url=not.is.null&category=not.in.(hands,inspection)&order=marketing_allowed.desc,is_favorite.desc,created_at.desc&limit=120&select=id,r2_url,credit,credit_url,caption,alt_text,property_slug,category,marketing_allowed';
        if (query) u += '&or=(caption.ilike.%25' + encodeURIComponent(query) + '%25,credit.ilike.%25' + encodeURIComponent(query) + '%25,property_slug.ilike.%25' + encodeURIComponent(query) + '%25,alt_text.ilike.%25' + encodeURIComponent(query) + '%25)';
        var res = await fetch(u, { headers: { 'apikey': SB_KEY, 'Accept': 'application/json' } });
        return res.ok ? await res.json() : [];
      }

      async function approveImage(id) {
        var saveBase = location.hostname === 'reset.club' ? '/n' : '/v5';
        var res = await fetch(saveBase + '/api/approve-media', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ id: id }),
        });
        return res.ok;
      }

      function renderCell(img) {
        var cell = document.createElement('div');
        cell.style.cssText = 'width:80px;height:80px;overflow:hidden;cursor:pointer;border:1px solid rgba(252,246,233,0.1);background:rgba(252,246,233,0.05);position:relative;' + (img.marketing_allowed ? '' : 'opacity:0.5;');
        cell.title = [img.caption, img.credit ? 'Credit: ' + img.credit : '', img.marketing_allowed ? '' : '(unapproved — click + to approve)'].filter(Boolean).join(' — ');
        var pic = document.createElement('img');
        pic.src = thumbUrl(img.r2_url);
        pic.alt = img.alt_text || '';
        pic.loading = 'lazy';
        pic.decoding = 'async';
        pic.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        cell.appendChild(pic);

        var badge = document.createElement('button');
        badge.type = 'button';
        badge.textContent = img.marketing_allowed ? '✓' : '+';
        badge.title = img.marketing_allowed ? 'Approved for marketing' : 'Approve for marketing';
        badge.style.cssText = 'position:absolute;top:2px;right:2px;width:18px;height:18px;padding:0;background:' + (img.marketing_allowed ? '#019740' : 'rgba(0,0,0,0.7)') + ';color:#fff;border:none;cursor:pointer;font-size:12px;line-height:18px;font-family:Inter,sans-serif;';
        badge.addEventListener('click', async function(e) {
          e.stopPropagation();
          if (img.marketing_allowed) return; // already approved, no-op
          badge.disabled = true;
          var ok = await approveImage(img.id);
          if (ok) {
            img.marketing_allowed = true;
            cell.style.opacity = '1';
            badge.textContent = '✓';
            badge.style.background = '#019740';
            badge.disabled = false;
          } else {
            badge.disabled = false;
            alert('Approve failed.');
          }
        });
        cell.appendChild(badge);

        cell.addEventListener('click', function() {
          if (!img.marketing_allowed) {
            alert('Approve this image first (click the + badge).');
            return;
          }
          insertMedia(img);
        });
        return cell;
      }

      async function renderGrid(query) {
        grid.innerHTML = '<span style="font-size:11px;opacity:0.4">Loading...</span>';
        var images = await fetchImages(query);
        grid.innerHTML = '';
        if (!images.length) { grid.innerHTML = '<span style="font-size:11px;opacity:0.4">No images found</span>'; return; }
        images.forEach(function(img) { grid.appendChild(renderCell(img)); });
      }
      renderGrid('');
      searchInput.addEventListener('input', function() {
        if (_imgDebounce) clearTimeout(_imgDebounce);
        _imgDebounce = setTimeout(function() { renderGrid(searchInput.value.trim()); }, 300);
      });

      // ----- Upload pane -----
      var fldStyle = 'padding:6px 8px;font-size:12px;font-family:Inter,sans-serif;border:1px solid rgba(252,246,233,0.3);background:transparent;color:#fcf6e9;border-radius:0;width:100%;box-sizing:border-box;';
      var labelStyle = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;opacity:0.6;display:block;margin-bottom:4px;';
      function labeled(label, el) {
        var row = document.createElement('div');
        var lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.cssText = labelStyle;
        row.appendChild(lbl);
        row.appendChild(el);
        return row;
      }
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.cssText = fldStyle + 'padding:4px;';
      var previewImg = document.createElement('img');
      previewImg.style.cssText = 'max-width:120px;max-height:80px;display:none;border:1px solid rgba(252,246,233,0.2);margin-top:8px;object-fit:cover;';
      fileInput.addEventListener('change', function() {
        var f = fileInput.files && fileInput.files[0];
        if (!f) { previewImg.style.display = 'none'; return; }
        previewImg.src = URL.createObjectURL(f);
        previewImg.style.display = 'block';
      });
      var captionField = document.createElement('input');
      captionField.type = 'text';
      captionField.placeholder = 'e.g. Cook House living room';
      captionField.style.cssText = fldStyle;
      var creditField = document.createElement('input');
      creditField.type = 'text';
      creditField.placeholder = 'e.g. ©JaegerSloan Studio';
      creditField.style.cssText = fldStyle;
      var creditUrlField = document.createElement('input');
      creditUrlField.type = 'text';
      creditUrlField.placeholder = 'optional, e.g. https://...';
      creditUrlField.style.cssText = fldStyle;
      var altField = document.createElement('input');
      altField.type = 'text';
      altField.placeholder = 'For screen readers — describe the image';
      altField.style.cssText = fldStyle;
      var categoryField = document.createElement('select');
      categoryField.style.cssText = fldStyle;
      ['news', 'marketing', 'property', 'interior', 'exterior', 'food', 'drink', 'people', 'art', 'detail', 'landscape', 'signage'].forEach(function(c) {
        var o = document.createElement('option');
        o.value = c; o.textContent = c;
        if (c === 'news') o.selected = true;
        categoryField.appendChild(o);
      });
      var submitBtn = document.createElement('button');
      submitBtn.type = 'button';
      submitBtn.textContent = 'Upload & insert';
      submitBtn.style.cssText = 'background:#019740;color:#fff;border:none;padding:10px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;font-family:Inter,sans-serif;align-self:flex-start;';
      var statusEl = document.createElement('div');
      statusEl.style.cssText = 'font-size:11px;opacity:0.6;margin-top:4px;';

      // Two-column grid for compact metadata layout
      var grid2 = document.createElement('div');
      grid2.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;';
      grid2.appendChild(labeled('Caption (shows left)', captionField));
      grid2.appendChild(labeled('Credit (shows right)', creditField));
      grid2.appendChild(labeled('Credit URL', creditUrlField));
      grid2.appendChild(labeled('Category', categoryField));

      upPane.appendChild(labeled('File', fileInput));
      upPane.appendChild(previewImg);
      upPane.appendChild(grid2);
      upPane.appendChild(labeled('Alt text', altField));
      var actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex;align-items:center;gap:12px;';
      actionRow.appendChild(submitBtn);
      actionRow.appendChild(statusEl);
      upPane.appendChild(actionRow);

      submitBtn.addEventListener('click', async function() {
        var f = fileInput.files && fileInput.files[0];
        if (!f) { statusEl.textContent = 'Pick a file first.'; statusEl.style.color = '#ff551e'; return; }
        submitBtn.disabled = true;
        statusEl.style.color = '#fcf6e9';
        statusEl.textContent = 'Uploading...';
        try {
          var fd = new FormData();
          fd.append('file', f);
          fd.append('caption', captionField.value.trim());
          fd.append('credit', creditField.value.trim());
          fd.append('credit_url', creditUrlField.value.trim());
          fd.append('alt_text', altField.value.trim());
          fd.append('category', categoryField.value);
          var saveBase = location.hostname === 'reset.club' ? '/n' : '/v5';
          var res = await fetch(saveBase + '/api/upload-media', { method: 'POST', credentials: 'include', body: fd });
          if (!res.ok) { statusEl.textContent = 'Failed: ' + await res.text(); statusEl.style.color = '#ff551e'; submitBtn.disabled = false; return; }
          var data = await res.json();
          insertMedia(data.media);
        } catch (err) {
          statusEl.textContent = 'Error: ' + (err.message || err);
          statusEl.style.color = '#ff551e';
          submitBtn.disabled = false;
        }
      });
    });

    // Edit/Remove link — appears contextually when cursor is in a link
    var linkInfo = document.createElement('span');
    linkInfo.id = 're-link-info';
    linkInfo.style.cssText = 'display:none;align-items:center;gap:6px;';
    linkInfo.innerHTML =
      '<span class="re-sep"></span>' +
      '<span style="font-size:10px;opacity:0.5;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" id="re-link-url"></span>' +
      '<button class="re-tool" id="re-link-edit" style="padding:4px 8px;">Edit</button>' +
      '<button class="re-tool" id="re-link-remove" style="padding:4px 8px;border-color:rgba(255,85,30,0.5);color:#ff551e;">Unlink</button>';
    bar.appendChild(linkInfo);

    // Check cursor position on selection change
    document.addEventListener('selectionchange', function() {
      if (!_bodyEl) return;
      var sel = window.getSelection();
      if (!sel.rangeCount) { linkInfo.style.display = 'none'; return; }
      var node = sel.anchorNode;
      var anchor = node && node.nodeType === 3 ? node.parentElement : node;
      var link = anchor && anchor.closest ? anchor.closest('a') : null;
      if (link && _bodyEl.contains(link)) {
        linkInfo.style.display = 'flex';
        document.getElementById('re-link-url').textContent = link.href;
        document.getElementById('re-link-url').title = link.href;
        linkInfo._activeLink = link;
      } else {
        linkInfo.style.display = 'none';
        linkInfo._activeLink = null;
      }
    });

    bar.querySelector('#re-link-edit').addEventListener('click', function() {
      var link = linkInfo._activeLink;
      if (!link) return;
      var url = prompt('Edit URL', link.getAttribute('href'));
      if (url === null) return;
      link.setAttribute('href', url);
      var newWindow = confirm('Open in new window?');
      if (newWindow) { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener'); }
      else { link.removeAttribute('target'); link.removeAttribute('rel'); }
      markDirty();
    });

    bar.querySelector('#re-link-remove').addEventListener('click', function() {
      var link = linkInfo._activeLink;
      if (!link) return;
      // If it's a link-row, remove the whole wrap
      var wrap = link.closest('.link-row-wrap');
      if (wrap) { wrap.remove(); }
      else {
        // Unwrap inline link — keep text
        var text = document.createTextNode(link.textContent);
        link.parentNode.replaceChild(text, link);
      }
      linkInfo.style.display = 'none';
      markDirty();
    });

    // Bold
    bar.querySelector('#re-bold').addEventListener('click', function() {
      if (!_bodyEl) return;
      _bodyEl.focus();
      document.execCommand('bold');
      markDirty();
    });

    // Save
    saveBtn.addEventListener('click', async function() {
      saveBtn.disabled = true;
      status.textContent = 'Saving...';
      status.style.color = '#fcf6e9';
      try {
        var body = _bodyEl.innerHTML;
        // Strip about-nav if present
        var navIdx = body.indexOf('<div class="about-nav">');
        if (navIdx > -1) body = body.substring(0, navIdx).trim();
        body = normalizeBody(body);

        var data = { body: body };
        if (_titleEl) data.title = _titleEl.textContent.trim();
        var propSelect = bar.querySelector('#re-property');
        if (propSelect) data.property_code = propSelect.value || null;
        await opts.save(data);
        status.textContent = 'Saved';
        status.style.color = '#019740';
        setTimeout(function() { status.textContent = 'Editing: ' + (opts.slug || ''); status.style.opacity = '0.5'; status.style.color = '#fcf6e9'; }, 2000);
      } catch(e) {
        status.textContent = 'Error: ' + (e.message || e);
        status.style.color = '#ff551e';
        saveBtn.disabled = false;
      }
    });

    // Cancel
    bar.querySelector('#re-cancel').addEventListener('click', function() { window.location.reload(); });

    // ---- Nav panel ----
    if (opts.navGroup && opts.saveNav) {
      var navPanel = document.createElement('div');
      navPanel.className = 're-nav-panel';
      navPanel.innerHTML =
        '<div class="re-nav-head">' +
          '<h3>Nav: ' + opts.navGroup + '</h3>' +
          '<span class="spacer"></span>' +
          '<span class="re-status" id="re-nav-status" style="margin-left:0;"></span>' +
          '<button class="re-save" id="re-nav-save">Save Nav</button>' +
          '<button class="re-cancel" id="re-nav-close">Close</button>' +
        '</div>' +
        '<div class="re-nav-list" id="re-nav-list"></div>' +
        '<button class="re-nav-add" id="re-nav-add">+ Add Link</button>';
      document.body.appendChild(navPanel);

      var navList = navPanel.querySelector('#re-nav-list');
      var navStatus = navPanel.querySelector('#re-nav-status');
      var navSaveBtn = navPanel.querySelector('#re-nav-save');

      // Seed local model from server data. Each row: {id, slug, title, url, is_published}
      // url = external_url if set, else "/" + slug (canonical, no /n or /v5 prefix —
      // the prefix is a display convention, not part of the path identity).
      var model = (opts.navItems || []).map(function(r) {
        return {
          id: r.id,
          slug: r.slug,
          title: r.title || '',
          url: r.external_url || (r.slug ? '/' + r.slug : ''),
          is_published: r.is_published !== false,
          _isExisting: true,
        };
      });

      function markNavDirty() { navSaveBtn.disabled = false; navStatus.textContent = 'Unsaved'; navStatus.style.color = '#ff551e'; }

      function render() {
        navList.innerHTML = '';
        model.forEach(function(item, idx) {
          var row = document.createElement('div');
          row.className = 're-nav-row';
          row.dataset.idx = String(idx);

          var grip = document.createElement('span');
          grip.className = 'grip';
          grip.textContent = '⋮⋮';
          grip.title = 'Drag to reorder';
          row.appendChild(grip);

          var labelInput = document.createElement('input');
          labelInput.className = 'label';
          labelInput.type = 'text';
          labelInput.value = item.title;
          labelInput.placeholder = 'Label';
          labelInput.addEventListener('input', function() { item.title = labelInput.value; markNavDirty(); });
          row.appendChild(labelInput);

          var urlInput = document.createElement('input');
          urlInput.className = 'url';
          urlInput.type = 'text';
          urlInput.value = item.url;
          urlInput.placeholder = '/about/method  or  mailto:hello@reset.club';
          urlInput.addEventListener('input', function() { item.url = urlInput.value; markNavDirty(); });
          row.appendChild(urlInput);

          var pubLabel = document.createElement('label');
          pubLabel.className = 'pub';
          var pubCb = document.createElement('input');
          pubCb.type = 'checkbox';
          pubCb.checked = item.is_published !== false;
          pubCb.addEventListener('change', function() { item.is_published = pubCb.checked; markNavDirty(); });
          pubLabel.appendChild(pubCb);
          pubLabel.appendChild(document.createTextNode('Published'));
          row.appendChild(pubLabel);

          var del = document.createElement('button');
          del.className = 'del';
          del.textContent = 'Delete';
          del.addEventListener('click', function() {
            model.splice(idx, 1);
            markNavDirty();
            render();
          });
          row.appendChild(del);

          // Pointer-event drag-reorder on grip
          grip.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            var startY = e.clientY;
            var startIdx = idx;
            row.classList.add('dragging');
            grip.setPointerCapture(e.pointerId);

            function onMove(ev) {
              var rows = Array.from(navList.children);
              var rowRects = rows.map(function(r) { return r.getBoundingClientRect(); });
              var pointerY = ev.clientY;
              // Find which row the pointer is over (by midpoint)
              var newIdx = startIdx;
              for (var i = 0; i < rowRects.length; i++) {
                var mid = rowRects[i].top + rowRects[i].height / 2;
                if (pointerY < mid) { newIdx = i; break; }
                newIdx = i;
              }
              if (newIdx !== startIdx) {
                var moved = model.splice(startIdx, 1)[0];
                model.splice(newIdx, 0, moved);
                startIdx = newIdx;
                markNavDirty();
                render();
                // Re-find the moved row's grip so subsequent moves keep tracking
                var newRow = navList.children[newIdx];
                if (newRow) {
                  var newGrip = newRow.querySelector('.grip');
                  if (newGrip) {
                    newGrip.setPointerCapture(ev.pointerId);
                    newGrip.addEventListener('pointermove', onMove);
                    newGrip.addEventListener('pointerup', onUp, { once: true });
                    newGrip.addEventListener('pointercancel', onUp, { once: true });
                    newRow.classList.add('dragging');
                  }
                }
                // Stop listening on the old grip
                grip.removeEventListener('pointermove', onMove);
              }
            }
            function onUp() {
              row.classList.remove('dragging');
              Array.from(navList.children).forEach(function(r) { r.classList.remove('dragging'); });
              grip.removeEventListener('pointermove', onMove);
            }
            grip.addEventListener('pointermove', onMove);
            grip.addEventListener('pointerup', onUp, { once: true });
            grip.addEventListener('pointercancel', onUp, { once: true });
          });

          navList.appendChild(row);
        });
      }
      render();

      navPanel.querySelector('#re-nav-add').addEventListener('click', function() {
        model.push({ id: null, slug: '', title: '', url: '', is_published: true, _isExisting: false });
        markNavDirty();
        render();
      });

      bar.querySelector('#re-nav-toggle').addEventListener('click', function() {
        navPanel.classList.toggle('active');
      });

      navPanel.querySelector('#re-nav-close').addEventListener('click', function() {
        navPanel.classList.remove('active');
      });

      navSaveBtn.addEventListener('click', async function() {
        navSaveBtn.disabled = true;
        navStatus.textContent = 'Saving...';
        navStatus.style.color = '#fcf6e9';
        try {
          // Translate URL → external_url vs slug.
          // Rule: if URL is "/<navGroup>" or starts with "/<navGroup>/" → sub-page slug.
          // Also tolerates legacy display prefixes /n/ and /v5/ by stripping them first.
          var groupRoot = '/' + opts.navGroup;
          var groupChild = groupRoot + '/';
          var payload = model.map(function(item, i) {
            var out = {
              id: item.id || undefined,
              title: item.title || '',
              nav_order: i + 1,
              is_published: item.is_published !== false,
            };
            var raw = (item.url || '').trim();
            // Strip /n or /v5 display prefix if user typed/saw one.
            var url = raw.replace(/^\/(n|v5)(\/|$)/, '/');
            if (url === groupRoot || url.indexOf(groupChild) === 0) {
              out.slug = url.slice(1); // strip leading /, e.g. "/about/story" → "about/story"
              out.external_url = null;
            } else if (url) {
              out.external_url = raw;
              // Do not send slug on new external-link rows; server auto-generates.
              if (!item.id) out.slug = undefined;
            } else {
              out.external_url = null;
            }
            return out;
          });
          await opts.saveNav(payload);
          navStatus.textContent = 'Saved — reloading';
          navStatus.style.color = '#019740';
          setTimeout(function() { window.location.reload(); }, 500);
        } catch(e) {
          navStatus.textContent = 'Error: ' + (e.message || e);
          navStatus.style.color = '#ff551e';
          navSaveBtn.disabled = false;
        }
      });
    }
  }

  return { init: init };
})();
