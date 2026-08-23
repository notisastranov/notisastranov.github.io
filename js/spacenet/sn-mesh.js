/**
 * SNMeshNet — apocalypse-ready multi-path mesh
 * Paths: local BroadcastChannel | WebRTC data P2P | server relay | offline queue
 * CLI: mesh · mesh status · mesh on/off · mesh join <code> · mesh invite · mesh peers
 *      mesh say <text> · apocalypse on · events
 * Build: 20260812160000-apocalypse-mesh
 */
(function (global) {
  'use strict';
  var BUILD = '20260812160000-apocalypse-mesh';
  if (global.__SN_MESH_NET === BUILD) return;
  global.__SN_MESH_NET = BUILD;

  var ROOM_KEY = 'sn:mesh-room-v1';
  var QUEUE_KEY = 'sn:mesh-outbox-v1';
  var MODE_KEY = 'sn:mesh-mode-v1';
  var BUS = 'astranov-mesh-v1';
  var ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  var S = {
    ready: false,
    enabled: true,
    mode: 'hybrid',
    room: '',
    nodeId: '',
    peers: Object.create(null),
    bc: null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    outbox: [],
  };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 260), c || 'ok');
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 90));
    } catch (_) {}
  }

  function nodeId() {
    try {
      if (global.SNEvent && SNEvent.nodeId) return SNEvent.nodeId();
    } catch (_) {}
    try {
      var id = localStorage.getItem('sn:node-id');
      if (id) return id;
      id = 'node-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('sn:node-id', id);
      return id;
    } catch (_) {
      return 'node-x';
    }
  }

  function loadState() {
    S.nodeId = nodeId();
    try {
      S.room = localStorage.getItem(ROOM_KEY) || 'spacenet-global';
    } catch (_) {
      S.room = 'spacenet-global';
    }
    try {
      S.mode = localStorage.getItem(MODE_KEY) || 'hybrid';
    } catch (_) {
      S.mode = 'hybrid';
    }
    try {
      var q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      S.outbox = Array.isArray(q) ? q.slice(-80) : [];
    } catch (_) {
      S.outbox = [];
    }
  }

  function saveQueue() {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(S.outbox.slice(-80)));
    } catch (_) {}
  }

  function envelope(kind, payload) {
    return {
      v: 1,
      kind: kind,
      room: S.room,
      from: S.nodeId,
      t: Date.now(),
      payload: payload,
    };
  }

  function setupBC() {
    try {
      if (typeof BroadcastChannel === 'undefined') return;
      S.bc = new BroadcastChannel(BUS + ':' + S.room);
      S.bc.onmessage = function (ev) {
        handleIncoming(ev.data, 'local');
      };
    } catch (_) {}
  }

  function sendLocal(msg) {
    try {
      if (S.bc) S.bc.postMessage(msg);
    } catch (_) {}
  }

  function ensurePeer(peerId, polite) {
    if (S.peers[peerId] && S.peers[peerId].pc) return S.peers[peerId];
    var pc = new RTCPeerConnection({ iceServers: ICE });
    var entry = { pc: pc, dc: null, label: peerId, lastSeen: Date.now(), polite: !!polite };
    S.peers[peerId] = entry;
    pc.onicecandidate = function (e) {
      if (e.candidate) {
        signalRelay({ type: 'ice', to: peerId, from: S.nodeId, candidate: e.candidate });
      }
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        try {
          pc.close();
        } catch (_) {}
        delete S.peers[peerId];
      }
    };
    pc.ondatachannel = function (ev) {
      wireDC(peerId, ev.channel);
    };
    if (!polite) {
      var dc = pc.createDataChannel('sn-mesh', { ordered: true });
      wireDC(peerId, dc);
    }
    return entry;
  }

  function wireDC(peerId, dc) {
    var entry = S.peers[peerId];
    if (!entry) return;
    entry.dc = dc;
    dc.onopen = function () {
      entry.lastSeen = Date.now();
      log('Mesh P2P · linked · ' + peerId.slice(0, 12), 'ok');
      flushOutbox();
      try {
        if (global.SNEvent && SNEvent.selfPLI) SNEvent.selfPLI(null, { via: 'mesh' });
      } catch (_) {}
    };
    dc.onmessage = function (ev) {
      entry.lastSeen = Date.now();
      try {
        var data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        handleIncoming(data, 'p2p');
      } catch (_) {}
    };
  }

  async function connectPeer(peerId) {
    if (!S.enabled || peerId === S.nodeId) return;
    var entry = ensurePeer(peerId, false);
    try {
      var offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      signalRelay({
        type: 'offer',
        to: peerId,
        from: S.nodeId,
        sdp: entry.pc.localDescription,
      });
    } catch (e) {
      console.warn('[mesh] offer', e);
    }
  }

  async function onSignal(sig) {
    if (!sig || sig.from === S.nodeId) return;
    if (sig.to && sig.to !== S.nodeId) return;
    var peerId = sig.from;
    try {
      if (sig.type === 'offer') {
        var entry = ensurePeer(peerId, true);
        await entry.pc.setRemoteDescription(sig.sdp);
        var answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        signalRelay({
          type: 'answer',
          to: peerId,
          from: S.nodeId,
          sdp: entry.pc.localDescription,
        });
      } else if (sig.type === 'answer') {
        var e2 = S.peers[peerId];
        if (e2 && e2.pc) await e2.pc.setRemoteDescription(sig.sdp);
      } else if (sig.type === 'ice') {
        var e3 = S.peers[peerId] || ensurePeer(peerId, true);
        if (e3.pc && sig.candidate) {
          try {
            await e3.pc.addIceCandidate(sig.candidate);
          } catch (_) {}
        }
      } else if (sig.type === 'hello') {
        if (!S.peers[peerId]) void connectPeer(peerId);
      }
    } catch (e) {
      console.warn('[mesh] signal', e);
    }
  }

  function signalRelay(sig) {
    var msg = envelope('signal', sig);
    sendLocal(msg);
    if (S.mode !== 'mesh-only') void sendServer(msg);
  }

  async function sendServer(msg) {
    if (S.mode === 'mesh-only' || !S.online) return false;
    try {
      var cfg = global.SN_CONFIG || {};
      var base = (cfg.sbUrl || global.SB_URL || '').replace(/\/$/, '');
      if (!base) return false;
      var url = base + '/functions/v1/debug-write';
      var key = cfg.sbKey || global.SB_KEY || '';
      var res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: 'Bearer ' + key,
        },
        body: JSON.stringify({
          kind: 'mesh_relay',
          room: S.room,
          from: S.nodeId,
          msg: msg,
          at: new Date().toISOString(),
        }),
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  function sendP2P(msg) {
    var n = 0;
    Object.keys(S.peers).forEach(function (id) {
      var p = S.peers[id];
      if (p && p.dc && p.dc.readyState === 'open') {
        try {
          p.dc.send(JSON.stringify(msg));
          n++;
        } catch (_) {}
      }
    });
    return n;
  }

  function broadcast(msg) {
    if (!S.enabled) return;
    sendLocal(msg);
    var p2p = sendP2P(msg);
    if (S.mode !== 'mesh-only') {
      void sendServer(msg).then(function (ok) {
        if (!ok && p2p === 0) {
          S.outbox.push(msg);
          if (S.outbox.length > 80) S.outbox = S.outbox.slice(-80);
          saveQueue();
        }
      });
    } else if (p2p === 0) {
      S.outbox.push(msg);
      if (S.outbox.length > 80) S.outbox = S.outbox.slice(-80);
      saveQueue();
    }
  }

  function broadcastEvent(ev) {
    broadcast(envelope('event', ev));
  }

  function handleIncoming(msg, via) {
    if (!msg || msg.from === S.nodeId) return;
    if (msg.room && msg.room !== S.room) return;
    if (msg.kind === 'signal') {
      void onSignal(msg.payload);
      return;
    }
    if (msg.kind === 'event' && msg.payload) {
      try {
        if (global.SNEvent && SNEvent.ingest) SNEvent.ingest(msg.payload, { silent: false });
      } catch (_) {}
      return;
    }
    if (msg.kind === 'chat') {
      log('Mesh · ' + String(msg.from || '').slice(0, 8) + ' · ' + String(msg.payload || '').slice(0, 160), 'ok');
      return;
    }
    if (msg.kind === 'hello') {
      void onSignal({ type: 'hello', from: msg.from });
    }
  }

  function flushOutbox() {
    if (!S.outbox.length) return;
    var left = [];
    S.outbox.forEach(function (msg) {
      var n = sendP2P(msg);
      sendLocal(msg);
      if (n === 0 && !S.online) left.push(msg);
    });
    S.outbox = left;
    saveQueue();
  }

  function announce() {
    broadcast(envelope('hello', { node: S.nodeId, room: S.room, build: BUILD }));
  }

  function setRoom(code) {
    S.room = String(code || 'spacenet-global').trim().slice(0, 48) || 'spacenet-global';
    try {
      localStorage.setItem(ROOM_KEY, S.room);
    } catch (_) {}
    try {
      if (S.bc) S.bc.close();
    } catch (_) {}
    setupBC();
    announce();
    log('Mesh room · ' + S.room, 'ok');
  }

  function setMode(m) {
    m = String(m || 'hybrid').toLowerCase();
    if (m === 'mesh' || m === 'mesh-only' || m === 'apocalypse') m = 'mesh-only';
    if (m === 'server' || m === 'server-first') m = 'server-first';
    if (m !== 'mesh-only' && m !== 'server-first') m = 'hybrid';
    S.mode = m;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch (_) {}
    log('Mesh mode · ' + m, 'ok');
  }

  function status() {
    var open = 0;
    Object.keys(S.peers).forEach(function (id) {
      if (S.peers[id].dc && S.peers[id].dc.readyState === 'open') open++;
    });
    return {
      build: BUILD,
      enabled: S.enabled,
      mode: S.mode,
      room: S.room,
      node: S.nodeId,
      online: S.online,
      peers: Object.keys(S.peers).length,
      p2pOpen: open,
      outbox: S.outbox.length,
      events: global.SNEvent ? SNEvent.active().length : 0,
    };
  }

  function say(text) {
    text = String(text || '').trim();
    if (!text) return;
    broadcast(envelope('chat', text));
    log('Mesh out · ' + text.slice(0, 120), 'dim');
  }

  function handleLine(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    if (!low) return false;
    if (low === 'mesh' || low === 'mesh status' || low === 'apocalypse' || low === 'apocalypse status') {
      var st = status();
      log(
        'Mesh · ' +
          (st.enabled ? 'ON' : 'OFF') +
          ' · ' +
          st.mode +
          ' · room ' +
          st.room +
          ' · P2P ' +
          st.p2pOpen +
          '/' +
          st.peers +
          ' · net ' +
          (st.online ? 'up' : 'DOWN') +
          ' · queue ' +
          st.outbox +
          ' · events ' +
          st.events,
        st.online || st.p2pOpen ? 'ok' : 'dim'
      );
      return true;
    }
    if (low === 'mesh on') {
      S.enabled = true;
      announce();
      log('Mesh ON', 'ok');
      return true;
    }
    if (low === 'mesh off') {
      S.enabled = false;
      log('Mesh OFF', 'dim');
      return true;
    }
    if (low === 'apocalypse on' || low === 'mesh only' || low === 'mesh-only') {
      setMode('mesh-only');
      S.enabled = true;
      announce();
      log('Apocalypse mode · mesh-only · server optional', 'ok');
      return true;
    }
    if (low === 'apocalypse off' || low === 'mesh hybrid') {
      setMode('hybrid');
      return true;
    }
    if (/^mesh room\s+/i.test(line) || /^mesh join\s+/i.test(line)) {
      setRoom(line.replace(/^mesh\s+(room|join)\s+/i, ''));
      return true;
    }
    if (low === 'mesh invite' || low === 'mesh code') {
      log('Share room code · ' + S.room + ' · peers: mesh join ' + S.room, 'ok');
      preview(S.room);
      return true;
    }
    if (low === 'mesh peers') {
      var ids = Object.keys(S.peers);
      if (!ids.length) log('No P2P peers yet · share room code', 'dim');
      ids.forEach(function (id) {
        var p = S.peers[id];
        log(
          '· ' + id.slice(0, 14) + ' · ' + (p.dc && p.dc.readyState === 'open' ? 'OPEN' : '…'),
          'dim'
        );
      });
      return true;
    }
    if (/^mesh say\s+/i.test(line) || /^mesh chat\s+/i.test(line)) {
      say(line.replace(/^mesh\s+(say|chat)\s+/i, ''));
      return true;
    }
    if (low === 'mesh flush') {
      flushOutbox();
      log('Mesh queue flushed · left ' + S.outbox.length, 'ok');
      return true;
    }
    if (low === 'events' || low === 'event list') {
      try {
        var act = global.SNEvent ? SNEvent.active() : [];
        log('Events live · ' + act.length, 'ok');
        act.slice(0, 12).forEach(function (e) {
          log(
            '· ' +
              String(e.type).slice(0, 24) +
              ' · ' +
              (e.callsign || e.uid).slice(0, 16) +
              (e.lat != null ? ' · ' + Number(e.lat).toFixed(3) + ',' + Number(e.lng).toFixed(3) : ''),
            'dim'
          );
        });
      } catch (_) {}
      return true;
    }
    return false;
  }

  function installCli() {
    if (!global.SNCli || typeof SNCli.run !== 'function') return;
    if (SNCli._snMeshNetHook) return;
    SNCli._snMeshNetHook = true;
    var prev = SNCli.run.bind(SNCli);
    SNCli.run = function (raw) {
      try {
        if (handleLine(raw)) return Promise.resolve(true);
      } catch (_) {}
      return prev(raw);
    };
  }

  function onOnline() {
    S.online = true;
    log('Net · online · mesh hybrid paths open', 'dim');
    flushOutbox();
    announce();
  }
  function onOffline() {
    S.online = false;
    log('Net · OFFLINE · mesh-only + local queue', 'dim');
  }

  function bootPLI() {
    setInterval(function () {
      if (!S.enabled || document.hidden) return;
      try {
        if (global.SNEvent && SNEvent.selfPLI) {
          SNEvent.selfPLI(global._snLastPos || null, { via: S.online ? 'hybrid' : 'mesh' });
        }
      } catch (_) {}
      announce();
    }, 28000);
  }

  function init() {
    if (S.ready) {
      installCli();
      return;
    }
    S.ready = true;
    loadState();
    setupBC();
    installCli();
    setTimeout(installCli, 800);
    setTimeout(installCli, 2500);
    try {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    } catch (_) {}
    announce();
    bootPLI();
    setTimeout(function () {
      var st = status();
      log('Mesh · apocalypse layer · ' + st.mode + ' · room ' + st.room + ' · type mesh', 'dim');
    }, 4500);
  }

  global.SNMeshNet = {
    build: BUILD,
    init: init,
    broadcast: broadcast,
    broadcastEvent: broadcastEvent,
    status: status,
    setRoom: setRoom,
    setMode: setMode,
    say: say,
    handleLine: handleLine,
    connectPeer: connectPeer,
    get room() {
      return S.room;
    },
    get mode() {
      return S.mode;
    },
    get enabled() {
      return S.enabled;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 80);
    });
  } else setTimeout(init, 80);
  setTimeout(init, 1600);
})(typeof window !== 'undefined' ? window : globalThis);
