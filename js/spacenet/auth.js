/* Astranov auth — Google GIS only · brand face astranov.eu · never supabase host */
(function (global) {
  'use strict';

  const A = {
    client: null,
    user: null,
    session: null,
    ready: false,
    _gsiReady: null,
    _gsiInit: false,
    _bound: false,
    _modal: null,
    _customAuthOk: null,
  };

  /**
   * Default Web OAuth client. Override in SN_CONFIG.googleClientId if you create a new client.
   * Google Cloud → this EXACT client → Authorized JavaScript origins must list the page origin.
   */
  const DEFAULT_GOOGLE_CLIENT_ID =
    '73846897360-va7gcqngfc370gfp7rl059no0vd4ts11.apps.googleusercontent.com';

  function cfg() {
    return global.SN_CONFIG || {};
  }

  function googleClientId() {
    const c = cfg();
    return (
      c.googleClientId ||
      c.googleClientID ||
      (c.layers && (c.layers.googleClientId || c.layers.googleOAuthClientId)) ||
      global.ASTRANOV_GOOGLE_CLIENT_ID ||
      DEFAULT_GOOGLE_CLIENT_ID
    );
  }

  function pageOrigin() {
    try {
      return (location.origin || 'https://astranov.eu').replace(/\/$/, '');
    } catch (_) {
      return 'https://astranov.eu';
    }
  }

  function brand() {
    const b = cfg().brand || {};
    return {
      name: b.name || 'ASTRANOV',
      domain: b.domain || 'astranov.eu',
      site: (b.site || cfg().live || 'https://astranov.eu').replace(/\/$/, ''),
      authHost: (b.authHost || cfg().authHost || 'https://api.astranov.eu').replace(/\/$/, ''),
    };
  }

  /** Never show supabase project ref to humans */
  function scrub(text) {
    return String(text || '')
      .replace(/https?:\/\/[a-z0-9-]+\.supabase\.co[^\s"'<>]*/gi, 'astranov.eu')
      .replace(/[a-z0-9]{12,}\.supabase\.co/gi, 'astranov.eu')
      .replace(/\blkoatrkhuigdolnjsbie\b/gi, 'astranov')
      .replace(/\bsupabase\b/gi, 'Astranov')
      .replace(/\bgotrue\b/gi, 'Astranov')
      .replace(/\binvalid_client\b/gi, 'Google client not allowed for this site')
      .replace(/\bno registered origin\b/gi, 'this site origin is missing on the Google OAuth client')
      .replace(/\bredirect_uri_mismatch\b/gi, 'sign-in redirect not allowed');
  }

  function say(msg, cls) {
    try {
      if (global.SNCli) {
        if (SNCli.beginTurn && !SNCli.inTurn?.()) {
          SNCli.beginTurn();
          try {
            SNCli.log(scrub(msg), cls || 'ok');
          } finally {
            SNCli.endTurn();
          }
        } else if (SNCli.log) {
          SNCli.log(scrub(msg), cls || 'ok', true);
        }
      }
    } catch (_) {}
  }

  function authBaseUrl() {
    const b = brand();
    const direct = String(cfg().sbUrl || global.SB_URL || '').replace(/\/$/, '');
    if (cfg().preferCustomAuth === true && b.authHost) return b.authHost;
    if (A._customAuthOk === true && b.authHost) return b.authHost;
    return direct;
  }

  async function probeCustomAuth() {
    if (A._customAuthOk != null) return A._customAuthOk;
    const host = brand().authHost;
    if (!host || /supabase\.co/i.test(host)) {
      A._customAuthOk = false;
      return false;
    }
    try {
      const key = cfg().sbKey || global.SB_KEY || '';
      const r = await fetch(host + '/auth/v1/health', {
        method: 'GET',
        headers: key ? { apikey: key } : {},
        cache: 'no-store',
      });
      A._customAuthOk = r.ok || r.status === 200;
      if (A._customAuthOk) {
        try {
          if (cfg()) cfg().preferCustomAuth = true;
        } catch (_) {}
      }
    } catch (_) {
      A._customAuthOk = false;
    }
    return A._customAuthOk;
  }

  async function ensureClient() {
    if (A.client) return A.client;
    if (typeof supabase === 'undefined') throw new Error('Auth loading · wait a moment');
    await probeCustomAuth();
    const url = authBaseUrl();
    const key = cfg().sbKey || global.SB_KEY;
    A.client = supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'astranov_auth_v3',
      },
    });
    A.client.auth.onAuthStateChange((evt, session) => {
      A.session = session || null;
      A.user = session?.user || null;
      paint();
      try {
        if (A.user && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION' || evt === 'USER_UPDATED')) {
          if (!global.__snPaidMindArmed) armOwnerPaidGrok();
          greetArrival(A.user, evt);
          try {
            if (global.SNPulse && SNPulse.onLogin) SNPulse.onLogin();
          } catch (_) {}
        } else if (!A.user && evt === 'SIGNED_OUT') {
          try {
            localStorage.removeItem('sn:owner-session');
          } catch (_) {}
          global.__snPaidMindArmed = 0;
          global.__snPaidMindSaid = 0;
        }
      } catch (_) {}
    });
    const { data } = await A.client.auth.getSession();
    A.session = data?.session || null;
    A.user = data?.session?.user || null;
    A.ready = true;
    paint();
    return A.client;
  }

  function avatarUrl() {
    const u = A.user;
    if (!u) return '';
    const md = u.user_metadata || {};
    if (md.avatar_url) return md.avatar_url;
    if (md.picture) return md.picture;
    if (md.avatar) return md.avatar;
    try {
      const id0 = u.identities && u.identities[0] && u.identities[0].identity_data;
      if (id0 && (id0.avatar_url || id0.picture)) return id0.avatar_url || id0.picture;
    } catch (_) {}
    return '';
  }

  function paint() {
    const btn = document.getElementById('btn-login');
    const chip = document.getElementById('user-chip');
    const name =
      A.user?.user_metadata?.full_name || A.user?.email?.split?.('@')?.[0] || null;
    if (btn) {
      btn.textContent = A.user ? '✓' : '🔐';
      btn.title = A.user
        ? 'Signed in as ' + (name || 'user') + ' · astranov.eu'
        : 'Sign in · ASTRANOV · astranov.eu';
      btn.classList.toggle('in', !!A.user);
    }
    if (chip) {
      chip.textContent = name ? name.slice(0, 18) : '';
      chip.hidden = !name;
    }
    try {
      global.SNCli?.preview?.(
        A.user
          ? 'Signed in · ' + (name || 'user') + ' · astranov.eu'
          : 'Guest · tap User to sign in to astranov.eu'
      );
    } catch (_) {}
    try {
      if (global.SNHome && SNHome.openState && SNHome.paint) SNHome.paint();
    } catch (_) {}
    try {
      if (global.SNField && SNField.paintRibbon) SNField.paintRibbon();
    } catch (_) {}
  }

  function loadGsi() {
    if (global.google && global.google.accounts && global.google.accounts.id) {
      return Promise.resolve();
    }
    if (A._gsiReady) return A._gsiReady;
    A._gsiReady = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Google sign-in blocked · check network / adblock'));
      };
      document.head.appendChild(s);
    });
    return A._gsiReady;
  }

  /** Owner-facing checklist for Google Cloud (this exact client + this exact origin) */
  function originHelp() {
    const origin = pageOrigin();
    const cid = googleClientId();
    const short = cid.replace('.apps.googleusercontent.com', '');
    return (
      'Google blocked this site origin. ONLY fix is Google Cloud (not our code): ' +
      'Credentials → OAuth client …' +
      short.slice(-12) +
      ' → Web application → Authorized JavaScript origins ADD exactly ' +
      origin +
      ' and https://www.astranov.eu → Save → wait 5 min → Ctrl+F5. ' +
      'Same Client ID + Secret in Supabase → Authentication → Providers → Google. ' +
      'Client: ' +
      cid
    );
  }

  function setupLines() {
    const origin = pageOrigin();
    const cid = googleClientId();
    return [
      '══════════════════════════════════════',
      'GOOGLE LOGIN BLOCKED — 5 MINUTE FIX',
      'Code already uses ASTRANOV face on astranov.eu only.',
      'Google Cloud must ALLOW this origin on the OAuth client.',
      '══════════════════════════════════════',
      'A) Google Cloud Console (REQUIRED)',
      '1) Open this exact client:',
      '   https://console.cloud.google.com/apis/credentials/oauthclient/' + cid,
      '2) Application type: Web application',
      '3) Authorized JavaScript origins — ADD exactly (no path, no slash at end):',
      '   · ' + origin,
      '   · https://astranov.eu',
      '   · https://www.astranov.eu',
      '4) Authorized redirect URIs (keep for Supabase):',
      '   · https://lkoatrkhuigdolnjsbie.supabase.co/auth/v1/callback',
      '   · https://api.astranov.eu/auth/v1/callback',
      '5) SAVE. Wait 2–10 minutes (Google cache is slow).',
      '',
      'B) OAuth consent screen',
      '1) https://console.cloud.google.com/apis/credentials/consent',
      '2) App name: ASTRANOV',
      '3) User support email: yours',
      '4) Authorized domains: astranov.eu',
      '5) App homepage: https://astranov.eu',
      '6) Privacy: https://astranov.eu/privacy.html',
      '7) Publishing status: In production (or add your Gmail as Test user)',
      '',
      'C) Supabase (same Google client)',
      '1) https://supabase.com/dashboard/project/lkoatrkhuigdolnjsbie/auth/providers',
      '2) Google ON · Client ID = same · Client Secret = from Google client',
      '3) (Optional later) Custom domain api.astranov.eu — currently Cloudflare 403',
      '',
      'D) Test',
      '1) Hard refresh https://astranov.eu (Ctrl+F5)',
      '2) Tap User → Sign in with Google',
      'You must see ASTRANOV / astranov.eu — never a supabase project name.',
      '',
      'If you made a NEW OAuth client, put its full *.apps.googleusercontent.com id in',
      'js/spacenet/config.js → googleClientId and push main.',
    ];
  }

  var ARCHITECT_EMAIL = 'notisastranov@gmail.com';

  function isOwner() {
    try {
      var em = (A.user && A.user.email ? String(A.user.email) : '').toLowerCase();
      if (em === ARCHITECT_EMAIL) return true;
      if (A.user && A.user.user_metadata && A.user.user_metadata.is_owner === true) return true;
    } catch (_) {}
    return false;
  }

  function greetArrival(user, evt) {
    try {
      if (!user) return;
      if (evt !== 'SIGNED_IN' && evt !== 'INITIAL_SESSION') return;
      var id = String(user.id || user.email || '').slice(0, 80);
      if (!id) return;
      var key = 'sn:hello-' + id;
      try {
        if (sessionStorage.getItem(key) === '1') return;
        sessionStorage.setItem(key, '1');
      } catch (_) {}
      var name =
        (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
        (user.email && user.email.split('@')[0]) ||
        'friend';
      name = String(name).split(' ')[0];
      if (isOwner()) {
        say('Hello ' + name + '. Architect is on deck.', 'ok');
        return;
      }
      say('Hello ' + name + '. Welcome to SpaceNet — tester and trainer.', 'ok');
      say('Break it. Improve it. Type in the CLI. Paid in ⭐ Astra.', 'dim');
    } catch (_) {}
  }

  /** When Architect signs in → arm paid Grok (server XAI_API_KEY). Never store the key client-side. */
  function armOwnerPaidGrok() {
    if (!isOwner()) {
      try {
        localStorage.removeItem('sn:owner-session');
      } catch (_) {}
      return false;
    }
    if (global.__snPaidMindArmed) return true;
    global.__snPaidMindArmed = 1;
    try {
      localStorage.setItem('sn:owner-session', '1');
      localStorage.setItem('sn:architect-email', ARCHITECT_EMAIL);
    } catch (_) {}
    try {
      if (global.SNUsage && SNUsage.track) SNUsage.track('owner_login_paid_arm', { t: Date.now() });
    } catch (_) {}
    try {
      if (!global.__snPaidMindSaid) {
        global.__snPaidMindSaid = 1;
        say('You are signed in. The paid mind is on.', 'ok');
      }
    } catch (_) {}
    return true;
  }

  function applyUser(user) {
    A.user = user || null;
    paint();
    if (!A.user) {
      try {
        localStorage.removeItem('sn:owner-session');
      } catch (_) {}
      return;
    }
    try {
      const me = global.SNProfiles?.me?.();
      if (me) {
        const nm = A.user.user_metadata?.full_name || A.user.email?.split('@')[0];
        if (nm) me.name = nm;
        if (A.user.user_metadata?.avatar_url) me.avatar = A.user.user_metadata.avatar_url;
        if (A.user.email) me.handle = '@' + A.user.email.split('@')[0];
        me.authUid = A.user.id;
        if (isOwner()) me.isOwner = true;
        global.SNProfiles.upsert(me);
      }
    } catch (_) {}
    try {
      armOwnerPaidGrok();
    } catch (_) {}
  }

  async function completeIdToken(credential) {
    await ensureClient();
    const { data, error } = await A.client.auth.signInWithIdToken({
      provider: 'google',
      token: credential,
    });
    if (error) {
      throw new Error(scrub(error.message || error));
    }
    applyUser(data?.user || data?.session?.user || null);
    A.session = data?.session || A.session;
    if (A.user) {
      say(
        'Signed in · ' +
          (A.user.user_metadata?.full_name || A.user.email || 'user') +
          ' · astranov.eu',
        'ok'
      );
    }
    closeModal();
    return data;
  }

  function ensureModalStyles() {
    if (document.getElementById('sn-auth-style')) return;
    const st = document.createElement('style');
    st.id = 'sn-auth-style';
    st.textContent =
      '#sn-auth-modal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,4,12,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:20px}' +
      '#sn-auth-modal[hidden]{display:none!important}' +
      '#sn-auth-card{width:min(400px,100%);max-height:min(92vh,640px);overflow:auto;background:linear-gradient(165deg,#061018 0%,#0a1624 55%,#050c14 100%);' +
      'border:1px solid rgba(61,158,255,.35);border-radius:18px;padding:28px 24px 22px;box-shadow:0 24px 80px rgba(0,40,80,.55),0 0 40px rgba(61,158,255,.12);' +
      'color:#e8f2ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center}' +
      '#sn-auth-card .sn-auth-mark{font-size:13px;letter-spacing:.28em;font-weight:700;color:#3d9eff;margin:0 0 6px}' +
      '#sn-auth-card h2{margin:0 0 8px;font-size:22px;font-weight:650;color:#fff;letter-spacing:.02em}' +
      '#sn-auth-card .sn-auth-domain{font-size:13px;color:#8ab4d9;margin:0 0 18px}' +
      '#sn-auth-card .sn-auth-copy{font-size:13px;line-height:1.45;color:#a8c4dc;margin:0 0 20px}' +
      '#sn-auth-gsi{display:flex;justify-content:center;min-height:44px;margin:0 0 14px}' +
      '#sn-auth-card .sn-auth-note{font-size:11px;color:#6a8aaa;margin:0 0 12px;line-height:1.4}' +
      '#sn-auth-card .sn-auth-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 10px}' +
      '#sn-auth-card .sn-auth-link{display:inline-block;background:rgba(26,111,212,.35);border:1px solid rgba(61,158,255,.55);color:#cfe8ff;' +
      'border-radius:999px;padding:10px 14px;font-size:12px;font-weight:700;text-decoration:none;cursor:pointer}' +
      '#sn-auth-card .sn-auth-link:hover{background:rgba(61,158,255,.45);color:#fff}' +
      '#sn-auth-card .sn-auth-link.hot{background:linear-gradient(180deg,#c62828,#8b0000);border-color:#ff6b7a;color:#fff}' +
      '#sn-auth-card .sn-auth-warn{font-size:12px;line-height:1.4;color:#ffc857;background:rgba(80,40,0,.35);border:1px solid rgba(255,200,87,.35);' +
      'border-radius:12px;padding:10px 12px;margin:0 0 14px;text-align:left}' +
      '#sn-auth-card .sn-auth-close{background:transparent;border:1px solid rgba(138,180,217,.25);color:#8ab4d9;' +
      'border-radius:999px;padding:8px 18px;font-size:12px;cursor:pointer;margin:0 6px}' +
      '#sn-auth-card .sn-auth-close:hover{border-color:#3d9eff;color:#cfe8ff}' +
      '#sn-auth-card .sn-auth-err{font-size:12px;color:#ff8a8a;margin:10px 0 0;min-height:1.2em;text-align:left;white-space:pre-wrap;word-break:break-word}' +
      '#sn-auth-card .sn-auth-setup{display:none;text-align:left;font-size:11px;line-height:1.45;color:#9ec0dc;background:rgba(0,0,0,.35);' +
      'border:1px solid rgba(61,158,255,.2);border-radius:12px;padding:12px;margin:12px 0 0;max-height:280px;overflow:auto}' +
      '#sn-auth-card.show-setup .sn-auth-setup{display:block}' +
      '#sn-auth-card .sn-auth-cid{font-size:10px;color:#5a7a96;margin:8px 0 0;word-break:break-all}';
    document.head.appendChild(st);
  }

  function closeModal() {
    if (A._modal) A._modal.hidden = true;
  }

  function showSetupInModal() {
    if (!A._modal) return;
    A._modal.querySelector('#sn-auth-card')?.classList.add('show-setup');
    const box = document.getElementById('sn-auth-setup');
    if (box) box.textContent = setupLines().join('\n');
    setupLines().forEach(function (ln) {
      say(ln, 'dim');
    });
  }

  function openModal(errText) {
    ensureModalStyles();
    const b = brand();
    const origin = pageOrigin();
    const cid = googleClientId();
    const gLink =
      'https://console.cloud.google.com/apis/credentials/oauthclient/' + encodeURIComponent(cid);
    const sbLink =
      'https://supabase.com/dashboard/project/lkoatrkhuigdolnjsbie/auth/providers';
    const debugAuth = /(?:\?|&)sn-debug=1\b/.test(location.search || '') || isOwner();
    if (!A._modal) {
      const root = document.createElement('div');
      root.id = 'sn-auth-modal';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Sign in to ASTRANOV');
      root.innerHTML =
        '<div id="sn-auth-card">' +
        '<div class="sn-auth-mark">ASTRANOV</div>' +
        '<h2>Sign in</h2>' +
        '<p class="sn-auth-copy">Sign in with Google to call, order, and keep your place on Earth.</p>' +
        '<div class="sn-auth-actions" style="margin:0 0 10px">' +
        '<button type="button" class="sn-auth-close" id="sn-auth-close">Cancel</button>' +
        '</div>' +
        '<div id="sn-auth-gsi"></div>' +
        '<p class="sn-auth-note"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>' +
        (debugAuth
          ? '<div class="sn-auth-warn" id="sn-auth-warn">Owner debug</div>' +
            '<div class="sn-auth-actions">' +
            '<a class="sn-auth-link hot" id="sn-auth-open-gcp" href="' +
            gLink +
            '" target="_blank" rel="noopener">Open Google OAuth client</a>' +
            '<a class="sn-auth-link" id="sn-auth-open-sb" href="' +
            sbLink +
            '" target="_blank" rel="noopener">Supabase provider</a>' +
            '</div>' +
            '<button type="button" class="sn-auth-close" id="sn-auth-setup-btn">Full checklist</button>' +
            '<button type="button" class="sn-auth-close" id="sn-auth-copy-btn">Copy fix steps</button>' +
            '<pre class="sn-auth-setup" id="sn-auth-setup"></pre>' +
            '<p class="sn-auth-cid" id="sn-auth-cid"></p>'
          : '') +
        '<p class="sn-auth-err" id="sn-auth-err"></p>' +
        '</div>';
      root.addEventListener('click', function (ev) {
        if (ev.target === root) closeModal();
      });
      document.body.appendChild(root);
      A._modal = root;
      root.querySelector('#sn-auth-close')?.addEventListener('click', closeModal);
      root.querySelector('#sn-auth-setup-btn')?.addEventListener('click', showSetupInModal);
      root.querySelector('#sn-auth-copy-btn')?.addEventListener('click', function () {
        const text = setupLines().join('\n');
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            void navigator.clipboard.writeText(text).then(function () {
              say('Auth fix steps copied · paste anywhere', 'ok');
            });
          } else {
            say('Copy failed · use Full checklist', 'err');
          }
        } catch (_) {
          say('Copy failed · use Full checklist', 'err');
        }
        showSetupInModal();
      });
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && A._modal && !A._modal.hidden) closeModal();
      });
    }
    A._modal.hidden = false;
    // Keep warn always visible — blocked state is the default owner pain
    A._modal.querySelector('#sn-auth-card')?.classList.remove('show-setup');
    const errEl = document.getElementById('sn-auth-err');
    if (errEl) errEl.textContent = errText ? scrub(errText) : '';
    if (errText && isOriginError(errText)) showSetupInModal();
    const cidEl = document.getElementById('sn-auth-cid');
    if (cidEl) cidEl.textContent = 'OAuth client · ' + cid + ' · origin ' + origin;
    // refresh deep links (origin may change on www)
    const aG = document.getElementById('sn-auth-open-gcp');
    if (aG) aG.href = gLink;
    const aS = document.getElementById('sn-auth-open-sb');
    if (aS) aS.href = sbLink;
    return document.getElementById('sn-auth-gsi');
  }

  function initGis(callback) {
    global.google.accounts.id.initialize({
      client_id: googleClientId(),
      callback: callback,
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
      use_fedcm_for_prompt: false,
    });
    A._gsiInit = true;
  }

  function isOriginError(raw) {
    return /invalid_client|origin|401|registered|FedCM|NotAllowed|no registered|Access blocked|Authorization Error/i.test(
      String(raw || '')
    );
  }

  /**
   * Mount Google GIS into an existing node. Never opens #sn-auth.
   * Used by the one Collective AI sheet so planet click stays a single menu.
   */
  async function renderGoogleButton(mountEl, opts) {
    opts = opts || {};
    if (!mountEl) return null;
    try {
      await ensureClient();
      await loadGsi();
    } catch (e) {
      mountEl.textContent = 'Google unavailable';
      return null;
    }
    if (!global.google || !global.google.accounts || !global.google.accounts.id) {
      mountEl.textContent = 'Google unavailable';
      return null;
    }
    if (A.user) return A.user;
    function onCredential(resp) {
      if (!resp || !resp.credential) return;
      completeIdToken(resp.credential)
        .then(function (data) {
          if (typeof opts.onSuccess === 'function') opts.onSuccess(data);
        })
        .catch(function (e) {
          var msg = scrub((e && e.message) || e);
          if (opts.errorEl) opts.errorEl.textContent = msg;
          else say(msg, 'err');
          if (typeof opts.onError === 'function') opts.onError(e);
        });
    }
    try {
      initGis(onCredential);
    } catch (e) {
      mountEl.textContent = scrub((e && e.message) || 'Google init failed');
      return null;
    }
    mountEl.innerHTML = '';
    var w = Math.max(200, Math.min(320, mountEl.clientWidth || 280));
    try {
      global.google.accounts.id.renderButton(mountEl, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: w,
      });
    } catch (eBtn) {
      mountEl.textContent = scrub((eBtn && eBtn.message) || 'Google button failed');
    }
    return null;
  }

  /**
   * Primary path: branded modal + Google button on THIS origin.
   * signInWithIdToken — never OAuth redirect via *.supabase.co.
   * If the Collective AI sheet is already open, mount GIS there — never a second menu.
   */
  async function signInGoogleGis() {
    await ensureClient();
    await loadGsi();
    if (!global.google || !global.google.accounts || !global.google.accounts.id) {
      throw new Error('Google sign-in unavailable');
    }
    const b = brand();
    say('Sign in · ' + b.name + ' · ' + b.domain + ' · ' + pageOrigin(), 'ok');

    return new Promise(function (resolve, reject) {
      let settled = false;
      function done(err, data) {
        if (settled) return;
        settled = true;
        if (err) {
          if (isOriginError(err.message || err)) {
            var planet = document.getElementById('sn-planet-sheet');
            var planetOpen = planet && !planet.hasAttribute('hidden');
            if (!planetOpen) showSetupInModal();
            const errEl =
              document.getElementById('ps-gsi-err') || document.getElementById('sn-auth-err');
            if (errEl) errEl.textContent = scrub(originHelp());
          } else {
            closeModal();
          }
          reject(err instanceof Error ? err : new Error(String(err)));
        } else resolve(data);
      }

      async function onCredential(resp) {
        try {
          if (!resp || !resp.credential) {
            done(new Error('Sign-in cancelled'));
            return;
          }
          say('Signing in to astranov.eu…', 'dim');
          const data = await completeIdToken(resp.credential);
          done(null, data);
        } catch (e) {
          const raw = String((e && e.message) || e || '');
          if (isOriginError(raw)) {
            done(new Error(originHelp()));
          } else {
            const errEl =
              document.getElementById('ps-gsi-err') || document.getElementById('sn-auth-err');
            if (errEl) errEl.textContent = scrub(raw);
            done(e);
          }
        }
      }

      try {
        initGis(onCredential);
      } catch (eInit) {
        done(eInit);
        return;
      }

      var planet = document.getElementById('sn-planet-sheet');
      var inline = document.getElementById('ps-gsi');
      var useInline = planet && !planet.hasAttribute('hidden') && inline;
      if (useInline) {
        closeModal();
        renderGoogleButton(inline, {
          onSuccess: function (data) {
            done(null, data);
          },
          onError: function (e) {
            done(e);
          },
          errorEl: document.getElementById('ps-gsi-err'),
        });
        return;
      }

      const mount = openModal();
      if (mount) {
        mount.innerHTML = '';
        try {
          global.google.accounts.id.renderButton(mount, {
            type: 'standard',
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            shape: 'pill',
            logo_alignment: 'left',
            width: 280,
          });
        } catch (eBtn) {
          done(
            isOriginError(eBtn && eBtn.message) ? new Error(originHelp()) : eBtn
          );
          return;
        }
      }

      try {
        global.google.accounts.id.prompt(function (notification) {
          if (!notification) return;
          try {
            if (notification.isNotDisplayed && notification.isNotDisplayed()) {
              const reason =
                (notification.getNotDisplayedReason && notification.getNotDisplayedReason()) ||
                '';
              if (isOriginError(reason)) {
                const help = originHelp();
                const errEl = document.getElementById('sn-auth-err');
                if (errEl) errEl.textContent = scrub(help);
                showSetupInModal();
              }
            }
          } catch (_) {}
        });
      } catch (_) {}

      const closeBtn = document.getElementById('sn-auth-close');
      if (closeBtn) {
        const onCancel = function () {
          closeBtn.removeEventListener('click', onCancel);
          if (!settled) done(new Error('Sign-in cancelled'));
        };
        closeBtn.addEventListener('click', onCancel);
      }
    });
  }

  async function signInGoogleOAuthFallback() {
    const customOk = await probeCustomAuth();
    if (!customOk || cfg().preferCustomAuth !== true) {
      throw new Error(originHelp());
    }
    const c = await ensureClient();
    const b = brand();
    const redirectTo = (location.origin || b.site).replace(/\/$/, '') + '/';
    say('Sign in · Google · ' + b.domain, 'ok');
    const { error } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    if (error) {
      const raw = scrub(error.message || error);
      if (isOriginError(raw)) throw new Error(originHelp());
      throw new Error(raw);
    }
    return null;
  }

  async function signInGoogle() {
    return signInGoogleGis();
  }

  async function signOut() {
    if (!A.client) await ensureClient();
    await A.client.auth.signOut();
    A.session = null;
    A.user = null;
    paint();
  }

  async function toggle() {
    if (A.user) {
      await signOut();
      say('Signed out · astranov.eu', 'ok');
    } else {
      try {
        await signInGoogle();
      } catch (e) {
        const msg = scrub(e && e.message ? e.message : e);
        if (!/cancelled/i.test(msg)) {
          say(msg, 'err');
          if (isOriginError(msg)) {
            setupLines().forEach(function (ln) {
              say(ln, 'dim');
            });
          }
        }
        throw new Error(msg);
      }
    }
  }

  async function authHeaders() {
    const h = {
      'Content-Type': 'application/json',
      apikey: cfg().sbKey || global.SB_KEY,
    };
    try {
      await ensureClient();
      const { data } = await A.client.auth.getSession();
      const tok = data?.session?.access_token;
      h.Authorization = tok
        ? 'Bearer ' + tok
        : 'Bearer ' + (cfg().sbKey || global.SB_KEY);
    } catch (_) {
      h.Authorization = 'Bearer ' + (cfg().sbKey || global.SB_KEY);
    }
    return h;
  }

  function authHeadersSync() {
    const h = {
      'Content-Type': 'application/json',
      apikey: cfg().sbKey || global.SB_KEY,
    };
    try {
      const raw =
        localStorage.getItem('astranov_auth_v3') || localStorage.getItem('astranov_auth_v2');
      if (raw) {
        const j = JSON.parse(raw);
        const tok = j?.access_token || j?.currentSession?.access_token;
        if (tok) h.Authorization = 'Bearer ' + tok;
      }
    } catch (_) {}
    if (!h.Authorization) h.Authorization = 'Bearer ' + (cfg().sbKey || global.SB_KEY);
    return h;
  }

  function init() {
    if (A._bound) return;
    A._bound = true;
    document.getElementById('btn-login')?.addEventListener('click', () => {
      void toggle().catch(() => {});
    });
    void loadGsi().catch(() => {});
    void probeCustomAuth();
    ensureClient()
      .then(async () => {
        try {
          const { data, error } = await A.client.auth.getSession();
          if (error) throw error;
          A.session = data?.session || null;
          A.user = data?.session?.user || null;
          if (A.user) applyUser(A.user);
          try {
            if (location.search || location.hash) {
              let q = (location.search || '')
                .replace(/[?&](code|error|error_description|state|provider)=[^&]*/gi, '')
                .replace(/\?&/, '?')
                .replace(/\?$/, '');
              let hash = (location.hash || '')
                .replace(/#.*access_token[^&]*/gi, '')
                .replace(
                  /[&#](access_token|refresh_token|token_type|expires_in|provider_token)=[^&]*/gi,
                  ''
                );
              if (hash === '#' || hash === '') hash = '';
              history.replaceState(null, '', (location.pathname || '/') + q + hash);
            }
          } catch (_) {}
          paint();
        } catch (_) {
          paint();
        }
      })
      .catch(() => {
        A.ready = true;
        paint();
      });
  }

  global.SNAuth = {
    init,
    toggle,
    renderGoogleButton,
    signInGoogle,
    signInGoogleGis,
    signInGoogleOAuthFallback,
    signOut,
    authHeaders,
    authHeadersSync,
    ensureClient,
    scrub,
    originHelp,
    setupLines,
    openModal,
    closeModal,
    probeCustomAuth,
    googleClientId,
    isOwner,
    avatarUrl,
    armOwnerPaidGrok,
    ARCHITECT_EMAIL,
    get GOOGLE_CLIENT_ID() {
      return googleClientId();
    },
    get user() {
      return A.user;
    },
    get ready() {
      return A.ready;
    },
    get session() {
      return A.session;
    },
    get client() {
      return A.client;
    },
    get owner() {
      return isOwner();
    },
  };
})(window);
