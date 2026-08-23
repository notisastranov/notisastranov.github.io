/**
 * Guest HOLD ⭐ / pay gate — Build 20260823230000-hold-card
 * NEW overlay on the #171 combine branch. Do not edit locked siblings:
 *   #171 pizza/laptop/research/ai-listen/call-arc/twin-cli
 *   #164 #169 #132 #127 #121 #122–#125 #128
 *
 * BOX: after a pizza or laptop hunt, tapping a shop pin prints
 *   Shop · name · km · ⭐
 * Guest HOLD ⭐ / pay → SAME guest Sign-in CARD that CALL opens
 * (Sign in with Google · Privacy · Terms · Cancel). Never a raw
 * accounts.google.com/gsi/button iframe. Cancel dismisses; clock + CLI
 * keep running. Camera stays. Pins stay.
 *
 * No fake DRIVER EN ROUTE. No me-av. No free 80 æ / Mesh Alpha.
 * Currency ⭐. Wallet stays ⭐ 0.00 until a real signed-in eur_balance.
 * Never INSERT into public.orders. No courier theatre. Do not complete a pay.
 *
 * DONE-WHEN (guest): hunt tap shop → HOLD is the CALL Sign-in card.
 */
(function (G) {
  'use strict';
  if (G.__snHoldPay20260823230000) return;
  G.__snHoldPay20260823230000 = 1;
  G.__snHoldPay20260823223000 = 1;

  var BUILD = '20260823230000-hold-card';
  var CHIP_ID = 'sn-hold-pay-chip';
  var CARD_ID = 'sn-hold-signin';
  var selected = null;
  var lastShopLine = '';
  var lastShopAt = 0;
  var fetchWrapped = false;
  var logWrapped = false;

  var FAKE_LINE =
    /DRIVER\s+EN\s+ROUTE|SEEKING\s+DRIVER|\bme-av\b|\bme_av\b|\bmeav\b|Mesh\s*(Alpha|Beta|Gamma)|free\s*80\s*[æÆ]|80\s*[æÆ]|Astranov\s*Kitchen|Rai\s*drone|Rai\s*Mesone/i;
  var PAY_RE =
    /^(pay|hold\s*⭐|hold\s*star|hold\s*stars?|checkout|confirm\s+order|buy\s+now|order\s+now)\b/i;
  var SHOP_RE = /^Shop · /;

  function now() {
    return Date.now();
  }
  function signed() {
    try {
      if (G.SNAuth && typeof SNAuth.isLoggedIn === 'function' && SNAuth.isLoggedIn()) return true;
      if (G.SNAuth && SNAuth.session && SNAuth.session.user) return true;
      if (G.SNAuth && SNAuth.user) return true;
    } catch (_) {}
    return false;
  }
  function isGuest() {
    return !signed();
  }

  function openLiveCli() {
    try {
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.add('sn-open', 'open');
        panel.classList.remove('collapsed', 'sn-quiet');
      }
    } catch (_) {}
  }

  function say(m, c) {
    var s = String(m == null ? '' : m).slice(0, 420);
    if (!s) return;
    s = s.replace(/[æÆ]/g, '⭐');
    if (FAKE_LINE.test(s)) return;
    try {
      if (G.SNCli && typeof SNCli.beginTurn === 'function' && typeof SNCli.inTurn === 'function') {
        if (!SNCli.inTurn()) SNCli.beginTurn();
      }
    } catch (_) {}
    try {
      if (G.SNCli && SNCli.log) SNCli.log(s, c || 'ok', true);
    } catch (_) {}
    try {
      var el = document.getElementById('cli-log');
      if (!el) return;
      openLiveCli();
      var last = el.lastElementChild;
      if (last && String(last.textContent || '') === s) {
        try {
          el.scrollTop = el.scrollHeight;
        } catch (__) {}
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'cli-feed-item is-latest';
      wrap.setAttribute('data-sn-hold-pay', '1');
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

  function killCourier() {
    try {
      ['sn-me-av', 'sn-meav', 'sn-you-av', 'sn-guest-me', 'sn-driver-en-route', 'sn-poly-root', 'sn-offer-stack'].forEach(
        function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          if (id === 'sn-offer-stack' || id === 'sn-poly-root') {
            el.style.setProperty('display', 'none', 'important');
            return;
          }
          try {
            el.remove();
          } catch (_) {}
        }
      );
    } catch (_) {}
    try {
      var nodes = document.querySelectorAll(
        '[data-sn-me-av], .sn-me-av, .sn-meav, .sn-you-pin, .sn-driver-en-route, .sn-courier, [data-sn-driver]'
      );
      for (var i = 0; i < nodes.length; i++) {
        try {
          nodes[i].remove();
        } catch (_) {}
      }
    } catch (_) {}
  }

  function realEurBalance() {
    if (isGuest()) return null;
    try {
      var u = G.SNAuth && SNAuth.user;
      var md = (u && u.user_metadata) || {};
      if (md.eur_balance != null && isFinite(+md.eur_balance)) return +md.eur_balance;
      if (md.balance_eur != null && isFinite(+md.balance_eur)) return +md.balance_eur;
    } catch (_) {}
    try {
      if (G.SNMoney && SNMoney.fromServer && SNMoney.eur_balance != null && isFinite(+SNMoney.eur_balance)) {
        return +SNMoney.eur_balance;
      }
    } catch (_) {}
    try {
      if (G.SNCurrency && SNCurrency.serverEur != null && isFinite(+SNCurrency.serverEur)) {
        return +SNCurrency.serverEur;
      }
    } catch (_) {}
    return null;
  }

  function paintWallet() {
    var txt = '⭐ 0.00';
    var bal = realEurBalance();
    if (bal != null && isFinite(bal)) txt = '⭐ ' + Number(bal).toFixed(2);
    try {
      var el = document.getElementById('fbh-s');
      if (el && String(el.textContent || '') !== txt) el.textContent = txt;
    } catch (_) {}
    try {
      var els = document.querySelectorAll('#field-balance-hud, [data-sn-wallet], #sn-wallet, #fbh-s');
      for (var i = 0; i < els.length; i++) {
        var n = els[i];
        var s = String(n.textContent || '');
        if (/[æÆ]|Mesh\s*Alpha|80\s*⭐\s*free/i.test(s) && n.id === 'fbh-s') n.textContent = txt;
      }
    } catch (_) {}
  }

  function injectCardCss() {
    if (document.getElementById('sn-hold-card-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-hold-card-css';
    st.textContent =
      '#' +
      CARD_ID +
      '{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,4,12,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:20px;' +
      'pointer-events:auto}' +
      '#' +
      CARD_ID +
      '[hidden]{display:none!important}' +
      '#' +
      CARD_ID +
      ' .sn-hold-card{width:min(400px,100%);max-height:min(92vh,640px);overflow:auto;' +
      'background:linear-gradient(165deg,#061018 0%,#0a1624 55%,#050c14 100%);' +
      'border:1px solid rgba(61,158,255,.35);border-radius:18px;padding:28px 24px 22px;' +
      'box-shadow:0 24px 80px rgba(0,40,80,.55),0 0 40px rgba(61,158,255,.12);' +
      'color:#e8f2ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center}' +
      '#' +
      CARD_ID +
      ' .sn-auth-mark{font-size:13px;letter-spacing:.28em;font-weight:700;color:#3d9eff;margin:0 0 6px}' +
      '#' +
      CARD_ID +
      ' h2{margin:0 0 8px;font-size:22px;font-weight:650;color:#fff;letter-spacing:.02em}' +
      '#' +
      CARD_ID +
      ' .sn-auth-copy{font-size:13px;line-height:1.45;color:#a8c4dc;margin:0 0 20px}' +
      '#' +
      CARD_ID +
      ' .sn-hold-google{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:min(280px,100%);' +
      'cursor:pointer;border:1px solid rgba(61,158,255,.55);border-radius:999px;padding:12px 18px;margin:0 0 16px;' +
      'font:700 14px/1.2 system-ui;letter-spacing:.02em;background:linear-gradient(180deg,#0a1624,#050c14);color:#e8f4ff;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.45),0 0 18px rgba(61,158,255,.25)}' +
      '#' +
      CARD_ID +
      ' .sn-hold-google:hover{border-color:#7ec8ff;color:#fff}' +
      '#' +
      CARD_ID +
      ' .sn-auth-note{font-size:11px;color:#6a8aaa;margin:0 0 14px;line-height:1.4}' +
      '#' +
      CARD_ID +
      ' .sn-auth-note a{color:#cfe8ff;text-decoration:none;border-bottom:1px solid rgba(61,158,255,.45)}' +
      '#' +
      CARD_ID +
      ' .sn-auth-close{background:transparent;border:1px solid rgba(138,180,217,.25);color:#8ab4d9;' +
      'border-radius:999px;padding:8px 18px;font-size:12px;cursor:pointer}' +
      '#' +
      CARD_ID +
      ' .sn-auth-close:hover{border-color:#3d9eff;color:#cfe8ff}';
    try {
      (document.head || document.documentElement).appendChild(st);
    } catch (_) {}
  }

  function hideAuthModal() {
    try {
      var modal = document.getElementById('sn-auth-modal');
      if (!modal) return;
      modal.hidden = true;
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('open', 'show', 'sn-open');
      modal.style.setProperty('display', 'none', 'important');
    } catch (_) {}
    try {
      var gsi = document.getElementById('sn-auth-gsi');
      if (!gsi) return;
      var iframes = gsi.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        try {
          iframes[i].remove();
        } catch (_) {}
      }
      gsi.innerHTML = '';
    } catch (_) {}
  }

  function dropWall() {
    G.__snHoldPayWall = false;
    try {
      document.documentElement.classList.remove('sn-hold-pay-wall');
    } catch (_) {}
    try {
      var el = document.getElementById(CARD_ID);
      if (el) {
        el.hidden = true;
        el.setAttribute('hidden', '');
        el.setAttribute('aria-hidden', 'true');
        el.style.setProperty('display', 'none', 'important');
      }
    } catch (_) {}
    hideAuthModal();
  }

  function nativeGoogleSignIn() {
    try {
      if (G.SNAuth && typeof SNAuth.ensureClient === 'function') {
        void Promise.resolve(SNAuth.ensureClient())
          .then(function (c) {
            if (!c || !c.auth || typeof c.auth.signInWithOAuth !== 'function') return null;
            return c.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: String(location.origin || '').replace(/\/$/, '') + '/',
                queryParams: { access_type: 'offline', prompt: 'select_account' },
              },
            });
          })
          .catch(function () {});
        return;
      }
    } catch (_) {}
  }

  function openHoldCard() {
    killCourier();
    hideAuthModal();
    injectCardCss();
    G.__snHoldPayWall = true;
    hideChip();
    try {
      document.documentElement.classList.add('sn-hold-pay-wall');
    } catch (_) {}

    var root = document.getElementById(CARD_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = CARD_ID;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Sign in to ASTRANOV');
      root.setAttribute('data-sn-build', BUILD);
      root.innerHTML =
        '<div class="sn-hold-card" id="sn-hold-card">' +
        '<div class="sn-auth-mark">ASTRANOV</div>' +
        '<h2>Sign in</h2>' +
        '<p class="sn-auth-copy">Sign in with Google to call, order, and keep your place on Earth.</p>' +
        '<button type="button" class="sn-hold-google" id="sn-hold-google" aria-label="Sign in with Google">' +
        'Sign in with Google</button>' +
        '<p class="sn-auth-note"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>' +
        '<div><button type="button" class="sn-auth-close" id="sn-hold-cancel">Cancel</button></div>' +
        '</div>';
      try {
        (document.body || document.documentElement).appendChild(root);
      } catch (_) {}
      root.addEventListener(
        'click',
        function (ev) {
          if (ev.target === root) dropWall();
        },
        true
      );
      var cancel = root.querySelector('#sn-hold-cancel');
      if (cancel) {
        cancel.addEventListener(
          'click',
          function (ev) {
            try {
              ev.preventDefault();
              ev.stopPropagation();
            } catch (_) {}
            dropWall();
            if (selected && isGuest()) showChip(selected);
          },
          true
        );
      }
      var googleBtn = root.querySelector('#sn-hold-google');
      if (googleBtn) {
        googleBtn.addEventListener(
          'click',
          function (ev) {
            try {
              ev.preventDefault();
              ev.stopPropagation();
            } catch (_) {}
            nativeGoogleSignIn();
          },
          true
        );
      }
      if (!document.documentElement._snHoldCardEsc) {
        document.documentElement._snHoldCardEsc = 1;
        document.addEventListener(
          'keydown',
          function (ev) {
            if (ev.key === 'Escape' && G.__snHoldPayWall) {
              dropWall();
              if (selected && isGuest()) showChip(selected);
            }
          },
          true
        );
      }
    }
    root.hidden = false;
    root.removeAttribute('hidden');
    root.setAttribute('aria-hidden', 'false');
    root.style.setProperty('display', 'flex', 'important');
    root.style.setProperty('visibility', 'visible', 'important');
    root.style.setProperty('opacity', '1', 'important');
    root.style.setProperty('pointer-events', 'auto', 'important');
    try {
      if (document.body && root.parentNode !== document.body) document.body.appendChild(root);
    } catch (_) {}
    return root;
  }

  function reuseCallSignInWall() {
    try {
      if (G.SNCallArc && typeof SNCallArc.openSignIn === 'function') {
        SNCallArc.openSignIn();
        return true;
      }
    } catch (_) {}
    try {
      if (G.SNCallArc && typeof SNCallArc.signInCard === 'function') {
        SNCallArc.signInCard();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function promptSignInCard() {
    killCourier();
    if (reuseCallSignInWall()) return;
    openHoldCard();
  }

  function hideChip() {
    try {
      var el = document.getElementById(CHIP_ID);
      if (el) el.style.setProperty('display', 'none', 'important');
    } catch (_) {}
  }

  function showChip(shop) {
    var el = document.getElementById(CHIP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = CHIP_ID;
      el.setAttribute('data-sn-build', BUILD);
      el.innerHTML =
        '<button type="button" data-sn-hold-pay="1" aria-label="HOLD ⭐ / pay">' +
        'HOLD ⭐ / pay</button>';
      try {
        (document.body || document.documentElement).appendChild(el);
      } catch (_) {}
      el.addEventListener(
        'click',
        function (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          } catch (_) {}
          onHoldPay('HOLD ⭐');
        },
        true
      );
    }
    el.style.cssText =
      'position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));' +
      'transform:translateX(-50%);z-index:12050;display:flex;gap:8px;align-items:center;' +
      'padding:0;border:0;background:transparent;pointer-events:auto;';
    var btn = el.querySelector('button');
    if (btn) {
      btn.style.cssText =
        'cursor:pointer;border:1px solid rgba(61,158,255,.55);border-radius:999px;' +
        'padding:10px 16px;font:700 13px system-ui;letter-spacing:.04em;' +
        'background:linear-gradient(180deg,#0a1624,#050c14);color:#e8f4ff;' +
        'box-shadow:0 8px 28px rgba(0,0,0,.45),0 0 18px rgba(61,158,255,.25);';
      var name = shop && shop.name ? String(shop.name).slice(0, 22) : '';
      btn.textContent = name ? 'HOLD ⭐ / pay · ' + name : 'HOLD ⭐ / pay';
    }
    el.style.setProperty('display', 'flex', 'important');
  }

  function patchOpenModal() {
    try {
      if (!G.SNAuth || typeof SNAuth.openModal !== 'function') return;
      if (SNAuth.__snHoldPayOpen === BUILD) return;
      var prev = SNAuth.openModal.bind(SNAuth);
      SNAuth.openModal = function (msg) {
        var m = String(msg == null ? '' : msg);
        var wantCard =
          G.__snHoldPayWall ||
          /pay|HOLD\s*⭐|hold\s*star|checkout|wallet|balance/i.test(m);
        if (wantCard && isGuest()) {
          promptSignInCard();
          return document.getElementById(CARD_ID);
        }
        return prev.apply(this, arguments);
      };
      SNAuth.__snHoldPayOpen = BUILD;
    } catch (_) {}
  }

  function onHoldPay(raw) {
    killCourier();
    openLiveCli();
    if (isGuest()) {
      say('HOLD ⭐ · Sign in with Google to pay', 'ok');
      say('Privacy · Terms', 'dim');
      promptSignInCard();
      return true;
    }
    say('HOLD ⭐ · wallet waits for eur_balance', 'dim');
    paintWallet();
    return true;
  }

  function rememberShop(hit) {
    if (!hit) return;
    selected = {
      name: String(hit.name || 'shop').slice(0, 36),
      km: hit.km,
      lat: hit.lat,
      lng: hit.lng,
      id: hit.id,
    };
    lastShopAt = now();
    if (!G.__snHoldPayWall) showChip(selected);
  }

  function parseShopFromLine(s) {
    s = String(s || '');
    if (!SHOP_RE.test(s)) return null;
    var name = s.replace(/^Shop · /, '').replace(/ · .*$/, '').trim();
    return { name: name || 'shop' };
  }

  function noteShopLine(s) {
    s = String(s || '');
    if (!SHOP_RE.test(s)) return;
    if (s === lastShopLine && now() - lastShopAt < 400) return;
    lastShopLine = s;
    lastShopAt = now();
    rememberShop(parseShopFromLine(s));
  }

  function isPayHold(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    return PAY_RE.test(s);
  }

  function wrapLog() {
    try {
      if (!G.SNCli || typeof SNCli.log !== 'function') return;
      if (logWrapped && SNCli.__snHoldPayLog === BUILD) return;
      var prev = SNCli.log.bind(SNCli);
      SNCli.log = function (m, c, force) {
        var s = String(m == null ? '' : m);
        if (FAKE_LINE.test(s)) return;
        s = s.replace(/[æÆ]/g, '⭐');
        if (SHOP_RE.test(s)) noteShopLine(s);
        return prev(s, c, force);
      };
      SNCli.__snHoldPayLog = BUILD;
      logWrapped = true;
    } catch (_) {}
  }

  function wrapFetch() {
    if (fetchWrapped) return;
    try {
      if (typeof G.fetch !== 'function') return;
      var prev = G.fetch.bind(G);
      G.fetch = function (url, opts) {
        try {
          var u = String(url && url.url ? url.url : url || '');
          var method = String((opts && opts.method) || (url && url.method) || 'GET').toUpperCase();
          var isOrders =
            /\/rest\/v1\/orders\b/i.test(u) ||
            /\/public\.orders\b/i.test(u) ||
            (/\/orders\b/i.test(u) && /supabase|astranov/i.test(u));
          if (isGuest() && isOrders && /POST|PUT|PATCH|DELETE/i.test(method)) {
            promptSignInCard();
            return Promise.resolve(
              new Response(JSON.stringify({ error: 'sign_in_required', hold: true }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          }
        } catch (_) {}
        return prev(url, opts);
      };
      fetchWrapped = true;
    } catch (_) {}
  }

  function wrapOrders() {
    try {
      if (G.SNProfiles && typeof SNProfiles.placeOrder === 'function' && !SNProfiles.__snHoldPay) {
        var po = SNProfiles.placeOrder.bind(SNProfiles);
        SNProfiles.placeOrder = function (opts) {
          if (isGuest()) {
            onHoldPay('HOLD ⭐');
            return { ok: false, error: 'guest_hold_pay', needAuth: true };
          }
          return po(opts);
        };
        SNProfiles.__snHoldPay = 1;
      }
    } catch (_) {}
    try {
      if (G.SNMarket && typeof SNMarket.placeOrder === 'function' && !SNMarket.__snHoldPayOrder) {
        var mo = SNMarket.placeOrder.bind(SNMarket);
        SNMarket.placeOrder = function () {
          if (isGuest()) {
            onHoldPay('HOLD ⭐');
            return Promise.resolve({ ok: false, error: 'guest_hold_pay', needAuth: true });
          }
          return mo.apply(this, arguments);
        };
        SNMarket.__snHoldPayOrder = 1;
      }
    } catch (_) {}
    try {
      if (G.SNOfferStack && !SNOfferStack.__snHoldPay) {
        SNOfferStack.__snHoldPay = 1;
        ['testThrow', 'demoDelivery', 'simulate'].forEach(function (name) {
          try {
            if (typeof SNOfferStack[name] !== 'function') return;
            SNOfferStack[name] = function () {
              killCourier();
              return null;
            };
          } catch (_) {}
        });
      }
    } catch (_) {}
  }

  function patchCliRun() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli.__snHoldPayRun === BUILD) return;
      var prev = SNCli.run.bind(SNCli);
      SNCli.run = function (raw) {
        try {
          var s = String(raw || '').trim();
          if (isPayHold(s)) {
            onHoldPay(s);
            return Promise.resolve(true);
          }
        } catch (_) {}
        return prev(raw);
      };
      SNCli.__snHoldPayRun = BUILD;
    } catch (_) {}
  }

  function bindInputs() {
    function capture(ev, el) {
      var v = String((el && el.value) || '').trim();
      if (!v || !isPayHold(v)) return false;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      if (el) el.value = '';
      onHoldPay(v);
      return true;
    }
    try {
      var form = document.getElementById('cli-form');
      var input = document.getElementById('cli-in');
      if (form && input && !input._snHoldPay) {
        input._snHoldPay = 1;
        form.addEventListener(
          'submit',
          function (ev) {
            capture(ev, input);
          },
          true
        );
        input.addEventListener(
          'keydown',
          function (ev) {
            if (ev.key === 'Enter') capture(ev, input);
          },
          true
        );
      }
      var topIn = document.getElementById('stc-cmd-in');
      if (topIn && !topIn._snHoldPay) {
        topIn._snHoldPay = 1;
        topIn.addEventListener(
          'keydown',
          function (ev) {
            if (ev.key === 'Enter') capture(ev, topIn);
          },
          true
        );
      }
    } catch (_) {}
  }

  function onPinTap(ev) {
    try {
      var t = ev && ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('[data-sn-pin], [data-sn-pizza-pin], [data-sn-laptop-pin]');
      if (!btn) return;
      var idx = +(
        btn.getAttribute('data-sn-pin') ||
        btn.getAttribute('data-sn-pizza-pin') ||
        btn.getAttribute('data-sn-laptop-pin')
      );
      var pin = null;
      try {
        if (G.SNChromeGuestPizzaHunt && typeof SNChromeGuestPizzaHunt.lastPins === 'function') {
          var pp = SNChromeGuestPizzaHunt.lastPins();
          if (pp && isFinite(idx) && pp[idx]) pin = pp[idx];
        }
      } catch (_) {}
      try {
        if (!pin && G.SNChromeGuestLaptopHunt && typeof SNChromeGuestLaptopHunt.lastPins === 'function') {
          var lp = SNChromeGuestLaptopHunt.lastPins();
          if (lp && isFinite(idx) && lp[idx]) pin = lp[idx];
        }
      } catch (_) {}
      if (!pin) pin = { name: (btn.title || btn.getAttribute('aria-label') || 'shop').slice(0, 36) };
      setTimeout(function () {
        rememberShop(pin);
      }, 40);
    } catch (_) {}
  }

  function bindPins() {
    try {
      if (document.documentElement && document.documentElement._snHoldPayPins) return;
      if (document.documentElement) document.documentElement._snHoldPayPins = 1;
      document.addEventListener('pointerup', onPinTap, true);
      document.addEventListener('click', onPinTap, true);
    } catch (_) {}
  }

  function watchCliLog() {
    try {
      var el = document.getElementById('cli-log');
      if (!el || el._snHoldPayMo) return;
      el._snHoldPayMo = 1;
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var nodes = muts[i].addedNodes || [];
          for (var j = 0; j < nodes.length; j++) {
            var n = nodes[j];
            var t = '';
            try {
              t = String((n && n.textContent) || '');
            } catch (_) {}
            if (SHOP_RE.test(t.trim())) noteShopLine(t.trim().split('\n')[0]);
          }
        }
      });
      mo.observe(el, { childList: true, subtree: true });
    } catch (_) {}
  }

  function tick() {
    patchOpenModal();
    patchCliRun();
    bindInputs();
    bindPins();
    wrapLog();
    wrapFetch();
    wrapOrders();
    watchCliLog();
    paintWallet();
    killCourier();
    if (signed() && G.__snHoldPayWall) {
      dropWall();
      hideChip();
    }
    if (selected && now() - lastShopAt < 180000 && isGuest() && !G.__snHoldPayWall) showChip(selected);
  }

  function init() {
    injectCardCss();
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 200);
    setTimeout(tick, 600);
    setTimeout(tick, 1400);
    setTimeout(tick, 2800);
    setInterval(tick, 2500);
  }

  G.SNHoldPay = {
    build: BUILD,
    hold: onHoldPay,
    promptGis: promptSignInCard,
    openCard: openHoldCard,
    closeCard: dropWall,
    selected: function () {
      return selected;
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
