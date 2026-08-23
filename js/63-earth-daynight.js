// === EARTH REALISM — live day/night terminator, sun & moon ===
const EarthRealism = {
  _inited: false,
  _shaderReady: false,
  sunDir: new THREE.Vector3(1, 0.2, 0.4),
  moonMesh: null,
  sunGlow: null,
  terminator: null,
  _dayTex: null,
  _nightTex: null,
  _hudTimer: 0,
  _tickLast: 0,
  _sunLocalCache: null,
  _sunLocalAt: 0,

  _canvasTex(c1, c2) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 64, 32);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  },

  _ensureFallbackTextures() {
    if (this._shaderReady) return;
    if (!this._dayTex) this._dayTex = this._canvasTex('#1a4a7a', '#2d8f4e');
    if (!this._nightTex) this._nightTex = this._canvasTex('#0a1830', '#334466');
    this._applyShader();
  },

  init() {
    if (this._inited || !earth) return;
    this._inited = true;
    const useHd = SlumberManager?.allows?.('earth_hd') && SlumberManager?.quality?.earthHd !== false;
    if (!useHd) {
      this._ensureFallbackTextures();
    } else {
      const loader = new THREE.TextureLoader();
      const dayUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg';
      const nightUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_lights_2048.png';
      const onDay = (tex) => { this._dayTex = tex; this._applyShader(); };
      const onNight = (tex) => { this._nightTex = tex; this._applyShader(); };
      loader.load(dayUrl, onDay, undefined, () => {
        if (!this._dayTex) { this._dayTex = this._canvasTex('#1a4a7a', '#2d8f4e'); this._applyShader(); }
      });
      loader.load(nightUrl, onNight, undefined, () => {
        if (!this._nightTex) { this._nightTex = this._canvasTex('#0a1830', '#334466'); this._applyShader(); }
      });
      setTimeout(() => this._ensureFallbackTextures(), 10000);
    }
    this._buildSkyBodies();
    this._buildTerminator();
    this.tick();
  },

  _applyShader() {
    if (!this._dayTex || !this._nightTex || !earth) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: this._dayTex },
        nightTexture: { value: this._nightTex },
        sunDirection: { value: this.sunDir.clone() },
        brightness: { value: AstranovTheme?.mode === 'bright' ? 1.15 : 1.0 },
      },
      vertexShader: [
        'varying vec2 vUv;',
        'varying vec3 vNormalW;',
        'void main() {',
        '  vUv = uv;',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vNormalW = normalize(mat3(modelMatrix) * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D dayTexture;',
        'uniform sampler2D nightTexture;',
        'uniform vec3 sunDirection;',
        'uniform float brightness;',
        'varying vec2 vUv;',
        'varying vec3 vNormalW;',
        'void main() {',
        '  vec3 n = normalize(vNormalW);',
        '  vec3 s = normalize(sunDirection);',
        '  float d = dot(n, s);',
        '  vec4 dayColor = texture2D(dayTexture, vUv);',
        '  vec4 nightColor = texture2D(nightTexture, vUv);',
        '  // Soft terminator + city-night glow (Astranov cinematic, not hard band)',
        '  float blend = smoothstep(-0.18, 0.32, d);',
        '  vec3 nightLit = nightColor.rgb * vec3(0.55, 0.72, 1.15) * 1.55;',
        '  vec3 dayLit = dayColor.rgb * (0.88 + 0.22 * max(d, 0.0));',
        '  // Specular kiss on oceans (cheap blue boost on day side)',
        '  float ocean = smoothstep(0.22, 0.55, dayColor.b - dayColor.r * 0.35);',
        '  dayLit += ocean * pow(max(d, 0.0), 12.0) * vec3(0.35, 0.55, 0.75);',
        '  vec3 col = mix(nightLit, dayLit, blend);',
        '  // Atmospheric limb brightening',
        '  float limb = pow(1.0 - abs(d), 2.8) * 0.18;',
        '  col += vec3(0.25, 0.55, 1.0) * limb * (1.0 - blend * 0.4);',
        '  gl_FragColor = vec4(col * brightness, 1.0);',
        '}',
      ].join('\n'),
    });
    earth.material = mat;
    earth.material.needsUpdate = true;
    this._shaderReady = true;
    window._earthShaderReady = true;
    this.tick();
  },

  onThemeChange() {
    if (earth?.material?.uniforms?.brightness) {
      earth.material.uniforms.brightness.value = AstranovTheme?.mode === 'bright' ? 1.15 : 1.0;
    }
  },

  _buildSkyBodies() {
    // TRUTH: no floating sun/moon spheres in the scene (looked like fake planets).
    // Day/night uses directional light + shader only.
    this.sunGlow = null;
    this.moonMesh = null;
  },

  _buildTerminator() {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.012, 0, Math.sin(a) * 1.012));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.terminator = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.55 })
    );
    globePivot.add(this.terminator);
  },

  _solarPosition(date) {
    const d = date || new Date();
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000;
    const decl = 23.44 * Math.sin((360 / 365) * (day - 81) * Math.PI / 180) * Math.PI / 180;
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const lon = ((12 - utcH) * 15) * Math.PI / 180;
    const lat = decl;
    const x = Math.cos(lat) * Math.cos(lon);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.sin(lon);
    return new THREE.Vector3(x, y, z).normalize();
  },

  _moonPosition(date) {
    const d = date || new Date();
    const jd = 367 * d.getUTCFullYear()
      - Math.floor(7 * (d.getUTCFullYear() + Math.floor((d.getUTCMonth() + 9) / 12)) / 4)
      + Math.floor(275 * (d.getUTCMonth() + 1) / 9)
      + d.getUTCDate() - 730530
      + (d.getUTCHours() + d.getUTCMinutes() / 60) / 24;
    const phase = (jd / 29.53) * Math.PI * 2;
    const orbit = jd * 0.036 + 1.2;
    const dist = 2.8;
    const sun = this._solarPosition(d);
    const perp = new THREE.Vector3(-sun.z, 0.15, sun.x).normalize();
    const pos = sun.clone().multiplyScalar(Math.cos(phase) * dist * 0.35)
      .add(perp.clone().multiplyScalar(Math.sin(phase) * dist))
      .add(new THREE.Vector3(Math.cos(orbit) * 0.2, Math.sin(orbit) * 0.08, Math.sin(orbit) * 0.2));
    return pos.normalize().multiplyScalar(dist);
  },

  _updateTerminator(sunDir) {
    if (!this.terminator) return;
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, sunDir).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(sunDir))));
    this.terminator.quaternion.setFromAxisAngle(axis, angle);
  },

  _formatHud(sunDir) {
    const subsolar = this._subsolarLatLng(sunDir);
    const now = new Date();
    const utc = now.toISOString().slice(11, 16) + ' UTC';
    const illum = Math.round((1 + sunDir.y) * 50);
    return '<div class="cg-title">Earth · ' + utc + '</div>'
      + '<div class="cg-item"><b>Day/night</b> — subsolar ' + subsolar.lat.toFixed(1) + '°, ' + subsolar.lng.toFixed(1) + '° · ' + illum + '% lit</div>'
      + '<div class="cg-item"><i>Drag · 🎯 city · no fake satellites</i></div>';
  },

  _subsolarLatLng(sunDir) {
    const lat = Math.asin(Math.max(-1, Math.min(1, sunDir.y))) * 180 / Math.PI;
    let lng = Math.atan2(sunDir.z, sunDir.x) * 180 / Math.PI;
    if (lng > 180) lng -= 360;
    return { lat, lng };
  },

  /**
   * Visible continuous spin — solar-day (1 rev/24h) is invisible at human scale.
   * ~1 full turn every ~3 minutes reads as a living planet without dizzying.
   * Solar position for lighting still uses real UTC via _solarPosition().
   */
  _earthSpin() {
    const t = Date.now() / 1000;
    const visualPeriod = 180; // seconds per revolution
    return (t / visualPeriod) * Math.PI * 2;
  },

  /** Call every animation frame for smooth natural rotation */
  applySpinNow() {
    if (!earth || CityMap?.active) return;
    if (window._globeFly || drag) return; // don't fight user / fly
    try { earth.rotation.y = this._earthSpin(); } catch (_) {}
  },

  _sunLocal(sunDir) {
    if (!earth) return sunDir;
    const now = Date.now();
    if (this._sunLocalCache && now - this._sunLocalAt < 400) return this._sunLocalCache;
    earth.updateMatrixWorld(false);
    const m = new THREE.Matrix4().copy(earth.matrixWorld).invert();
    this._sunLocalCache = sunDir.clone().transformDirection(m).normalize();
    this._sunLocalAt = now;
    return this._sunLocalCache;
  },

  tick() {
    const now = Date.now();
    const camZ = camera?.position?.z ?? 7.2;
    const level = CosmicZoom?.level || 'earth';
    const earthView = (level === 'earth' || level === 'orbit') && camZ < 4.8;
    if (!earthView) return;
    const earthGap = SlumberManager?.tickMs?.('earth') || (window._globePerfLite ? 500 : 250);
    if (now - this._tickLast < earthGap) return;
    this._tickLast = now;

    const sunDir = this._solarPosition();
    this.sunDir.copy(sunDir);
    if (earth) {
      earth.rotation.y = this._earthSpin();
      if (earth.material?.uniforms?.sunDirection) {
        earth.material.uniforms.sunDirection.value.copy(this._sunLocal(sunDir));
      }
    }
    if (typeof sun !== 'undefined' && sun?.position) {
      sun.position.copy(sunDir.clone().multiplyScalar(8));
      sun.intensity = AstranovTheme?.mode === 'bright' ? 1.9 : 1.5;
    }
    if (this.sunGlow) {
      this.sunGlow.position.copy(sunDir.clone().multiplyScalar(4.2));
      const camZ = camera?.position?.z ?? 2.5;
      this.sunGlow.visible = camZ < 5.5 && camZ > 1.5 && !CityMap?.active;
      this.sunGlow.scale.setScalar(0.85 + Math.sin(Date.now() * 0.002) * 0.08);
    }
    if (this.moonMesh) {
      this.moonMesh.position.copy(this._moonPosition());
      const camZ = camera?.position?.z ?? 2.5;
      this.moonMesh.visible = camZ < 5.5 && camZ > 1.5 && !CityMap?.active;
    }
    this._updateTerminator(sunDir);

    if (level === 'earth' && camZ < 3.4 && !CityMap?.active) {
      if (!this._hudTimer || now - this._hudTimer > 3500) {
        this._hudTimer = now;
        // No planet/day-night essay on the left — unreadable noise (ResourceMonitor owns left rail)
        const el = document.getElementById('cosmic-guide');
        if (el) { el.innerHTML = ''; el.style.display = 'none'; }
      }
    }
  },
};
window.EarthRealism = EarthRealism;
