// === MAP COMMS — team polygon · cloud chat · video/voice/phone/message ===
const MapComms = {
  kind: 'team',
  teamId: null,
  teamName: 'Team',
  members: new Map(),
  messages: [],
  dmUser: null,
  compromised: null,
  rtChannel: null,
  callChannel: null,
  _viz: null,
  _lines: [],
  _beamSvg: null,
  _pulse: 0,
  CLOUD_R: 1.22,
  SURFACE_R: 1.031,
  BLUE: 0x1a6fd4,
  BLUE_GLOW: 0x3d9eff,

  init() {
    this._beamSvg = document.getElementById('map-comms-beam');
    this._bindCloud();
    if (Auth?.client) {
      Auth.client.auth.onAuthStateChange((_e, s) => {
        if (!s?.user) this.leaveTeam();
      });
    }
  },

  _bindCloud() {
    const cloud = document.getElementById('map-comms-cloud');
    if (!cloud || cloud.dataset.bound) return;
    cloud.dataset.bound = '1';
    document.getElementById('mc-close')?.addEventListener('click', () => this.closeCloud());
    document.getElementById('mc-send')?.addEventListener('click', () => this.sendFromInput());
    document.getElementById('mc-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.sendFromInput(); }
    });
    document.querySelectorAll('#map-comms-contact [data-mc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const hud = document.getElementById('map-comms-contact');
        const uid = hud?.dataset?.userId;
        if (uid) this.contactUser(uid, btn.dataset.mc);
      });
    });
  },

  esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  selfMember() {
    const p = GhostTravel?.active?.()
      ? GhostTravel.publicPos()
      : (window._lastPos || { lat: 36.22, lng: 28.12 });
    return {
      id: Auth?.user?.id || 'guest',
      name: AstranovPresence?.displayName?.()
        || Auth?.user?.user_metadata?.full_name
        || Auth?.user?.email?.split?.('@')?.[0]
        || 'You',
      lat: p.lat,
      lng: p.lng,
      emoji: '◎',
    };
  },

  memberList() {
    const list = [...this.members.values()];
    const self = this.selfMember();
    if (!list.find(m => m.id === self.id)) list.unshift(self);
    return list.filter(m => m.lat != null && m.lng != null);
  },

  async openPrivateCloud(opts) {
    opts = opts || {};
    const target = opts.target;
    const circleId = opts.circleId;
    if (!Auth?.user || !target?.id || !circleId) return null;
    this.kind = 'dm';
    this.dmUser = { id: target.id, name: target.name, lat: target.lat, lng: target.lng, emoji: target.emoji };
    this.teamId = circleId;
    this.teamName = 'DM · ' + (target.name || 'User');
    this.members.clear();
    const self = this.selfMember();
    this.members.set(self.id, self);
    this.members.set(target.id, {
      id: target.id,
      name: target.name || 'User',
      lat: target.lat ?? self.lat,
      lng: target.lng ?? self.lng,
      emoji: target.emoji || '👤',
    });
    this.messages = (opts.messages || []).map((m) => ({
      author: m.author || '?',
      name: m.author,
      body: m.body || m.text,
      t: m.t || Date.now(),
      author_id: m.author_id,
    }));
    this.compromised = null;
    ContextTruth?.clearCompromised?.();
    await this._joinChannel(circleId);
    this._openCloud(this.teamName);
    this._rebuildViz();
    this._renderMessages();
    ContextTruth?.sync?.();
    return circleId;
  },

  async openSession(opts) {
    opts = opts || {};
    if (!Auth?.user) {
      ACIControl?.reply('Sign in for map chat');
      return null;
    }
    const id = opts.id || ('mapteam-' + Date.now().toString(36));
    this.kind = opts.kind || 'team';
    this.teamName = (opts.name || opts.title || 'Cloud chat').slice(0, 56);
    this.teamId = id;
    this.members.clear();
    (opts.members || []).forEach((m) => {
      const id = m?.id ?? m?.user_id;
      if (id != null && m.lat != null && m.lng != null) {
        this.members.set(id, { ...m, id, name: m.name || m.display_name || 'User' });
      }
    });
    const self = this.selfMember();
    if (!this.members.has(self.id)) this.members.set(self.id, { ...self, role: opts.selfRole || 'member' });
    if (opts.persist !== false && this.kind === 'team') {
      try {
        await Auth.client.from('circles').upsert({
          id,
          name: this.teamName,
          scope: 'map_team',
          type: 'team',
          owner_id: Auth.user.id,
          map_members: [...this.members.values()],
          map_center_lat: this._centroid(this.memberList()).lat,
          map_center_lng: this._centroid(this.memberList()).lng,
        });
      } catch (_) {}
    }
    if (opts.messages) this.messages = opts.messages.slice();
    await this._joinChannel(id);
    this._openCloud(this.teamName);
    this._rebuildViz();
    this._renderMessages();
    if (opts.showDriverPicker && opts.drivers?.length) {
      this.renderDriverPicker(opts.drivers, opts.orderId);
    } else if (opts.showDriverPicker === false) {
      this.hideDriverPicker();
    }
    return id;
  },

  async createTeam(name) {
    const self = this.selfMember();
    const id = await this.openSession({
      name: name || 'Cloud team',
      kind: 'team',
      members: [self],
    });
    if (id) {
      ACIControl?.reply('Team «' + this.teamName + '» — share: team join ' + id);
      AciCli?.print('team id · ' + id, 'ok');
    }
    return id;
  },

  async joinTeam(id) {
    if (!Auth?.user) {
      ACIControl?.reply('Sign in to join a map team');
      return;
    }
    const teamId = (id || '').trim();
    if (!teamId.startsWith('mapteam-') && !teamId.startsWith('mapdm-')) {
      ACIControl?.reply('usage: team join mapteam-… · mapdm-…');
      return;
    }
    this.teamId = teamId;
    this.kind = teamId.startsWith('mapdm-') ? 'dm' : 'team';
    if (this.kind !== 'dm') this.dmUser = null;
    try {
      const { data } = await Auth.client.from('circles').select('name,map_members').eq('id', teamId).maybeSingle();
      if (data?.name) this.teamName = data.name;
      (data?.map_members || []).forEach((m) => {
        if (m?.id) this.members.set(m.id, m);
      });
      const msgs = await fetch(SB_URL + '/rest/v1/circle_messages?circle_id=eq.' + encodeURIComponent(teamId) + '&order=ts.desc&limit=40', {
        headers: await Auth.authHeaders(),
      }).then(r => r.ok ? r.json() : []);
      this.messages = (msgs || []).reverse();
    } catch (_) {}
    const self = this.selfMember();
    this.members.set(self.id, self);
    if (this.kind === 'dm') {
      const other = [...this.members.values()].find((m) => m.id && m.id !== Auth.user.id);
      if (other) {
        this.dmUser = { id: other.id, name: other.name, lat: other.lat, lng: other.lng, emoji: other.emoji };
        if (!this.teamName || this.teamName === teamId) this.teamName = 'DM · ' + (other.name || 'User');
      } else {
        const peerId = teamId.replace(/^mapdm-/, '').split('--').find((p) => p && p !== Auth.user.id);
        if (peerId) {
          try {
            const { data: prof } = await Auth.client.from('profiles')
              .select('id, display_name, field_lat, field_lng, avatar_emoji')
              .eq('id', peerId).maybeSingle();
            if (prof) {
              this.dmUser = {
                id: prof.id,
                name: prof.display_name || 'User',
                lat: prof.field_lat,
                lng: prof.field_lng,
                emoji: prof.avatar_emoji || '👤',
              };
              this.members.set(prof.id, this.dmUser);
              if (!this.teamName || this.teamName === teamId) this.teamName = 'DM · ' + (prof.display_name || 'User');
            }
          } catch (_) {}
        }
      }
    }
    await this._joinChannel(teamId);
    this._openCloud(this.teamName);
    this._rebuildViz();
    this._renderMessages();
    AciCli?.print('◎ joined ' + this.teamName, 'ok');
    ContextTruth?.sync?.();
  },

  async leaveTeam() {
    if (this.rtChannel && Auth?.client) {
      try { await Auth.client.removeChannel(this.rtChannel); } catch (_) {}
    }
    this.rtChannel = null;
    this.teamId = null;
    this.kind = 'team';
    this.members.clear();
    this.messages = [];
    this.dmUser = null;
    this.compromised = null;
    ContextTruth?.clearCompromised?.();
    this._clearViz();
    this.closeCloud();
    this.hideDriverPicker();
    ContextTruth?.sync?.();
  },

  async _joinChannel(teamId) {
    if (!Auth?.client) return;
    if (this.rtChannel) {
      try { await Auth.client.removeChannel(this.rtChannel); } catch (_) {}
      this.rtChannel = null;
    }
    const ch = Auth.client.channel('map-team-' + teamId, {
      config: { broadcast: { self: false }, presence: { key: Auth.user.id } },
    });
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => this._onChat(payload));
    ch.on('broadcast', { event: 'member' }, ({ payload }) => this._onMember(payload));
    ch.on('broadcast', { event: 'call' }, ({ payload }) => this._onCallSignal(payload));
    ch.on('presence', { event: 'sync' }, () => this._syncPresence(ch));
    await ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const self = this.selfMember();
        await ch.track(self);
        ch.send({ type: 'broadcast', event: 'member', payload: self });
      }
    });
    this.rtChannel = ch;
  },

  _syncPresence(ch) {
    const state = ch.presenceState();
    Object.keys(state).forEach((key) => {
      (state[key] || []).forEach((p) => {
        if (p?.id) this.members.set(p.id, p);
      });
    });
    this._rebuildViz();
  },

  _onMember(m) {
    if (!m?.id) return;
    this.members.set(m.id, m);
    this._rebuildViz();
  },

  _onChat(msg) {
    if (!msg?.body) return;
    this._checkIntrusion(msg);
    this.messages.push(msg);
    if (this.messages.length > 80) this.messages.shift();
    this._renderMessages();
    this._persistMessage(msg);
  },

  _checkIntrusion(msg) {
    const uid = msg.author_id || msg.from || msg.user_id;
    const selfId = Auth?.user?.id;
    if (!uid || uid === selfId) return;
    if (this.kind === 'dm' && this.dmUser?.id && uid !== this.dmUser.id) {
      this.compromised = { id: uid, name: msg.author || msg.name || 'Intruder', at: Date.now() };
      ContextTruth?.setCompromised?.(this.compromised);
      this.postSystem('⚠ COMPROMISED — unexpected sender: ' + (msg.author || uid.slice(0, 8)));
      return;
    }
    if (this.kind === 'team' && this.members?.size && !this.members.has(uid)) {
      this.compromised = { id: uid, name: msg.author || msg.name || 'Intruder', at: Date.now() };
      ContextTruth?.setCompromised?.(this.compromised);
      this.postSystem('⚠ COMPROMISED — non-member on team cloud: ' + (msg.author || uid.slice(0, 8)));
    }
  },

  _applyCloudTruth() {
    const cloud = document.getElementById('map-comms-cloud');
    if (!cloud) return;
    const mode = this.compromised ? 'compromised' : (this.kind || 'team');
    cloud.dataset.truth = mode;
    if (this.compromised) {
      cloud.classList.add('compromised');
      this.BLUE = 0xff3344;
      this.BLUE_GLOW = 0xff6688;
    } else {
      cloud.classList.remove('compromised');
      this.BLUE = 0x1a6fd4;
      this.BLUE_GLOW = 0x3d9eff;
    }
    this._rebuildViz();
    ContextTruth?.sync?.();
  },

  async _persistMessage(msg) {
    if (!this.teamId || !Auth?.client) return;
    try {
      await Auth.client.from('circle_messages').insert({
        circle_id: this.teamId,
        author: msg.author || msg.name || 'user',
        author_id: msg.author_id || Auth?.user?.id || null,
        text: msg.body,
        ts: msg.t || Date.now(),
      });
    } catch (_) {}
  },

  sendFromInput() {
    const input = document.getElementById('mc-input');
    const body = (input?.value || '').trim();
    if (!body) return;
    if (input) input.value = '';
    this.sendMessage(body);
  },

  postSystem(body) {
    const msg = { author: '◎', name: '◎', body: String(body || '').slice(0, 500), t: Date.now(), system: true };
    this._onChat(msg);
  },

  sendMessage(body) {
    const self = this.selfMember();
    const msg = {
      author: self.name,
      author_id: self.id,
      body: body.slice(0, 500),
      lat: self.lat,
      lng: self.lng,
      t: Date.now(),
    };
    this._onChat(msg);
    this.rtChannel?.send({ type: 'broadcast', event: 'chat', payload: msg });
    if (this.dmUser) this._sendDm(msg);
    if (this.kind === 'dm' && this.dmUser?.id) {
      CliHub?.queueLine?.(msg.body, 'out', { peer_id: this.dmUser.id, circle_id: this.teamId });
    }
  },

  _youtubeFromMsg(m) {
    return GlobeVideo?.parseId?.(m.body) || GlobeVideo?.parseId?.(m.url) || null;
  },

  _lineHtml(m) {
    const yt = this._youtubeFromMsg(m);
    const vid = yt
      ? ('<div class="mc-yt-card"><iframe title="YouTube preview" src="https://www.youtube-nocookie.com/embed/'
        + yt + '?rel=0&modestbranding=1&playsinline=1" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>')
      : '';
    return '<div class="mc-line"><b>' + this.esc(m.author || m.name) + '</b> ' + this.esc(m.body) + vid + '</div>';
  },

  showCloudVideo(videoId, title) {
    const box = document.getElementById('mc-media');
    const cloud = document.getElementById('map-comms-cloud');
    if (!box) return;
    const id = GlobeVideo?.parseId?.(videoId) || videoId;
    if (!id) return;
    cloud?.classList.add('has-media');
    if (!cloud?.classList.contains('open')) cloud?.classList.add('open');
    box.classList.add('open');
    box.innerHTML = '<div class="mc-yt-title">▶ ' + this.esc((title || 'YouTube').slice(0, 56)) + '</div>'
      + '<div class="mc-yt-wrap"><button type="button" class="mc-yt-close">✖</button>'
      + '<iframe title="' + this.esc(title || 'YouTube') + '" src="https://www.youtube-nocookie.com/embed/'
      + id + '?rel=0&modestbranding=1&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
    box.querySelector('.mc-yt-close')?.addEventListener('click', () => this.hideCloudVideo());
  },

  hideCloudVideo() {
    const box = document.getElementById('mc-media');
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
    document.getElementById('map-comms-cloud')?.classList.remove('has-media');
  },

  _renderMessages() {
    const log = document.getElementById('mc-log');
    if (!log) return;
    const msgs = this.messages.slice(-40);
    const global = GlobeEntity?.isGlobalView?.();

    if (global && msgs.length >= 3) {
      const groups = new Map();
      msgs.forEach((m) => {
        const lat = m.lat ?? this._center?.lat ?? 36.22;
        const lng = m.lng ?? this._center?.lng ?? 28.12;
        const key = GlobeEntity?.cellKey?.(lat, lng) || '0:0';
        const g = groups.get(key) || { key, lat, lng, items: [] };
        g.items.push(m);
        groups.set(key, g);
      });
      log.innerHTML = [...groups.values()].map((g) => {
        if (g.items.length < 2) return this._lineHtml(g.items[0]);
        const yt = g.items.map((m) => this._youtubeFromMsg(m)).find(Boolean);
        const vid = yt
          ? ('<div class="mc-yt-card"><iframe title="YouTube" src="https://www.youtube-nocookie.com/embed/'
            + yt + '?rel=0&modestbranding=1&playsinline=1" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>')
          : '';
        return '<details class="mc-cluster"><summary>☁ ' + g.items.length + ' · '
          + g.lat.toFixed(1) + '°, ' + g.lng.toFixed(1) + '°</summary><div class="mc-cluster-body">'
          + g.items.map((m) => this._lineHtml(m)).join('') + vid + '</div></details>';
      }).join('');
    } else {
      log.innerHTML = msgs.slice(-24).map((m) => this._lineHtml(m)).join('');
      const lastYt = [...msgs].reverse().map((m) => this._youtubeFromMsg(m)).find(Boolean);
      if (lastYt) this.showCloudVideo(lastYt, 'Latest video');
    }
    log.scrollTop = log.scrollHeight;
  },

  _openCloud(title) {
    const cloud = document.getElementById('map-comms-cloud');
    if (!cloud) return;
    document.getElementById('mc-title').textContent = title || 'Cloud chat';
    cloud.classList.add('open');
    cloud.dataset.kind = this.kind || 'team';
    this._applyCloudTruth();
    this._renderMessages();
    ContextTruth?.sync?.();
  },

  closeCloud() {
    document.getElementById('map-comms-cloud')?.classList.remove('open');
    document.getElementById('map-comms-contact')?.classList.remove('open');
    this.hideCloudVideo();
    this.hideDriverPicker();
    if (this._beamSvg) this._beamSvg.innerHTML = '';
  },

  renderDriverPicker(drivers, orderId) {
    const box = document.getElementById('mc-drivers');
    if (!box) return;
    const list = drivers || [];
    if (!list.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.dataset.orderId = orderId || '';
    const u = Commerce?.userLatLng?.() || window._lastPos || {};
    box.innerHTML = '<div class="mc-drivers-title">🚚 Choose delivery driver</div>'
      + list.slice(0, 8).map((d) => {
        const km = d.km != null ? d.km.toFixed(1) : (Commerce?.haversineKm?.(u.lat, u.lng, d.field_lat, d.field_lng)?.toFixed(1) || '?');
        return '<button type="button" class="mc-driver-pick" data-driver-id="' + this.esc(d.id) + '">'
          + this.esc(d.avatar_emoji || d.emoji || '🚚') + ' ' + this.esc(d.display_name || d.name || 'Driver')
          + ' · ' + km + ' km</button>';
      }).join('');
    box.querySelectorAll('.mc-driver-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.driverId;
        if (id) MarketplaceComms?.selectDriver?.(id);
      });
    });
  },

  hideDriverPicker() {
    const box = document.getElementById('mc-drivers');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  },

  contactMenu(user) {
    if (!user?.id) return;
    const hud = document.getElementById('map-comms-contact');
    if (!hud) return;
    hud.dataset.userId = user.id;
    document.getElementById('mc-contact-name').textContent = (user.emoji || '👤') + ' ' + (user.name || 'User');
    hud.classList.add('open');
    GlobeEntity?.clearSelection?.();
  },

  async contactUser(userId, mode) {
    const u = [...(window.others || []), this.selfMember()].find(x => x.id === userId)
      || this.members.get(userId);
    if (!u) {
      ACIControl?.reply('User not on map');
      return;
    }
    document.getElementById('map-comms-contact')?.classList.remove('open');
    const m = (mode || 'message').toLowerCase();
    if (m === 'message' || m === 'msg' || m === 'chat') {
      if (CliHub?.startPrivateCloud) {
        await CliHub.startPrivateCloud(u.id);
        return;
      }
      this.dmUser = u;
      this._openCloud('DM · ' + u.name);
      ACIControl?.reply('Message ' + u.name + ' in the cloud above the map');
      return;
    }
    if (m === 'video') return this.startVideoCall(u);
    if (m === 'voice' || m === 'audio') return this.startVoiceCall(u);
    if (m === 'landline' || m === 'cellular' || m === 'phone') return this.startPhoneCall(u, m);
    ACIControl?.reply('contact: video · voice · message · landline · cellular');
  },

  async _userPhone(userId) {
    try {
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/profiles?select=phone,display_name&id=eq.' + encodeURIComponent(userId) + '&limit=1', { headers });
      const rows = r.ok ? await r.json() : [];
      return rows[0]?.phone || null;
    } catch { return null; }
  },

  async startPhoneCall(user, kind) {
    const phone = await this._userPhone(user.id);
    if (!phone) {
      ACIControl?.reply('No phone on file — use message or ask them to add phone in profile');
      this.dmUser = user;
      this._openCloud('DM · ' + user.name);
      return;
    }
    const tel = phone.replace(/\s/g, '');
    ACIControl?.reply((kind === 'landline' ? 'Landline' : 'Cellular') + ' · ' + user.name);
    AciCli?.print('tel:' + tel, 'ok');
    window.open('tel:' + tel, '_self');
  },

  async startVoiceCall(user) {
    if (!navigator.mediaDevices?.getUserMedia) {
      ACIControl?.reply('Microphone not available');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._inviteCall(user, 'voice');
      ACIControl?.reply('Voice call to ' + user.name + ' — invite sent on map mesh');
      MapDepict?.pulse?.(user.lat, user.lng, 0x3d9eff, 'voice → ' + user.name, 10000);
      setTimeout(() => stream.getTracks().forEach(t => t.stop()), 60000);
    } catch (e) {
      ACIControl?.reply('Mic denied — allow microphone for voice call');
    }
  },

  async startVideoCall(user) {
    this._inviteCall(user, 'video');
    if (typeof startOrbitalVideoCall === 'function') {
      startOrbitalVideoCall(user.name);
    } else {
      ACIControl?.reply('Video invite to ' + user.name + ' — WebRTC starting');
    }
    MapDepict?.pulse?.(user.lat, user.lng, 0x3d9eff, 'video → ' + user.name, 12000);
  },

  _inviteCall(user, kind) {
    const payload = {
      type: 'invite',
      kind,
      from: this.selfMember(),
      to: user.id,
      t: Date.now(),
    };
    const chName = 'map-call-' + [Auth.user.id, user.id].sort().join('-');
    if (!this.callChannel) {
      this.callChannel = Auth.client.channel(chName, { config: { broadcast: { self: false } } });
      this.callChannel.on('broadcast', { event: 'call' }, ({ payload: p }) => this._onCallSignal(p));
      this.callChannel.subscribe();
    }
    this.callChannel.send({ type: 'broadcast', event: 'call', payload });
    this.rtChannel?.send({ type: 'broadcast', event: 'call', payload });
  },

  _onCallSignal(p) {
    if (!p || p.to !== Auth?.user?.id) return;
    const from = p.from?.name || 'User';
    if (p.type === 'invite') {
      ACIControl?.reply(from + ' · ' + (p.kind || 'call') + ' — tap player or type: contact ' + from + ' ' + p.kind);
      GlobeDeck?.setPreview?.('📞 ' + from + ' · ' + p.kind);
    }
  },

  async _sendDm(msg) {
    if (!this.dmUser?.id || !Auth?.client) return;
    const chName = 'map-dm-' + [Auth.user.id, this.dmUser.id].sort().join('-');
    const ch = Auth.client.channel(chName, { config: { broadcast: { self: false } } });
    await ch.subscribe();
    ch.send({ type: 'broadcast', event: 'chat', payload: { ...msg, to: this.dmUser.id } });
    setTimeout(() => { try { Auth.client.removeChannel(ch); } catch (_) {} }, 3000);
  },

  _centroid(members) {
    if (!members.length) return { lat: 36.22, lng: 28.12 };
    let lat = 0, lng = 0;
    members.forEach((m) => { lat += m.lat; lng += m.lng; });
    return { lat: lat / members.length, lng: lng / members.length };
  },

  _clearViz() {
    if (this._viz?.parent) this._viz.parent.remove(this._viz);
    this._viz = null;
    this._lines = [];
  },

  _rebuildViz() {
    if (!globePivot) return;
    this._clearViz();
    const members = this.memberList();
    if (members.length < 1) return;

    const group = new THREE.Group();
    group.name = 'mapCommsViz';
    const center = this._centroid(members);
    this._center = center;

    const sorted = members.slice().sort((a, b) => {
      const angA = Math.atan2(a.lat - center.lat, a.lng - center.lng);
      const angB = Math.atan2(b.lat - center.lat, b.lng - center.lng);
      return angA - angB;
    });

    const ringPts = sorted.map((m) => {
      const p = latLngToPos(m.lat, m.lng, this.SURFACE_R);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    if (ringPts.length >= 2) {
      const closed = ringPts.concat([ringPts[0].clone()]);
      this._addGlowLine(group, closed);
      ringPts.forEach((pt) => this._addGlowLine(group, [this._surfaceCenter(center), pt]));
    }

    const sky = this._skyPoint(center);
    this._skyAnchor = sky;
    this._addGlowLine(group, [this._surfaceCenter(center), sky]);

    const cloudGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: this.BLUE_GLOW,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.position.copy(sky);
    group.add(cloudMesh);

    globePivot.add(group);
    this._viz = group;
  },

  _surfaceCenter(c) {
    const p = latLngToPos(c.lat, c.lng, this.SURFACE_R);
    return new THREE.Vector3(p.x, p.y, p.z);
  },

  _skyPoint(c) {
    const p = latLngToPos(c.lat, c.lng, this.CLOUD_R);
    return new THREE.Vector3(p.x, p.y, p.z);
  },

  _addGlowLine(group, points) {
    const glow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: this.BLUE, transparent: true, opacity: 0.22 })
    );
    const core = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: this.BLUE_GLOW, transparent: true, opacity: 0.78 })
    );
    group.add(glow);
    group.add(core);
    this._lines.push(glow, core);
  },

  tick() {
    const global = GlobeEntity?.isGlobalView?.();
    if (global !== this._wasGlobal) {
      this._wasGlobal = global;
      if (document.getElementById('map-comms-cloud')?.classList.contains('open') && this.messages.length) {
        this._renderMessages();
      }
    }
    if (!this._viz || !this._lines.length) {
      if (this._beamSvg) this._beamSvg.innerHTML = '';
      return;
    }
    this._pulse += 0.04;
    const o = 0.55 + Math.sin(this._pulse) * 0.22;
    this._lines.forEach((ln, i) => {
      if (ln.material) ln.material.opacity = (i % 2 ? 0.78 : 0.22) * (0.85 + Math.sin(this._pulse + i) * 0.15);
    });

    const members = this.memberList();
    (window.others || []).forEach((u) => {
      if (this.teamId && !this.members.has(u.id)) {
        this.members.set(u.id, u);
      }
    });
    if (Auth?.user) {
      const self = this.selfMember();
      this.members.set(self.id, self);
    }
    if (members.length >= 1 && this.teamId) this._rebuildVizThrottled();

    this._updateBeam();
    this._updateMemberPositions();
  },

  _rebuildTick: 0,
  _rebuildVizThrottled() {
    const now = Date.now();
    if (now - this._rebuildTick < 2800) return;
    this._rebuildTick = now;
    this._rebuildViz();
  },

  _updateMemberPositions() {
    if (!this.rtChannel || !Auth?.user) return;
    const self = this.selfMember();
    const prev = this.members.get(self.id);
    if (!prev || Math.abs(prev.lat - self.lat) > 0.0001 || Math.abs(prev.lng - self.lng) > 0.0001) {
      this.members.set(self.id, self);
      this.rtChannel.track(self);
      this.rtChannel.send({ type: 'broadcast', event: 'member', payload: self });
    }
  },

  _updateBeam() {
    const svg = this._beamSvg;
    const cloud = document.getElementById('map-comms-cloud');
    if (!svg || !cloud?.classList.contains('open') || !this._center || !camera) {
      if (svg) svg.innerHTML = '';
      return;
    }
    const centerWorld = this._surfaceCenter(this._center);
    const cScr = centerWorld.clone().project(camera);
    const cx = (cScr.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-cScr.y * 0.5 + 0.5) * window.innerHeight;
    const cr = cloud.getBoundingClientRect();
    const x1 = cr.left + cr.width / 2;
    const y1 = cr.bottom - 4;
    if (cScr.z > 1) { svg.innerHTML = ''; return; }
    svg.innerHTML = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + cx + '" y2="' + cy + '" />'
      + '<line class="mc-beam-glow" x1="' + x1 + '" y1="' + y1 + '" x2="' + cx + '" y2="' + cy + '" />';
  },

  async cmd(parts) {
    const sub = (parts[1] || 'help').toLowerCase();
    const rest = parts.slice(2).join(' ');
    if (sub === 'create' || sub === 'new') return this.createTeam(rest || 'Cloud team');
    if (sub === 'join') return this.joinTeam(rest);
    if (sub === 'leave') { await this.leaveTeam(); ACIControl?.reply('Left map team'); return; }
    if (sub === 'msg' || sub === 'say') { this.sendMessage(rest); return; }
    ACIControl?.reply('team create <name> · team join <id> · team leave · team say <text>');
  },

  async contactCmd(parts) {
    const mode = (parts[1] || 'message').toLowerCase();
    const name = parts.slice(2).join(' ').toLowerCase();
    const u = (window.others || []).find(x => (x.name || '').toLowerCase().includes(name));
    if (!u) {
      ACIControl?.reply('Tap a player on the map or: contact video <name>');
      return;
    }
    return this.contactUser(u.id, mode);
  },
};

window.MapComms = MapComms;
