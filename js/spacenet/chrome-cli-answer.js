/**
 * Twin CLI — Build 20260823234000-twin-cli
 * Copy of #172 + ONLY the twin CLI from #126, last-wins so guest HUD+bottom
 * both paint, both talk to Grok, camera keeps running.
 *
 * Guest hard-refresh DONE-WHEN:
 *   #stc-cmd-in visible, non-zero size, placeholder exactly
 *     "Heads up display command line interface" (full text, no ellipsis)
 *   #cli-in visible, placeholder exactly "command line interface"
 *   both visible at once · neon star on both · one live #cli-log
 *   both POST /api/ai allow_paid:true
 *   photosynthesis in EITHER input → real Grok answer, camera not frozen
 *
 * Do not restyle other chrome. Do not regress HOLD / CALL / pizza / laptop / listen.
 * Wallet stays ⭐ 0.00 (hold-pay). Currency ⭐.
 */
(function (G) {
  'use strict';
  if (G.__snTwinCli20260823234000) return;
  G.__snTwinCli20260823234000 = 1;
  G.__snCliAnswer0822c = 1;

  var BUILD = '20260823234000-twin-cli';
  var HUD_PH = 'Heads up display command line interface';
  var BOT_PH = 'command line interface';
  var answering = false;
  var cliWrap = null;
  var wrapArmedAt = Date.now() + 700;

  var FORCE_CSS =
    '/* sn-twin-cli ' + BUILD + ' last-wins — inputs only */\n' +
    '#stc-cmd, #stc-cmd-in, #cli-form, #cli-in, #cli-log, #panel,\n' +
    '#panel.sn-open, #panel.open, body #panel, body #cli-log, body #stc-cmd {\n' +
    '  visibility: visible !important;\n' +
    '  opacity: 1 !important;\n' +
    '  pointer-events: auto !important;\n' +
    '  clip: auto !important;\n' +
    '  clip-path: none !important;\n' +
    '}\n' +
    '#sn-topchrome-panel {\n' +
    '  overflow: visible !important;\n' +
    '  max-height: 168px !important;\n' +
    '  height: auto !important;\n' +
    '}\n' +
    '#stc-cmd {\n' +
    '  display: flex !important;\n' +
    '  flex-direction: column !important;\n' +
    '  min-height: 44px !important;\n' +
    '  height: auto !important;\n' +
    '  width: 100% !important;\n' +
    '  max-width: 100% !important;\n' +
    '  overflow: visible !important;\n' +
    '  position: relative !important;\n' +
    '}\n' +
    '#stc-cmd .sn-cli-field, #cli-form .sn-cli-field {\n' +
    '  display: flex !important;\n' +
    '  align-items: center !important;\n' +
    '  gap: 8px !important;\n' +
    '  width: 100% !important;\n' +
    '  min-height: 36px !important;\n' +
    '  overflow: visible !important;\n' +
    '  border: 1px solid rgba(126,233,255,0.72) !important;\n' +
    '  box-shadow: 0 0 14px rgba(28,140,255,0.42), inset 0 0 12px rgba(20,90,220,0.22) !important;\n' +
    '  background: rgba(0,10,32,0.42) !important;\n' +
    '}\n' +
    '#stc-cmd .sn-cli-star, #cli-form .sn-cli-star {\n' +
    '  color: #7ee9ff !important;\n' +
    '  text-shadow: 0 0 10px #1c8cff, 0 0 18px #7ee9ff !important;\n' +
    '  flex: 0 0 auto !important;\n' +
    '}\n' +
    '#stc-cmd-in, #cli-in {\n' +
    '  display: block !important;\n' +
    '  flex: 1 1 auto !important;\n' +
    '  min-height: 28px !important;\n' +
    '  height: 32px !important;\n' +
    '  min-width: 0 !important;\n' +
    '  width: 100% !important;\n' +
    '  opacity: 1 !important;\n' +
    '  pointer-events: auto !important;\n' +
    '  position: relative !important;\n' +
    '  z-index: 5 !important;\n' +
    '  overflow: hidden !important;\n' +
    '  text-overflow: clip !important;\n' +
    '  white-space: nowrap !important;\n' +
    '  font: 500 12.5px/1.3 Inter, system-ui, sans-serif !important;\n' +
    '  letter-spacing: 0 !important;\n' +
    '}\n' +
    '#stc-cmd-in::placeholder, #cli-in::placeholder {\n' +
    '  color: #7a8a96 !important;\n' +
    '  opacity: 0.85 !important;\n' +
    '  text-overflow: clip !important;\n' +
    '  overflow: hidden !important;\n' +
    '  white-space: nowrap !important;\n' +
    '  font: 500 12.5px/1.3 Inter, system-ui, sans-serif !important;\n' +
    '}\n' +
    '#cli-form {\n' +
    '  display: flex !important;\n' +
    '  min-height: 36px !important;\n' +
    '  height: auto !important;\n' +
    '  width: 100% !important;\n' +
    '  align-items: center !important;\n' +
    '  overflow: visible !important;\n' +
    '}\n' +
    '#cli-log {\n' +
    '  display: block !important;\n' +
    '  visibility: visible !important;\n' +
    '  opacity: 1 !important;\n' +
    '  min-height: 48px !important;\n' +
    '  height: auto !important;\n' +
    '  max-height: 40vh !important;\n' +
    '  overflow-y: auto !important;\n' +
    '  width: 100% !important;\n' +
    '  pointer-events: auto !important;\n' +
    '}\n' +
    '#panel {\n' +
    '  display: flex !important;\n' +
    '  flex-direction: column !important;\n' +
    '  visibility: visible !important;\n' +
    '  opacity: 1 !important;\n' +
    '  min-height: 72px !important;\n' +
    '  height: auto !important;\n' +
    '  max-height: none !important;\n' +
    '  width: auto !important;\n' +
    '  pointer-events: auto !important;\n' +
    '  z-index: 40 !important;\n' +
    '  overflow: visible !important;\n' +
    '}\n' +
    '#sn-guest-pass-one-cli, style#sn-guest-pass-one-cli { display: none !important; }\n';

  function injectForceStyle() {
    try {
      var id = 'sn-force-paint-twin-cli';
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        el.setAttribute('data-sn-build', BUILD);
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = FORCE_CSS;
      try {
        (document.head || document.documentElement).appendChild(el);
      } catch (_) {}
    } catch (_) {}
  }

  function forceEl(el, display, minH, minW) {
    if (!el) return;
    try {
      el.removeAttribute('hidden');
      el.setAttribute('aria-hidden', 'false');
      el.style.setProperty('display', display || 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
      el.style.setProperty('clip', 'auto', 'important');
      el.style.setProperty('clip-path', 'none', 'important');
      el.style.setProperty('transform', 'none', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      if (minH) {
        el.style.setProperty('min-height', minH, 'important');
        el.style.setProperty('height', 'auto', 'important');
      }
      if (minW) {
        el.style.setProperty('min-width', minW, 'important');
        el.style.setProperty('width', '100%', 'important');
      }
      try {
        var r = el.getBoundingClientRect();
        if (!r || r.width < 2 || r.height < 2) {
          el.style.setProperty('min-height', minH || '32px', 'important');
          el.style.setProperty('height', minH || '36px', 'important');
          el.style.setProperty('min-width', minW || '120px', 'important');
          if (display === 'flex') el.style.setProperty('display', 'flex', 'important');
          else el.style.setProperty('display', 'block', 'important');
        }
      } catch (_) {}
    } catch (_) {}
  }

  function applyPlaceholders() {
    try {
      var top = document.getElementById('stc-cmd-in');
      if (top) {
        top.placeholder = HUD_PH;
        top.setAttribute('aria-label', HUD_PH);
        top.setAttribute('title', HUD_PH);
        top.disabled = false;
        top.removeAttribute('hidden');
        top.style.setProperty('text-overflow', 'clip', 'important');
        top.style.setProperty('overflow', 'hidden', 'important');
        top.style.setProperty('white-space', 'nowrap', 'important');
        top.style.setProperty('font', '500 12.5px/1.3 Inter, system-ui, sans-serif', 'important');
      }
      var bot = document.getElementById('cli-in');
      if (bot) {
        bot.placeholder = BOT_PH;
        bot.setAttribute('aria-label', BOT_PH);
        bot.setAttribute('title', BOT_PH);
        bot.disabled = false;
        bot.removeAttribute('hidden');
        bot.style.setProperty('text-overflow', 'clip', 'important');
        bot.style.setProperty('overflow', 'hidden', 'important');
        bot.style.setProperty('white-space', 'nowrap', 'important');
        bot.style.setProperty('font', '500 12.5px/1.3 Inter, system-ui, sans-serif', 'important');
      }
    } catch (_) {}
  }

  function applyHudSize() {
    try {
      var topPanel = document.getElementById('sn-topchrome-panel');
      if (topPanel) {
        topPanel.style.setProperty('overflow', 'visible', 'important');
        topPanel.style.setProperty('max-height', '168px', 'important');
        topPanel.style.setProperty('height', 'auto', 'important');
      }
      var topIn = document.getElementById('stc-cmd-in');
      if (topIn) {
        topIn.style.setProperty('min-height', '28px', 'important');
        topIn.style.setProperty('height', '32px', 'important');
        topIn.style.setProperty('min-width', '160px', 'important');
        topIn.style.setProperty('width', '100%', 'important');
        topIn.style.setProperty('display', 'block', 'important');
        topIn.style.setProperty('text-overflow', 'clip', 'important');
      }
      var bot = document.getElementById('cli-in');
      if (bot) {
        bot.style.setProperty('min-height', '28px', 'important');
        bot.style.setProperty('height', '32px', 'important');
        bot.style.setProperty('min-width', '160px', 'important');
        bot.style.setProperty('display', 'block', 'important');
      }
    } catch (_) {}
  }

  function patchFixPlaceholders() {
    try {
      if (G.SNChromeFixLoader && typeof SNChromeFixLoader.enforceHud === 'function' && !SNChromeFixLoader.__snTwinCliPh) {
        SNChromeFixLoader.__snTwinCliPh = 1;
        var prev = SNChromeFixLoader.enforceHud.bind(SNChromeFixLoader);
        SNChromeFixLoader.enforceHud = function () {
          var r = prev.apply(this, arguments);
          applyPlaceholders();
          applyHudSize();
          return r;
        };
      }
    } catch (_) {}
    try {
      if (G.SNChromeFixLoader && typeof SNChromeFixLoader.earthHome === 'function' && !SNChromeFixLoader.__snTwinCliEarth) {
        SNChromeFixLoader.__snTwinCliEarth = 1;
        var prevE = SNChromeFixLoader.earthHome.bind(SNChromeFixLoader);
        SNChromeFixLoader.earthHome = function () {
          var r = prevE.apply(this, arguments);
          applyHudSize();
          applyPlaceholders();
          return r;
        };
      }
    } catch (_) {}
    try {
      if (G.SNChromeFix && typeof SNChromeFix.enforceHudPlaceholder === 'function' && !SNChromeFix.__snTwinCliPh) {
        SNChromeFix.__snTwinCliPh = 1;
        var prev2 = SNChromeFix.enforceHudPlaceholder.bind(SNChromeFix);
        SNChromeFix.enforceHudPlaceholder = function () {
          applyPlaceholders();
        };
        if (typeof SNChromeFix.applyHud === 'function' && !SNChromeFix.__snTwinCliApply) {
          SNChromeFix.__snTwinCliApply = 1;
          var prevA = SNChromeFix.applyHud.bind(SNChromeFix);
          SNChromeFix.applyHud = function () {
            var r = prevA.apply(this, arguments);
            applyPlaceholders();
            applyHudSize();
            return r;
          };
        }
      }
    } catch (_) {}
  }

  function forcePaint() {
    try {
      ['sn-guest-pass-one-cli', 'sn-one-cli', 'sn-quiet-cli', 'sn-p1-one-cli'].forEach(function (id) {
        var s = document.getElementById(id);
        if (s) {
          try {
            s.remove();
          } catch (_) {}
        }
      });
      injectForceStyle();

      var topPanel = document.getElementById('sn-topchrome-panel');
      if (topPanel) {
        topPanel.style.setProperty('overflow', 'visible', 'important');
        topPanel.style.setProperty('max-height', '168px', 'important');
        topPanel.style.setProperty('height', 'auto', 'important');
        topPanel.classList.remove('collapsed');
      }

      var stc = document.getElementById('stc-cmd');
      forceEl(stc, 'flex', '44px', '160px');
      if (stc) {
        stc.style.setProperty('overflow', 'visible', 'important');
        stc.style.setProperty('position', 'relative', 'important');
        stc.style.setProperty('width', '100%', 'important');
      }

      var topIn = document.getElementById('stc-cmd-in');
      forceEl(topIn, 'block', '28px', '160px');
      if (topIn) {
        topIn.disabled = false;
        topIn.style.setProperty('position', 'relative', 'important');
        topIn.style.setProperty('z-index', '5', 'important');
        topIn.style.setProperty('height', '32px', 'important');
        topIn.style.setProperty('min-width', '160px', 'important');
        topIn.style.setProperty('width', '100%', 'important');
        topIn.style.setProperty('flex', '1 1 auto', 'important');
      }

      var form = document.getElementById('cli-form');
      forceEl(form, 'flex', '36px', '160px');
      if (form) form.style.setProperty('align-items', 'center', 'important');

      var bottom = document.getElementById('cli-in');
      forceEl(bottom, 'block', '28px', '160px');
      if (bottom) {
        bottom.disabled = false;
        bottom.style.setProperty('height', '32px', 'important');
        bottom.style.setProperty('width', '100%', 'important');
        bottom.style.setProperty('flex', '1 1 auto', 'important');
      }

      var logEl = document.getElementById('cli-log');
      forceEl(logEl, 'block', '48px', '160px');
      if (logEl) {
        logEl.style.setProperty('max-height', '40vh', 'important');
        logEl.style.setProperty('overflow-y', 'auto', 'important');
        logEl.style.setProperty('overflow-x', 'hidden', 'important');
      }

      var panel = document.getElementById('panel');
      forceEl(panel, 'flex', '72px', '200px');
      if (panel) {
        panel.classList.add('sn-open', 'open');
        panel.classList.remove('collapsed', 'sn-quiet');
        panel.style.setProperty('flex-direction', 'column', 'important');
        panel.style.setProperty('z-index', '40', 'important');
        panel.style.setProperty('overflow', 'visible', 'important');
      }

      applyPlaceholders();
    } catch (_) {}
  }

  function ensureTwinCli() {
    forcePaint();
  }

  function openLiveCli() {
    try {
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.add('sn-open', 'open');
        panel.classList.remove('collapsed', 'sn-quiet');
      }
    } catch (_) {}
    try {
      var el = document.getElementById('cli-log');
      if (el) {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', '40vh', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
        el.style.setProperty('min-height', '48px', 'important');
      }
    } catch (_) {}
  }

  function paintLiveCli(s, c) {
    s = String(s == null ? '' : s).slice(0, 480);
    if (!s) return;
    openLiveCli();
    try {
      var el = document.getElementById('cli-log');
      if (!el) return;
      var last = el.lastElementChild;
      if (last && String(last.textContent || '') === s) {
        try {
          el.scrollTop = el.scrollHeight;
        } catch (__) {}
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'cli-feed-item is-latest';
      wrap.setAttribute('data-sn-twin-cli', '1');
      wrap.setAttribute('data-search', s);
      var line = document.createElement('div');
      var kind = c || 'ok';
      if (kind === 'dim') kind = 'progress';
      line.className = 'cli-line ' + kind;
      var body = document.createElement('div');
      body.className = 'cli-body';
      body.textContent = s;
      line.appendChild(body);
      wrap.appendChild(line);
      try {
        el.querySelectorAll('.cli-feed-item.is-latest').forEach(function (n) {
          n.classList.remove('is-latest');
        });
      } catch (__) {}
      el.appendChild(wrap);
      try {
        el.scrollTop = el.scrollHeight;
      } catch (__) {}
    } catch (_) {}
  }

  function starify(text) {
    var t = String(text == null ? '' : text);
    t = t.replace(/[æÆ]/g, '⭐');
    t = t.replace(/\u00e6|\u00c6/g, '⭐');
    t = t.replace(/\bAE\b/g, '⭐');
    t = t.replace(/\bAstra coins?\b/gi, '⭐');
    return t;
  }

  function stripActionTags(text) {
    return String(text || '')
      .replace(
        /\[\[\s*(GO|FLY|LOCATE|CITY|SHOPS|GLOBAL|EARTH|MAP|BASEMAP|LAYER|LAYERS|OVERLAY|PILOT|CLI|TILE|CMD|YOUTUBE|YT|IMAGINE|IMAGE)\s*(?::\s*[^\]]+)?\s*\]\]/gi,
        ' '
      )
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function say(m, c) {
    var s = starify(String(m == null ? '' : m)).slice(0, 480);
    if (!s) return;
    try {
      if (G.SNCli && typeof SNCli.beginTurn === 'function' && typeof SNCli.inTurn === 'function') {
        if (!SNCli.inTurn()) SNCli.beginTurn();
      }
    } catch (_) {}
    try {
      if (G.SNCli && SNCli.log) SNCli.log(s, c || 'ok', true);
    } catch (_) {}
    paintLiveCli(s, c);
    try {
      if (G.SNCli && SNCli.preview) SNCli.preview(s.slice(0, 90));
    } catch (_) {}
  }

  function clearInputs() {
    try {
      var a = document.getElementById('cli-in');
      if (a) a.value = '';
      var b = document.getElementById('stc-cmd-in');
      if (b) b.value = '';
    } catch (_) {}
  }

  function stayPut() {
    try {
      if (G.SNMap && SNMap.active && typeof SNMap.close === 'function') SNMap.close();
    } catch (_) {}
  }

  function isIdentity(line) {
    var low = String(line || '')
      .trim()
      .toLowerCase();
    if (!low) return false;
    if (/what\s+is\s+astranov|who\s+is\s+astranov|astranov\s*\?|τι\s+εί?ναι\s+astranov|τι\s+ειναι\s+astranov/i.test(low))
      return true;
    if (/who\s+are\s+you|what\s+are\s+you|your\s+name|ποιος\s+εί?σαι|τι\s+εί?σαι/i.test(low)) return true;
    if (/what\s+is\s+spacenet|spacenet\s*\?/i.test(low)) return true;
    return false;
  }

  function isSiblingOwned(line) {
    var s = String(line || '').trim();
    var low = s.toLowerCase().replace(/\s+/g, ' ');
    if (!s) return false;
    if (/\?$/.test(s)) return false;
    if (/^(what|why|how|who|when|explain|tell me|define)\b/i.test(low)) return false;
    if (/^(pizza|pizzeria|pizzas)$/i.test(low)) return true;
    if (/\bpizza\b|\bpizzeria\b/i.test(low) && !/^(what|why|how)\b/i.test(low)) return true;
    if (
      /^(laptop|laptops|buy (a )?laptops?|order (me )?(a )?laptop|get (me )?(a )?laptop|find (a )?laptop|i want (a )?laptop|need (a )?laptop)$/i.test(
        low
      )
    )
      return true;
    if (/^(nairobi|kenya|africa|kalithea|kallithea|rhodes|rodos|ρόδος|ρόδο)$/i.test(low)) return true;
    if (
      /^(show|go(?: to)?|fly|zoom(?: to)?|take me to)\s+(the )?(nairobi|kenya|africa|kalithea|kallithea|rhodes|rodos|ρόδος)\b/i.test(
        low
      )
    )
      return true;
    if (/^(call|hangup|hang up|webrtc|phone|video(\s*call)?)\b/i.test(low)) return true;
    if (/^(listen|talk|speak|mic|handsfree|ai listen|listen ai)$/i.test(low)) return true;
    if (/^(pay|hold\s*⭐|hold\s*star|hold\s*stars?|checkout|confirm\s+order|buy\s+now)\b/i.test(low)) return true;
    if (/^(locate|gps|power(\s+on|\s+off)?|polygon|poly|install|login|layers|send)\b/i.test(low)) return true;
    return false;
  }

  function isResearchish(line) {
    var s = String(line || '').trim();
    var low = s.toLowerCase();
    if (!s || s.length < 2) return false;
    if (isSiblingOwned(s)) return false;
    if (isIdentity(s)) return true;
    if (/\bphotosynthesis\b/i.test(low)) return true;
    if (/\?$/.test(s)) return true;
    if (/^(what|why|how|who|when|explain|tell me|define)\b/i.test(low)) return true;
    if (/^what\s+is\b/.test(low)) return true;
    if (/^(is |are |can |do |does |should |would |could )\b/i.test(low) && s.length > 8) return true;
    if (/^τι\s+(εί?ναι|ειναι)\b/i.test(s)) return true;
    if (/^(γιατί|γιατι|πώς|πως|ποιος)\b/i.test(s)) return true;
    return false;
  }

  function paidApiUrl() {
    try {
      var host = location.hostname || '';
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        /astranov\.eu$/i.test(host) ||
        /vercel\.app$/i.test(host)
      ) {
        return location.origin + '/api/ai';
      }
    } catch (_) {}
    try {
      if (G.SN_CONFIG && SN_CONFIG.aiUrl) return String(SN_CONFIG.aiUrl);
      if (G.SN_CONFIG && SN_CONFIG.sbUrl)
        return String(SN_CONFIG.sbUrl).replace(/\/$/, '') + '/functions/v1/ai-router';
    } catch (_) {}
    return '/api/ai';
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    try {
      var key = (G.SN_CONFIG && SN_CONFIG.sbKey) || G.SB_KEY || '';
      if (key) {
        h.apikey = key;
        h.Authorization = 'Bearer ' + key;
      }
      if (G.SNAuth && SNAuth.session && SNAuth.session.access_token) {
        h.Authorization = 'Bearer ' + SNAuth.session.access_token;
      } else if (G.SNAuth && typeof SNAuth.authHeaders === 'function') {
        var extra = SNAuth.authHeaders();
        if (extra) {
          Object.keys(extra).forEach(function (k) {
            h[k] = extra[k];
          });
        }
      }
    } catch (_) {}
    return h;
  }

  function pickReply(j) {
    if (!j) return null;
    var t = j.text || j.reply || j.message || j.answer || j.response || j.content || '';
    t = String(t || '').trim();
    if (!t) return null;
    if (/try again|no model|warming|unavailable|^error\b/i.test(t) && t.length < 80) return null;
    if (/owner_note|USAGE SHIP|ASTRANOV LAW/i.test(t)) return null;
    return t;
  }

  async function paidMind(line) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (_) {}
    }, 14000);
    try {
      if (G.SNSubscription && typeof SNSubscription.askPowerful === 'function') {
        try {
          var pow = await SNSubscription.askPowerful(line, {
            mode: 'chat',
            timeoutMs: 12000,
            allow_paid: true,
            stayGlobe: true,
            stay_globe: true,
          });
          if (pow && pow.ok && pow.text) {
            var pt = pickReply({ text: pow.text });
            if (pt) return pt;
          }
        } catch (_) {}
      }
      var urls = [paidApiUrl()];
      try {
        var cfg = G.SN_CONFIG || {};
        if (cfg.sbUrl) urls.push(String(cfg.sbUrl).replace(/\/$/, '') + '/functions/v1/aicycle');
      } catch (_) {}
      var body = {
        text: line,
        message: line,
        allow_paid: true,
        force_paid: true,
        preferred_provider: 'astranov',
        level: 'personal',
        source: 'twin-cli',
        build: BUILD,
        stay_globe: true,
        stayGlobe: true,
        mode: 'chat',
        fast: false,
      };
      for (var i = 0; i < urls.length; i++) {
        try {
          var res = await fetch(urls[i], {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
            mode: 'cors',
            signal: ctrl ? ctrl.signal : undefined,
          });
          if (!res.ok) continue;
          var j = await res.json().catch(function () {
            return {};
          });
          var t = pickReply(j);
          if (t) return t;
        } catch (_) {}
      }
    } catch (_) {
    } finally {
      clearTimeout(timer);
    }
    return null;
  }

  async function answerInCli(line) {
    var s = String(line || '').trim();
    if (!s || answering) return true;
    answering = true;
    stayPut();
    forcePaint();
    clearInputs();
    openLiveCli();
    say(s, 'cmd');
    say('Mind · thinking…', 'dim');
    var paid = null;
    try {
      paid = await paidMind(s);
    } catch (_) {}
    paid = stripActionTags(starify(paid || ''));
    stayPut();
    forcePaint();
    if (paid) {
      String(paid)
        .split(/\n+/)
        .forEach(function (part) {
          var p = String(part || '').trim();
          if (p) say(p, 'ok');
        });
    } else {
      say('Mind · no reply yet · camera stays', 'dim');
    }
    try {
      if (G.SNCli && SNCli.endTurn) SNCli.endTurn();
    } catch (_) {}
    clearInputs();
    forcePaint();
    answering = false;
    return true;
  }

  function handleLine(raw) {
    var s = String(raw || '').trim();
    if (!s) return false;
    if (isSiblingOwned(s)) return false;
    if (!isResearchish(s) && !isIdentity(s)) return false;
    void answerInCli(s);
    return true;
  }

  function wrapRun() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      /* Wrap ONCE. Pizza re-wraps every 2s if SNCli.run !== its handle.
         Mutual re-wrap grows an infinite SNCli.run chain and freezes the globe.
         Delay until research-stay/pizza/hold have wrapped so we sit outside
         freezeCamera. Pizza may wrap after us — isSiblingOwned lets pizza through.
         Typed photosynthesis is also caught by document capture (this file binds first). */
      if (SNCli.__snTwinCliRun === BUILD) return;
      if (Date.now() < wrapArmedAt && !SNCli.__snResearchStay) return;
      var prev = SNCli.run.bind(SNCli);
      cliWrap = function (raw) {
        try {
          if (isSiblingOwned(raw)) return prev(raw);
          if (handleLine(raw)) return Promise.resolve(true);
        } catch (_) {}
        return prev(raw);
      };
      SNCli.run = cliWrap;
      SNCli.__snCliAnswerC = 1;
      SNCli.__snTwinCliRun = BUILD;
    } catch (_) {}
  }

  function bindDocumentCapture() {
    try {
      if (document.documentElement && document.documentElement._snTwinCliCap) return;
      if (document.documentElement) document.documentElement._snTwinCliCap = 1;
      function fromEvent(ev) {
        var el = ev && ev.target;
        try {
          if (el && el.closest) {
            if (el.id === 'cli-in' || el.id === 'stc-cmd-in') return el;
            var inp = el.closest('#cli-in, #stc-cmd-in, #cli-form, #stc-cmd');
            if (inp) {
              if (inp.id === 'cli-in' || inp.id === 'stc-cmd-in') return inp;
              return inp.querySelector('#cli-in, #stc-cmd-in');
            }
          }
        } catch (_) {}
        return null;
      }
      function capture(ev, el) {
        var v = String((el && el.value) || '').trim();
        if (!v) return false;
        if (isSiblingOwned(v)) return false;
        if (!isIdentity(v) && !isResearchish(v)) return false;
        try {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        } catch (_) {}
        if (el) el.value = '';
        void answerInCli(v);
        return true;
      }
      document.addEventListener(
        'keydown',
        function (ev) {
          if (!ev || ev.key !== 'Enter') return;
          var el = fromEvent(ev);
          if (!el) return;
          capture(ev, el);
        },
        true
      );
      document.addEventListener(
        'submit',
        function (ev) {
          var el = fromEvent(ev);
          if (!el) {
            try {
              var t = ev && ev.target;
              if (t && t.id === 'cli-form') el = document.getElementById('cli-in');
              else if (t && t.id === 'stc-cmd') el = document.getElementById('stc-cmd-in');
            } catch (_) {}
          }
          if (!el) return;
          capture(ev, el);
        },
        true
      );
    } catch (_) {}
  }

  function install() {
    forcePaint();
    patchFixPlaceholders();
    wrapRun();
    bindDocumentCapture();
  }

  function boot() {
    forcePaint();
    install();
  }

  boot();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 0);
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 4000);
  setInterval(function () {
    applyPlaceholders();
    applyHudSize();
  }, 700);
  setInterval(function () {
    forcePaint();
    patchFixPlaceholders();
    wrapRun();
    bindDocumentCapture();
  }, 2000);

  G.SNChromeCliAnswer = {
    build: BUILD,
    answer: answerInCli,
    stayPut: stayPut,
    ensureTwinCli: ensureTwinCli,
    forcePaint: forcePaint,
  };
})(typeof window !== 'undefined' ? window : globalThis);
