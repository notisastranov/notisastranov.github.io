// === SUPER ADD (+) — camera video post · channels · vendor · driver · map pin ===
const SuperAdd = {
  _stream: null,
  _recorder: null,
  _chunks: [],
  _blob: null,
  _facing: 'user',
  _recording: false,
  _markers: [],

  CHANNELS: [
    { id: 'global', label: 'Global channel' },
    { id: 'team', label: 'Team / batch' },
    { id: 'local', label: 'Local · near me' },
    { id: 'custom', label: 'Type channel…' },
  ],

  init() {
    if (this._bound) return;
    this._bound = true;
    document.getElementById('sa-close')?.addEventListener('click', () => this.hide());
    document.getElementById('sa-flip')?.addEventListener('click', () => this.flipCamera());
    document.getElementById('sa-record')?.addEventListener('click', () => this.toggleRecord());
    document.getElementById('sa-post')?.addEventListener('click', () => this.publish());
    document.getElementById('sa-channel')?.addEventListener('change', () => this._syncChannelUi());
    document.getElementById('sa-as-vendor')?.addEventListener('change', e => {
      const n = document.getElementById('sa-vendor-name');
      if (n) n.style.display = e.target.checked ? 'block' : 'none';
    });
    document.getElementById('sa-as-booker')?.addEventListener('change', e => {
      const on = e.target.checked;
      ['sa-booker-slug', 'sa-booker-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = on ? 'block' : 'none';
      });
    });
    // FAB also bound in SuperCli — keep both for deferred-load safety
    const fab = document.getElementById('super-add-fab');
    if (fab && !fab._superAddBound) {
      fab._superAddBound = true;
      fab.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        this.open();
      });
    }
    this._syncChannelUi();
    this.loadPostsOnGlobe();
  },

  open() {
    if (!this._bound) this.init();
    GlobeDeck?.expand?.(SuperCli?.title || 'Astranov');
    this.showPanel();
    this.startCamera();
    SuperCli?.setContext?.('add');
    AciCli?.print('▸ super add · camera', 'cmd');
    CliRibbon?.setNotice?.('Super Add · camera', 'ready');
    GlobeDeck?.setPreview?.('Super Add — record or post on the globe');
  },

  hide() {
    this.stopCamera();
    document.getElementById('globe-super-add')?.classList.remove('open', 'deck-active');
    if (GlobeDeck?.activeTask === 'add') GlobeDeck?.completeTask?.('add');
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  },

  showPanel() {
    GlobeDeck?.showStage?.('globe-super-add', 'add', 'Super Add · post video');
    const panel = document.getElementById('globe-super-add');
    if (panel) panel.classList.add('open', 'deck-active');
    const batch = AstranovNode?.shortId;
    const teamOpt = document.getElementById('sa-channel-team');
    if (teamOpt) teamOpt.textContent = batch ? ('Team · batch ' + batch) : 'Team · launch batch first';
  },

  _syncChannelUi() {
    const sel = document.getElementById('sa-channel');
    const custom = document.getElementById('sa-channel-custom');
    if (!sel || !custom) return;
    custom.style.display = sel.value === 'custom' ? 'block' : 'none';
  },

  _videoEl() {
    return document.getElementById('sa-preview');
  },

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      ACIControl?.reply('Camera not supported in this browser');
      return;
    }
    try {
      await this.stopCamera();
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this._facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      const v = this._videoEl();
      if (v) {
        v.srcObject = this._stream;
        v.muted = true;
        await v.play().catch(() => {});
      }
      document.getElementById('sa-status')?.replaceChildren(document.createTextNode('Camera ready · tap ● to record'));
    } catch (e) {
      ACIControl?.reply('Camera denied — allow camera in browser settings');
      AciCli?.print('camera error: ' + (e.message || e), 'err');
    }
  },

  async stopCamera() {
    if (this._recording) await this.stopRecord();
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    const v = this._videoEl();
    if (v) v.srcObject = null;
  },

  async flipCamera() {
    this._facing = this._facing === 'user' ? 'environment' : 'user';
    await this.startCamera();
    AciCli?.print('camera → ' + (this._facing === 'user' ? 'front' : 'back'), 'dim');
  },

  async toggleRecord() {
    if (this._recording) await this.stopRecord();
    else await this.startRecord();
  },

  async startRecord() {
    if (!this._stream) { await this.startCamera(); if (!this._stream) return; }
    this._chunks = [];
    this._blob = null;
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4');
    try {
      this._recorder = new MediaRecorder(this._stream, { mimeType: mime });
    } catch {
      this._recorder = new MediaRecorder(this._stream);
    }
    this._recorder.ondataavailable = e => { if (e.data?.size) this._chunks.push(e.data); };
    this._recorder.onstop = () => {
      this._blob = new Blob(this._chunks, { type: this._recorder.mimeType || 'video/webm' });
      const playback = document.getElementById('sa-playback');
      if (playback) {
        playback.src = URL.createObjectURL(this._blob);
        playback.classList.add('has-clip');
      }
    };
    this._recorder.start(400);
    this._recording = true;
    const btn = document.getElementById('sa-record');
    if (btn) { btn.textContent = '■ Stop'; btn.classList.add('recording'); }
    document.getElementById('sa-status')?.replaceChildren(document.createTextNode('Recording…'));
  },

  async stopRecord() {
    if (!this._recorder || this._recorder.state === 'inactive') {
      this._recording = false;
      return;
    }
    return new Promise(resolve => {
      this._recorder.onstop = () => {
        this._blob = new Blob(this._chunks, { type: this._recorder.mimeType || 'video/webm' });
        const playback = document.getElementById('sa-playback');
        if (playback) {
          playback.src = URL.createObjectURL(this._blob);
          playback.classList.add('has-clip');
        }
        resolve();
      };
      this._recorder.stop();
      this._recording = false;
      const btn = document.getElementById('sa-record');
      if (btn) { btn.textContent = '● Record'; btn.classList.remove('recording'); }
      document.getElementById('sa-status')?.replaceChildren(document.createTextNode('Clip ready · choose channel & post'));
    });
  },

  _channelValue() {
    const sel = document.getElementById('sa-channel');
    const custom = document.getElementById('sa-channel-custom');
    const v = sel?.value || 'global';
    if (v === 'team') return AstranovNode?.channel || ('batch-' + (AstranovNode?.shortId || 'team'));
    if (v === 'local') return 'local';
    if (v === 'custom') return (custom?.value || '').trim() || 'custom';
    return 'global';
  },

  async _uploadVideo(blob) {
    if (!Auth?.user || !Auth?.client) throw new Error('login required — tap G');
    const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
    const path = Auth.user.id + '/' + Date.now() + '.' + ext;
    const { error } = await Auth.client.storage.from('posts').upload(path, blob, {
      contentType: blob.type || 'video/webm',
      upsert: false,
    });
    if (error) throw new Error(error.message || 'upload failed');
    const { data } = Auth.client.storage.from('posts').getPublicUrl(path);
    return data?.publicUrl || (SB_URL + '/storage/v1/object/public/posts/' + path);
  },

  async registerDriver() {
    if (!Auth?.user) return;
    const pos = window._lastPos || {};
    const roles = Array.from(new Set([...(FieldBrain?.roles || ['client']), 'driver']));
    const headers = await Auth.authHeaders();
    await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
      method: 'PATCH', headers,
      body: JSON.stringify({ roles, field_lat: pos.lat ?? null, field_lng: pos.lng ?? null, field_seen_at: new Date().toISOString() }),
    });
    FieldBrain.roles = roles;
    FieldBrain?.updateChip?.();
    FieldBrain?.pulse?.('roles_sync', 'driver via Super Add', { role: 'driver' });
    AciCli?.print('registered as driver · visible to deliveries', 'ok');
  },

  async registerVendor(name) {
    if (!Auth?.user) return;
    const pos = window._lastPos || { lat: 36.44, lng: 28.22 };
    const vname = String(name || '').trim() || (Auth.user.user_metadata?.full_name || 'My shop');
    const id = 'v-' + Auth.user.id.slice(0, 8) + '-' + Date.now().toString(36);
    const headers = await Auth.authHeaders();
    const body = {
      id, owner_id: Auth.user.id, name: vname, emoji: '🏬',
      lat: pos.lat, lng: pos.lng, country: 'GR', city: 'field',
      items: [], is_active: true, delivery_enabled: true, category: 'field_add',
    };
    const r = await fetch(SB_URL + '/rest/v1/vendors', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'vendor create failed');
    }
    await FieldBrain?.onAuth?.();
    await Commerce?.loadVendors?.();
    MapDepict?.pulse?.(pos.lat, pos.lng, 0xff8844, vname, 16000);
    AciCli?.print('vendor added on map · ' + vname, 'ok');
    return body.id;
  },

  async pinMapDiscovery(caption, channel) {
    const pos = window._lastPos || { lat: 36.44, lng: 28.22 };
    MapDepict?.action?.('explore', { lat: pos.lat, lng: pos.lng, detail: caption || 'discovery' });
    this._placeMarker(pos.lat, pos.lng, caption || 'Found here', channel);
    FieldBrain?.pulse?.('explore', caption || 'map discovery', { role: 'client' });
  },

  _placeMarker(lat, lng, label, channel, url) {
    GlobeEntity?.syncPost?.({ id: 'live-' + Date.now(), lat, lng, text: label, channel, mode: url ? 'video' : 'text', url, author: Auth?.user?.email?.split('@')[0] });
  },

  async publish() {
    const caption = (document.getElementById('sa-caption')?.value || '').trim();
    const asVendor = document.getElementById('sa-as-vendor')?.checked;
    const asDriver = document.getElementById('sa-as-driver')?.checked;
    const asBooker = document.getElementById('sa-as-booker')?.checked;
    const asMap = document.getElementById('sa-as-map')?.checked;
    const vendorName = (document.getElementById('sa-vendor-name')?.value || '').trim();
    const bookerSlug = (document.getElementById('sa-booker-slug')?.value || '').trim();
    const bookerName = (document.getElementById('sa-booker-name')?.value || '').trim();
    const channel = this._channelValue();

    if (!Auth?.user) {
      ACIControl?.reply('Sign in (G) to post');
      Auth?.openLoginModal?.('Sign in to post');
      return;
    }

    if (!userLocated && navigator.geolocation) {
      await new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(p => {
          placeMe(p.coords.latitude, p.coords.longitude, { quiet: true, markerOnly: true });
          resolve();
        }, () => resolve());
      });
    }

    const pos = window._lastPos || { lat: 36.44, lng: 28.22 };
    const author = Auth.user.user_metadata?.full_name || Auth.user.email?.split('@')[0] || 'user';
    GlobeDeck?.setThinking?.(true, 'Posting…');

    try {
      let url = '';
      if (this._blob && this._blob.size > 800) {
        url = await this._uploadVideo(this._blob);
      }

      const postId = 'p-' + Date.now().toString(36);
      const headers = await Auth.authHeaders();
      const row = {
        id: postId,
        channel,
        author,
        url: url || null,
        mode: url ? 'video' : 'text',
        lat: pos.lat,
        lng: pos.lng,
        text: caption || (asMap ? 'Map discovery' : 'Super Add'),
      };
      const ins = await fetch(SB_URL + '/rest/v1/posts', { method: 'POST', headers, body: JSON.stringify(row) });
      if (!ins.ok) {
        const j = await ins.json().catch(() => ({}));
        throw new Error(j.message || j.error || 'post save failed');
      }

      if (asDriver) await this.registerDriver();
      let vendorId = null;
      if (asVendor) vendorId = await this.registerVendor(vendorName || caption);
      if (asBooker) {
        const prov = window.AstranovSitesProvision || window.SuperBookingProvision;
        const parsed = prov?.parseAsk?.(bookerSlug || bookerName || caption || vendorName) || {};
        await prov?.provision?.({
          slug: bookerSlug || parsed.slug,
          business_name: bookerName || parsed.name || vendorName || caption,
          business_type: parsed.businessType,
          mode: parsed.mode,
          vendor_id: vendorId,
        });
      }
      if (asMap || url) this._placeMarker(pos.lat, pos.lng, caption || author, channel, url);

      if (channel === 'global' || channel === 'local') {
        MapDepict?.action?.('video', { lat: pos.lat, lng: pos.lng, detail: caption || 'posted' });
      }

      FieldBrain?.pulse?.('post', channel + ' · ' + (caption || 'video').slice(0, 80), { role: 'client' });
      AciCli?.print('posted → ' + channel + (url ? ' · video' : ' · pin'), 'ok');
      ACIControl?.reply('Posted to ' + channel + (asVendor ? ' · vendor on map' : '') + (asBooker ? ' · Astranov Site' : '') + (asDriver ? ' · driver on' : ''));
      GlobeDeck?.setPreview?.('➕ posted · ' + channel);

      this._blob = null;
      this._chunks = [];
      const playback = document.getElementById('sa-playback');
      if (playback) { playback.removeAttribute('src'); playback.classList.remove('has-clip'); }
      const cap = document.getElementById('sa-caption');
      if (cap) cap.value = '';
    } catch (e) {
      AciCli?.print('post failed: ' + (e.message || e), 'err');
      ACIControl?.reply('Post failed — ' + (e.message || e));
    } finally {
      GlobeDeck?.setThinking?.(false);
    }
  },

  async loadPostsOnGlobe() {
    if (window._postsApiUnavailable) return;
    if (!Auth?.user) return;
    try {
      const r = await fetch(SB_URL + '/rest/v1/posts?select=id,channel,author,url,mode,lat,lng,text&order=created_at.desc&limit=24', {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      });
      if (r.status === 404) {
        window._postsApiUnavailable = true;
        return;
      }
      const rows = r.ok ? await r.json() : [];
      rows.forEach(p => {
        if (p.lat == null) return;
        GlobeEntity?.syncPost?.(p);
      });
    } catch { /* */ }
  },

  stop() {
    this.stopCamera();
  },
};
window.SuperAdd = SuperAdd;
