// === ASTRANOV LOGO — top-center reset + live mic/AI waveform ===
const AstranovLogo = {
  _bound: false,
  _canvas: null,
  _ctx: null,
  _raf: 0,
  _micAnalyser: null,
  _aiAnalyser: null,
  _micCtx: null,
  _micStream: null,
  _aiSynth: 0,
  _bars: 24,

  init() {
    const el = document.getElementById('astranov-logo');
    if (!el || this._bound) return;
    this._bound = true;
    this._mountWave(el);
    el.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      this.hardReset();
    });
    this._loop();
  },

  _mountWave(el) {
    let canvas = document.getElementById('astranov-logo-wave');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'astranov-logo-wave';
      canvas.setAttribute('aria-hidden', 'true');
      const label = el.querySelector('.astranov-logo-label');
      if (label) el.insertBefore(canvas, label);
      else el.appendChild(canvas);
    }
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  },

  _resize() {
    if (!this._canvas) return;
    const r = this._canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._canvas.width = Math.max(120, Math.floor(r.width * dpr));
    this._canvas.height = Math.max(28, Math.floor(r.height * dpr));
  },

  async ensureMicAnalyser() {
    if (this._micAnalyser) return this._micAnalyser;
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._micCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this._micCtx.createMediaStreamSource(this._micStream);
      const an = this._micCtx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.72;
      src.connect(an);
      this._micAnalyser = an;
      return an;
    } catch (_) {
      return null;
    }
  },

  setMicActive(on) {
    const el = document.getElementById('astranov-logo');
    if (!el) return;
    if (on) {
      el.classList.add('voice-mic');
      void this.ensureMicAnalyser();
    } else {
      el.classList.remove('voice-mic');
    }
  },

  setAiActive(on) {
    const el = document.getElementById('astranov-logo');
    if (!el) return;
    el.classList.toggle('voice-ai', !!on);
    if (on) this._aiSynth = performance.now();
    else this._aiAnalyser = null;
  },

  hookAiAudio(audioEl) {
    if (!audioEl) return;
    try {
      const ctx = this._micCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (!this._micCtx) this._micCtx = ctx;
      const src = ctx.createMediaElementSource(audioEl);
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.68;
      src.connect(an);
      an.connect(ctx.destination);
      this._aiAnalyser = an;
    } catch (_) {}
  },

  _readBars(analyser, fallback) {
    const out = new Array(this._bars).fill(0);
    if (analyser) {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const step = Math.max(1, Math.floor(buf.length / this._bars));
      for (let i = 0; i < this._bars; i++) {
        let v = 0;
        for (let j = 0; j < step; j++) v = Math.max(v, buf[i * step + j] || 0);
        out[i] = v / 255;
      }
      return out;
    }
    const t = performance.now() * 0.006;
    for (let i = 0; i < this._bars; i++) {
      out[i] = fallback * (0.35 + 0.65 * Math.abs(Math.sin(t + i * 0.55)));
    }
    return out;
  },

  _drawBars(bars, color, x0, width, barCount) {
    const ctx = this._ctx;
    const c = this._canvas;
    if (!ctx || !c || !width) return;
    const h = c.height;
    const n = barCount || bars.length;
    const gap = width / n;
    const mid = h * 0.5;
    for (let i = 0; i < n; i++) {
      const amp = Math.max(0.06, bars[i] || 0);
      const bh = amp * h * 0.88;
      const x = x0 + i * gap + gap * 0.15;
      const bw = gap * 0.7;
      const grad = ctx.createLinearGradient(0, mid - bh, 0, mid + bh);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color.replace('0.95)', '0.35)').replace('0.92)', '0.35)'));
      ctx.fillStyle = grad;
      ctx.fillRect(x, mid - bh * 0.5, bw, bh);
    }
  },

  _draw(bars, color) {
    const c = this._canvas;
    if (!this._ctx || !c) return;
    this._ctx.clearRect(0, 0, c.width, c.height);
    this._drawBars(bars, color, 0, c.width, bars.length);
  },

  _drawDual(micBars, aiBars) {
    const c = this._canvas;
    if (!this._ctx || !c) return;
    this._ctx.clearRect(0, 0, c.width, c.height);
    const half = Math.floor(this._bars / 2);
    this._drawBars(micBars, 'rgba(255,55,55,0.95)', 0, c.width * 0.5, half);
    this._drawBars(aiBars, 'rgba(0,230,110,0.95)', c.width * 0.5, c.width * 0.5, this._bars - half);
  },

  _loop() {
    const el = document.getElementById('astranov-logo');
    const micOn = isListening || window._handsFreeVoice;
    const aiOn = !!Voice?.speaking;
    if (micOn) this.setMicActive(true);
    else this.setMicActive(false);
    this.setAiActive(aiOn);

    if (micOn && aiOn) {
      const micBars = this._readBars(this._micAnalyser, 0.2);
      const aiBars = this._readBars(this._aiAnalyser, 0.55);
      this._drawDual(micBars, aiBars);
      if (el) el.classList.add('voice-mic', 'voice-ai');
    } else if (aiOn) {
      this._draw(this._readBars(this._aiAnalyser, 0.5 + 0.2 * Math.sin(performance.now() * 0.01)), 'rgba(0,230,110,0.95)');
    } else if (micOn) {
      this._draw(this._readBars(this._micAnalyser, 0.25 + 0.15 * Math.sin(performance.now() * 0.012)), 'rgba(255,60,60,0.95)');
    } else if (this._ctx && this._canvas) {
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    this._raf = requestAnimationFrame(() => this._loop());
  },

  resetToGlobalView() {
    userIntervene?.();
    GlobeControl?.userTookGlobe?.('silent');
    window.DrivingView?.deactivate?.();
    SuperSpace?.stop?.();
    GlobeVideo?.stop?.();
    GlobeVideo?.hide?.();
    window.SuperAdd?.stop?.();
    GlobeEntity?.clearSelection?.();
    GlobeDeck?.collapse?.();
    GlobeDeck?.hideStage?.();
    GlobeDeck?.setPreview?.('ASTRANOV — global earth · tap 🎯 Locate');
    window._globeFly = null;
    window._cityDropLock = false;
    if (typeof globePivot !== 'undefined' && globePivot) {
      globePivot.rotation.y = 0;
      globePivot.rotation.x = 0.12;
      globePivot.quaternion.setFromEuler(globePivot.rotation, 'YXZ');
    }
    if (typeof camera !== 'undefined' && camera) {
      camera.position.z = ZoomTiers?.tierZ?.('global') || 2.55;
      camera.lookAt(0, 0, 0);
    }
    ZoomTiers?.goTo?.('global', true);
    CityMap?._exit?.();
    CosmicZoom?.update?.(2.55, { tier: 'global', label: 'Earth', cosmic: 'earth' });
    cityLevel = false;
    const zl = document.getElementById('zoom-label');
    if (zl && !window.DrivingView?.active) {
      zl.textContent = PublicCopy?.zoomLine?.('global') || 'Earth · 🎯 for your city';
    }
    const chip = document.getElementById('city-life-chip');
    if (chip) chip.classList.remove('open');
  },

  async hardReset() {
    const el = document.getElementById('astranov-logo');
    if (el?._resetting) return;
    const label = el?.querySelector('.astranov-logo-label');
    if (el) {
      el._resetting = true;
      el.disabled = true;
      if (label) label.textContent = '…';
    }
    this.resetToGlobalView();
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (_) { /* best-effort */ }
    const url = new URL(location.href);
    url.searchParams.set('v', String(Date.now()));
    url.hash = '';
    location.replace(url.toString());
  },
};
window.AstranovLogo = AstranovLogo;
