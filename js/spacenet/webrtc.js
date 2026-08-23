/**
 * SNWebRTC — instant video/voice from CLI Call button
 * Call · answer · mute · camera on/off on the call tile
 * Build: 20260822150000-call-live
 */
(function (global) {
  'use strict';
  var BUILD = '20260822150000-call-live';
  var ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  var BUS = 'sn-webrtc-v1';
  var state = {
    ready: false,
    inCall: false,
    pc: null,
    localStream: null,
    remoteStream: null,
    room: null,
    reason: null,
    camOn: true,
    micOn: true,
    peerLabel: '',
    pending: null, // incoming offer
    audioOnly: true,
  };
  var bc = null;
  var sbCh = null;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.beginTurn) SNCli.beginTurn();
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 240), c || 'ok', true);
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 80));
    } catch (_) {}
  }

  function ensureCss() {
    if (document.getElementById('sn-webrtc-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-webrtc-css';
    st.textContent = [
      '#sn-rtc-layer{position:fixed;inset:0;z-index:12000;display:none;pointer-events:none;}',
      '#sn-rtc-layer.on{display:block;}',
      '#sn-rtc-box{pointer-events:auto;position:fixed;left:50%;top:12%;transform:translateX(-50%);width:min(440px,94vw);',
      'border-radius:16px;overflow:visible;border:1px solid rgba(61,158,255,.45);',
      'background:linear-gradient(165deg,rgba(8,24,56,.96),rgba(2,8,20,.98));box-shadow:0 20px 60px rgba(0,0,0,.55);}',
      '#sn-rtc-layer.min #sn-rtc-vidwrap,#sn-rtc-layer.min #sn-rtc-dial,#sn-rtc-layer.min #sn-rtc-bar{display:none!important}',
      '#sn-rtc-layer.max #sn-rtc-box{left:3vw;top:10vh;transform:none;width:94vw;height:78vh}',
      '#sn-rtc-handle{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:10px 14px;cursor:grab;touch-action:none;min-height:44px;border-bottom:1px solid rgba(61,158,255,.2)}',
      '#sn-rtc-handle .sn-win-title{justify-self:start;font:700 11px/1 system-ui;color:#9ec8ff;letter-spacing:.08em}',
      '#sn-rtc-handle .sn-win-lights{display:flex;gap:10px;justify-self:center}',
      '#sn-rtc-handle .sn-win-lights button{width:22px;height:22px;border-radius:50%;border:1px solid transparent;padding:0;cursor:pointer;font:800 12px/1 system-ui}',
      '#sn-rtc-handle .sn-win-min{background:radial-gradient(circle at 35% 30%,#ffe58a,#e0b000 70%);border-color:#c9a000;color:#3a2c00}',
      '#sn-rtc-handle .sn-win-x{background:radial-gradient(circle at 35% 30%,#ff8a8a,#c62828 70%);border-color:#ff4444;color:#fff}',
      '#sn-rtc-handle .sn-win-max{background:radial-gradient(circle at 35% 30%,#8dffb4,#1a9e4a 70%);border-color:#2ecc71;color:#041a0c}',
      '#sn-rtc-box .sn-win-c{position:absolute;width:22px;height:22px}',
      '#sn-rtc-box .sn-win-c.nw{top:-4px;left:-4px;cursor:nwse-resize}',
      '#sn-rtc-box .sn-win-c.ne{top:-4px;right:-4px;cursor:nesw-resize}',
      '#sn-rtc-box .sn-win-c.sw{bottom:-4px;left:-4px;cursor:nesw-resize}',
      '#sn-rtc-box .sn-win-c.se{bottom:-4px;right:-4px;cursor:nwse-resize}',
      '#sn-rtc-box video{width:100%;display:block;background:#000;max-height:42vh;object-fit:cover;}',
      '#sn-rtc-remote{min-height:180px;background:#02060e;}',
      '#sn-rtc-local{position:absolute;right:12px;bottom:12px;width:30%;max-width:140px;border-radius:14px;',
      'border:1px solid rgba(61,158,255,.55);box-shadow:0 4px 18px rgba(0,0,0,.45);}',
      '#sn-rtc-local.cam-off{opacity:0.35;filter:grayscale(1);}',
      '#sn-rtc-vidwrap{position:relative;}',
      '#sn-rtc-bar{display:flex;gap:8px;padding:12px;justify-content:center;flex-wrap:wrap;}',
      '#sn-rtc-bar button{border-radius:999px;border:1px solid rgba(61,158,255,.4);background:rgba(12,40,80,.9);',
      'color:#cfe8ff;font:700 12px system-ui;padding:11px 16px;cursor:pointer;min-width:96px;}',
      '#sn-rtc-bar button.hang{border-color:rgba(232,33,39,.65);color:#ffb4b8;background:rgba(60,10,16,.9);}',
      '#sn-rtc-bar button.cam-off{border-color:rgba(255,180,60,.7);color:#ffd48a;background:rgba(50,30,0,.85);}',
      '#sn-rtc-bar button.mic-off{border-color:rgba(200,200,200,.5);color:#ccc;}',
      '#sn-rtc-meta{padding:12px 14px 0;font:600 12px system-ui;color:#8ab4e0;text-align:center;line-height:1.4;}',
      '#sn-rtc-dial{padding:14px 16px 16px;display:none;flex-direction:column;gap:10px;}',
      '#sn-rtc-dial.on{display:flex;}',
      '#sn-rtc-dial h3{margin:0;font:800 15px system-ui;color:#dff0ff;letter-spacing:.04em;}',
      '#sn-rtc-dial p{margin:0;font:500 12px system-ui;color:#8ab4e0;line-height:1.45;}',
      '#sn-rtc-dial .row{display:flex;flex-wrap:wrap;gap:8px;}',
      '#sn-rtc-dial button{border-radius:14px;border:1px solid rgba(61,158,255,.4);background:rgba(12,40,80,.9);',
      'color:#cfe8ff;font:700 12px system-ui;padding:12px 14px;cursor:pointer;flex:1 1 120px;}',
      '#sn-rtc-dial button.primary{border-color:rgba(61,214,140,.65);background:rgba(10,50,30,.9);color:#b8ffd4;}',
      '#sn-rtc-dial input{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(61,158,255,.3);',
      'background:rgba(0,10,24,.7);color:#dff0ff;font:600 13px system-ui;padding:10px 12px;}',
      '#sn-rtc-ring{display:none;padding:18px 16px;text-align:center;}',
      '#sn-rtc-ring.on{display:block;}',
      '#sn-rtc-ring h3{margin:0 0 8px;font:800 16px system-ui;color:#b8ffd4;}',
      '#sn-rtc-ring p{margin:0 0 14px;color:#8ab4e0;font:500 12px system-ui;}',
      '#sn-rtc-ring .row{display:flex;gap:10px;justify-content:center;}',
      '#sn-rtc-ring button{border-radius:999px;border:1px solid rgba(61,158,255,.45);padding:12px 20px;',
      'font:800 13px system-ui;cursor:pointer;color:#dff0ff;background:rgba(12,40,80,.95);}',
      '#sn-rtc-ring button.accept{border-color:rgba(61,214,140,.7);background:rgba(10,50,30,.95);color:#b8ffd4;}',
      '#sn-rtc-ring button.decline{border-color:rgba(232,33,39,.65);background:rgba(50,10,14,.95);color:#ffb4b8;}',
      '#sn-rtc-close-x{position:absolute;top:8px;right:10px;border:0;background:transparent;color:#8ab4e0;',
      'font:800 18px system-ui;cursor:pointer;line-height:1;padding:4px 8px;}',
    ].join('');
    document.head.appendChild(st);
  }

  function ensureDom() {
    ensureCss();
    if (document.getElementById('sn-rtc-layer')) return;
    var el = document.createElement('div');
    el.id = 'sn-rtc-layer';
    el.innerHTML =
      '<div id="sn-rtc-box">' +
      '<div id="sn-rtc-handle">' +
      '<span class="sn-win-title">CALL</span>' +
      '<div class="sn-win-lights">' +
      '<button type="button" class="sn-win-min" data-win="min" title="Minimize">−</button>' +
      '<button type="button" class="sn-win-x" id="sn-rtc-close-x" title="Close">×</button>' +
      '<button type="button" class="sn-win-max" data-win="max" title="Maximize">+</button>' +
      '</div><span></span></div>' +
      '<div id="sn-rtc-meta">Video call</div>' +
      '<div id="sn-rtc-dial">' +
      '<h3>VIDEO CALL</h3>' +
      '<p>Call instantly from the CLI. Share the room code with the other person, or answer when they call you.</p>' +
      '<input id="sn-rtc-room" type="text" maxlength="32" placeholder="Room code (optional)" autocomplete="off" />' +
      '<div class="row">' +
      '<button type="button" class="primary" data-dial="start">Start video call</button>' +
      '<button type="button" data-dial="audio">Audio only</button>' +
      '</div>' +
      '<div class="row">' +
      '<button type="button" data-dial="contacts">Call a contact</button>' +
      '<button type="button" data-dial="close">Close</button>' +
      '</div></div>' +
      '<div id="sn-rtc-ring">' +
      '<h3>Incoming call</h3>' +
      '<p id="sn-rtc-ring-msg">Someone is calling you</p>' +
      '<div class="row">' +
      '<button type="button" class="accept" data-ring="accept">Accept</button>' +
      '<button type="button" class="decline" data-ring="decline">Decline</button>' +
      '</div></div>' +
      '<div id="sn-rtc-vidwrap" style="display:none">' +
      '<video id="sn-rtc-remote" autoplay playsinline></video>' +
      '<video id="sn-rtc-local" autoplay playsinline muted></video>' +
      '</div>' +
      '<div id="sn-rtc-bar" style="display:none">' +
      '<button type="button" data-rtc="mute">Mic ON</button>' +
      '<button type="button" data-rtc="cam">Camera ON</button>' +
      '<button type="button" class="hang" data-rtc="hang">Hang up</button>' +
      '</div>' +
      '<i class="sn-win-c nw" data-c="nw"></i><i class="sn-win-c ne" data-c="ne"></i>' +
      '<i class="sn-win-c sw" data-c="sw"></i><i class="sn-win-c se" data-c="se"></i>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelector('#sn-rtc-close-x').onclick = function () {
      if (state.inCall) hangup();
      else closeUi();
    };
    var layer = el;
    var box = el.querySelector('#sn-rtc-box');
    el.querySelector('[data-win="min"]').onclick = function () {
      layer.classList.toggle('min');
      layer.classList.remove('max');
    };
    el.querySelector('[data-win="max"]').onclick = function () {
      layer.classList.toggle('max');
      layer.classList.remove('min');
    };
    (function bindRtcWin() {
      var handle = el.querySelector('#sn-rtc-handle');
      if (handle) {
        handle.addEventListener('pointerdown', function (e) {
          if (e.target.closest('button')) return;
          var r = box.getBoundingClientRect();
          var sx = e.clientX;
          var sy = e.clientY;
          var sl = r.left;
          var st = r.top;
          function move(ev) {
            box.style.left = sl + ev.clientX - sx + 'px';
            box.style.top = st + ev.clientY - sy + 'px';
            box.style.transform = 'none';
          }
          function up() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        });
      }
      Array.prototype.forEach.call(el.querySelectorAll('.sn-win-c'), function (h) {
        h.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var c = h.getAttribute('data-c');
          var r = box.getBoundingClientRect();
          var sx = e.clientX;
          var sy = e.clientY;
          var sl = r.left;
          var st = r.top;
          var sw = r.width;
          var sh = r.height;
          function move(ev) {
            var dx = ev.clientX - sx;
            var dy = ev.clientY - sy;
            var l = sl;
            var t = st;
            var w = sw;
            var ht = sh;
            if (c.indexOf('e') >= 0) w = Math.max(240, sw + dx);
            if (c.indexOf('s') >= 0) ht = Math.max(180, sh + dy);
            if (c.indexOf('w') >= 0) {
              w = Math.max(240, sw - dx);
              l = sl + dx;
            }
            if (c.indexOf('n') >= 0) {
              ht = Math.max(180, sh - dy);
              t = st + dy;
            }
            box.style.left = l + 'px';
            box.style.top = t + 'px';
            box.style.width = w + 'px';
            box.style.height = ht + 'px';
            box.style.transform = 'none';
            layer.classList.remove('min', 'max');
          }
          function up() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        });
      });
    })();
    el.querySelector('[data-rtc="hang"]').onclick = function () {
      hangup();
    };
    el.querySelector('[data-rtc="mute"]').onclick = function () {
      toggleMic();
    };
    el.querySelector('[data-rtc="cam"]').onclick = function () {
      toggleCam();
    };
    el.querySelector('[data-dial="start"]').onclick = function () {
      void startInstant({ audioOnly: false });
    };
    el.querySelector('[data-dial="audio"]').onclick = function () {
      void startInstant({ audioOnly: true });
    };
    el.querySelector('[data-dial="close"]').onclick = function () {
      closeUi();
    };
    el.querySelector('[data-dial="contacts"]').onclick = function () {
      pickContact();
    };
    el.querySelector('[data-ring="accept"]').onclick = function () {
      void acceptIncoming();
    };
    el.querySelector('[data-ring="decline"]').onclick = function () {
      declineIncoming();
    };
  }

  function showLayer() {
    ensureDom();
    document.getElementById('sn-rtc-layer').classList.add('on');
  }

  function closeUi() {
    var layer = document.getElementById('sn-rtc-layer');
    if (layer && !state.inCall) layer.classList.remove('on');
  }

  function showDialer() {
    showLayer();
    var dial = document.getElementById('sn-rtc-dial');
    var ring = document.getElementById('sn-rtc-ring');
    var vid = document.getElementById('sn-rtc-vidwrap');
    var bar = document.getElementById('sn-rtc-bar');
    if (dial) dial.classList.add('on');
    if (ring) ring.classList.remove('on');
    if (vid) vid.style.display = 'none';
    if (bar) bar.style.display = 'none';
    var meta = document.getElementById('sn-rtc-meta');
    if (meta) meta.textContent = 'Call · place or answer from CLI';
    try {
      var roomIn = document.getElementById('sn-rtc-room');
      if (roomIn && !roomIn.value) {
        roomIn.value = 'sn-' + Math.random().toString(36).slice(2, 7);
      }
    } catch (_) {}
  }

  function showCallUi() {
    if (state.audioOnly) {
      try {
        var btn = document.getElementById('sn-rib-call');
        if (btn) btn.classList.add('on');
      } catch (_) {}
      return;
    }
    showLayer();
    var dial = document.getElementById('sn-rtc-dial');
    var ring = document.getElementById('sn-rtc-ring');
    var vid = document.getElementById('sn-rtc-vidwrap');
    var bar = document.getElementById('sn-rtc-bar');
    if (dial) dial.classList.remove('on');
    if (ring) ring.classList.remove('on');
    if (vid) vid.style.display = 'block';
    if (bar) bar.style.display = 'flex';
    paintMediaButtons();
  }

  function showRing(msg) {
    showLayer();
    var dial = document.getElementById('sn-rtc-dial');
    var ring = document.getElementById('sn-rtc-ring');
    var vid = document.getElementById('sn-rtc-vidwrap');
    var bar = document.getElementById('sn-rtc-bar');
    if (dial) dial.classList.remove('on');
    if (ring) {
      ring.classList.add('on');
      var p = document.getElementById('sn-rtc-ring-msg');
      if (p) p.textContent = msg || 'Incoming video call';
    }
    if (vid) vid.style.display = 'none';
    if (bar) bar.style.display = 'none';
    var meta = document.getElementById('sn-rtc-meta');
    if (meta) meta.textContent = 'Incoming call';
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview('📞 Incoming call');
      log('Incoming video call · tap Call or Accept', 'ok');
    } catch (_) {}
  }

  function paintMediaButtons() {
    var camBtn = document.querySelector('#sn-rtc-bar [data-rtc="cam"]');
    var micBtn = document.querySelector('#sn-rtc-bar [data-rtc="mute"]');
    var local = document.getElementById('sn-rtc-local');
    if (camBtn) {
      camBtn.textContent = state.camOn ? 'Camera ON' : 'Camera OFF';
      camBtn.classList.toggle('cam-off', !state.camOn);
      camBtn.title = state.camOn ? 'Turn camera off' : 'Turn camera on';
    }
    if (micBtn) {
      micBtn.textContent = state.micOn ? 'Mic ON' : 'Mic OFF';
      micBtn.classList.toggle('mic-off', !state.micOn);
    }
    if (local) local.classList.toggle('cam-off', !state.camOn);
  }

  function toggleCam() {
    if (!state.localStream) {
      log('No camera stream yet', 'dim');
      return;
    }
    var tracks = state.localStream.getVideoTracks();
    if (!tracks.length) {
      log('This call is audio-only · no camera', 'dim');
      return;
    }
    state.camOn = !state.camOn;
    tracks.forEach(function (t) {
      t.enabled = state.camOn;
    });
    paintMediaButtons();
    log(state.camOn ? 'Camera ON' : 'Camera OFF', 'ok');
  }

  function toggleMic() {
    if (!state.localStream) return;
    state.micOn = !state.micOn;
    state.localStream.getAudioTracks().forEach(function (t) {
      t.enabled = state.micOn;
    });
    paintMediaButtons();
    log(state.micOn ? 'Mic ON' : 'Mic muted', 'dim');
  }

  function bus() {
    if (bc) return bc;
    try {
      bc = new BroadcastChannel(BUS);
      bc.onmessage = function (ev) {
        void onSignal(ev.data || {});
      };
    } catch (_) {
      bc = { postMessage: function () {}, close: function () {} };
    }
    try {
      netBus();
    } catch (_) {}
    return bc;
  }

  async function netBus() {
    try {
      if (sbCh) return sbCh;
      if (global.SNAuth && SNAuth.ensureClient) await SNAuth.ensureClient();
      var sb = global.SNAuth && SNAuth.client;
      if (!sb || typeof sb.channel !== 'function') return null;
      var ch = sb.channel('sn-calls', { config: { broadcast: { ack: false, self: false } } });
      ch.on('broadcast', { event: 'signal' }, function (e) {
        var payload = (e && e.payload) || {};
        void onSignal(payload);
      });
      await ch.subscribe();
      sbCh = ch;
      return sbCh;
    } catch (_) {
      return null;
    }
  }

  function post(msg) {
    var payload = Object.assign({ t: Date.now(), room: state.room }, msg);
    try {
      bus().postMessage(payload);
    } catch (_) {}
    try {
      if (sbCh && typeof sbCh.send === 'function') {
        sbCh.send({ type: 'broadcast', event: 'signal', payload: payload });
      }
    } catch (_) {}
  }

  /** Instant calls always allowed from CLI Call button */
  function canCall(order, opts) {
    opts = opts || {};
    var signed = false;
    try {
      signed = !!(global.SNAuth && SNAuth.user);
    } catch (_) {}
    if (!signed && !opts.force) return { ok: false, reason: 'Sign in to call' };
    if (opts.force || opts.instant || opts.open) return { ok: true, reason: opts.reason || 'CLI call' };
    if (!order) return { ok: true, reason: 'direct call' };
    var limits = order.limits || (order.quote && order.quote.limits) || {};
    var late = false;
    var eta = Number(order.etaMin || limits.maxEtaMin || 0);
    var elapsed = order.startedAt ? (Date.now() - order.startedAt) / 60000 : 0;
    if (eta && elapsed > eta * 1.25) late = true;
    var offRoute = !!(order.offRoute || order.dispute || order.offLimits);
    if (late || offRoute || order.phase === 'disputed' || opts.sealed) {
      return {
        ok: true,
        reason: late ? 'late vs ETA' : offRoute ? 'off-route / dispute' : 'sealed',
      };
    }
    // Still allow — ribbon Call is an explicit user action
    return { ok: true, reason: 'user call' };
  }

  async function getMedia(opts) {
    opts = opts || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera/mic unavailable · need HTTPS + permission');
    }
    var constraints = {
      audio: true,
      video: opts.audioOnly
        ? false
        : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      // Fall back audio-only if camera denied
      if (!opts.audioOnly) {
        log('Camera denied · audio only', 'dim');
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      throw e;
    }
  }

  async function makePc() {
    var pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = function (e) {
      if (e.candidate) post({ type: 'ice', candidate: e.candidate });
    };
    pc.ontrack = function (e) {
      state.remoteStream = e.streams[0] || new MediaStream([e.track]);
      var v = document.getElementById('sn-rtc-remote');
      if (v) v.srcObject = state.remoteStream;
    };
    pc.onconnectionstatechange = function () {
      log('Call · ' + pc.connectionState, pc.connectionState === 'connected' ? 'ok' : 'dim');
      var meta = document.getElementById('sn-rtc-meta');
      if (meta && state.inCall) {
        meta.textContent =
          (state.peerLabel || 'Call') +
          ' · ' +
          pc.connectionState +
          (state.room ? ' · room ' + state.room : '');
      }
    };
    return pc;
  }

  async function startInstant(opts) {
    opts = opts || {};
    if (state.inCall) {
      showCallUi();
      log('Already in a call', 'dim');
      return { ok: false, error: 'busy' };
    }
    var roomEl = document.getElementById('sn-rtc-room');
    var room =
      (roomEl && roomEl.value && roomEl.value.trim()) ||
      opts.room ||
      'sn-' + Math.random().toString(36).slice(2, 8);
    return startCall(null, {
      force: true,
      instant: true,
      open: true,
      room: room,
      audioOnly: !!opts.audioOnly,
      label: opts.label || 'Direct call',
      reason: 'CLI instant call',
    });
  }

  async function startCall(order, opts) {
    opts = opts || {};
    var gate = canCall(order, opts);
    if (!gate.ok) {
      log(gate.reason, 'err');
      return { ok: false, error: gate.reason };
    }
    if (state.inCall) {
      showCallUi();
      return { ok: false, error: 'busy' };
    }
    ensureDom();
    state.room =
      (order && order.id) || opts.room || 'room-' + Math.random().toString(36).slice(2, 8);
    state.reason = gate.reason || opts.reason || 'call';
    state.peerLabel = opts.label || (order && (order.vendorName || order.clientName)) || 'Call';
    state.camOn = !opts.audioOnly;
    state.micOn = true;
    state.audioOnly = !!opts.audioOnly;
    try {
      state.localStream = await getMedia({ audioOnly: !!opts.audioOnly });
      // if no video track, mark cam off
      if (!state.localStream.getVideoTracks().length) state.camOn = false;
      state.pc = await makePc();
      state.localStream.getTracks().forEach(function (t) {
        state.pc.addTrack(t, state.localStream);
      });
      var lv = document.getElementById('sn-rtc-local');
      if (lv) lv.srcObject = state.localStream;
      showCallUi();
      var meta = document.getElementById('sn-rtc-meta');
      if (meta && !state.audioOnly)
        meta.textContent =
          state.peerLabel + ' · connecting · room ' + state.room;
      bus();
      void netBus();
      var offer = await state.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await state.pc.setLocalDescription(offer);
      post({ type: 'offer', sdp: state.pc.localDescription, from: 'caller', label: state.peerLabel });
      state.inCall = true;
      paintMediaButtons();
      log(
        (state.audioOnly ? 'CALL live · audio · ' : 'Video call open · ') +
          (state.peerLabel || 'peer') +
          ' · type hang to end',
        'ok'
      );
      try {
        if (global.SNCli && SNCli.preview) SNCli.preview('📞 Call · ' + state.room);
      } catch (_) {}
      return { ok: true, room: state.room, reason: state.reason };
    } catch (e) {
      hangup(true);
      log('Call failed · ' + (e.message || e), 'err');
      return { ok: false, error: String(e.message || e) };
    }
  }

  async function acceptIncoming() {
    var msg = state.pending;
    if (!msg) {
      log('No incoming call', 'dim');
      return;
    }
    state.pending = null;
    try {
      ensureDom();
      state.room = msg.room || state.room;
      state.peerLabel = msg.label || 'Caller';
      state.localStream = await getMedia({});
      state.camOn = !!state.localStream.getVideoTracks().length;
      state.micOn = true;
      state.pc = await makePc();
      state.localStream.getTracks().forEach(function (t) {
        state.pc.addTrack(t, state.localStream);
      });
      var lv = document.getElementById('sn-rtc-local');
      if (lv) lv.srcObject = state.localStream;
      showCallUi();
      await state.pc.setRemoteDescription(msg.sdp);
      var answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      post({ type: 'answer', sdp: state.pc.localDescription });
      state.inCall = true;
      paintMediaButtons();
      log('Joined call · room ' + state.room, 'ok');
    } catch (e) {
      hangup(true);
      log('Accept failed · ' + (e.message || e), 'err');
    }
  }

  function declineIncoming() {
    try {
      if (state.pending) post({ type: 'hang', room: state.pending.room });
    } catch (_) {}
    state.pending = null;
    closeUi();
    log('Call declined', 'dim');
  }

  async function onSignal(msg) {
    if (!msg || !msg.type) return;
    if (state.room && msg.room && msg.room !== state.room && msg.type !== 'offer') return;
    try {
      if (msg.type === 'offer' && !state.inCall) {
        // Ring — user accepts from Call button or ring UI
        state.pending = msg;
        if (!state.room) state.room = msg.room;
        showRing((msg.label || 'Someone') + ' is calling · room ' + (msg.room || ''));
        // pulse ribbon button if present
        try {
          var btn = document.getElementById('sn-rib-call');
          if (btn) btn.classList.add('on');
        } catch (_) {}
      } else if (msg.type === 'answer' && state.pc) {
        await state.pc.setRemoteDescription(msg.sdp);
      } else if (msg.type === 'ice' && state.pc && msg.candidate) {
        try {
          await state.pc.addIceCandidate(msg.candidate);
        } catch (_) {}
      } else if (msg.type === 'hang') {
        if (state.pending && msg.room === state.pending.room) {
          state.pending = null;
          closeUi();
          log('Caller hung up', 'dim');
        } else hangup(true);
      }
    } catch (e) {
      log('Signal · ' + (e.message || e), 'err');
    }
  }

  function hangup(silent) {
    try {
      if (!silent) post({ type: 'hang' });
    } catch (_) {}
    try {
      if (state.pc) state.pc.close();
    } catch (_) {}
    try {
      if (state.localStream)
        state.localStream.getTracks().forEach(function (t) {
          t.stop();
        });
    } catch (_) {}
    state.pc = null;
    state.localStream = null;
    state.remoteStream = null;
    state.inCall = false;
    state.pending = null;
    state.camOn = true;
    state.micOn = true;
    state.audioOnly = true;
    var layer = document.getElementById('sn-rtc-layer');
    if (layer) layer.classList.remove('on');
    try {
      if (global.SNStage && SNStage.clear) SNStage.clear('call');
    } catch (_) {}
    try {
      var btn = document.getElementById('sn-rib-call');
      if (btn) btn.classList.remove('on');
    } catch (_) {}
    if (!silent) log('Call ended', 'dim');
  }

  function pickContact() {
    var list = [];
    try {
      if (global.SNProfiles && SNProfiles.list) {
        list = (SNProfiles.list() || []).filter(function (p) {
          return p && p.id && !(global.SNProfiles.me && SNProfiles.me() && SNProfiles.me().id === p.id);
        }).slice(0, 12);
      }
    } catch (_) {}
    if (!list.length) {
      log('No contacts nearby · start a room call and share the code', 'dim');
      void startInstant({});
      return;
    }
    // Simple pick: first open flyout via field if available, else first contact
    try {
      if (global.SNField && SNField.openRibbonFlyout) {
        SNField.openRibbonFlyout(
          'sn-rib-call',
          {
            title: 'CALL CONTACT',
            items: list.map(function (p) {
              return {
                id: p.id,
                e: '📞',
                t: p.name || p.shopName || 'Contact',
                d: p.handle || (p.lat != null ? 'on map' : 'profile'),
              };
            }),
          },
          function (id) {
            var p = list.find(function (x) {
              return x.id === id;
            });
            void startCall(null, {
              force: true,
              instant: true,
              room: 'p-' + String(id).slice(0, 12),
              label: (p && (p.name || p.shopName)) || 'Contact',
            });
          }
        );
        return;
      }
    } catch (_) {}
    var p0 = list[0];
    void startCall(null, {
      force: true,
      instant: true,
      room: 'p-' + String(p0.id).slice(0, 12),
      label: p0.name || 'Contact',
    });
  }

  /** Ribbon / CLI entry — globe hop + live audio. Guest = Google sign-in. Video tile only on "call video". */
  function openFromRibbon() {
    try {
      if (global.SNChromeFix && SNChromeFix.demandHud) SNChromeFix.demandHud('call');
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.beginTurn) SNCli.beginTurn();
    } catch (_) {}
    var signed = false;
    try {
      signed = !!(global.SNAuth && SNAuth.user);
    } catch (_) {}
    if (!signed) {
      log('Sign in with Google to call. Then the hop draws on Earth.', 'ok');
      try {
        if (global.SNAuth && SNAuth.signInGoogleGis) {
          void SNAuth.signInGoogleGis().catch(function (e) {
            log('Sign in · ' + ((e && e.message) || 'try again'), 'err');
          });
        } else if (global.SNAuth && SNAuth.openModal) {
          SNAuth.openModal();
        }
      } catch (e) {
        log('Sign in failed · ' + (e.message || e), 'err');
      }
      return;
    }
    if (state.inCall) {
      log('Already in a call · type hang to end', 'dim');
      return;
    }
    var from =
      (global.SNStage && SNStage.here && SNStage.here()) ||
      global._snPhysPos ||
      { lat: 36.387557, lng: 28.222533, name: 'KALITHEA' };
    var to = null;
    try {
      if (global.SNVillage && SNVillage.HQ)
        to = { lat: SNVillage.HQ.lat, lng: SNVillage.HQ.lng, name: SNVillage.HQ.short || 'KALITHEA' };
    } catch (_) {}
    if (!to) to = { lat: 37.9838, lng: 23.7275, name: 'Athens' };
    try {
      if (global.SNStage && SNStage.link) {
        SNStage.link(from, to, { kind: 'call', color: 0x14c3f3, fromFace: '', toFace: '' });
      } else if (global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(from.lat, from.lng, 0x14c3f3, 'YOU', 20000);
        SNGlobe.pulse(to.lat, to.lng, 0x14c3f3, to.name, 20000);
      }
    } catch (_) {}
    log('CALL · hop on Earth · ' + (from.name || 'YOU') + ' → ' + to.name + ' · audio', 'ok');
    var uid = '';
    try {
      uid = String((global.SNAuth.user && (SNAuth.user.id || SNAuth.user.email)) || '').slice(0, 12);
    } catch (_) {}
    void startCall(null, {
      force: true,
      instant: true,
      open: true,
      audioOnly: true,
      room: 'u-' + (uid || Math.random().toString(36).slice(2, 8)),
      label: to.name,
      reason: 'ribbon call',
    });
  }

  function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!/^(call|video|webrtc|rtc|phone)\b/.test(low)) return false;
    if (/hang|end|stop/.test(low)) {
      hangup();
      return true;
    }
    if (/camera\s*off|cam\s*off|video\s*off/.test(low)) {
      if (state.camOn) toggleCam();
      return true;
    }
    if (/camera\s*on|cam\s*on|video\s*on/.test(low)) {
      if (!state.camOn) toggleCam();
      return true;
    }
    if (/answer|accept|pick up/.test(low)) {
      void acceptIncoming();
      return true;
    }
    if (/decline|reject/.test(low)) {
      declineIncoming();
      return true;
    }
    if (/test|force|demo/.test(low)) {
      void startCall({ id: 'demo-call', offLimits: true, phase: 'disputed' }, { force: true });
      return true;
    }
    // open dialer or instant
    if (/instant|now|start|open/.test(low) || low === 'call' || low === 'video' || low === 'video call') {
      if (/video/.test(low) && !/audio/.test(low)) {
        var signedV = !!(global.SNAuth && SNAuth.user);
        if (!signedV) {
          openFromRibbon();
          return true;
        }
        void startCall(null, { force: true, instant: true, audioOnly: false, label: 'Video', open: true });
        return true;
      }
      openFromRibbon();
      return true;
    }
    var place = String(raw || '')
      .replace(/^(call|video|webrtc|rtc|phone)\s+/i, '')
      .replace(/\b(to|in|at)\s+/i, '')
      .trim();
    if (place) {
      void (async function () {
        var peer = null;
        try {
          if (global.SNStage && SNStage.call) peer = await SNStage.call(null, { place: place, label: place });
        } catch (_) {}
        var signedP = !!(global.SNAuth && SNAuth.user);
        if (!signedP) {
          openFromRibbon();
          return;
        }
        void startCall(null, {
          force: true,
          instant: true,
          audioOnly: !/video/.test(low),
          label: place,
          room: 'p-' + String(place).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12),
        });
      })();
      return true;
    }
    openFromRibbon();
    return true;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snRtcHook) return;
      SNCli._snRtcHook = true;
      var prev = SNCli.run.bind(SNCli);
      SNCli.run = function (raw) {
        try {
          if (handleLine(raw)) return Promise.resolve(true);
        } catch (_) {}
        return prev(raw);
      };
    } catch (_) {}
  }

  function init() {
    state.ready = true;
    ensureCss();
    installCli();
    bus();
    void netBus();
    setTimeout(installCli, 1500);
  }

  global.SNWebRTC = {
    build: BUILD,
    init: init,
    startCall: startCall,
    startInstant: startInstant,
    hangup: hangup,
    canCall: canCall,
    handleLine: handleLine,
    open: openFromRibbon,
    openFromRibbon: openFromRibbon,
    toggleCam: toggleCam,
    toggleMic: toggleMic,
    accept: acceptIncoming,
    decline: declineIncoming,
    get inCall() {
      return state.inCall;
    },
    get ready() {
      return state.ready;
    },
    get pending() {
      return !!state.pending;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 120);
    });
  } else {
    setTimeout(init, 120);
  }
})(typeof window !== 'undefined' ? window : globalThis);
