// === GLOBE PRESENCE — logged-in users on map · collab · κρυφτό hide-and-seek ===
const AstranovPresence = {
  CHANNEL: 'astranov-globe-live',
  TICK_MS: 3000,
  POLL_MS: 15000,
  DB_MIN_MS: 12000,
  rtChannel: null,
  _hb: null,
  _poll: null,
  _watchId: null,
  _lastDbAt: 0,
  _live: new Map(),
  game: null,
  _gameStartedAt: 0,

  wantsKryftoStart(line) {
    const low = String(line || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!low) return false;
    if (/^(κρυφτό|κρυφτο|kryfto|hideandseek|hide-and-seek|συγύρισμα|συγυρισμα|συγυρίσμα)\b/.test(low)) return true;
    if (/\bhide\s*(and|&|n)?\s*seek/.test(low)) return true;
    if (/\bhouse\s*keep(ing)?\b/.test(low)) return true;
    if (/\bσυγύρισμα|συγυρισμα|συγυρίσμα\b/.test(low)) return true;
    if (/\b(start|play|begin|παίξε|παιξε|άρχισε|αρχισε|ξεκίνα|ξεκινα)\b.*\b(κρυφτ|kryfto|hide\s*and\s*seek|house\s*keep|συγύρισμα|συγυρισμα|συγυρίσμα)/.test(low)) return true;
    if (/\b(κρυφτ|kryfto|hide\s*and\s*seek|house\s*keep|συγύρισμα|συγυρισμα|συγυρίσμα).*\b(start|play|game|ξεκίνα|ξεκινα)\b/.test(low)) return true;
    if (/\bπαιχνίδι\s+(κρυφτ|kryfto)\b/.test(low)) return true;
    return false;
  },

  init() {
    if (!SlumberManager?.allows?.('presence')) return;
    if (Auth?.client) {
      Auth.client.auth.onAuthStateChange((_ev, session) => {
        if (session?.user) setTimeout(() => this.join(), 400);
        else this.leave();
      });
      setTimeout(() => { if (Auth?.user) this.join(); }, 2500);
    }
  },

  displayName() {
    if (AstranovSession?.isAstranov?.()) return 'ASTRANOV';
    const u = Auth?.user;
    if (!u) return 'Guest';
    return u.user_metadata?.full_name
      || u.user_metadata?.name
      || (u.email || '').split('@')[0]
      || 'User';
  },

  pos() {
    if (GhostTravel?.active?.()) return GhostTravel.publicPos();
    return window._lastPos || { lat: 36.22, lng: 28.12 };
  },

  async join() {
    if (!SlumberManager?.allows?.('presence')) return;
    if (!Auth?.client || !Auth?.user) return;
    if (Auth?.whenReady) await Auth.whenReady();
    if (this.rtChannel) return;
    const uid = Auth.user.id;
    this.rtChannel = Auth.client.channel(this.CHANNEL, {
      config: { presence: { key: uid } },
    });
    this.rtChannel.on('presence', { event: 'sync' }, () => this._onPresenceSync());
    this.rtChannel.on('presence', { event: 'join' }, () => this._onPresenceSync());
    this.rtChannel.on('presence', { event: 'leave' }, () => this._onPresenceSync());
    this.rtChannel.on('broadcast', { event: 'pos' }, ({ payload }) => {
      if (payload?.user_id && payload.user_id !== Auth?.user?.id) {
        GhostTravel?.ingestUserPos?.(payload);
        this._ingest(payload);
        this._render();
      }
    });
    this.rtChannel.on('broadcast', { event: 'game' }, ({ payload }) => {
      if (payload?.type === 'kryfto_start' && payload.from !== this.displayName()) {
        this.game = 'kryfto';
        GlobeDeck?.setPreview?.('◎ ' + payload.from + ' started κρυφτό — hide or seek!');
        AciCli?.print('◎ ' + payload.from + ' · κρυφτό game', 'dim');
      }
    });
    await this.rtChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await this.broadcast();
    });
    if (this._hb) clearInterval(this._hb);
    this._hb = setInterval(() => this._tick(), this.TICK_MS);
    if (this._poll) clearInterval(this._poll);
    this._poll = setInterval(() => this._pollProfiles(), this.POLL_MS);
    if (userLocated) this._startGpsWatch();
    await this._pollProfiles();
    if (GhostTravel?.active?.()) {
      GhostTravel._pollLastLogin?.();
      AciCli?.print?.('◎ Ghost route · ±3 km scramble · real GPS never leaves device', 'dim');
    } else {
      AciCli?.print?.('◎ Map live — sign-in players visible · kryfto · hide · players', 'dim');
    }
  },

  async leave() {
    this._stopGpsWatch();
    if (this._hb) { clearInterval(this._hb); this._hb = null; }
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
    if (this.rtChannel && Auth?.client) {
      try { await Auth.client.removeChannel(this.rtChannel); } catch (_) {}
      this.rtChannel = null;
    }
    this._live.clear();
    this._applyOthers([]);
    this.game = null;
  },

  payload() {
    const p = this.pos();
    return {
      user_id: Auth.user.id,
      name: this.displayName(),
      lat: p.lat,
      lng: p.lng,
      hidden: !!window.hidden,
      game: this.game,
      emoji: '👤',
      t: Date.now(),
    };
  },

  async broadcast() {
    if (!Auth?.user) return;
    const pl = this.payload();
    const now = Date.now();
    const writeDb = now - (this._lastDbAt || 0) >= this.DB_MIN_MS;
    try {
      if (this.rtChannel) await this.rtChannel.track(pl);
      if (writeDb && Auth?.client) {
        await Auth.client.from('profiles').update({
          field_lat: pl.lat,
          field_lng: pl.lng,
          field_seen_at: new Date().toISOString(),
          map_hidden: pl.hidden,
          map_mode: this.game || 'collab',
          display_name: pl.name,
        }).eq('id', Auth.user.id);
        this._lastDbAt = now;
      }
      if (this.rtChannel) {
        this.rtChannel.send({ type: 'broadcast', event: 'pos', payload: pl });
      }
    } catch (e) {
      console.warn('[Presence] broadcast', e.message || e);
    }
  },

  _onGpsFix(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const now = Date.now();
    let speed = pos.coords.speed;
    const prev = window._lastGpsFix;
    if ((speed == null || speed < 0) && prev?.lat != null && prev.t) {
      const dt = (now - prev.t) / 1000;
      if (dt > 0.5 && dt < 30 && typeof FieldHud?.haversineKm === 'function') {
        const dKm = FieldHud.haversineKm(prev.lat, prev.lng, lat, lng);
        speed = (dKm * 1000) / dt;
      }
    }
    window._gpsSpeedMps = (speed != null && speed >= 0) ? speed : (window._gpsSpeedMps || 0);
    window._lastGpsFix = { lat, lng, speed: window._gpsSpeedMps, t: now };
    if (GhostTravel?.active?.()) {
      GhostTravel.setTruePos(lat, lng);
      window._truePos = { lat, lng };
      userLocated = true;
      GhostTravel._applyVisual?.();
      return;
    }
    window._lastPos = { lat, lng };
    userLocated = true;
    if (window._meMarker) {
      const p = latLngToPos(lat, lng, 1.03);
      window._meMarker.position.set(p.x, p.y, p.z);
    }
    GlobeEntity?.syncMe?.(lat, lng, me?.name || 'You');
    if (CityMap?.active) CityMap._syncMarkers?.();
  },

  _startGpsWatch() {
    if (this._watchId != null || !navigator.geolocation) return;
    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._onGpsFix(pos),
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  },

  _stopGpsWatch() {
    if (this._watchId == null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(this._watchId);
    this._watchId = null;
  },

  async _tick() {
    if (!Auth?.user) return;
    if (!GhostTravel?.active?.()) await this.broadcast();
  },

  async broadcastGhost() {
    if (!GhostTravel?.active?.()) return;
    await this.broadcast();
  },

  onMove(lat, lng) {
    if (!Auth?.user) return;
    if (GhostTravel?.active?.()) {
      GhostTravel.setTruePos(lat, lng);
      window._truePos = { lat, lng };
      userLocated = true;
      this._startGpsWatch();
      return;
    }
    window._lastPos = { lat, lng };
    userLocated = true;
    this._startGpsWatch();
    this.broadcast();
  },

  refresh() {
    if (!Auth?.user) {
      this._applyOthers([]);
      return;
    }
    if (!this.rtChannel) this.join();
    else {
      this._onPresenceSync();
      this._pollProfiles();
    }
  },

  _ingest(p) {
    if (!p?.user_id || p.user_id === Auth?.user?.id || p.hidden) return;
    if (p.lat == null || p.lng == null) return;
    this._live.set(p.user_id, {
      id: p.user_id,
      name: p.name || 'Player',
      lat: +p.lat,
      lng: +p.lng,
      emoji: p.emoji || '👤',
      game: p.game,
      t: p.t || Date.now(),
    });
  },

  _onPresenceSync() {
    if (!this.rtChannel) return;
    const state = this.rtChannel.presenceState();
    Object.keys(state).forEach((key) => {
      (state[key] || []).forEach((pres) => this._ingest(pres));
    });
    this._render();
  },

  async _pollProfiles() {
    if (!Auth?.user || !Auth?.client) return;
    if (Auth?.whenReady) await Auth.whenReady();
    try {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: rows, error } = await Auth.client
        .from('profiles')
        .select('id,display_name,avatar_emoji,field_lat,field_lng,field_seen_at,map_hidden')
        .gte('field_seen_at', since)
        .not('field_lat', 'is', null)
        .not('field_lng', 'is', null)
        .eq('map_hidden', false)
        .neq('id', Auth.user.id)
        .limit(80);
      if (error) return;
      (rows || []).forEach((row) => {
        this._ingest({
          user_id: row.id,
          name: row.display_name || 'User',
          lat: row.field_lat,
          lng: row.field_lng,
          emoji: row.avatar_emoji || '👤',
          hidden: row.map_hidden,
          t: row.field_seen_at ? new Date(row.field_seen_at).getTime() : Date.now(),
        });
      });
      this._render();
    } catch (e) {
      console.warn('[Presence] poll', e.message || e);
    }
  },

  _render() {
    const users = [...this._live.values()].sort((a, b) => (b.t || 0) - (a.t || 0));
    this._applyOthers(users);
    TelemachosPilot?._syncGamerTelemetry?.();
    TelemachosPilot?.refreshTeamStatus?.({ quiet: true });
  },

  _applyOthers(users) {
    users = WillaGames?.mergeLivePlayers?.(users) || users;
    window.others = users;
    if (typeof others !== 'undefined') others = users;
    GlobeEntity?.syncFriends?.(users);
    if (CityMap?.active) CityMap._syncMarkers?.();
    const chip = document.getElementById('city-life-chip');
    if (chip?.classList.contains('open') && users.length) {
      const shops = (Commerce?.vendors || []).length;
      chip.innerHTML = '<b>City</b> · ' + shops + ' shops · ' + users.length + ' player(s) live';
    }
  },

  toggleHide() {
    if (!Auth?.user) {
      ACIControl?.reply('Sign in first — then hide for κρυφτό');
      return !!window.hidden;
    }
    window.hidden = !window.hidden;
    if (typeof hidden !== 'undefined') hidden = window.hidden;
    if (window._meMarker) window._meMarker.visible = !window.hidden;
    const ge = GlobeEntity?.entities?.get('me');
    if (ge?.mesh) ge.mesh.visible = !window.hidden;
    this.broadcast();
    const msg = window.hidden
      ? 'Κρυφτό — hidden from other players'
      : 'Visible — back on the map for collab';
    ACIControl?.reply(msg);
    ContextTruth?.sync?.();
    if (Voice.maySpeak()) speak(msg.slice(0, 80), () => resumeListening?.());
    return window.hidden;
  },

  startKryfto() {
    if (!Auth?.user) {
      WillaGames?.ensureDemoPlayers?.('kryfto');
      WillaGames?.startKryftoDemo?.();
      return;
    }
    WillaGames?.ensureDemoPlayers?.('kryfto');
    this.game = 'kryfto';
    this._gameStartedAt = Date.now();
    window.hidden = false;
    if (typeof hidden !== 'undefined') hidden = false;
    if (window._meMarker) window._meMarker.visible = true;
    const ge = GlobeEntity?.entities?.get('me');
    if (ge?.mesh) ge.mesh.visible = true;

    const afterLocate = () => this._kryftoLive();
    if (!userLocated && typeof requestLocationIfNeeded === 'function') {
      requestLocationIfNeeded(afterLocate);
      ACIControl?.reply('Κρυφτό — locating you on the map…');
      return;
    }
    if (!userLocated && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (typeof placeMe === 'function') {
            placeMe(pos.coords.latitude, pos.coords.longitude, { quiet: true, markerOnly: true });
          }
          afterLocate();
        },
        () => afterLocate(),
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 }
      );
      ACIControl?.reply('Κρυφτό — locating…');
      return;
    }
    afterLocate();
  },

  _kryftoLive() {
    this.broadcast();
    this.rtChannel?.send({
      type: 'broadcast',
      event: 'game',
      payload: { type: 'kryfto_start', from: this.displayName(), t: Date.now() },
    });
    const others = window.others || [];
    const n = others.length;
    const total = n + 1;
    others.forEach((u) => {
      const color = u.team === 'red' ? 0xff2244 : 0x3d9eff;
      MapDepict?.pulse?.(u.lat, u.lng, color, 'κρυφτό · ' + u.name, 16000);
    });
    const p = this.pos();
    MapDepict?.action?.('play', { lat: p.lat, lng: p.lng, detail: 'κρυφτό · hide and seek LIVE' });
    MapDepict?.pulse?.(p.lat, p.lng, 0x1a6fd4, 'ΚΡΥΦΤΟ', 18000);
    GlobeDeck?.expand?.(SuperCli?.title || 'Astranov');
    GlobeDeck?.setTitle?.('ΚΡΥΦΤΟ');
    GlobeDeck?.setPreview?.('◎ ' + total + ' player(s) · say hide to vanish · players to seek');
    GlobeDeck.activeTask = 'game';
    ContextTruth?.sync?.();
    AciCli?.print('◎ GAME START · κρυφτό / hide and seek · ' + total + ' on map', 'ok');
    const olympians = others.filter(u => u.agent === 'grok-heavy').length;
    const titans = others.filter(u => u.agent === 'cronian').length;
    const msg = olympians >= 12 && titans >= 12
      ? 'Κρυφτό · 12 gods 🔵 · 12 titans 🔴 on map. Πες hide · players'
      : n > 0
      ? 'Κρυφτό ξεκίνησε! ' + total + ' παίκτες. Πες hide · players'
      : 'Κρυφτό ξεκίνησε! Πες hide — ή players για gods vs titans';
    ACIControl?.reply(msg);
    if (Voice.maySpeak()) speak('Κρυφτό. Πες hide.', () => resumeListening?.());
    FieldBrain?.pulse?.('play', 'kryfto started', { role: 'client', props: { players: total } });
  },

  listPlayers() {
    WillaGames?.ensureDemoPlayers?.(this.game || 'lobby');
    const list = window.others || [];
    if (!list.length) {
      AciCli?.print('No other players on map — try: kryfto · pyramid · willa', 'dim');
      ACIControl?.reply('No players yet — say kryfto · pyramid game · willa game for demos');
      return list;
    }
    list.forEach((u) => {
      const color = u.team === 'red' ? 0xff2244 : u.team === 'blue' ? 0x3d9eff : 0xffaa33;
      MapDepict?.pulse?.(u.lat, u.lng, color, (u.emoji || '👤') + ' ' + u.name, 12000);
    });
    AciCli?.print(list.map((u) => (u.emoji || '👤') + ' ' + u.name
      + (u.domain ? ' · ' + u.domain : '') + ' · ' + u.lat.toFixed(3)).join(' · '), 'ok');
    ACIControl?.reply(list.length + ' on map — tap a marker or type locate');
    return list;
  },
};

window.AstranovPresence = AstranovPresence;
