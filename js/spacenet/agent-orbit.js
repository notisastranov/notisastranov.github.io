/**
 * SNAgentOrbit — Collective AI orchestrator (one menu, real council)
 * Build: 20260813204000-plain-talk
 *
 * Planet click opens ONE sheet only: Google + inline API keys + official
 * company login pages + council inspect (SOLVED / USEFUL / SHIP).
 * Never a second key sheet. Never a stacked auth modal. Never CLI expand.
 */
(function (global) {
  'use strict';
  var BUILD = '20260813204000-plain-talk';
  if (global.__SN_AGENT_ORBIT === BUILD) return;
  global.__SN_AGENT_ORBIT = BUILD;

  var CREDS_KEY = 'sn:agent-creds-v1';
  var CODE_KEY = 'sn:council-code-v1';
  var VERDICT_KEY = 'sn:council-verdict-v1';
  var SHIP_KEY = 'sn:council-ship-ticket-v1';
  var PROVIDERS = {
    astranov: {
      id: 'astranov', name: 'Astranov Mind', hex: 0x3d9eff, role: 'orchestrator',
      needsKey: false, icon: '\u25ce', login: '', console: 'https://astranov.eu'
    },
    gemini: {
      id: 'gemini', name: 'Gemini', hex: 0x8ab4f8, role: 'reasoner', needsKey: true, icon: '\u2726',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      login: 'https://gemini.google.com/app',
      console: 'https://aistudio.google.com/apikey'
    },
    chatgpt: {
      id: 'chatgpt', name: 'ChatGPT', hex: 0x10a37f, role: 'coder', needsKey: true, icon: '\u2b21',
      endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini',
      login: 'https://chatgpt.com/auth/login',
      console: 'https://platform.openai.com/api-keys'
    },
    claude: {
      id: 'claude', name: 'Claude', hex: 0xd4a27f, role: 'reviewer', needsKey: true, icon: '\u25c8',
      endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-sonnet-20241022',
      login: 'https://claude.ai/login',
      console: 'https://console.anthropic.com/settings/keys'
    }
  };
  var PLANET = { lat: 36.43, lng: 28.22, altitude: 4.28, color: 0x3d9eff };
  var SAT = {
    astranov: { dLat: 0, dLng: 0, alt: 1.22 },
    gemini: { dLat: 2.4, dLng: 3.1, alt: 1.18 },
    chatgpt: { dLat: -2.1, dLng: 2.8, alt: 1.19 },
    claude: { dLat: 1.6, dLng: -3.4, alt: 1.17 }
  };
  var S = {
    ready: false, creds: {}, entityIds: [], planetVisible: false, awaitingKey: null,
    lastLinks: [], lastTask: '', lastCode: '', lastVerdict: null, sheetBound: false,
    inspecting: false, checks: {}, checking: {}, loginAway: null
  };

  function log(m, c) {
    m = String(m == null ? '' : m).slice(0, 420);
    c = c || 'ok';
    try { if (global.SNCli && SNCli.log) SNCli.log(m, c); } catch (_) {}
    try { if (global.AciCli && AciCli.print) AciCli.print(m, c === 'err' ? 'err' : 'ok'); } catch (_) {}
    try { if (global.ACIControl && ACIControl.reply) ACIControl.reply(m); } catch (_) {}
    try {
      var el = document.getElementById('cli-log') || document.getElementById('globe-deck-log');
      if (el) {
        var line = document.createElement('div');
        line.className = 'cli-line ' + (c === 'err' ? 'err' : c === 'dim' ? 'dim' : 'ok');
        line.innerHTML = '<span class="cli-body">' + esc(m) + '</span>';
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
      }
    } catch (_) {}
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function loadCreds() {
    try { S.creds = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') || {}; } catch (_) { S.creds = {}; }
  }
  function saveCreds() {
    try { localStorage.setItem(CREDS_KEY, JSON.stringify(S.creds)); } catch (_) {}
  }
  function hasKey(id) {
    if (id === 'astranov') return true;
    return !!(S.creds[id] && String(S.creds[id]).length > 8);
  }

  function loadRemembered() {
    try {
      var j = JSON.parse(localStorage.getItem(CODE_KEY) || 'null');
      if (j && (j.task || j.code)) {
        S.lastTask = String(j.task || '');
        S.lastCode = String(j.code || '');
      }
    } catch (_) {}
    try {
      var v = JSON.parse(localStorage.getItem(VERDICT_KEY) || 'null');
      if (v && v.majority) S.lastVerdict = v;
    } catch (_) {}
  }

  function rememberCode(task, text, source) {
    S.lastTask = String(task || S.lastTask || '');
    S.lastCode = String(text || '');
    try {
      localStorage.setItem(CODE_KEY, JSON.stringify({
        task: S.lastTask, code: S.lastCode, source: source || '', at: Date.now()
      }));
    } catch (_) {}
    var taskEl = document.getElementById('ps-task');
    var codeEl = document.getElementById('ps-code');
    if (taskEl && S.lastTask && !String(taskEl.value || '').trim()) taskEl.value = S.lastTask;
    if (codeEl && S.lastCode) codeEl.value = S.lastCode;
  }

  function destroyKeySheet() {
    S.awaitingKey = null;
    var el = document.getElementById('sn-orbit-key');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function hideKeySheet() {
    destroyKeySheet();
  }

  function dismissForeignMenus() {
    destroyKeySheet();
    try { if (global.SNAuth && SNAuth.closeModal) SNAuth.closeModal(); } catch (_) {}
    var auth = document.getElementById('sn-auth-modal');
    if (auth) {
      auth.setAttribute('hidden', '');
      auth.style.display = 'none';
    }
  }

  function hidePlanetSheet() {
    var el = document.getElementById('sn-planet-sheet');
    var back = document.getElementById('sn-planet-back');
    if (el) el.setAttribute('hidden', '');
    if (back) back.setAttribute('hidden', '');
    S.awaitingKey = null;
  }

  function authUser() {
    try { return (global.SNAuth && SNAuth.user) || null; } catch (_) { return null; }
  }

  function authName() {
    var u = authUser();
    if (!u) return '';
    return (u.user_metadata && u.user_metadata.full_name) || (u.email && u.email.split('@')[0]) || 'signed in';
  }

  function paintAuth() {
    var mount = document.getElementById('ps-gsi');
    var err = document.getElementById('ps-gsi-err');
    var out = document.getElementById('ps-signout');
    var who = document.getElementById('ps-who');
    if (!mount) return;
    if (err) err.textContent = '';
    if (authUser()) {
      mount.innerHTML = '';
      mount.setAttribute('hidden', '');
      if (who) {
        who.removeAttribute('hidden');
        who.textContent = 'Signed in · ' + authName() + ' · ASTRANOV (our system)';
      }
      if (out) out.removeAttribute('hidden');
      return;
    }
    mount.removeAttribute('hidden');
    if (who) {
      who.textContent = 'Not signed in · Google signs you into ASTRANOV only (our system)';
      who.removeAttribute('hidden');
    }
    if (out) out.setAttribute('hidden', '');
    if (global.SNAuth && typeof SNAuth.renderGoogleButton === 'function') {
      SNAuth.renderGoogleButton(mount, {
        errorEl: err,
        onSuccess: function () { paintAuth(); checkProvider('astranov', true); }
      });
    } else {
      mount.textContent = 'Google loading…';
    }
  }

  function paintRowStatus(id) {
    var st = document.getElementById('ps-st-' + id);
    if (!st) return;
    var p = PROVIDERS[id];
    if (!p) return;
    if (S.checking[id]) {
      st.textContent = 'Checking…';
      st.className = 'ps-st wait';
      return;
    }
    var ck = S.checks[id];
    if (ck) {
      st.textContent = ck.badge;
      st.className = 'ps-st' + (ck.ok ? ' on' : ck.need ? '' : ' bad');
      return;
    }
    if (id === 'astranov') {
      st.textContent = authUser() ? 'Signed in · not proven yet' : 'Not signed in · not proven yet';
      st.className = 'ps-st';
      return;
    }
    if (hasKey(id)) {
      st.textContent = 'Password saved · not proven yet';
      st.className = 'ps-st';
      return;
    }
    st.textContent = 'Needs their password';
    st.className = 'ps-st';
  }

  function paintCheck(id) {
    var el = document.getElementById('ps-ck-' + id);
    paintRowStatus(id);
    if (!el) return;
    if (S.checking[id]) {
      el.textContent = 'checking whether I can use this…';
      el.className = 'ps-check wait';
      return;
    }
    var ck = S.checks[id];
    if (ck) {
      el.textContent = ck.line;
      el.className = 'ps-check' + (ck.ok ? ' on' : ck.need ? ' need' : ' bad');
      return;
    }
    if (id !== 'astranov' && !hasKey(id)) {
      el.textContent = 'Signing in on their website does not connect them here. I need their secret password.';
      el.className = 'ps-check need';
      return;
    }
    el.textContent = 'Not checked yet';
    el.className = 'ps-check';
  }

  function paintAllStatus() {
    Object.keys(PROVIDERS).forEach(function (id) {
      paintRowStatus(id);
      paintCheck(id);
    });
  }

  function interpretCheck(id, r) {
    var name = (PROVIDERS[id] && PROVIDERS[id].name) || id;
    var text = String((r && r.text) || '');
    if (r && r.ok) {
      if (id === 'astranov') {
        var signed = !!authUser();
        return {
          ok: true,
          need: false,
          at: Date.now(),
          badge: signed ? 'Working · it is you' : 'Working · guest',
          line: signed
            ? 'Our AI is working. Signed in as ' + authName() + '. I can use it.'
            : 'Our AI is working. You are a guest. Sign in with Google so I know it is you.'
        };
      }
      return {
        ok: true,
        need: false,
        at: Date.now(),
        badge: 'Working',
        line: 'I can use ' + name + ' from here.'
      };
    }
    if (/failed to fetch|networkerror|load failed|cors/i.test(text)) {
      return {
        ok: false,
        need: false,
        at: Date.now(),
        badge: 'They blocked us',
        line: name + ' will not talk from this browser. Their website login cannot fix this. Get a secret password from GET PASSWORD.'
      };
    }
    if (/401|403|invalid api|incorrect api|api[_ ]?key|unauthorized|permission|no .+ key/i.test(text)) {
      return {
        ok: false,
        need: true,
        at: Date.now(),
        badge: 'Password refused',
        line: name + ' refused this password. Open GET PASSWORD, create a new one, paste it here.'
      };
    }
    return {
      ok: false,
      need: false,
      at: Date.now(),
      badge: 'No answer',
      line: name + ' did not answer. ' + text.slice(0, 120)
    };
  }

  function normalizeId(id) {
    id = String(id || '').toLowerCase();
    if (id === 'openai' || id === 'gpt') return 'chatgpt';
    if (id === 'google') return 'gemini';
    if (id === 'anthropic') return 'claude';
    if (id === 'mind') return 'astranov';
    return id;
  }

  async function checkProvider(id, force) {
    id = normalizeId(id);
    var p = PROVIDERS[id];
    if (!p) return null;
    if (id !== 'astranov' && !hasKey(id)) {
      S.checks[id] = {
        ok: false,
        need: true,
        at: Date.now(),
        badge: 'Needs their password',
        line: 'Their website login stays on their site. Paste a secret password from GET PASSWORD so I can use ' + p.name + '.'
      };
      paintCheck(id);
      return S.checks[id];
    }
    if (!force && S.checking[id]) return S.checks[id] || null;
    var prev = S.checks[id];
    if (!force && prev && prev.at && (Date.now() - prev.at) < 8000) {
      paintCheck(id);
      return prev;
    }
    S.checking[id] = true;
    paintCheck(id);
    var r;
    try {
      r = await callProvider(id, 'Reply with only the word PONG. Do not add anything else.');
    } catch (e) {
      r = { ok: false, text: String((e && e.message) || e), provider: id };
    }
    S.checking[id] = false;
    S.checks[id] = interpretCheck(id, r);
    paintCheck(id);
    log(p.name + ' · ' + S.checks[id].line, S.checks[id].ok ? 'ok' : 'err');
    return S.checks[id];
  }

  async function checkAll() {
    var ids = Object.keys(PROVIDERS);
    for (var i = 0; i < ids.length; i++) {
      await checkProvider(ids[i]);
    }
  }

  function bindLoginReturn() {
    if (document.__snOrbitFocus) return;
    document.__snOrbitFocus = true;
    window.addEventListener('focus', function () {
      if (!S.loginAway) return;
      var id = S.loginAway;
      S.loginAway = null;
      var sheet = document.getElementById('sn-planet-sheet');
      if (!sheet || sheet.hasAttribute('hidden')) return;
      if (hasKey(id)) {
        checkProvider(id);
        return;
      }
      var p = PROVIDERS[id];
      if (!p) return;
      S.checks[id] = {
        ok: false,
        need: true,
        badge: 'Needs their password',
        line: 'You came back from ' + p.name + '. That website login stays on their site. Paste a secret password from GET PASSWORD so I can use them.'
      };
      paintCheck(id);
    });
  }

  function saveInlineKey(id) {
    var inp = document.getElementById('ps-key-' + id);
    var val = inp ? inp.value : '';
    setKey(id, val);
    if (inp) inp.value = '';
    paintRowStatus(id);
    checkProvider(id, true);
  }

  function showKeySheet(id) {
    openPlanetSheet();
    S.awaitingKey = id;
    setTimeout(function () {
      var inp = document.getElementById('ps-key-' + id);
      if (inp) {
        try { inp.focus(); inp.scrollIntoView({ block: 'nearest' }); } catch (_) {}
      }
    }, 40);
  }

  function ensurePlanetSheet() {
    var back = document.getElementById('sn-planet-back');
    if (!back) {
      back = document.createElement('div');
      back.id = 'sn-planet-back';
      back.setAttribute('hidden', '');
      document.body.appendChild(back);
    }
    var el = document.getElementById('sn-planet-sheet');
    if (el && S.sheetBound) return el;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = document.createElement('div');
    el.id = 'sn-planet-sheet';
    el.setAttribute('hidden', '');
    var cards = Object.keys(PROVIDERS).map(function (id) {
      var p = PROVIDERS[id];
      if (id === 'astranov') {
        return (
          '<article class="ps-card" data-id="astranov">' +
            '<div class="ps-card-h"><span class="ps-name">' + p.icon + ' ' + esc(p.name) + '</span>' +
            '<span class="ps-st" id="ps-st-astranov">Not signed in · not proven yet</span></div>' +
            '<p class="ps-who" id="ps-who">Not signed in · Google signs you into ASTRANOV only (our system)</p>' +
            '<div id="ps-gsi"></div>' +
            '<p class="ps-err" id="ps-gsi-err"></p>' +
            '<p class="ps-check" id="ps-ck-astranov">Not checked yet</p>' +
            '<button type="button" class="ps-glow" data-check="astranov">> check our AI</button>' +
            '<button type="button" class="ps-ghost" id="ps-signout" hidden>SIGN OUT</button>' +
          '</article>'
        );
      }
      return (
        '<article class="ps-card" data-id="' + id + '">' +
          '<div class="ps-card-h"><span class="ps-name">' + p.icon + ' ' + esc(p.name) + '</span>' +
          '<span class="ps-st" id="ps-st-' + id + '">Needs their password</span></div>' +
          '<div class="ps-keyrow">' +
            '<input id="ps-key-' + id + '" type="password" autocomplete="off" spellcheck="false" placeholder="paste ' + esc(p.name) + ' secret password" />' +
            '<button type="button" class="ps-save" data-save="' + id + '">SAVE</button>' +
          '</div>' +
          '<div class="ps-links">' +
            '<a class="ps-link" href="' + p.login + '" target="_blank" rel="noopener noreferrer" data-login="' + id + '">THEIR SITE</a>' +
            '<a class="ps-link" href="' + p.console + '" target="_blank" rel="noopener noreferrer">GET PASSWORD</a>' +
          '</div>' +
          '<p class="ps-note">Their website login stays on their site. A secret password from GET PASSWORD is what lets me use them.</p>' +
          '<p class="ps-check" id="ps-ck-' + id + '">Not connected. I need their secret password.</p>' +
          '<button type="button" class="ps-glow" data-check="' + id + '">> check ' + esc(String(p.name).toLowerCase()) + '</button>' +
        '</article>'
      );
    }).join('');
    el.innerHTML =
      '<style>' +
      '#sn-planet-back{position:fixed;inset:0;z-index:460;background:rgba(0,2,10,.62);pointer-events:auto}' +
      '#sn-planet-back[hidden],#sn-planet-sheet[hidden]{display:none!important}' +
      '#sn-planet-sheet{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:470;' +
      'width:min(560px,calc(100vw - 16px));max-height:min(88vh,calc(100vh - 24px));overflow:auto;' +
      'padding:16px 16px 14px;border-radius:18px;pointer-events:auto;' +
      'background:#050a14;backdrop-filter:blur(18px) saturate(1.2);' +
      '-webkit-backdrop-filter:blur(18px) saturate(1.2);-webkit-overflow-scrolling:touch;' +
      'border:1px solid rgba(61,158,255,.45);box-shadow:0 0 40px rgba(40,140,255,.28)}' +
      '#sn-planet-sheet h2{margin:0;font:800 13px/1 Space Grotesk,system-ui,sans-serif;letter-spacing:.16em;color:#7ec8ff}' +
      '#sn-planet-sheet .ps-sub{margin:6px 0 12px;font:600 12px/1.35 Inter,system-ui,sans-serif;color:#9ab}' +
      '#sn-planet-sheet .ps-card{margin:8px 0;padding:12px;border:1px solid rgba(61,158,255,.22);border-radius:14px}' +
      '#sn-planet-sheet .ps-card-h{display:flex;align-items:center;gap:8px;margin:0 0 8px}' +
      '#sn-planet-sheet .ps-name{font:700 13px/1.2 Inter,system-ui,sans-serif;color:#d8ecff}' +
      '#sn-planet-sheet .ps-st{margin-left:auto;font:600 11px/1 Inter,system-ui,sans-serif;color:#8ab}' +
      '#sn-planet-sheet .ps-st.on{color:#7ef0b0}' +
      '#sn-planet-sheet .ps-st.bad{color:#ff8a90}' +
      '#sn-planet-sheet .ps-st.wait{color:#8ab}' +
      '#sn-planet-sheet .ps-who{margin:0 0 8px;font:600 12px/1.35 Inter,system-ui,sans-serif;color:#9ab}' +
      '#sn-planet-sheet .ps-err{margin:6px 0 0;min-height:0;font:600 11px/1.35 Inter,system-ui,sans-serif;color:#ff8a90}' +
      '#sn-planet-sheet .ps-note{margin:6px 0 0;font:500 11px/1.4 Inter,system-ui,sans-serif;color:#8ab}' +
      '#sn-planet-sheet .ps-check{margin:8px 0 0;font:600 12px/1.4 Inter,system-ui,sans-serif;color:#9ab}' +
      '#sn-planet-sheet .ps-check.on{color:#7ef0b0}' +
      '#sn-planet-sheet .ps-check.need{color:#ffc857}' +
      '#sn-planet-sheet .ps-check.bad{color:#ff8a90}' +
      '#sn-planet-sheet .ps-check.wait{color:#8ab}' +
      '#sn-planet-sheet .ps-glow{display:block;width:100%;min-height:44px;margin-top:8px;padding:0 8px;' +
      'border:0;background:transparent;text-align:left;cursor:pointer;' +
      'font:700 14px/1.2 JetBrains Mono,ui-monospace,monospace;letter-spacing:.04em;' +
      'color:#7ec8ff;text-shadow:0 0 14px rgba(61,158,255,.9);' +
      'animation:ps-glow 1.5s ease-in-out infinite}' +
      '#sn-planet-sheet .ps-glow:hover,#sn-planet-sheet .ps-glow:focus-visible{color:#d8ecff;outline:none}' +
      '@keyframes ps-glow{0%,100%{opacity:.72}50%{opacity:1}}' +
      '@media (prefers-reduced-motion:reduce){#sn-planet-sheet .ps-glow{animation:none}}' +
      '#sn-planet-sheet #ps-gsi{min-height:44px;display:flex;justify-content:flex-start}' +
      '#sn-planet-sheet .ps-keyrow{display:flex;gap:8px;margin:0 0 8px}' +
      '#sn-planet-sheet .ps-keyrow input{flex:1;min-width:0;min-height:44px;box-sizing:border-box;padding:0 12px;' +
      'border-radius:12px;border:1px solid rgba(61,158,255,.45);background:transparent;color:#d8ecff;' +
      'font:600 14px/1.3 JetBrains Mono,ui-monospace,monospace;outline:none}' +
      '#sn-planet-sheet .ps-keyrow input:focus{box-shadow:0 0 0 2px rgba(61,158,255,.35)}' +
      '#sn-planet-sheet .ps-save,#sn-planet-sheet .ps-ghost,#sn-planet-sheet .ps-go,' +
      '#sn-planet-sheet .ps-close{min-height:44px;padding:0 14px;border-radius:999px;cursor:pointer;' +
      'border:1px solid rgba(61,158,255,.4);background:transparent;color:#9cf;' +
      'font:800 12px/1 system-ui;letter-spacing:.08em}' +
      '#sn-planet-sheet .ps-save{border-color:rgba(61,214,140,.7);color:#7ef0b0}' +
      '#sn-planet-sheet .ps-ghost{width:100%;margin-top:8px;color:#9ab}' +
      '#sn-planet-sheet .ps-links{display:flex;gap:8px}' +
      '#sn-planet-sheet .ps-link{flex:1;min-height:44px;display:flex;align-items:center;justify-content:center;' +
      'border-radius:999px;border:1px solid rgba(61,158,255,.4);color:#9cf;text-decoration:none;' +
      'font:800 11px/1 system-ui;letter-spacing:.08em}' +
      '#sn-planet-sheet .ps-sec{margin:14px 0 8px;font:800 12px/1 Space Grotesk,system-ui,sans-serif;' +
      'letter-spacing:.14em;color:#7ec8ff}' +
      '#sn-planet-sheet label{display:block;margin:8px 0 4px;font:700 11px/1 Inter,system-ui,sans-serif;color:#8ab;letter-spacing:.06em}' +
      '#sn-planet-sheet #ps-task,#sn-planet-sheet #ps-code{width:100%;box-sizing:border-box;background:transparent;color:#d8ecff;' +
      'border:1px solid rgba(61,158,255,.35);border-radius:12px;padding:10px 12px;font:500 13px/1.4 Inter,system-ui,sans-serif}' +
      '#sn-planet-sheet #ps-code{min-height:88px;resize:vertical}' +
      '#sn-planet-sheet .ps-actions{display:flex;gap:8px;margin-top:10px}' +
      '#sn-planet-sheet .ps-go{flex:1}' +
      '#sn-planet-sheet #ps-publish{border-color:rgba(61,214,140,.7);color:#7ef0b0}' +
      '#sn-planet-sheet #ps-publish[disabled]{opacity:.35;pointer-events:none}' +
      '#sn-planet-sheet #ps-verdicts{margin:10px 0 0;font:600 12px/1.45 Inter,system-ui,sans-serif;color:#cfe8ff;white-space:pre-wrap}' +
      '#sn-planet-sheet .ps-close{width:100%;margin-top:12px;color:#9ab;border-color:rgba(61,158,255,.3)}' +
      '@media (max-width:520px){#sn-planet-sheet{top:max(8px,env(safe-area-inset-top));left:8px;right:8px;' +
      'bottom:max(8px,env(safe-area-inset-bottom));transform:none;width:auto;max-height:none;border-radius:16px}' +
      '#sn-planet-sheet .ps-links{flex-direction:column}}' +
      '</style>' +
      '<h2>COLLECTIVE AI</h2>' +
      '<p class="ps-sub">Google is for ASTRANOV (our system). Gemini, ChatGPT and Claude need their own secret passwords. I check if I can actually use them.</p>' +
      '<button type="button" class="ps-glow" id="ps-check-all">> check all connections</button>' +
      '<div id="ps-rows">' + cards + '</div>' +
      '<p class="ps-sec">COUNCIL</p>' +
      '<p class="ps-sub">Our AI plus Gemini, ChatGPT and Claude read the work. They say if it is solved, useful, and ready to publish. I only publish if they say yes.</p>' +
      '<label for="ps-task">TASK</label>' +
      '<input id="ps-task" type="text" autocomplete="off" placeholder="what the code was asked to do" />' +
      '<label for="ps-code">PRODUCED CODE</label>' +
      '<textarea id="ps-code" spellcheck="false" placeholder="paste the produced code — last collab / agent output appears here"></textarea>' +
      '<div class="ps-actions">' +
        '<button type="button" class="ps-go" id="ps-inspect">INSPECT</button>' +
        '<button type="button" class="ps-go" id="ps-publish" disabled>PUBLISH</button>' +
      '</div>' +
      '<div id="ps-verdicts"></div>' +
      '<button type="button" class="ps-close" id="ps-close">CLOSE</button>';
    document.body.appendChild(el);

    back.onclick = function () { hidePlanetSheet(); };
    el.querySelector('#ps-close').addEventListener('click', hidePlanetSheet);
    var so = el.querySelector('#ps-signout');
    if (so) {
      so.addEventListener('click', function () {
        try {
          if (global.SNAuth && SNAuth.signOut) {
            SNAuth.signOut().then(function () { paintAuth(); checkProvider('astranov', true); }).catch(function () { paintAuth(); });
          }
        } catch (_) { paintAuth(); }
      });
    }
    el.querySelectorAll('[data-save]').forEach(function (btn) {
      btn.addEventListener('click', function () { saveInlineKey(btn.getAttribute('data-save')); });
    });
    el.querySelectorAll('[data-check]').forEach(function (btn) {
      btn.addEventListener('click', function () { checkProvider(btn.getAttribute('data-check')); });
    });
    var allBtn = el.querySelector('#ps-check-all');
    if (allBtn) allBtn.addEventListener('click', function () { checkAll(); });
    el.querySelectorAll('[data-login]').forEach(function (a) {
      a.addEventListener('click', function () { S.loginAway = a.getAttribute('data-login'); });
    });
    Object.keys(PROVIDERS).forEach(function (id) {
      var inp = el.querySelector('#ps-key-' + id);
      if (!inp) return;
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); saveInlineKey(id); }
      });
    });
    el.querySelector('#ps-inspect').addEventListener('click', function () { inspectCouncil(); });
    el.querySelector('#ps-publish').addEventListener('click', function () { publishVerdict(); });
    if (!document.__snPlanetEsc) {
      document.__snPlanetEsc = true;
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var sheet = document.getElementById('sn-planet-sheet');
        if (sheet && !sheet.hasAttribute('hidden')) hidePlanetSheet();
      });
    }
    S.sheetBound = true;
    return el;
  }

  function paintCouncilBox() {
    var taskEl = document.getElementById('ps-task');
    var codeEl = document.getElementById('ps-code');
    var box = document.getElementById('ps-verdicts');
    var pub = document.getElementById('ps-publish');
    if (taskEl && S.lastTask && !String(taskEl.value || '').trim()) taskEl.value = S.lastTask;
    if (codeEl && S.lastCode && !String(codeEl.value || '').trim()) codeEl.value = S.lastCode;
    if (box && S.lastVerdict) box.textContent = formatVerdict(S.lastVerdict);
    if (pub) {
      var ship = !!(S.lastVerdict && S.lastVerdict.majority && S.lastVerdict.majority.ship);
      if (ship) pub.removeAttribute('disabled');
      else pub.setAttribute('disabled', '');
    }
  }

  function openPlanetSheet() {
    dismissForeignMenus();
    loadRemembered();
    var el = ensurePlanetSheet();
    var back = document.getElementById('sn-planet-back');
    paintAllStatus();
    paintCouncilBox();
    if (back) back.removeAttribute('hidden');
    el.removeAttribute('hidden');
    paintAuth();
    checkAll();
  }

  var orbitGroup = null;
  var orbitSats = [];
  var orbitLabel = null;
  var orbitFrameOn = false;
  var hudRafOn = false;

  function llVec(lat, lng, r) {
    if (global.SNGlobe && SNGlobe.latLngToVec) return SNGlobe.latLngToVec(lat, lng, r);
    r = r == null ? 1 : r;
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((lng + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  function projectToScreen(vec) {
    try {
      var cam = global.SNGlobe && SNGlobe.getCamera && SNGlobe.getCamera();
      var renderer = global.SNGlobe && SNGlobe.getRenderer && SNGlobe.getRenderer();
      if (!cam || !renderer || !vec) return null;
      var v = vec.clone();
      if (orbitGroup && orbitGroup.parent && orbitGroup.parent.localToWorld) {
        v = orbitGroup.parent.localToWorld(vec.clone());
      }
      v.project(cam);
      var w = renderer.domElement.clientWidth || window.innerWidth;
      var h = renderer.domElement.clientHeight || window.innerHeight;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, z: v.z };
    } catch (_) {
      return null;
    }
  }

  function fallbackHudPos() {
    var w = window.innerWidth || 390;
    var h = window.innerHeight || 844;
    var dx = Math.max(88, Math.min(210, w * 0.18));
    return { x: w * 0.5 + dx, y: h * 0.30 };
  }

  function placeHud(el) {
    if (!el) return;
    var pos = fallbackHudPos();
    try {
      if (orbitGroup && global.SNGlobe && SNGlobe.getCamera) {
        var world = new THREE.Vector3();
        orbitGroup.getWorldPosition(world);
        var scr = projectToScreen(world);
        if (scr && scr.z > -1 && scr.z < 1 && scr.x > 40 && scr.x < window.innerWidth - 40) {
          pos = { x: scr.x, y: scr.y };
        }
      }
    } catch (_) {}
    el.style.left = Math.round(pos.x) + 'px';
    el.style.top = Math.round(pos.y) + 'px';
    el.style.opacity = '1';
  }

  function ensurePlanetHud() {
    var el = document.getElementById('sn-collective-hud');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    var st = document.getElementById('sn-collective-hud-css');
    if (st && st.parentNode) st.parentNode.removeChild(st);
    return null;
  }

  function ensureOrbitLabel() {
    return ensurePlanetHud();
  }

  function clearPlanet() {
    S.entityIds.forEach(function (id) {
      try { if (global.GlobeEntity) GlobeEntity.unregister(id); } catch (_) {}
    });
    S.entityIds = [];
    S.planetVisible = false;
    hidePlanetSheet();
    destroyKeySheet();
    try {
      if (orbitGroup && orbitGroup.parent) orbitGroup.parent.remove(orbitGroup);
    } catch (_) {}
    orbitGroup = null;
    orbitSats = [];
    var hud = document.getElementById('sn-collective-hud');
    if (hud) hud.setAttribute('hidden', '');
    if (orbitLabel) orbitLabel.style.opacity = '0';
  }

  function paintPlanet3d() {
    if (!global.THREE || !global.SNGlobe || !SNGlobe.ready) return false;
    var host = null;
    try {
      if (global.SNSkyBodies && SNSkyBodies.getAstranovGroup) host = SNSkyBodies.getAstranovGroup();
    } catch (_) {}
    if (orbitGroup && orbitGroup.parent && host && orbitGroup.parent === host) {
      S.planetVisible = true;
      return true;
    }
    if (orbitGroup && orbitGroup.parent) {
      try { orbitGroup.parent.remove(orbitGroup); } catch (_) {}
    }
    if (!host) {
      var scene = SNGlobe.getScene && SNGlobe.getScene();
      if (!scene) return false;
    }
    var T = THREE;
    var group = new T.Group();
    group.name = 'sn-collective-sats';
    if (host) {
      group.position.set(0, 0, 0);
    } else {
      group.position.set(1.35, 0.62, 1.55);
    }

    orbitSats = [];
    Object.keys(PROVIDERS).forEach(function (id, i) {
      var p = PROVIDERS[id];
      var sat = new T.Mesh(
        new T.SphereGeometry(id === 'astranov' ? 0.038 : 0.028, 12, 12),
        new T.MeshBasicMaterial({ color: p.hex })
      );
      sat.userData = { id: id, phase: (i / 4) * Math.PI * 2, radius: 0.52 + (i % 2) * 0.06 };
      sat.position.set(
        Math.cos(sat.userData.phase) * sat.userData.radius,
        Math.sin(sat.userData.phase * 0.7) * 0.06,
        Math.sin(sat.userData.phase) * sat.userData.radius
      );
      group.add(sat);
      orbitSats.push(sat);
    });

    if (host) host.add(group);
    else {
      var scene2 = SNGlobe.getScene && SNGlobe.getScene();
      if (!scene2) return false;
      scene2.add(group);
    }
    orbitGroup = group;
    S.planetVisible = true;
    try { if (global.SNGlobe) SNGlobe.lastAct = Date.now(); } catch (_) {}
    if (!orbitFrameOn) {
      orbitFrameOn = true;
      function spin() {
        if (orbitGroup) {
          orbitSats.forEach(function (sat) {
            sat.userData.phase += 0.014;
            sat.position.set(
              Math.cos(sat.userData.phase) * sat.userData.radius,
              Math.sin(sat.userData.phase * 0.7) * 0.06,
              Math.sin(sat.userData.phase) * sat.userData.radius
            );
          });
        }
        requestAnimationFrame(spin);
      }
      requestAnimationFrame(spin);
    }
    return true;
  }

  function paintPlanet() {
    S.planetVisible = true;
    ensurePlanetHud();
    try { paintPlanet3d(); } catch (_) {}
  }

  function flyToOrbit() {
    try {
      if (typeof latLngToPos === 'function' && typeof flyToPoint === 'function' && global.THREE) {
        var fp = latLngToPos(PLANET.lat, PLANET.lng, 1.24);
        var z = (global.GlobeControl && GlobeControl.Z && GlobeControl.Z.global) || 2.55;
        flyToPoint(new THREE.Vector3(fp.x, fp.y, fp.z), z);
        return;
      }
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(PLANET.lat, PLANET.lng, { tier: 'global', label: 'Astranov Orbit', openMap: false });
      }
    } catch (_) {}
  }

  function listAgents() {
    log('-- ASTRANOV ORBIT --', 'ok');
    Object.keys(PROVIDERS).forEach(function (id) {
      var p = PROVIDERS[id];
      var ck = S.checks[id];
      var face = ck ? ck.badge : (hasKey(id) ? 'Password saved · not proven yet' : (p.needsKey ? 'Needs their password' : 'Not proven yet'));
      log((ck && ck.ok ? '\u25cf ' : '\u25cb ') + p.name + ' · ' + face, ck && ck.ok ? 'ok' : 'dim');
      if (ck && ck.line) log('  ' + ck.line, ck.ok ? 'ok' : 'dim');
    });
    log('planet sheet · Google · keys · company login · council inspect', 'dim');
  }

  function goOrbit(opts) {
    opts = opts || {};
    paintPlanet();
    ensurePlanetHud();
    if (!opts.quiet) openPlanetSheet();
    if (opts.noFly) return;
    if (opts.fly) flyToOrbit();
  }

  function setKey(provider, key) {
    var id = String(provider || '').toLowerCase();
    if (id === 'openai' || id === 'gpt') id = 'chatgpt';
    if (id === 'anthropic') id = 'claude';
    if (id === 'google') id = 'gemini';
    if (!PROVIDERS[id] || id === 'astranov') { log('use gemini · chatgpt · claude', 'err'); return; }
    key = String(key || '').trim();
    if (key.length < 8) { log('key too short', 'err'); return; }
    S.creds[id] = key;
    saveCreds();
    log(PROVIDERS[id].name + ' · password saved on this device · checking…', 'ok');
    paintRowStatus(id);
    checkProvider(id, true);
    if (S.planetVisible) paintPlanet();
  }

  function clearKey(id) {
    id = String(id || '').toLowerCase();
    if (id === 'all') { S.creds = {}; S.checks = {}; saveCreds(); log('keys cleared', 'ok'); }
    else if (S.creds[id]) { delete S.creds[id]; delete S.checks[id]; saveCreds(); log(id + ' cleared', 'ok'); }
    paintAllStatus();
    if (S.planetVisible) paintPlanet();
  }

  function pulseSat(id, mode) {
    try {
      if (!global.GlobeEntity || !GlobeEntity.register) return;
      var p = PROVIDERS[id];
      var off = SAT[id];
      if (!p || !off) return;
      GlobeEntity.register({
        id: 'agent-sat-' + id, type: 'place',
        lat: PLANET.lat + off.dLat, lng: PLANET.lng + off.dLng, altitude: off.alt,
        title: p.icon + ' ' + p.name,
        description: mode === 'think' ? 'THINKING…' : mode === 'ok' ? 'REPLIED' : mode === 'fail' ? 'FAIL' : p.role,
        urgency: mode === 'think' ? 3 : mode === 'fail' ? 2 : 3,
        color: mode === 'fail' ? 0xe82127 : p.hex,
        icon: p.icon, radius: 0.028, persist: true,
        data: { alwaysShowLabel: true, agentOrbit: true, agentId: id }
      });
    } catch (_) {}
  }

  async function callAstranov(prompt) {
    try {
      var base = (global.SB_URL || (global.SN_CONFIG && SN_CONFIG.sbUrl) || 'https://lkoatrkhuigdolnjsbie.supabase.co').replace(/\/$/, '');
      var headers;
      if (global.SNAuth && typeof SNAuth.authHeaders === 'function') {
        headers = await SNAuth.authHeaders();
      } else {
        headers = { 'Content-Type': 'application/json' };
        var k = global.SB_KEY || (global.SN_CONFIG && SN_CONFIG.sbKey) || '';
        if (k) { headers.apikey = k; headers.Authorization = 'Bearer ' + k; }
      }
      try {
        var tok = (global.SNAuth && SNAuth.session && SNAuth.session.access_token) || '';
        if (tok) headers.Authorization = 'Bearer ' + tok;
      } catch (_) {}
      var res = await fetch(base + '/functions/v1/ai-router', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ text: prompt, preferred_provider: 'astranov' })
      });
      var j = await res.json().catch(function () { return {}; });
      return { ok: res.ok, text: j.text || j.reply || j.message || JSON.stringify(j).slice(0, 600), provider: 'astranov' };
    } catch (e) {
      return { ok: false, text: 'astranov fail · ' + (e && e.message), provider: 'astranov' };
    }
  }

  async function callGemini(prompt) {
    var key = S.creds.gemini;
    if (!key) return { ok: false, text: 'no gemini key', provider: 'gemini' };
    try {
      var res = await fetch(PROVIDERS.gemini.endpoint + '?key=' + encodeURIComponent(key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      });
      var j = await res.json().catch(function () { return {}; });
      var text = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || (j.error && j.error.message) || JSON.stringify(j).slice(0, 400);
      return { ok: res.ok, text: text, provider: 'gemini' };
    } catch (e) { return { ok: false, text: 'gemini fail · ' + e.message, provider: 'gemini' }; }
  }

  async function callChatGPT(prompt) {
    var key = S.creds.chatgpt;
    if (!key) return { ok: false, text: 'no chatgpt key', provider: 'chatgpt' };
    try {
      var res = await fetch(PROVIDERS.chatgpt.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: PROVIDERS.chatgpt.model, messages: [{ role: 'user', content: prompt }], max_tokens: 800 })
      });
      var j = await res.json().catch(function () { return {}; });
      var text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || (j.error && j.error.message) || JSON.stringify(j).slice(0, 400);
      return { ok: res.ok, text: text, provider: 'chatgpt' };
    } catch (e) { return { ok: false, text: 'chatgpt fail (CORS?) · ' + e.message, provider: 'chatgpt' }; }
  }

  async function callClaude(prompt) {
    var key = S.creds.claude;
    if (!key) return { ok: false, text: 'no claude key', provider: 'claude' };
    try {
      var res = await fetch(PROVIDERS.claude.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: PROVIDERS.claude.model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
      });
      var j = await res.json().catch(function () { return {}; });
      var text = (j.content && j.content[0] && j.content[0].text) || (j.error && j.error.message) || JSON.stringify(j).slice(0, 400);
      return { ok: res.ok, text: text, provider: 'claude' };
    } catch (e) { return { ok: false, text: 'claude fail · ' + e.message, provider: 'claude' }; }
  }

  async function callProvider(id, prompt) {
    id = String(id || '').toLowerCase();
    if (id === 'openai' || id === 'gpt') id = 'chatgpt';
    if (id === 'google') id = 'gemini';
    if (id === 'anthropic') id = 'claude';
    pulseSat(id, 'think');
    var r;
    if (id === 'astranov') r = await callAstranov(prompt);
    else if (id === 'gemini') r = await callGemini(prompt);
    else if (id === 'chatgpt') r = await callChatGPT(prompt);
    else if (id === 'claude') r = await callClaude(prompt);
    else r = { ok: false, text: 'unknown ' + id, provider: id };
    pulseSat(id, r.ok ? 'ok' : 'fail');
    return r;
  }

  function parseVerdict(text) {
    var raw = String(text || '');
    var m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        var j = JSON.parse(m[0]);
        return {
          solved: j.solved === true,
          useful: j.useful === true,
          ship: j.ship === true,
          reason: String(j.reason || '').slice(0, 240)
        };
      } catch (_) {}
    }
    return { solved: false, useful: false, ship: false, reason: raw.slice(0, 180) || 'no structured verdict' };
  }

  function majorityOf(votes, key) {
    var n = votes.length;
    if (!n) return false;
    var yes = 0;
    votes.forEach(function (v) { if (v[key]) yes++; });
    return yes * 2 > n;
  }

  function formatVerdict(v) {
    if (!v) return '';
    var lines = [];
    (v.votes || []).forEach(function (row) {
      if (!row.ok) {
        lines.push(row.name + '  FAIL · ' + String(row.error || 'no reply'));
        return;
      }
      lines.push(
        row.name +
        '  SOLVED ' + (row.solved ? 'yes' : 'no') +
        ' · USEFUL ' + (row.useful ? 'yes' : 'no') +
        ' · SHIP ' + (row.ship ? 'yes' : 'no')
      );
      if (row.reason) lines.push('  ' + row.reason);
    });
    if (v.majority) {
      lines.push('');
      lines.push(
        'MAJORITY  SOLVED ' + (v.majority.solved ? 'yes' : 'no') +
        ' · USEFUL ' + (v.majority.useful ? 'yes' : 'no') +
        ' · SHIP ' + (v.majority.ship ? 'yes' : 'HOLD')
      );
    } else {
      lines.push('');
      lines.push('No council member could inspect. Add keys or try again.');
    }
    return lines.join('\n');
  }

  function councilPrompt(task, code) {
    return (
      'You sit on the Astranov collective council with Gemini, ChatGPT, Claude and Astranov Mind. ' +
      'The chief coder is Astranov. Inspect the produced code.\n\n' +
      'Return ONLY a JSON object, no markdown:\n' +
      '{"solved":true or false,"useful":true or false,"ship":true or false,"reason":"one sentence"}\n\n' +
      'solved = the code actually addresses the stated problem\n' +
      'useful = coherent, would run, not dummy or placeholder\n' +
      'ship = vote YES to publish to astranov.eu — only if solved AND useful AND no critical defect\n\n' +
      'TASK:\n' + String(task).slice(0, 1200) + '\n\nCODE:\n' + String(code).slice(0, 8000)
    );
  }

  async function inspectCouncil(task, code) {
    if (S.inspecting) return S.lastVerdict;
    var taskEl = document.getElementById('ps-task');
    var codeEl = document.getElementById('ps-code');
    task = String(task != null ? task : (taskEl && taskEl.value) || S.lastTask || '').trim();
    code = String(code != null ? code : (codeEl && codeEl.value) || S.lastCode || '').trim();
    var box = document.getElementById('ps-verdicts');
    var btn = document.getElementById('ps-inspect');
    var pub = document.getElementById('ps-publish');
    if (!task || !code) {
      if (box) box.textContent = 'Paste the task and the produced code. Council will not invent either.';
      return null;
    }
    rememberCode(task, code, 'inspect');
    S.inspecting = true;
    if (btn) btn.textContent = 'INSPECTING…';
    if (pub) pub.setAttribute('disabled', '');
    if (box) box.textContent = 'Council reading the code…';
    var prompt = councilPrompt(task, code);
    var ids = Object.keys(PROVIDERS).filter(function (id) {
      return id === 'astranov' || hasKey(id);
    });
    var rows = await Promise.all(ids.map(async function (id) {
      var r = await callProvider(id, prompt);
      if (!r.ok) {
        return { id: id, name: PROVIDERS[id].name, ok: false, error: String(r.text || 'fail') };
      }
      var v = parseVerdict(r.text);
      return {
        id: id, name: PROVIDERS[id].name, ok: true,
        solved: v.solved, useful: v.useful, ship: v.ship, reason: v.reason, raw: String(r.text || '').slice(0, 400)
      };
    }));
    var okVotes = rows.filter(function (r) { return r.ok; });
    var verdict = {
      at: Date.now(),
      task: task,
      votes: rows,
      majority: okVotes.length
        ? {
            solved: majorityOf(okVotes, 'solved'),
            useful: majorityOf(okVotes, 'useful'),
            ship: majorityOf(okVotes, 'ship')
          }
        : null
    };
    S.lastVerdict = verdict;
    try { localStorage.setItem(VERDICT_KEY, JSON.stringify(verdict)); } catch (_) {}
    S.inspecting = false;
    if (btn) btn.textContent = 'INSPECT';
    if (box) box.textContent = formatVerdict(verdict);
    if (pub) {
      if (verdict.majority && verdict.majority.ship) pub.removeAttribute('disabled');
      else pub.setAttribute('disabled', '');
    }
    log(
      'council · ' +
        (verdict.majority
          ? ('SOLVED ' + (verdict.majority.solved ? 'yes' : 'no') +
             ' · USEFUL ' + (verdict.majority.useful ? 'yes' : 'no') +
             ' · SHIP ' + (verdict.majority.ship ? 'yes' : 'HOLD'))
          : 'no votes'),
      verdict.majority && verdict.majority.ship ? 'ok' : 'dim'
    );
    return verdict;
  }

  async function publishVerdict() {
    var v = S.lastVerdict;
    var box = document.getElementById('ps-verdicts');
    if (!v || !v.majority || !v.majority.ship) {
      if (box) box.textContent = (box.textContent || '') + '\n\nCouncil did not vote SHIP. Nothing published.';
      return null;
    }
    var ticket = {
      at: Date.now(),
      build: BUILD,
      task: v.task,
      majority: v.majority,
      votes: (v.votes || []).map(function (row) {
        return { id: row.id, ok: row.ok, solved: row.solved, useful: row.useful, ship: row.ship, reason: row.reason, error: row.error };
      })
    };
    try { localStorage.setItem(SHIP_KEY, JSON.stringify(ticket)); } catch (_) {}
    var posted = false;
    try {
      var base = (global.SB_URL || (global.SN_CONFIG && SN_CONFIG.sbUrl) || 'https://lkoatrkhuigdolnjsbie.supabase.co').replace(/\/$/, '');
      var headers = { 'Content-Type': 'application/json' };
      var k = global.SB_KEY || (global.SN_CONFIG && SN_CONFIG.sbKey) || '';
      if (k) { headers.apikey = k; headers.Authorization = 'Bearer ' + k; }
      try {
        var tok = (global.SNAuth && SNAuth.session && SNAuth.session.access_token) || '';
        if (tok) headers.Authorization = 'Bearer ' + tok;
      } catch (_) {}
      var res = await fetch(base + '/functions/v1/ai-router', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          text: 'COUNCIL SHIP TICKET for chief coder.\n' + JSON.stringify(ticket).slice(0, 3500),
          preferred_provider: 'astranov',
          kind: 'council-ship'
        })
      });
      posted = res.ok;
    } catch (_) {}
    var msg = posted
      ? 'SHIP recorded · chief coder publishes this to astranov.eu'
      : 'SHIP recorded on this device · chief coder publishes this to astranov.eu';
    if (box) box.textContent = formatVerdict(v) + '\n\n' + msg;
    log(msg, 'ok');
    return ticket;
  }

  async function collab(task) {
    task = String(task || '').trim();
    if (!task) { log('usage: collab <task>', 'dim'); return; }
    if (!S.planetVisible) paintPlanet();
    log('\u25ce COLLAB · ' + task.slice(0, 120), 'ok');
    var online = Object.keys(PROVIDERS).filter(hasKey);
    log('link  ' + online.map(function (i) { return PROVIDERS[i].icon + ' ' + PROVIDERS[i].name; }).join('  \u2194  '), 'ok');
    pulseSat('astranov', 'think');
    var plan = await callAstranov('SpaceNet multi-agent orchestrator. Task: ' + task + '\nOnline: ' + online.join(', ') + '\nShort plan max 6 lines.');
    log('PLAN · ' + String(plan.text || '').slice(0, 260), plan.ok ? 'ok' : 'err');
    var targets = online.filter(function (i) { return i !== 'astranov'; });
    if (!targets.length) targets = ['astranov'];
    var results = [];
    await Promise.all(targets.slice(0, 3).map(async function (id) {
      log('\u25ce \u2192 ' + PROVIDERS[id].name + ' …', 'dim');
      var r = await callProvider(id, 'Task: ' + task + '\nPlan: ' + String(plan.text || '').slice(0, 400) + '\nConcise actionable answer max 300 words.');
      results.push(r);
      log(PROVIDERS[id].name + ' \u2192 ASTRANOV · ' + (r.ok ? 'ok' : 'fail') + ' · ' + String(r.text || '').slice(0, 140), r.ok ? 'ok' : 'err');
    }));
    pulseSat('astranov', 'think');
    var final = await callAstranov('Merge into ONE final answer.\nTask: ' + task + '\n\n' + results.map(function (r) { return '### ' + r.provider + '\n' + String(r.text || '').slice(0, 700); }).join('\n\n'));
    pulseSat('astranov', final.ok ? 'ok' : 'fail');
    var artifact = results.map(function (r) {
      return '### ' + r.provider + '\n' + String(r.text || '');
    }).join('\n\n') + '\n\n### FINAL\n' + String(final.text || '');
    rememberCode(task, artifact, 'collab');
    log('-- FINAL --', 'ok');
    String(final.text || '').split(/\n+/).slice(0, 22).forEach(function (ln) { if (ln.trim()) log(ln.trim(), 'ok'); });
  }

  async function singleAgent(name, prompt) {
    var id = String(name || '').toLowerCase();
    if (id === 'openai' || id === 'gpt') id = 'chatgpt';
    if (id === 'google') id = 'gemini';
    if (id === 'anthropic') id = 'claude';
    if (id === 'mind') id = 'astranov';
    prompt = String(prompt || '').trim();
    if (!prompt) { log('usage: agent <name> <prompt>', 'dim'); return; }
    log('\u2192 ' + ((PROVIDERS[id] && PROVIDERS[id].name) || id) + '…', 'dim');
    var r = await callProvider(id, prompt);
    rememberCode(prompt, String(r.text || ''), id);
    log((r.ok ? '\u2713 ' : '\u2717 ') + String(r.text || '').slice(0, 420), r.ok ? 'ok' : 'err');
  }

  function handleLine(line) {
    var raw = String(line || '').trim();
    var low = raw.toLowerCase();
    if (!low) return false;
    if (S.awaitingKey && raw.length > 8 && raw.indexOf(' ') < 0) {
      setKey(S.awaitingKey, raw);
      S.awaitingKey = null;
      return true;
    }
    if (low === 'agents' || low === 'orbit' || low === 'planet' || low === 'astranov planet') { goOrbit(); return true; }
    if (low === 'agents off' || low === 'orbit off' || low === 'planet off') { clearPlanet(); log('orbit cleared', 'ok'); return true; }
    if (low === 'agents help') {
      log('orbit · check all connections · agents key <p> <KEY> · collab <task> · agent <name> <prompt> · council inspect', 'dim');
      return true;
    }
    if (low === 'agents check' || low === 'check all' || low === 'check connections') {
      openPlanetSheet();
      return true;
    }
    var mCk = raw.match(/^check\s+(astranov|mind|gemini|google|chatgpt|openai|gpt|claude|anthropic)$/i);
    if (mCk) { checkProvider(mCk[1]); return true; }
    var mKey = raw.match(/^agents?\s+key\s+(\w+)\s+(.+)$/i);
    if (mKey) { setKey(mKey[1], mKey[2]); return true; }
    var mClear = low.match(/^agents?\s+clear\s+(\w+)$/);
    if (mClear) { clearKey(mClear[1]); return true; }
    if (low.indexOf('collab ') === 0) { collab(raw.slice(7).trim()); return true; }
    var mA = raw.match(/^agent\s+(astranov|mind|gemini|google|chatgpt|openai|gpt|claude|anthropic)\s+(.+)$/i);
    if (mA) { singleAgent(mA[1], mA[2]); return true; }
    if (low === 'council' || low === 'council inspect') {
      openPlanetSheet();
      if (low === 'council inspect') inspectCouncil();
      return true;
    }
    return false;
  }

  function installCli() {
    try {
      if (global.SNCli && SNCli.run && !SNCli.__agentOrbitWrapped) {
        var p = SNCli.run.bind(SNCli);
        SNCli.run = function (line) { if (handleLine(line)) return true; return p(line); };
        SNCli.__agentOrbitWrapped = true;
      }
    } catch (_) {}
    try {
      if (global.SuperCli && SuperCli.run && !SuperCli.__agentOrbitWrapped) {
        var p2 = SuperCli.run.bind(SuperCli);
        SuperCli.run = function (line) { if (handleLine(line)) return true; return p2(line); };
        SuperCli.__agentOrbitWrapped = true;
      }
    } catch (_) {}
    try {
      if (global.AciCli && AciCli.submit && !AciCli.__agentOrbitWrapped) {
        var p3 = AciCli.submit.bind(AciCli);
        AciCli.submit = function (line) { if (handleLine(line)) return true; return p3(line); };
        AciCli.__agentOrbitWrapped = true;
      }
    } catch (_) {}
    try {
      var form = document.getElementById('cli-form') || document.getElementById('aci-cli-form');
      if (form && !form.__agentOrbit) {
        form.__agentOrbit = true;
        form.addEventListener('submit', function () {
          var inp = document.getElementById('cli-in') || document.getElementById('aci-cli-in');
          if (inp && inp.value) handleLine(inp.value);
        }, true);
      }
    } catch (_) {}
  }

  function ensureRibbonBtn() {
    return;
  }

  function hitPlanet(cx, cy) {
    try {
      if (global.SNSkyBodies && typeof SNSkyBodies.hitTest === 'function') {
        if (SNSkyBodies.hitTest(cx, cy)) return true;
      }
    } catch (_) {}
    try {
      if (!global.THREE || !global.SNGlobe) return false;
      var cam = SNGlobe.getCamera && SNGlobe.getCamera();
      var renderer = SNGlobe.getRenderer && SNGlobe.getRenderer();
      var host = null;
      if (global.SNSkyBodies && SNSkyBodies.getAstranovGroup) host = SNSkyBodies.getAstranovGroup();
      if (!host) host = orbitGroup;
      if (!cam || !renderer || !host) return false;
      var rect = renderer.domElement.getBoundingClientRect();
      var x = ((cx - rect.left) / rect.width) * 2 - 1;
      var y = -((cy - rect.top) / rect.height) * 2 + 1;
      var ray = new THREE.Raycaster();
      ray.params.Sprite = { threshold: 0.45 };
      ray.setFromCamera(new THREE.Vector2(x, y), cam);
      var hits = ray.intersectObject(host, true);
      if (hits && hits.length) return true;
      var world = new THREE.Vector3();
      host.getWorldPosition(world);
      world.project(cam);
      var sx = (world.x * 0.5 + 0.5) * rect.width + rect.left;
      var sy = (-world.y * 0.5 + 0.5) * rect.height + rect.top;
      return Math.hypot(cx - sx, cy - sy) < 140 && world.z < 1;
    } catch (_) {
      return false;
    }
  }

  function bindPlanetClick() {
    try {
      if (global.SNGlobe && SNGlobe.onClick && !SNGlobe.__orbitClick) {
        SNGlobe.__orbitClick = true;
        SNGlobe.onClick(function (cx, cy) {
          if (hitPlanet(cx, cy)) {
            try { if (global.SNGlobe) SNGlobe.consumeClick = true; } catch (_) {}
            openPlanetSheet();
            return true;
          }
          return false;
        });
      }
    } catch (_) {}
    try {
      var canvas = null;
      if (global.SNGlobe && SNGlobe.getRenderer) {
        var r = SNGlobe.getRenderer();
        canvas = r && r.domElement;
      }
      if (!canvas) canvas = document.querySelector('#globe canvas');
      if (!canvas || canvas.__orbitPtr) return;
      canvas.__orbitPtr = true;
      canvas.addEventListener(
        'pointerdown',
        function (e) {
          if (hitPlanet(e.clientX, e.clientY)) {
            try { if (global.SNGlobe) SNGlobe.consumeClick = true; } catch (_) {}
          }
        },
        true
      );
      canvas.addEventListener(
        'pointerup',
        function (e) {
          if (!hitPlanet(e.clientX, e.clientY)) return;
          try { if (global.SNGlobe) SNGlobe.consumeClick = true; } catch (_) {}
          openPlanetSheet();
        },
        true
      );
    } catch (_) {}
  }

  function silentPaintWhenReady() {
    if (S.planetVisible && orbitGroup) return;
    paintPlanet();
  }

  function init() {
    if (S.ready) return;
    loadCreds();
    loadRemembered();
    destroyKeySheet();
    installCli();
    bindPlanetClick();
    bindLoginReturn();
    S.planetVisible = true;
    S.ready = true;
  }

  global.SNAgentOrbit = global.SNAgents = global.AstranovOrbit = {
    BUILD: BUILD, init: init, goOrbit: goOrbit, list: listAgents, setKey: setKey,
    clearKey: clearKey, collab: collab, ask: singleAgent, handleLine: handleLine,
    hasKey: hasKey, clearPlanet: clearPlanet, showKeySheet: showKeySheet,
    openPlanetSheet: openPlanetSheet, hidePlanetSheet: hidePlanetSheet,
    paintAuth: paintAuth, inspect: inspectCouncil, publish: publishVerdict,
    check: checkProvider, checkAll: checkAll, lastCheck: function (id) { return S.checks[normalizeId(id)]; },
    lastVerdict: function () { return S.lastVerdict; },
    providers: PROVIDERS, planet: PLANET
  };

  function boot() {
    init();
    paintPlanet();
    [400, 1400, 3200, 6000, 10000].forEach(function (ms) {
      setTimeout(function () {
        installCli();
        bindPlanetClick();
        destroyKeySheet();
        silentPaintWhenReady();
      }, ms);
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 80);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 80); });
  window.addEventListener('load', function () { setTimeout(boot, 400); });
})(typeof window !== 'undefined' ? window : globalThis);
