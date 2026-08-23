// === PMR RADIO — REAL AUDIO ONLY (no simulation) ===
// Browser cannot transmit 446.13125 MHz RF. Real: mic PTT + WebRTC voice mesh.
// Physical PMR446 Ch11: tune YOUR handheld — app shows exact frequency.
const PmrRadio = {
  open: false,
  channel: 11,
  freqMHz: 446.13125,
  callsign: 'ASTRANOV-AXAS',
  peerId: null,
  micStream: null,
  audioCtx: null,
  micGain: null,
  analyser: null,
  pttDown: false,
  pc: null,
  remoteAudio: null,
  rtChannel: null,
  peerCount: 0,
  micReady: false,
  channelLive: false,
  vuAnim: null,

  async show() {
    this.open = true;
    GlobeDeck?.showStage('sat-radio', 'radio');
    this.setFreqUI();
    this.setStep(1, 'active', 'Tap Enable Mic — browser will ask permission');
    const up = window._lastPos || { lat: 36.22, lng: 28.12 };
    MapDepict.action('vhf', { lat: up.lat, lng: up.lng, detail: 'EU PMR 11 · setup' });
    ACIControl.reply('PMR Ch11 446.13125 MHz — follow the 3 steps below. No simulation.');
  },

  hide() {
    this.open = false;
    this.pttDown = false;
    document.getElementById('sat-radio')?.classList.remove('open', 'deck-active');
    if (GlobeDeck?.activeTask === 'radio') GlobeDeck?.completeTask('radio');
    if (this.vuAnim) cancelAnimationFrame(this.vuAnim);
    this.teardown();
    if (Comms) Comms.vhfActive = false;
  },

  setFreqUI() {
    const ch = document.querySelector('.sr-ch');
    const fq = document.querySelector('.sr-freq');
    if (ch) ch.textContent = 'EU PMR Ch ' + this.channel;
    if (fq) fq.textContent = this.freqMHz + ' MHz';
  },

  setStep(n, state, msg) {
    const el = document.getElementById('sr-step-' + n);
    if (!el) return;
    el.className = 'sr-step sr-' + state;
    el.querySelector('.sr-step-msg').textContent = msg;
  },

  setStatus(line) {
    const el = document.getElementById('sr-status');
    if (el) el.textContent = line;
    ACIControl?.reply(line.slice(0, 220));
  },

  async enableMic() {
    this.setStep(1, 'active', 'Requesting microphone…');
    try {
      this.teardownMic();
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      this.micStream.getAudioTracks().forEach(t => { t.enabled = false; });
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.micGain = this.audioCtx.createGain();
      this.micGain.gain.value = 0;
      src.connect(this.analyser);
      src.connect(this.micGain);
      this.micReady = true;
      this.setStep(1, 'done', 'Microphone ON — hold PTT to test level meter');
      this.setStep(2, 'active', 'Tap Join Channel for live WebRTC voice');
      this.startVuMeter();
      this.setStatus('Mic ready. Hold PTT — meter must move when you speak.');
    } catch (err) {
      this.setStep(1, 'blocked', 'Mic blocked: ' + (err.message || 'denied') + ' — allow mic in browser settings');
      this.setStatus('Cannot continue without microphone permission.');
    }
  },

  startVuMeter() {
    const bar = document.getElementById('sr-vu');
    if (!bar || !this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.open) return;
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = Math.min(100, Math.round((sum / data.length) * 1.2));
      bar.style.width = level + '%';
      bar.style.opacity = this.pttDown ? '1' : '0.5';
      this.vuAnim = requestAnimationFrame(tick);
    };
    tick();
  },

  async joinChannel() {
    if (!this.micReady) {
      this.setStatus('Step 1 first: Enable Mic.');
      return;
    }
    this.setStep(2, 'active', 'Joining voice channel pmr-ch11…');
    const sbUrl = typeof resolveAstranovSupabaseClientUrl === 'function' ? resolveAstranovSupabaseClientUrl() : SB_URL;
    const sb = typeof supabase !== 'undefined' ? supabase.createClient(sbUrl, SB_KEY) : null;
    if (!sb) {
      this.setStep(2, 'blocked', 'Supabase unavailable — cannot open live voice channel');
      return;
    }
    this.peerId = 'pmr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const chName = 'pmr-voice-ch11-44613125';
    this.rtChannel = sb.channel(chName, { config: { broadcast: { ack: true, self: false } } });
    this.rtChannel.on('broadcast', { event: 'sig' }, ({ payload }) => this.onSignal(payload));
    await this.rtChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.channelLive = true;
        this.setStep(2, 'done', 'Channel LIVE — open astranov.eu on another device & join too');
        this.setStep(3, 'active', 'Hold PTT: real voice TX · release: RX listen');
        this.setStatus('Channel live. Peers: 0. Hold PTT and speak — VU meter must peak.');
        this.setupPeer();
        this.rtChannel.send({ type: 'broadcast', event: 'sig', payload: { type: 'hello', from: this.peerId } });
      }
    });
  },

  setupPeer() {
    if (this.pc) { this.pc.close(); this.pc = null; }
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    });
    this.pc.ontrack = (ev) => {
      if (!this.remoteAudio) {
        this.remoteAudio = document.createElement('audio');
        this.remoteAudio.autoplay = true;
        this.remoteAudio.id = 'pmr-remote-audio';
        document.body.appendChild(this.remoteAudio);
      }
      this.remoteAudio.srcObject = ev.streams[0];
      this.setStatus('RX: receiving real audio from peer');
      MapDepict.action('vhf', { detail: 'RX peer audio' });
    };
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.broadcast({ type: 'ice', from: this.peerId, candidate: ev.candidate });
    };
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc?.iceConnectionState;
      if (s === 'connected') this.setStatus('WebRTC connected — real two-way voice active');
      if (s === 'failed' || s === 'disconnected') this.setStatus('WebRTC ' + s + ' — tap Join Channel again');
    };
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => this.pc.addTrack(t, this.micStream));
    }
  },

  broadcast(payload) {
    this.rtChannel?.send({ type: 'broadcast', event: 'sig', payload });
  },

  async onSignal(payload) {
    if (!payload || payload.from === this.peerId) return;
    if (payload.type === 'hello') {
      this.peerCount++;
      document.getElementById('sr-peers').textContent = String(this.peerCount);
      if (this.pc.signalingState === 'stable') {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.broadcast({ type: 'offer', from: this.peerId, sdp: offer });
      }
    }
    if (payload.type === 'offer' && payload.sdp) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.broadcast({ type: 'answer', from: this.peerId, sdp: answer });
    }
    if (payload.type === 'answer' && payload.sdp) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    }
    if (payload.type === 'ice' && payload.candidate) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (_) {}
    }
  },

  pttPress() {
    if (!this.micReady) {
      this.setStatus('Enable Mic first (step 1).');
      return;
    }
    this.pttDown = true;
    this.micStream?.getAudioTracks().forEach(t => { t.enabled = true; });
    if (this.micGain) this.micGain.gain.value = 1;
    document.getElementById('sr-ptt')?.classList.add('active');
    this.setStatus(this.channelLive ? 'TX LIVE — mic open on WebRTC channel' : 'TX local test — VU must move; step 2 for peers');
    MapDepict.action('vhf', { detail: 'PTT TX live' });
  },

  pttRelease() {
    this.pttDown = false;
    this.micStream?.getAudioTracks().forEach(t => { t.enabled = false; });
    if (this.micGain) this.micGain.gain.value = 0;
    document.getElementById('sr-ptt')?.classList.remove('active');
    this.setStatus(this.channelLive ? 'RX — mic muted, listening for peers' : 'Standby — mic muted');
  },

  teardownMic() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    this.micReady = false;
  },

  teardown() {
    this.teardownMic();
    if (this.pc) { this.pc.close(); this.pc = null; }
    if (this.rtChannel) { this.rtChannel.unsubscribe(); this.rtChannel = null; }
    if (this.remoteAudio) { this.remoteAudio.remove(); this.remoteAudio = null; }
    this.channelLive = false;
    this.peerCount = 0;
  },

  bindUI() {
    document.getElementById('sr-mic-btn')?.addEventListener('click', () => this.enableMic());
    document.getElementById('sr-join-btn')?.addEventListener('click', () => this.joinChannel());
    const ptt = document.getElementById('sr-ptt');
    if (ptt) {
      const down = (e) => { e.preventDefault(); this.pttPress(); };
      const up = () => this.pttRelease();
      ptt.addEventListener('mousedown', down);
      ptt.addEventListener('touchstart', down, { passive: false });
      ptt.addEventListener('mouseup', up);
      ptt.addEventListener('mouseleave', up);
      ptt.addEventListener('touchend', up);
    }
    document.getElementById('sr-close')?.addEventListener('click', () => this.hide());
  }
};

window.PmrRadio = PmrRadio;
window.SatRadio = PmrRadio;
