// === ASTRANOV AI GRAPHICS ENGINE — WebGL gaming procedural layer (shader + particles) ===
const AIGraphics = {
  atmosphere: null,
  clouds: null,
  cityLights: null,
  idleNodes: null,
  neuralLayer: null,
  activeEffects: [],
  batchGroup: null,
  batchRing: null,
  batchNodes: null,
  superBatchActive: false,
  shellDim: false,
  voicePerf: false,
  thinkPulse: false,
  _frameSkip: 0,
  _parent: null,
  _hudCanvas: null,
  _hudCtx: null,
  _hudRaf: 0,
  _seed: (Date.now() % 9973) / 9973,
  _paths: [],
  _flyer: null,
  _flyerFrame: 0,
  _flyerFlying: false,

  init(parent, earthRadius = 1) {
    if (this._inited) return;
    this._inited = true;
    this._parent = parent || globePivot;
    const tier = SlumberManager?.tier || 'balanced';
    const lite = tier === 'conserve' || tier === 'slumber';
    this.addAtmosphere(this._parent, earthRadius);
    if (!lite) this.addClouds(this._parent, earthRadius);
    this.addCityLights(this._parent, earthRadius, lite ? 900 : 2200);
    this.addIdleAIEffects(this._parent, earthRadius, lite ? 40 : 80);
    this.addNeuralField(this._parent, earthRadius);
    this._mountGamingHud();
    if (SlumberManager?.quality?.gamingGraphics && !this._gamingLight) {
      this._gamingLight = new THREE.PointLight(0x00e8ff, 1.4, 4.5);
      this._gamingLight.position.set(0.3, 0.5, 1.2);
      scene.add(this._gamingLight);
    }
    console.log('%c[Astranov AI Graphics] Gaming shader pipeline live', 'color:#00ddff;font-weight:700');
    window._aiGraphicsReady = true;
  },

  _isGaming() {
    // Prefer high-end helper art unless device is in deep conserve
    if (SlumberManager?.tier === 'slumber' || SlumberManager?.tier === 'conserve') return false;
    return true;
  },

  _gamingVert() {
    return [
      'varying vec3 vN;',
      'varying vec3 vV;',
      'varying vec3 vW;',
      'void main(){',
      '  vN = normalize(normalMatrix * normal);',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vV = -mv.xyz;',
      '  vW = (modelMatrix * vec4(position, 1.0)).xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n');
  },

  _gamingFrag() {
    return [
      'uniform vec3 uColor;',
      'uniform vec3 uEmit;',
      'uniform float uPulse;',
      'uniform float uRim;',
      'uniform float uAlpha;',
      'uniform float uMetal;',
      'varying vec3 vN;',
      'varying vec3 vV;',
      'varying vec3 vW;',
      'void main(){',
      '  vec3 n = normalize(vN);',
      '  vec3 v = normalize(vV);',
      '  float ndv = max(dot(n, v), 0.0);',
      '  float rim = pow(1.0 - ndv, 2.8) * uRim;',
      '  float pulse = 0.78 + 0.22 * sin(uPulse * 1.7 + vW.y * 40.0);',
      '  float fres = pow(1.0 - ndv, 3.4);',
      '  vec3 base = uColor * (0.35 + uMetal * 0.4);',
      '  vec3 emit = uEmit * pulse * (0.55 + fres * 0.9);',
      '  vec3 rimCol = mix(vec3(0.2, 0.85, 1.0), uEmit, 0.45) * rim;',
      '  vec3 col = base + emit + rimCol;',
      '  // Hot core flecks',
      '  float fleck = pow(max(sin(vW.x * 90.0 + uPulse) * sin(vW.z * 70.0), 0.0), 8.0) * 0.35;',
      '  col += uEmit * fleck;',
      '  gl_FragColor = vec4(col, uAlpha);',
      '}',
    ].join('\n');
  },

  _gamingMat(opts = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color || 0x1a2838) },
        uEmit: { value: new THREE.Color(opts.emissive || 0x00c8ff) },
        uPulse: { value: 0 },
        uRim: { value: opts.rim ?? 1.55 },
        uAlpha: { value: opts.opacity ?? 1 },
        uMetal: { value: opts.metal ?? 0.55 },
      },
      vertexShader: this._gamingVert(),
      fragmentShader: this._gamingFrag(),
      transparent: !!opts.transparent || (opts.opacity != null && opts.opacity < 1),
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: opts.additive ? false : (opts.depthWrite !== false),
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    mat.userData._gaming = true;
    return mat;
  },

  _pulseGamingMats(root, t) {
    root.traverse((o) => {
      const u = o.material?.uniforms;
      if (u?.uPulse) u.uPulse.value = t;
    });
  },

  _createJetVfx(group, side) {
    const COUNT = this._isGaming() ? 110 : 56;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: this._isGaming() ? 0.028 : 0.016,
      color: side < 0 ? 0x00f0ff : 0x66ccff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    return { points: pts, positions: pos, count: COUNT, head: 0, side };
  },

  _emitJet(vfx, origin, dir, power) {
    if (!vfx?.positions || !origin) return;
    const i = vfx.head % vfx.count;
    vfx.head++;
    const idx = i * 3;
    vfx.positions[idx] = origin.x;
    vfx.positions[idx + 1] = origin.y;
    vfx.positions[idx + 2] = origin.z;
    vfx.points.geometry.attributes.position.needsUpdate = true;
    if (!vfx.vel) vfx.vel = [];
    vfx.vel[i] = {
      x: (dir?.x || 0) * power + (Math.random() - 0.5) * 0.002,
      y: (dir?.y || -0.01) * power + (Math.random() - 0.5) * 0.002,
      z: (dir?.z || 0) * power + (Math.random() - 0.5) * 0.002,
      life: 28 + Math.floor(Math.random() * 18),
    };
  },

  _tickJetVfx(vfx, flying) {
    if (!vfx?.vel || !vfx.positions) return;
    const decay = flying ? 0.96 : 0.92;
    for (let i = 0; i < vfx.count; i++) {
      const v = vfx.vel[i];
      if (!v || v.life <= 0) continue;
      const idx = i * 3;
      vfx.positions[idx] += v.x;
      vfx.positions[idx + 1] += v.y;
      vfx.positions[idx + 2] += v.z;
      v.x *= decay; v.y *= decay; v.z *= decay;
      v.life--;
    }
    vfx.points.geometry.attributes.position.needsUpdate = true;
  },

  _latLngToPos(lat, lng, r = 1) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return {
      x: -(r * Math.sin(phi) * Math.cos(theta)),
      y: r * Math.cos(phi),
      z: r * Math.sin(phi) * Math.sin(theta),
    };
  },

  _procCanvas(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { alpha: true });
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return { canvas: c, tex, ctx };
  },

  setThinkPulse(on) {
    this.thinkPulse = !!on;
    if (this.neuralLayer) this.neuralLayer.visible = !!on || this.superBatchActive;
    if (this._hudCanvas) this._hudCanvas.style.opacity = on ? '0.5' : (this.superBatchActive ? '0.35' : '0');
  },

  showNeural(on) {
    if (this.neuralLayer) this.neuralLayer.visible = !!on;
  },

  addAtmosphere(parent, r) {
    // Remove boot-atmosphere duplicate if present
    try {
      const kids = parent && parent.children ? parent.children.slice() : [];
      kids.forEach((c) => {
        if (c.userData?.type === 'boot-atmosphere') parent.remove(c);
      });
    } catch (_) { /* */ }
    const segs = SlumberManager?.tier === 'full' || SlumberManager?.tier === 'gaming' ? 64 : 48;
    // Outer glow shell
    const geo = new THREE.SphereGeometry(r * 1.045, segs, segs);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x3aa8ff) },
        uPower: { value: 3.2 },
        uIntensity: { value: 0.55 },
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'void main(){',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  vView = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform float uPower;',
        'uniform float uIntensity;',
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'void main(){',
        '  float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), uPower);',
        '  float a = fres * uIntensity;',
        '  gl_FragColor = vec4(uColor, a);',
        '}',
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(geo, mat);
    parent.add(this.atmosphere);
    // Thin bright rim
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.012, segs, segs),
      new THREE.MeshBasicMaterial({
        color: 0x66ccff,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        depthWrite: false,
      })
    );
    this._atmoRim = rim;
    parent.add(rim);
  },

  addClouds(parent, r) {
    const { tex } = this._procCanvas(1024, 512, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < 70; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const rw = 20 + Math.random() * 60;
          ctx.globalAlpha = 0.04 + Math.random() * 0.08;
          ctx.beginPath();
          ctx.ellipse(x, y, rw, rw * 0.45, Math.random() * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    });
    const geo = new THREE.SphereGeometry(r * 1.008, 40, 40);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.clouds = new THREE.Mesh(geo, mat);
    parent.add(this.clouds);
  },

  addCityLights(parent, r, count = 2200) {
    const pos = [];
    const cols = [];
    for (let i = 0; i < count; i++) {
      const lat = Math.random() * 170 - 85;
      const popFactor = Math.sin(lat * 0.025) * 0.6 + 0.4;
      if (Math.random() < popFactor * 0.85) {
        const lng = Math.random() * 360 - 180;
        const p = this._latLngToPos(lat, lng, r * 1.003);
        pos.push(p.x, p.y, p.z);
        const warm = Math.random() > 0.4;
        cols.push(warm ? 1 : 0.6, warm ? 0.85 : 0.95, warm ? 0.5 : 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.007,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.cityLights = new THREE.Points(geo, mat);
    parent.add(this.cityLights);
  },

  addIdleAIEffects(parent, r, count = 80) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const lat = Math.sin(angle) * 35;
      const lng = (i * 4.5) % 360;
      const p = this._latLngToPos(lat, lng, r * 1.04);
      positions.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.004,
      color: 0x00ddff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.idleNodes = new THREE.Points(geo, mat);
    parent.add(this.idleNodes);
  },

  addNeuralField(parent, r) {
    const pack = this._procCanvas(512, 256, (ctx, w, h) => {
      this._paintNeural(ctx, w, h, 0);
    });
    this._neuralPack = pack;
    const geo = new THREE.SphereGeometry(r * 1.012, 36, 36);
    const mat = new THREE.MeshBasicMaterial({
      map: pack.tex,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.neuralLayer = new THREE.Mesh(geo, mat);
    this.neuralLayer.visible = false;
    parent.add(this.neuralLayer);
  },

  _paintNeural(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(0,30,60,0)');
    g.addColorStop(0.5, 'rgba(0,180,255,0.12)');
    g.addColorStop(1, 'rgba(0,255,140,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 48; i++) {
      const x = (i / 48) * w;
      const y = h * 0.5 + Math.sin(t * 0.04 + i * 0.55 + this._seed * 12) * h * 0.22;
      ctx.strokeStyle = `rgba(0,${180 + (i % 3) * 20},255,${0.15 + (i % 5) * 0.04})`;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 1; j <= 6; j++) {
        ctx.lineTo(x + j * (w / 48) * 0.15, y + Math.sin(t * 0.03 + i + j) * 8);
      }
      ctx.stroke();
    }
    for (let n = 0; n < 120; n++) {
      const nx = (Math.sin(n * 0.91 + t * 0.02) * 0.5 + 0.5) * w;
      const ny = (Math.cos(n * 0.73 + t * 0.015) * 0.5 + 0.5) * h;
      ctx.fillStyle = n % 7 === 0 ? 'rgba(0,255,120,0.55)' : 'rgba(0,200,255,0.35)';
      ctx.fillRect(nx, ny, 2, 2);
    }
  },

  _mountGamingHud() {
    const globe = document.getElementById('globe');
    if (!globe || this._hudCanvas) return;
    const c = document.createElement('canvas');
    c.id = 'ai-gaming-hud';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;opacity:0;transition:opacity 0.35s ease;mix-blend-mode:screen';
    globe.appendChild(c);
    this._hudCanvas = c;
    this._hudCtx = c.getContext('2d');
    const resize = () => {
      const r = globe.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.max(1, Math.floor(r.width * dpr));
      c.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);
    this._hudLoop();
  },

  _hudLoop() {
    const ctx = this._hudCtx;
    const c = this._hudCanvas;
    if (ctx && c) {
      const on = this.thinkPulse || this.superBatchActive || Voice?.speaking;
      c.style.opacity = on ? '0.42' : '0';
      if (on) {
        const t = performance.now() * 0.001;
        const w = c.width;
        const h = c.height;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(0,200,255,0.08)';
        for (let y = 0; y < h; y += 4) {
          ctx.beginPath();
          ctx.moveTo(0, y + Math.sin(t * 2 + y * 0.02) * 0.5);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        const cx = w * 0.5;
        const cy = h * 0.42;
        for (let i = 0; i < 5; i++) {
          const r = (Math.sin(t * 1.8 + i) * 0.5 + 0.5) * Math.min(w, h) * 0.12 + 20;
          ctx.strokeStyle = `rgba(0,${220 - i * 30},${140 + i * 20},${0.12 - i * 0.015})`;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.clearRect(0, 0, c.width, c.height);
      }
    }
    this._hudRaf = requestAnimationFrame(() => this._hudLoop());
  },

  spawnEffect(originPos, color = 0x00ffcc, count = 25, life = 45) {
    if (!originPos || !scene) return;
    if (this.voicePerf) {
      count = Math.min(count, 8);
      life = Math.min(life, 24);
    }
    const maxFx = SlumberManager?.tier === 'slumber' ? 8 : 24;
    while (this.activeEffects.length > maxFx) {
      const eff = this.activeEffects.shift();
      if (eff?.points) {
        scene.remove(eff.points);
        eff.points.geometry?.dispose?.();
        eff.points.material?.dispose?.();
      }
    }
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] = originPos.x + (Math.random() - 0.5) * 0.04;
      positions[idx + 1] = originPos.y + (Math.random() - 0.5) * 0.04;
      positions[idx + 2] = originPos.z + (Math.random() - 0.5) * 0.04;
      vel.push(
        (Math.random() - 0.5) * 0.0035,
        (Math.random() - 0.5) * 0.0035,
        (Math.random() - 0.5) * 0.0035,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.018,
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    this.activeEffects.push({ points: pts, velocities: vel, life, maxLife: life });
  },

  /** 2D HUD silhouette — gaming-grade mecha angel (used by overlay only) */
  _paintAstranovCharacter(ctx, w, h, frame, opts = {}) {
    const t = frame * 0.14;
    const cx = w * 0.5;
    const cy = h * 0.44 + Math.sin(t * 0.7) * 3;
    const cyan = opts.glow || '#00f0ff';
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, w * 0.48);
    bg.addColorStop(0, 'rgba(0,80,140,0.55)');
    bg.addColorStop(0.45, 'rgba(0,30,70,0.22)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    // Energy wings
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 5; i++) {
        const flap = Math.sin(t + i * 0.4) * 14 * side;
        ctx.beginPath();
        ctx.moveTo(8 * side, -6);
        ctx.quadraticCurveTo(40 * side + flap, -40 - i * 6, 88 * side + flap * 0.4, -8 + i * 8);
        ctx.quadraticCurveTo(50 * side, 10 + i * 4, 12 * side, 8);
        ctx.closePath();
        ctx.fillStyle = `rgba(0,${200 - i * 20},255,${0.22 - i * 0.03})`;
        ctx.fill();
      }
    });
    // Body silhouette
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createLinearGradient(0, -36, 0, 40);
    body.addColorStop(0, '#e8f4ff');
    body.addColorStop(0.35, '#7a90a8');
    body.addColorStop(1, '#0a1520');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-16, -10);
    ctx.lineTo(16, -10);
    ctx.lineTo(20, 12);
    ctx.lineTo(12, 36);
    ctx.lineTo(-12, 36);
    ctx.lineTo(-20, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Core
    const core = ctx.createRadialGradient(0, 4, 1, 0, 4, 14);
    core.addColorStop(0, '#fff');
    core.addColorStop(0.4, cyan);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 4, 12, 0, Math.PI * 2);
    ctx.fill();
    // Helmet
    ctx.fillStyle = '#c8d8e8';
    ctx.beginPath();
    ctx.ellipse(0, -26, 14, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 16;
    ctx.fillStyle = cyan;
    ctx.fillRect(-12, -28, 24, 6);
    ctx.shadowBlur = 0;
    // Halo
    ctx.strokeStyle = 'rgba(0,240,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -48, 22, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  /**
   * Astranov Helper v2 — high-level gaming mecha-angel on the globe.
   * Procedural THREE.js (no external models): energy wings, articulated armor,
   * halo, core bloom, thruster jets, orbital micro-drones.
   */
  _buildProceduralHumanoid(lat, lng, opts = {}) {
    const hi = this._isGaming();
    const seg = hi ? 20 : 12;
    const g = new THREE.Group();
    const mat = (o) => this._gamingMat(o);

    // ── Root skeleton groups ──
    const hips = new THREE.Group();
    const spine = new THREE.Group();
    const chestG = new THREE.Group();
    const headG = new THREE.Group();
    spine.add(chestG);
    chestG.add(headG);
    hips.add(spine);
    g.add(hips);

    // Pelvis / hip armor
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.02, 0.018, seg),
      mat({ color: 0x121c28, emissive: 0x004466, rim: 1.3, metal: 0.7 }),
    );
    hips.add(pelvis);

    // Torso stack
    const abdomen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.017, 0.022, seg),
      mat({ color: 0x1a2838, emissive: 0x006688, rim: 1.2, metal: 0.65 }),
    );
    abdomen.position.y = 0.018;
    spine.add(abdomen);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.036, 0.028),
      mat({ color: 0x243848, emissive: 0x00aadd, rim: 1.85, metal: 0.75 }),
    );
    chest.position.y = 0.04;
    chestG.add(chest);

    // Chest plate ridge
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.03, 0.008),
      mat({ color: 0x8899aa, emissive: 0x00e8ff, rim: 2.0, metal: 0.9 }),
    );
    plate.position.set(0, 0.04, 0.016);
    chestG.add(plate);

    // Pauldrons
    const pauldrons = [];
    [-1, 1].forEach((side) => {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, seg, seg * 0.5, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mat({ color: 0x3a4a5a, emissive: 0x0088cc, rim: 1.7, metal: 0.8 }),
      );
      p.position.set(side * 0.028, 0.052, 0);
      p.rotation.z = side * -0.4;
      chestG.add(p);
      pauldrons.push(p);
    });

    // Energy core (multi-layer bloom)
    const coreInner = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, seg, seg),
      mat({ color: 0xffffff, emissive: 0xffffff, rim: 0.5, additive: true, transparent: true, opacity: 0.95 }),
    );
    coreInner.position.set(0, 0.038, 0.012);
    chestG.add(coreInner);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, seg, seg),
      mat({ color: 0x00e8ff, emissive: 0x00ffff, rim: 2.6, additive: true, transparent: true, opacity: 0.55 }),
    );
    core.position.set(0, 0.038, 0.012);
    chestG.add(core);
    const coreOuter = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, seg, seg),
      mat({ color: 0x0088ff, emissive: 0x00aaff, rim: 1.2, additive: true, transparent: true, opacity: 0.18 }),
    );
    coreOuter.position.set(0, 0.038, 0.012);
    chestG.add(coreOuter);

    // Head + helm + visor
    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, seg, seg),
      mat({ color: 0xb8c8d8, emissive: 0x224466, rim: 1.5, metal: 0.85 }),
    );
    skull.position.y = 0.072;
    headG.add(skull);
    const helmCrest = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.02, 0.028),
      mat({ color: 0x00c8ff, emissive: 0x00e8ff, rim: 2.2, metal: 0.5 }),
    );
    helmCrest.position.set(0, 0.086, -0.002);
    headG.add(helmCrest);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.01, 0.014),
      mat({ color: 0x001018, emissive: 0x00f0ff, rim: 2.8, transparent: true, opacity: 0.92 }),
    );
    visor.position.set(0, 0.072, 0.014);
    headG.add(visor);

    // Halo ring above head
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.0022, 8, hi ? 48 : 24),
      mat({ color: 0x00e8ff, emissive: 0x00ffff, rim: 2.5, additive: true, transparent: true, opacity: 0.75 }),
    );
    halo.position.y = 0.102;
    halo.rotation.x = Math.PI / 2.4;
    headG.add(halo);

    // Arms (upper + lower + gauntlet)
    const arms = [];
    [-1, 1].forEach((side) => {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.0055, 0.028, seg),
        mat({ color: 0x4a5a6a, emissive: 0x0088aa, rim: 1.35, metal: 0.7 }),
      );
      upper.position.y = -0.012;
      arm.add(upper);
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.0045, 0.024, seg),
        mat({ color: 0x3a4a58, emissive: 0x006688, rim: 1.25, metal: 0.65 }),
      );
      lower.position.y = -0.034;
      arm.add(lower);
      const gauntlet = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.014, 0.012),
        mat({ color: 0x00c8ff, emissive: 0x00e8ff, rim: 2.0, metal: 0.5 }),
      );
      gauntlet.position.y = -0.05;
      arm.add(gauntlet);
      // Energy blade idle
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.003, 0.028, 0.006),
        mat({ color: 0x00ffff, emissive: 0x00ffff, rim: 2.4, additive: true, transparent: true, opacity: 0.55 }),
      );
      blade.position.set(side * 0.006, -0.062, 0);
      arm.add(blade);
      arm.position.set(side * 0.03, 0.05, 0);
      arm.rotation.z = side * 0.25;
      chestG.add(arm);
      arms.push(arm);
    });

    // Legs
    const legs = [];
    [-1, 1].forEach((side) => {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0065, 0.006, 0.026, seg),
        mat({ color: 0x3a4a58, emissive: 0x004466, rim: 1.15, metal: 0.7 }),
      );
      thigh.position.y = -0.014;
      leg.add(thigh);
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.005, 0.024, seg),
        mat({ color: 0x2a3848, emissive: 0x003355, rim: 1.1, metal: 0.65 }),
      );
      shin.position.y = -0.038;
      leg.add(shin);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, 0.012, 0.02),
        mat({ color: 0x1a2838, emissive: 0x0066aa, rim: 1.4, metal: 0.8 }),
      );
      boot.position.set(0, -0.054, 0.004);
      leg.add(boot);
      leg.position.set(side * 0.012, -0.008, 0);
      hips.add(leg);
      legs.push(leg);
    });

    // Energy wings — multi-vane, not boxes
    const wings = [];
    const wingVanes = [];
    [-1, 1].forEach((side) => {
      const wing = new THREE.Group();
      for (let s = 0; s < (hi ? 5 : 3); s++) {
        const len = 0.055 - s * 0.007;
        const vane = new THREE.Mesh(
          new THREE.BoxGeometry(len, 0.0025 + s * 0.0004, 0.018 - s * 0.002),
          mat({
            color: 0x6a8aaa,
            emissive: s === 0 ? 0x00e8ff : 0x0088cc,
            rim: 1.8 + s * 0.25,
            transparent: true,
            opacity: 0.92 - s * 0.1,
            metal: 0.4,
            additive: s > 2,
          }),
        );
        vane.position.set(side * (0.02 + s * 0.018), 0.01 + s * 0.008, -0.012 - s * 0.004);
        vane.rotation.z = side * (0.15 + s * 0.08);
        vane.rotation.y = side * -0.12;
        wing.add(vane);
        wingVanes.push(vane);
        // Soft energy membrane
        if (s < 3) {
          const membrane = new THREE.Mesh(
            new THREE.PlaneGeometry(len * 0.9, 0.02),
            mat({
              color: 0x00aaff,
              emissive: 0x00e8ff,
              rim: 1.2,
              additive: true,
              transparent: true,
              opacity: 0.22,
              doubleSide: true,
            }),
          );
          membrane.position.copy(vane.position);
          membrane.position.z -= 0.002;
          membrane.rotation.z = vane.rotation.z;
          wing.add(membrane);
        }
      }
      wing.position.set(side * 0.014, 0.045, -0.012);
      chestG.add(wing);
      wings.push(wing);
    });

    // Back thruster pods
    const thrusters = [];
    const jetVfx = [];
    [-1, 1].forEach((side) => {
      const pack = new THREE.Group();
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.01, 0.02, seg),
        mat({ color: 0x1a2838, emissive: 0x00aacc, rim: 1.5, metal: 0.75 }),
      );
      pack.add(housing);
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.007, 0.01, seg),
        mat({ color: 0x2a3848, emissive: 0x0088aa, rim: 1.3 }),
      );
      nozzle.position.y = -0.014;
      pack.add(nozzle);
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.009, hi ? 0.05 : 0.032, seg),
        mat({ color: 0x00e8ff, emissive: 0x00ffff, rim: 2.2, additive: true, transparent: true, opacity: 0.8 }),
      );
      plume.rotation.x = Math.PI;
      plume.position.y = -0.032;
      pack.add(plume);
      pack.position.set(side * 0.016, 0.02, -0.022);
      chestG.add(pack);
      thrusters.push(plume);
      jetVfx.push(this._createJetVfx(g, side));
    });

    // Orbital micro-drones (gaming flair)
    const orbiters = [];
    if (hi) {
      for (let i = 0; i < 3; i++) {
        const orb = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.005, 0),
          mat({ color: 0x00e8ff, emissive: 0x00ffff, rim: 2.0, additive: true, transparent: true, opacity: 0.85 }),
        );
        g.add(orb);
        orbiters.push({ mesh: orb, phase: (i / 3) * Math.PI * 2, radius: 0.055 + i * 0.008 });
      }
    }

    // Soft aura
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, seg, seg),
      new THREE.MeshBasicMaterial({
        color: 0x00c8ff,
        transparent: true,
        opacity: hi ? 0.1 : 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    g.add(aura);

    // Ground contact ring (reads as “helper present”)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.0018, 8, 40),
      mat({ color: 0x00aaff, emissive: 0x00e8ff, rim: 1.5, additive: true, transparent: true, opacity: 0.45 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.06;
    g.add(ring);

    const alt = opts.alt || 1.095;
    const p = this._latLngToPos(lat ?? 36.44, lng ?? 28.22, alt);
    g.position.set(p.x, p.y, p.z);
    const n = new THREE.Vector3(p.x, p.y, p.z).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);

    g.userData = {
      type: 'astranov-flyer',
      gen: 2,
      procedural3d: true,
      gaming: hi,
      name: opts.label || 'Astranov',
      lat, lng, alt,
      wings, wingVanes, arms, legs, thrusters, core, coreInner, coreOuter,
      aura, halo, visor, ring, orbiters, pauldrons, jetVfx,
      hips, spine, chestG, headG,
      edition: opts.edition?.id || 'astranov',
    };
    return g;
  },

  _animateFlyerPose(mesh, flying) {
    const ud = mesh?.userData;
    if (!ud?.procedural3d) return;
    const t = this._flyerFrame * 0.11;
    this._pulseGamingMats(mesh, t);

    // Body hover / lean
    if (ud.spine) {
      ud.spine.rotation.x = Math.sin(t * 0.7) * (flying ? 0.18 : 0.06) + (flying ? 0.12 : 0);
      ud.spine.position.y = Math.sin(t * 1.4) * 0.002;
    }
    if (ud.headG) {
      ud.headG.rotation.y = Math.sin(t * 0.55) * 0.15;
      ud.headG.rotation.x = Math.sin(t * 0.4) * 0.05;
    }
    if (ud.halo) {
      ud.halo.rotation.z = t * 0.9;
      if (ud.halo.material?.uniforms?.uAlpha) {
        ud.halo.material.uniforms.uAlpha.value = 0.55 + Math.sin(t * 2) * 0.25;
      }
    }
    if (ud.visor?.material?.uniforms?.uEmit) {
      const pulse = 0.7 + Math.sin(t * 2.2) * 0.3;
      ud.visor.material.uniforms.uEmit.value.setRGB(0, pulse, 1);
    }

    // Wing flap + vane shimmer
    const flap = Math.sin(t * (flying ? 1.6 : 1.0)) * (flying ? 0.62 : 0.32);
    ud.wings?.forEach((wing, i) => {
      const s = i === 0 ? 1 : -1;
      wing.rotation.z = s * flap;
      wing.rotation.y = Math.sin(t * 0.9 + i) * 0.1;
      wing.rotation.x = flying ? -0.15 : Math.sin(t * 0.5) * 0.05;
    });
    ud.wingVanes?.forEach((v, i) => {
      if (v.material?.uniforms?.uAlpha) {
        v.material.uniforms.uAlpha.value = 0.55 + Math.sin(t * 1.8 + i) * 0.25;
      }
    });

    ud.legs?.forEach((leg, i) => {
      leg.rotation.x = Math.sin(t * 0.95 + i) * (flying ? 0.28 : 0.1) + (flying ? 0.2 : 0);
    });
    ud.arms?.forEach((arm, i) => {
      const s = i === 0 ? 1 : -1;
      arm.rotation.z = s * (0.18 + Math.sin(t * 0.75) * 0.1);
      arm.rotation.x = flying ? -0.35 + Math.sin(t + i) * 0.08 : Math.sin(t * 0.6 + i) * 0.08;
    });

    // Core bloom
    const coreA = 0.45 + Math.sin(t * 1.8) * 0.35;
    [ud.core, ud.coreInner, ud.coreOuter].forEach((c, i) => {
      if (!c) return;
      if (c.material?.uniforms?.uAlpha) {
        c.material.uniforms.uAlpha.value = coreA * (i === 0 ? 1 : i === 1 ? 1.1 : 0.45);
      }
      c.scale.setScalar(1 + Math.sin(t * 1.5 + i) * 0.08);
    });

    if (ud.aura?.material) {
      ud.aura.material.opacity = (flying ? 0.16 : 0.09) + Math.sin(t * 1.1) * 0.04;
      ud.aura.scale.setScalar(1 + Math.sin(t * 0.85) * 0.08);
    }
    if (ud.ring) {
      ud.ring.rotation.z = t * 1.2;
      if (ud.ring.material?.uniforms?.uAlpha) {
        ud.ring.material.uniforms.uAlpha.value = flying ? 0.55 : 0.35;
      }
    }

    // Orbiting drones
    ud.orbiters?.forEach((o) => {
      const a = t * 1.3 + o.phase;
      o.mesh.position.set(
        Math.cos(a) * o.radius,
        0.04 + Math.sin(a * 1.7) * 0.02,
        Math.sin(a) * o.radius * 0.7 - 0.01,
      );
      o.mesh.rotation.y = a;
      o.mesh.rotation.x = a * 0.6;
    });

    // Thrusters + particle jets
    ud.thrusters?.forEach((thr, i) => {
      if (thr.material?.uniforms?.uAlpha) {
        thr.material.uniforms.uAlpha.value = flying
          ? 0.7 + Math.sin(t * 2.4 + i) * 0.28
          : 0.28 + Math.sin(t + i) * 0.12;
      }
      thr.scale.y = flying ? 1.35 + Math.sin(t * 1.6 + i) * 0.5 : 0.55 + Math.sin(t + i) * 0.1;
      thr.scale.x = thr.scale.z = flying ? 1.1 : 0.75;
    });
    const power = flying ? 0.018 : 0.007;
    const worldDown = new THREE.Vector3(0, -1, 0).applyQuaternion(mesh.quaternion);
    ud.thrusters?.forEach((thr, i) => {
      const wp = new THREE.Vector3();
      thr.getWorldPosition(wp);
      this._emitJet(ud.jetVfx?.[i], wp, worldDown, power);
    });
    ud.jetVfx?.forEach((vfx) => this._tickJetVfx(vfx, flying));

    // Follow light on helper
    if (this._gamingLight && mesh.position) {
      this._gamingLight.position.copy(mesh.position).multiplyScalar(1.03);
      this._gamingLight.intensity = flying ? 2.2 : 1.5;
    }
  },

  _orientFlyerOnGlobe(mesh, pos) {
    if (!mesh || !pos) return;
    const n = pos.clone().normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  },

  _scaleFlyer(mesh, camZ) {
    if (!mesh?.userData?.procedural3d) return;
    // Larger, readable hero scale at global zoom — gaming presence
    const base = mesh.userData.gaming ? 4.2 : 3.4;
    const scale = Math.max(2.8, Math.min(8.5, base * (camZ / 2.15)));
    mesh.scale.setScalar(scale);
  },

  spawnAstranovFlyer(lat, lng, opts = {}) {
    if (this._flyer?.parent) {
      try { this._flyer.parent.remove(this._flyer); } catch (_) { /* */ }
    }
    // Dispose old thruster particle systems lightly
    this._flyer = null;
    const robot = this._buildProceduralHumanoid(lat, lng, opts);
    globePivot.add(robot);
    this._flyer = robot;
    window._astranovFlyer = robot;
    window._pilot = robot;
    // Dedicated point light for cinematic helper
    if (!this._gamingLight) {
      this._gamingLight = new THREE.PointLight(0x00e8ff, 1.6, 5.5);
      scene.add(this._gamingLight);
    }
    this._animateFlyerPose(robot, false);
    this.spawnEffect(robot.position, opts.color || 0x00e8ff, 36, 55);
    console.log('%c[Astranov Helper v2] gaming mecha-angel spawned', 'color:#00e8ff;font-weight:700');
    return robot;
  },

  _greatCircleCurve(fromVec, toVec, alt = 1.09, segments = 36) {
    const a = fromVec.clone().normalize();
    const b = toVec.clone().normalize();
    const qA = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), a);
    const qB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b);
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const q = qA.clone().slerp(qB, t);
      pts.push(new THREE.Vector3(0, 0, alt).applyQuaternion(q));
    }
    return new THREE.CatmullRomCurve3(pts);
  },

  flyAstranovTo(lat, lng, opts = {}) {
    if (!this._flyer) {
      const u = window._lastPos || { lat: 36.44, lng: 28.22 };
      this.spawnAstranovFlyer(u.lat, u.lng, opts);
    }
    const alt = opts.alt || this._flyer.userData?.alt || 1.09;
    const toP = this._latLngToPos(lat, lng, alt);
    const to = new THREE.Vector3(toP.x, toP.y, toP.z);
    const from = this._flyer.position.clone();
    const dist = TrackballGuard?.greatCircleKm?.(
      this._flyer.userData?.lat ?? 0,
      this._flyer.userData?.lng ?? 0,
      lat, lng
    ) || 800;
    const dur = opts.dur || Math.min(6200, Math.max(1400, dist * 2.8));
    const curve = this._greatCircleCurve(from, to, alt);
    this._flyerFlying = true;
    this._flyer.userData.lat = lat;
    this._flyer.userData.lng = lng;
    return this.animateAlongPath(this._flyer, curve, {
      dur,
      color: opts.color || 0x3d9eff,
      isFlyer: true,
      onDone: () => {
        this._flyerFlying = false;
        opts.onDone?.();
      },
    });
  },

  buildProceduralPilot(lat, lng, opts = {}) {
    return this.spawnAstranovFlyer(lat, lng, { ...opts, label: opts.edition?.name_gr || 'Astranov' });
  },

  buildProceduralDrone(lat, lng, domain = 'air', color = 0x44ccff) {
    const spec = TelemachosPilot?.DOMAINS?.[domain] || { alt: 1.06, color };
    const pos = this._latLngToPos(lat, lng, spec.alt || 1.06);
    const g = new THREE.Group();
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.012, 0.018, 6),
      new THREE.MeshBasicMaterial({ color: color || spec.color || 0x44ccff }),
    );
    g.add(hub);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.003, 0.003),
        new THREE.MeshBasicMaterial({ color: 0x88ccff }),
      );
      arm.rotation.z = (i / 4) * Math.PI * 2;
      arm.position.x = Math.cos(arm.rotation.z) * 0.018;
      arm.position.y = Math.sin(arm.rotation.z) * 0.018;
      g.add(arm);
    }
    g.userData = { type: 'drone', domain };
    g.position.set(pos.x, pos.y, pos.z);
    const n = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    globePivot.add(g);
    this.spawnEffect(g.position, color, 12, 35);
    return g;
  },

  animateAlongPath(mesh, curve, opts = {}) {
    if (!mesh || !curve) return null;
    const dur = opts.dur || 4200;
    const trailColor = opts.color || 0x00ddff;
    const t0 = performance.now();
    const id = { mesh, curve, t0, dur, trailColor, done: false, isFlyer: !!opts.isFlyer, onDone: opts.onDone };
    this._paths.push(id);
    if (opts.isFlyer) this._flyerFlying = true;
    return id;
  },

  _tickPaths() {
    const now = performance.now();
    for (let i = this._paths.length - 1; i >= 0; i--) {
      const p = this._paths[i];
      const prog = Math.min(1, (now - p.t0) / p.dur);
      const pt = p.curve.getPoint(prog);
      p.mesh.position.copy(pt);
      const n = pt.clone().normalize();
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const camZ = camera?.position?.z ?? 2.55;
      if (p.isFlyer) {
        this._flyerFrame++;
        this._scaleFlyer(p.mesh, camZ);
        this._animateFlyerPose(p.mesh, true);
      }
      if (Math.floor(prog * 40) % (p.isFlyer ? 2 : 3) === 0) {
        this.spawnEffect(pt, p.trailColor, p.isFlyer ? 6 : 4, p.isFlyer ? 22 : 18);
      }
      if (prog >= 1) {
        p.done = true;
        this.spawnEffect(pt, p.trailColor, 16, 40);
        this._paths.splice(i, 1);
        if (p.isFlyer) this._flyerFlying = false;
        p.onDone?.();
      }
    }
  },

  _tickAstranovFlyer() {
    if (!this._flyer || this._flyerFlying) return;
    this._flyerFrame++;
    const t = Date.now() * 0.001;
    const alt = (this._flyer.userData?.alt || 1.09) + Math.sin(t * 2.2) * 0.004;
    const lat = this._flyer.userData?.lat ?? 36.44;
    const lng = this._flyer.userData?.lng ?? 28.22;
    const p = this._latLngToPos(lat, lng, alt);
    this._flyer.position.set(p.x, p.y, p.z);
    this._orientFlyerOnGlobe(this._flyer, this._flyer.position);
    const camZ = camera?.position?.z ?? 2.55;
    this._scaleFlyer(this._flyer, camZ);
    this._animateFlyerPose(this._flyer, false);
    if (this._flyerFrame % 18 === 0) {
      this.spawnEffect(this._flyer.position, 0x3d9eff, 4, 16);
    }
  },

  setSiteShellMode(on) {
    this.shellDim = !!on;
    if (this.atmosphere) this.atmosphere.material.opacity = on ? 0.12 : (this.voicePerf ? 0.04 : 0.06);
    if (this.idleNodes) this.idleNodes.material.opacity = on ? 0.55 : 0.35;
  },

  setVoicePerfMode(on) {
    this.voicePerf = !!on;
    if (this.atmosphere) this.atmosphere.material.opacity = on ? 0.04 : (this.shellDim ? 0.12 : 0.06);
    if (this.clouds) this.clouds.visible = !on;
    if (this.idleNodes) this.idleNodes.visible = !on;
    if (this.neuralLayer) this.neuralLayer.visible = on || this.thinkPulse;
    if (on) {
      while (this.activeEffects.length > 6) {
        const eff = this.activeEffects.pop();
        if (eff?.points) {
          scene.remove(eff.points);
          eff.points.geometry?.dispose?.();
          eff.points.material?.dispose?.();
        }
      }
    }
  },

  setThinkMode(on) {
    this.thinkPulse = !!on;
    if (this.neuralLayer) {
      this.neuralLayer.visible = on || this.voicePerf;
      this.neuralLayer.material.opacity = on ? 0.22 : 0.14;
    }
  },

  setSuperBatchActive(on, meta = {}) {
    this.superBatchActive = !!on;
    this._batchMeta = meta || {};
    if (!this._parent) return;
    if (!this.batchGroup) {
      this.batchGroup = new THREE.Group();
      this._parent.add(this.batchGroup);
      const ringGeo = new THREE.RingGeometry(0.04, 0.07, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xaa88ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.batchRing = new THREE.Mesh(ringGeo, ringMat);
      this.batchGroup.add(this.batchRing);
      const nodeGeo = new THREE.BufferGeometry();
      const pts = new Float32Array(8 * 3);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts[i * 3] = Math.cos(a) * 0.09;
        pts[i * 3 + 1] = Math.sin(a) * 0.09;
        pts[i * 3 + 2] = 0;
      }
      nodeGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      this.batchNodes = new THREE.Points(nodeGeo, new THREE.PointsMaterial({
        size: 0.012,
        color: 0x00ddff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.batchGroup.add(this.batchNodes);
    }
    this.batchGroup.visible = on;
    if (on) this._placeBatchRing(meta);
    if (on && meta.lat != null) {
      try {
        const p = this._latLngToPos(meta.lat, meta.lng || 0, 1.06);
        this.spawnEffect(new THREE.Vector3(p.x, p.y, p.z), 0xaa88ff, 24, 40);
      } catch (_) {}
    }
  },

  _placeBatchRing(meta = {}) {
    if (!this.batchGroup) return;
    const lat = meta.lat != null ? meta.lat : 36.44;
    const lng = meta.lng != null ? meta.lng : 28.22;
    const p = this._latLngToPos(lat, lng, 1.055);
    this.batchGroup.position.set(p.x, p.y, p.z);
    const normal = new THREE.Vector3(p.x, p.y, p.z).normalize();
    this.batchGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  },

  pulseBatchMesh(peerCount) {
    if (!this.batchRing) return;
    this.batchRing.material.opacity = 0.45 + Math.min(peerCount, 8) * 0.04;
    if (this.batchNodes) this.batchNodes.material.color.setHex(peerCount > 2 ? 0x3d9eff : 0x1a6fd4);
    try {
      const m = this._batchMeta || {};
      if (m.lat != null) {
        const p = this._latLngToPos(m.lat, m.lng || 0, 1.06);
        this.spawnEffect(new THREE.Vector3(p.x, p.y, p.z), 0xaa88ff, 18, 35);
      }
    } catch (_) {}
  },

  _tickPilotThrusters() {
    const pilot = window._pilot;
    if (!pilot?.userData?.thrusters) return;
    const t = Date.now() * 0.008;
    pilot.userData.thrusters.forEach((thr, i) => {
      thr.material.opacity = 0.65 + Math.sin(t + i) * 0.35;
      thr.scale.y = 0.8 + Math.sin(t * 1.4 + i) * 0.35;
    });
  },

  update() {
    if (!this._inited) return;
    const thinking = !!GlobeDeck?.thinking;
    if (thinking !== this.thinkPulse) this.setThinkMode(thinking);

    if (this.voicePerf) {
      this._frameSkip = (this._frameSkip + 1) % 2;
      if (this._frameSkip) return;
    }
    const t = Date.now() * 0.001;
    if (this.batchRing && this.superBatchActive) {
      this.batchRing.rotation.z = t * 0.6;
      this.batchRing.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.15;
    }
    if (this.batchNodes && this.superBatchActive) this.batchNodes.rotation.y = t * 0.5;
    if (this.clouds && !this.shellDim && !this.voicePerf) this.clouds.rotation.y += 0.00008;
    if (this.cityLights) this.cityLights.material.opacity = 0.65 + Math.sin(t * 1.5) * 0.1;
    if (this.neuralLayer?.visible && this._neuralPack) {
      this._paintNeural(this._neuralPack.ctx, 512, 256, t * 60);
      this._neuralPack.tex.needsUpdate = true;
      this.neuralLayer.rotation.y += 0.00012;
    }
    this._tickAstranovFlyer();
    this._tickPilotThrusters();
    this._tickPaths();

    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const eff = this.activeEffects[i];
      const posAttr = eff.points.geometry.attributes.position;
      const arr = posAttr.array;
      eff.life--;
      const alpha = eff.life / eff.maxLife;
      for (let j = 0; j < arr.length; j += 3) {
        const vidx = j / 3;
        arr[j] += eff.velocities[vidx * 3] * alpha;
        arr[j + 1] += eff.velocities[vidx * 3 + 1] * alpha;
        arr[j + 2] += eff.velocities[vidx * 3 + 2] * alpha;
      }
      posAttr.needsUpdate = true;
      eff.points.material.opacity = alpha * 0.9;
      if (eff.life <= 0) {
        scene.remove(eff.points);
        eff.points.geometry.dispose();
        eff.points.material.dispose();
        this.activeEffects.splice(i, 1);
      }
    }
  },
};

window.AIGraphics = AIGraphics;
// Graphics helpers only on demand — no auto-spawn flying character / orbiters (truth + perf)
const _aiInit = () => {
  try { AIGraphics.init(globePivot); } catch (e) { console.warn('[AIGraphics] init', e); }
};
setTimeout(_aiInit, window._globePerfLite ? 1500 : 600);

// NO auto flyer / particle burst — was fake flying object around Earth
window.AstranovFlyer = {
  spawn(lat, lng, opts) {
    try {
      AIGraphics?.init?.(globePivot);
      window._astranovFlyerActive = true;
      return AIGraphics.spawnAstranovFlyer?.(lat, lng, opts);
    } catch (_) { return null; }
  },
  flyTo(lat, lng, opts) {
    try { return AIGraphics.flyAstranovTo?.(lat, lng, opts); } catch (_) { return null; }
  },
};
window._astranovFlyerActive = false;
