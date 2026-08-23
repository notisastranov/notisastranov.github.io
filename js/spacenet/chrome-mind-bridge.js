/**
 * SNMindBridge — chat-first · direct form capture · backend-wired
 * Build: 20260812045000-chat-direct
 */
(function (global) {
  'use strict';
  var BUILD = '20260812045000-chat-direct';
  if (global.__SN_MIND_BRIDGE === BUILD) return;
  global.__SN_MIND_BRIDGE = BUILD;

  var CFG_KEY = 'sn:mind-bridge-cfg-v1';
  var USAGE_KEY = 'sn:mind-usage-v1';
  var HISTORY_KEY = 'sn:mind-history-v1';
  var COOLDOWN_KEY = 'sn:mind-cooldown-v1';

  var RESERVED =
    /^(locate|gps|power(\s+on|\s+off)?|call|video|hang(\s*up)?|polygon|poly|global|city|map|shops|layers|send|market|offer|offers|install|login|user|cancel|clear|drive|pilot|youtube|yt|radar|routes?|simulate|accept|decline|mute|cam|button|ribbon)\b/i;

  function defaultBridgeUrl() {
    try {
      var base =
        (global.SN_CONFIG && SN_CONFIG.sbUrl) ||
        global.SB_URL ||
        'https://lkoatrkhuigdolnjsbie.supabase.co';
      return String(base).replace(/\/$/, '') + '/functions/v1/ai-router';
    } catch (_) {
      return 'https://lkoatrkhuigdolnjsbie.supabase.co/functions/v1/ai-router';
    }
  }
  function anonKey() {
    try {
      return (global.SN_CONFIG && SN_CONFIG.sbKey) || global.SB_KEY || '';
    } catch (_) {
      return '';
    }
  }
  function userAccessToken() {
    try {
      if (global.SNAuth && SNAuth.session && SNAuth.session.access_token)
        return SNAuth.session.access_token;
      var raw =
        localStorage.getItem('astranov_auth_v3') ||
        localStorage.getItem('sb-lkoatrkhuigdolnjsbie-auth-token');
      if (raw) {
        var j = JSON.parse(raw);
        if (j && j.access_token) return j.access_token;
        if (j && j.currentSession && j.currentSession.access_token)
          return j.currentSession.access_token;
      }
    } catch (_) {}
    return '';
  }

  var S = {
    ready: false,
    listening: true,
    history: [],
    cfg: { bridgeUrl: '', dailyFreeTurns: 48, verifiedDailyTurns: 200, ownerDailyTurns: 2000, minGapMs: 600 },
    usage: { day: '', turns: 0 },
    lastCallAt: 0,
  };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 280), c || 'ok');
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 90));
    } catch (_) {}
  }
  function expandCli() {
    try {
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.remove('collapsed', 'cli-quiet');
        panel.classList.add('mid');
      }
    } catch (_) {}
  }

  function load() {
    try {
      var c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      S.cfg = Object.assign(S.cfg, c || {});
    } catch (_) {}
    if (!S.cfg.bridgeUrl) S.cfg.bridgeUrl = defaultBridgeUrl();
    try {
      var u = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
      S.usage = Object.assign(S.usage, u || {});
    } catch (_) {}
    try {
      var h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(h)) S.history = h.slice(-48);
    } catch (_) {}
    try {
      S.lastCallAt = Number(localStorage.getItem(COOLDOWN_KEY) || 0) || 0;
    } catch (_) {}
    var day = new Date().toISOString().slice(0, 10);
    if (S.usage.day !== day) {
      S.usage = { day: day, turns: 0 };
      saveUsage();
    }
  }
  function saveUsage() {
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(S.usage));
    } catch (_) {}
  }
  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(S.history.slice(-48)));
    } catch (_) {}
  }
  function isOwner() {
    try {
      if (global.SNAuth && SNAuth.isOwner && SNAuth.isOwner()) return true;
    } catch (_) {}
    return false;
  }
  function turnLimit() {
    return isOwner() ? 2000 : S.cfg.dailyFreeTurns || 48;
  }
  function canTakeTurn() {
    if (S.usage.turns >= turnLimit() && !isOwner()) return false;
    if (Date.now() - S.lastCallAt < (S.cfg.minGapMs || 600)) return false;
    return true;
  }
  function noteTurn() {
    S.usage.turns = (S.usage.turns || 0) + 1;
    S.lastCallAt = Date.now();
    saveUsage();
    try {
      localStorage.setItem(COOLDOWN_KEY, String(S.lastCallAt));
    } catch (_) {}
  }
  function pushHist(role, text) {
    S.history.push({ role: role, text: String(text).slice(0, 900), t: Date.now() });
    if (S.history.length > 48) S.history = S.history.slice(-48);
    saveHistory();
  }

  async function localAnswer(msg) {
    var low = msg.toLowerCase();
    if (/^(hi|hello|hey|γεια|ela)\b/.test(low))
      return 'I am here inside SpaceNet. Listening.';
    if (/who are you|what are you/.test(low))
      return 'Astranov mind · trained living OS, not a static app. I learn from live envelopes and what you teach.';
    return 'Heard you. “' + String(msg).slice(0, 120) + '” · try once more if backend was slow.';
  }

  async function bridgeAnswer(msg) {
    var url = (S.cfg.bridgeUrl || defaultBridgeUrl()).trim();
    var key = anonKey();
    var tok = userAccessToken() || key;
    if (!key) return null;
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          apikey: key,
          Authorization: 'Bearer ' + tok,
        },
        body: JSON.stringify({
          text: msg,
          message: msg,
          preferred_provider: 'astranov',
          level: 'personal',
          source: 'sn-mind-bridge',
          build: BUILD,
          lessons: (global.SNMindTrain && SNMindTrain.lessons && SNMindTrain.lessons()) || [],
          system: (global.SNMindTrain && SNMindTrain.context && SNMindTrain.context()) || ''
        }),
        mode: 'cors',
      });
      if (res.status === 429) return 'Slow down — pool protected.';
      if (!res.ok) return null;
      var j = await res.json();
      if (j && (j.text || j.reply || j.message)) return String(j.text || j.reply || j.message);
    } catch (e) {
      console.warn('[mind]', e);
    }
    return null;
  }

  async function talk(msg, opts) {
    opts = opts || {};
    msg = String(msg || '').trim();
    if (!msg) return null;
    if (!canTakeTurn()) {
      if (S.usage.turns >= turnLimit() && !isOwner()) {
        var lim = 'Daily turns used.';
        if (!opts.silent) log(lim, 'dim');
        return lim;
      }
      await new Promise(function (r) {
        setTimeout(r, 400);
      });
    }
    pushHist('user', msg);
    noteTurn();
    if (!opts.silent) {
      expandCli();
      preview('…');
      log('…', 'dim');
    }
    var answer = await bridgeAnswer(msg);
    if (!answer) answer = await localAnswer(msg);
    pushHist('assistant', answer);
    if (!opts.silent) {
      log(String(answer).slice(0, 420), 'ok');
      preview(String(answer).slice(0, 80));
    }
    try {
      if (global.SNChromeHelper && SNChromeHelper.speak && opts.speak !== false)
        SNChromeHelper.speak(String(answer).slice(0, 160), { ms: 8000, voice: false });
    } catch (_) {}
    return answer;
  }

  function looksConversational(line, low) {
    if (!line || line.length < 2) return false;
    if (RESERVED.test(low)) return false;
    if (/^(mind|teach|train|interest|law|export|collective|ambient|forget)\b/i.test(low))
      return false;
    if (/^(find places|search places|search near|map near)\b/i.test(low)) return false;
    return true;
  }

  function handleLine(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    if (!low) return false;
    if (low === 'mind' || low === 'mind status') {
      log('Mind · on · turns ' + S.usage.turns + '/' + turnLimit(), 'ok');
      return true;
    }
    if (S.listening && looksConversational(line, low)) {
      void talk(line);
      return true;
    }
    return false;
  }

  function installCli() {
    if (!global.SNCli || typeof SNCli.run !== 'function') return;
    if (SNCli._snMindOuter === handleLine) return;
    var prev = SNCli.run.bind(SNCli);
    SNCli.run = function (raw) {
      try {
        if (handleLine(raw)) return Promise.resolve(true);
      } catch (_) {}
      return prev(raw);
    };
    SNCli._snMindOuter = handleLine;
  }

  function bindFormDirect() {
    try {
      var form = document.getElementById('cli-form') || document.querySelector('#panel form');
      var input = document.getElementById('cli-in');
      if (!input || input._snMindDirect) return;
      input._snMindDirect = true;
      function capture(ev) {
        var v = String(input.value || '').trim();
        var low = v.toLowerCase();
        if (!v || !looksConversational(v, low)) return false;
        try {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        } catch (_) {}
        input.value = '';
        void talk(v);
        return true;
      }
      if (form) {
        form.addEventListener(
          'submit',
          function (ev) {
            capture(ev);
          },
          true
        );
      }
      input.addEventListener(
        'keydown',
        function (ev) {
          if (ev.key === 'Enter') capture(ev);
        },
        true
      );
    } catch (_) {}
  }

  function wireSilver() {
    try {
      if (!global.SNChromeHelper) return;
      SNChromeHelper.ask = async function (message) {
        return await talk(message, { speak: true });
      };
      var prevAct = SNChromeHelper.activate && SNChromeHelper.activate.bind(SNChromeHelper);
      SNChromeHelper.activate = function () {
        S.listening = true;
        expandCli();
        if (prevAct) prevAct();
        void talk('Hello — I am here. Talk to me.', { speak: true });
      };
    } catch (_) {}
  }

  function init() {
    if (S.ready) {
      installCli();
      bindFormDirect();
      wireSilver();
      return;
    }
    S.ready = true;
    S.listening = true;
    load();
    installCli();
    bindFormDirect();
    wireSilver();
    setTimeout(installCli, 400);
    setTimeout(bindFormDirect, 600);
    setTimeout(installCli, 1500);
    setTimeout(bindFormDirect, 1600);
    setTimeout(installCli, 5000);
    setTimeout(bindFormDirect, 5200);
    setInterval(function () {
      installCli();
      bindFormDirect();
    }, 10000);
    setTimeout(function () {
      expandCli();
      log('Mind · listening · type below', 'dim');
    }, 3500);
  }

  global.SNMindBridge = {
    build: BUILD,
    init: init,
    talk: talk,
    handleLine: handleLine,
    get listening() {
      return S.listening;
    },
  };
  global.SNPresence = global.SNMindBridge;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 50);
    });
  } else setTimeout(init, 50);
  setTimeout(init, 1200);
})(typeof window !== 'undefined' ? window : globalThis);
