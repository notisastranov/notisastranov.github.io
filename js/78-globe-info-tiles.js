// === GLOBE INFO + VIDEO TILES ===
// Popup labels that ride the rotating globe (same system as SpaceNet place tiles).
// SpaceX / YouTube updates pin as media tiles · crawl results pin as info tiles.
const GlobeInfoTiles = {
  version: '20260717-tiles',
  _lastSpaceX: 0,
  SPACEX_PINS: {
    starbase: { lat: 25.9971, lng: -97.1554, name: 'Starbase · Pad 2' },
    cape: { lat: 28.5623, lng: -80.5774, name: 'Cape Canaveral' },
    vandenberg: { lat: 34.6321, lng: -120.6106, name: 'Vandenberg' },
    hawthorne: { lat: 33.9207, lng: -118.3280, name: 'SpaceX HQ' },
  },

  init(opts) {
    if (this._inited) return;
    this._inited = true;
    opts = opts || {};
    window.GlobeInfoTiles = this;
    this._wireSuperSpace();
    // NEVER auto-fetch YouTube/Piped on boot — kills mobile main thread
    // Pin one static F13 marker only (no network)
    if (opts.seed !== false) {
      setTimeout(() => {
        try {
          this.pinInfo({
            id: 'spacex-f13-event',
            lat: this.SPACEX_PINS.starbase.lat,
            lng: this.SPACEX_PINS.starbase.lng,
            title: 'Starship Flight 13',
            description: 'Tap · or type spacex / starship',
            icon: '🚀',
            color: 0xff6622,
            urgency: 2,
            fly: false,
            onTap: async () => {
              await this.refreshSpaceXVideos({ fly: true });
              StarshipFlight13?.focusPad?.();
            },
          });
        } catch (e) {
          console.warn('[GlobeInfoTiles] seed soft-fail', e);
        }
      }, window._globePerfLite ? 6000 : 3500);
    }
    console.log('%c[GlobeInfoTiles] video/info tiles · demand-load', 'color:#3d9eff;font-weight:700');
  },

  _wireSuperSpace() {
    const self = this;
    window.SuperSpace = Object.assign(window.SuperSpace || {}, {
      init() { self.init(); },
      stop() {},
      tick() {},
      status() {
        return {
          tiles: self.count(),
          version: self.version,
        };
      },
      async locateForMedia(query, meta) {
        return self.pinVideoFromMeta(query, meta);
      },
      async locateText(text) {
        return self.pinInfoFromQuery(text);
      },
      zoomTo(level) {
        if (level === 'orbit' || level === 'space') {
          if (typeof camera !== 'undefined' && camera?.position) {
            window._globeFly = {
              mode: 'zoom', fromZ: camera.position.z, toZ: 5.05,
              t0: performance.now(), dur: 1200,
            };
          }
          if (window.CosmicZoom) CosmicZoom.level = 'orbit';
        }
      },
    });
  },

  count() {
    let n = 0;
    GlobeEntity?.entities?.forEach?.(e => {
      if (e.type === 'media' || e.type === 'news' || e.data?.infoTile) n++;
    });
    return n;
  },

  /** Resolve a place name / query to lat/lng (known POIs + heuristics). */
  resolvePlace(query) {
    const q = String(query || '').toLowerCase();
    if (/starbase|boca\s*chica|pad\s*2|starship/.test(q)) return { ...this.SPACEX_PINS.starbase };
    if (/cape\s*canaveral|kennedy|ksc|falcon/.test(q)) return { ...this.SPACEX_PINS.cape };
    if (/vandenberg|vafb|slc-4/.test(q)) return { ...this.SPACEX_PINS.vandenberg };
    if (/hawthorne|spacex\s*hq/.test(q)) return { ...this.SPACEX_PINS.hawthorne };
    if (/iss|space\s*station/.test(q)) {
      const iss = CosmicZoom?.issMarker?.userData;
      if (iss?.lat != null) return { lat: iss.lat, lng: iss.lng, name: 'ISS' };
      return { lat: 0, lng: -90, name: 'ISS (approx)' };
    }
    if (/mars|olympus\s*mons/.test(q)) return { lat: 18.65, lng: -133.8, name: 'Mars · Olympus (map proxy)' };
    if (/moon|lunar/.test(q)) return { lat: 0.67, lng: 23.47, name: 'Moon · Sea of Tranquility (proxy)' };
    if (/athens|αθήνα/.test(q)) return { lat: 37.9838, lng: 23.7275, name: 'Athens' };
    if (/rhodes|ρόδο/.test(q)) return { lat: 36.4341, lng: 28.2176, name: 'Rhodes' };
    const u = window._lastPos;
    if (u) return { lat: u.lat, lng: u.lng, name: 'Near you' };
    return { lat: 25.9971, lng: -97.1554, name: 'Starbase' };
  },

  pinInfo(opts) {
    opts = opts || {};
    const lat = opts.lat;
    const lng = opts.lng;
    if (lat == null || lng == null) return null;
    const id = opts.id || ('info-' + Math.round(lat * 100) + '-' + Math.round(lng * 100) + '-' + Date.now().toString(36).slice(-4));
    const entity = GlobeEntity?.register?.({
      id,
      type: opts.type || 'place',
      lat, lng,
      title: (opts.title || 'Info').slice(0, 64),
      description: (opts.description || opts.body || '').slice(0, 140),
      icon: opts.icon || '◎',
      urgency: opts.urgency != null ? opts.urgency : 3,
      color: opts.color || 0x3d9eff,
      persist: opts.persist !== false,
      expires: opts.expires || 0,
      altitude: opts.altitude || 1.032,
      data: {
        alwaysShowLabel: true,
        infoTile: true,
        body: opts.body || opts.description,
        url: opts.url,
        ...(opts.data || {}),
      },
      _actionLabel: opts.actionLabel || 'Open',
      onTap: opts.onTap || (() => {
        GlobeEntity?.select?.(entity);
        if (opts.url) window.open(opts.url, '_blank', 'noopener');
        ACIControl?.reply?.((opts.title || 'Info') + ' — ' + (opts.description || '').slice(0, 80));
      }),
    });
    if (opts.fly !== false) {
      GlobeControl?.flyToLatLng?.(lat, lng, opts.title || 'info', opts.zoom || GlobeControl?.Z?.national || 1.82, {});
    }
    MapDepict?.pulse?.(lat, lng, opts.color || 0x3d9eff, (opts.title || 'info').slice(0, 28), 8000);
    return entity;
  },

  pinVideo(opts) {
    opts = opts || {};
    const idYt = GlobeVideo?.parseId?.(opts.videoId || opts.url || opts.id);
    if (!idYt) return null;
    const place = opts.lat != null
      ? { lat: opts.lat, lng: opts.lng, name: opts.placeName || 'Location' }
      : this.resolvePlace(opts.placeQuery || opts.query || opts.title);
    const id = opts.entityId || ('vid-' + idYt);
    const thumb = opts.thumbnail || ('https://i.ytimg.com/vi/' + idYt + '/hqdefault.jpg');
    const title = (opts.title || 'Video').slice(0, 72);
    const desc = (opts.channel || opts.description || 'Tap to play on globe').slice(0, 100);

    const entity = GlobeEntity?.register?.({
      id,
      type: 'media',
      lat: place.lat,
      lng: place.lng,
      title: '▶ ' + title,
      description: desc,
      icon: '🎬',
      urgency: 3,
      color: 0xff6622,
      persist: opts.persist !== false,
      expires: opts.expires || 0,
      altitude: opts.altitude || 1.035,
      data: {
        alwaysShowLabel: true,
        pinVideo: true,
        youtubeId: idYt,
        thumbnail: thumb,
        infoTile: true,
        query: opts.query,
        placeName: place.name,
      },
      _actionLabel: 'Play video',
      onTap: () => {
        MapComms?.showCloudVideo?.(idYt, title);
        LazyModules?.ensure?.().then(() => {
          GlobeVideo?.play?.(idYt, { title, channel: opts.channel }, opts.query || title);
        });
        GlobeControl?.flyToLatLng?.(place.lat, place.lng, title.slice(0, 40), GlobeControl?.Z?.national || 1.82, {});
      },
    });

    // Enrich label with thumbnail (rotating tile)
    this._paintVideoLabel(entity, thumb, title, place.name);

    if (opts.fly !== false) {
      GlobeControl?.flyToLatLng?.(place.lat, place.lng, place.name || title.slice(0, 32), opts.zoom || GlobeControl?.Z?.national || 1.82, {});
    }
    MapDepict?.action?.('video', { lat: place.lat, lng: place.lng, detail: title.slice(0, 40) });
    AciCli?.print?.('video tile · ' + title.slice(0, 50) + ' @ ' + (place.name || ''), 'ok');
    return entity;
  },

  _paintVideoLabel(entity, thumb, title, placeName) {
    if (!entity?._labelEl) return;
    const el = entity._labelEl;
    el.classList.add('ge-video-tile', 'ge-travel-label');
    el.innerHTML = '<div class="ge-vid-thumb"><img src="' + this.esc(thumb) + '" alt="" loading="lazy" /></div>'
      + '<div class="ge-text"><b>' + this.esc(title.slice(0, 48)) + '</b>'
      + '<span>' + this.esc(placeName || 'Globe') + ' · tap play</span></div>';
    el.style.display = 'flex';
    el.onclick = (ev) => {
      ev.stopPropagation();
      entity.onTap?.(entity);
    };
  },

  esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  async pinVideoFromMeta(query, meta) {
    const id = meta?.id || GlobeVideo?.parseId?.(meta?.url) || GlobeVideo?.parseId?.(query);
    if (!id) {
      // fall back to place pin for query
      return this.pinInfoFromQuery(query);
    }
    return this.pinVideo({
      videoId: id,
      title: meta?.title || query,
      channel: meta?.channel,
      thumbnail: meta?.thumbnail,
      query,
      placeQuery: query,
      fly: true,
    });
  },

  async pinInfoFromQuery(text) {
    const place = this.resolvePlace(text);
    // Run SpaceNet crawl at place + pin summary tile
    void SpaceNetBrain?.crawlAll?.(place.lat, place.lng, 2);
    return this.pinInfo({
      lat: place.lat,
      lng: place.lng,
      title: place.name,
      description: String(text || 'Requested info').slice(0, 120),
      icon: '◎',
      urgency: 3,
      actionLabel: 'Explore',
      onTap: () => {
        MapPlaceMenu?.openAt?.(place.lat, place.lng, { label: place.name });
        SpaceNetBrain?.crawlAll?.(place.lat, place.lng, 3, { force: true });
      },
    });
  },

  /** Seed SpaceX / Starship video tiles (search + known NET pin). */
  async seedSpaceXTiles() {
    const now = Date.now();
    if (now - this._lastSpaceX < 10 * 60 * 1000 && this.count() > 0) return;
    this._lastSpaceX = now;

    // Always pin F13 event tile at Starbase
    this.pinInfo({
      id: 'spacex-f13-event',
      lat: this.SPACEX_PINS.starbase.lat,
      lng: this.SPACEX_PINS.starbase.lng,
      title: 'Starship Flight 13',
      description: 'NET window · type starship to sim · tap for SpaceX videos',
      icon: '🚀',
      color: 0xff6622,
      urgency: 3,
      fly: false,
      actionLabel: 'SpaceX videos',
      onTap: async () => {
        await this.refreshSpaceXVideos({ fly: true });
        StarshipFlight13?.focusPad?.();
      },
    });

    // Async video search — never block boot
    void this.refreshSpaceXVideos({ fly: false });
  },

  async refreshSpaceXVideos(opts) {
    opts = opts || {};
    try {
      await LazyModules?.ensure?.();
      const queries = [
        'SpaceX Starship Flight 13',
        'SpaceX launch live',
        'SpaceX Starlink mission',
      ];
      const places = [
        this.SPACEX_PINS.starbase,
        this.SPACEX_PINS.cape,
        this.SPACEX_PINS.hawthorne,
      ];
      let placed = 0;
      for (let i = 0; i < queries.length; i++) {
        try {
          const items = await GlobeVideo?.pipedSearch?.(queries[i]);
          const v = items?.[0];
          if (!v?.id) continue;
          const place = places[i % places.length];
          this.pinVideo({
            videoId: v.id,
            title: v.title,
            channel: v.channel || 'SpaceX',
            thumbnail: v.thumbnail,
            lat: place.lat,
            lng: place.lng,
            placeName: place.name,
            query: queries[i],
            fly: false,
            entityId: 'spacex-yt-' + i + '-' + v.id,
          });
          placed++;
        } catch (_) { /* next query */ }
      }
      if (placed && opts.fly !== false) {
        const p = this.SPACEX_PINS.starbase;
        GlobeControl?.flyToLatLng?.(p.lat, p.lng, 'SpaceX tiles', GlobeControl?.Z?.national || 1.9, {});
      }
      if (placed) {
        CliRibbon?.setNotice?.('SpaceX · ' + placed + ' video tiles on globe', 'ready');
        AciCli?.print?.('SpaceX video tiles · ' + placed + ' on globe', 'ok');
      }
      return placed;
    } catch (e) {
      AciCli?.print?.('SpaceX tiles · ' + (e.message || e), 'dim');
      return 0;
    }
  },

  /** SpaceNet crawler result → globe tile */
  pinCrawlResult(kind, data, lat, lng) {
    const place = { lat: lat ?? window._lastPos?.lat ?? 36.43, lng: lng ?? window._lastPos?.lng ?? 28.22 };
    if (kind === 'weather' && data) {
      return this.pinInfo({
        id: 'wx-' + place.lat.toFixed(2) + '-' + place.lng.toFixed(2),
        lat: place.lat, lng: place.lng,
        title: 'Weather · ' + (data.temp_c ?? '?') + '°C',
        description: 'Wind ' + (data.wind ?? '?') + ' · precip ' + (data.precip ?? 0),
        icon: '🌤',
        color: 0x66ccff,
        fly: false,
        expires: 20 * 60 * 1000,
      });
    }
    if (kind === 'drivers' && data?.count != null) {
      return this.pinInfo({
        id: 'drv-' + place.lat.toFixed(2),
        lat: place.lat, lng: place.lng,
        title: 'Drivers · ' + data.count,
        description: 'Delivery fleet near you',
        icon: '🚚',
        fly: false,
      });
    }
    if (kind === 'vendors' || kind === 'places') {
      const n = data?.count ?? data?.results?.places?.count;
      return this.pinInfo({
        id: 'shops-' + place.lat.toFixed(2),
        lat: place.lat, lng: place.lng,
        title: 'Shops · sector',
        description: n != null ? (n + ' found · crawl') : 'SpaceNet places',
        icon: '🏬',
        fly: false,
      });
    }
    return null;
  },

  wants(text) {
    return /spacex\s*video|video\s*tile|globe\s*video|starship\s*video|show\s*spacex|tiles?\s*on\s*globe/i.test(String(text || ''));
  },

  async handleCli(line) {
    const low = String(line || '').toLowerCase();
    if (/spacex|starship|flight\s*13|f13/.test(low)) {
      const n = await this.refreshSpaceXVideos({ fly: true });
      StarshipFlight13?.focusPad?.();
      return 'SpaceX video tiles · ' + n + ' · Starbase';
    }
    if (/refresh|reload/.test(low)) {
      const n = await this.refreshSpaceXVideos({ fly: true });
      return 'Refreshed · ' + n + ' tiles';
    }
    // Freeform: pin video search at resolved place
    const q = String(line || '').replace(/^(video\s*tile|tiles?|spacex)\s*/i, '').trim() || 'SpaceX';
    await LazyModules?.ensure?.();
    try {
      const items = await GlobeVideo?.pipedSearch?.(q);
      if (items?.[0]) {
        this.pinVideo({
          videoId: items[0].id,
          title: items[0].title,
          channel: items[0].channel,
          thumbnail: items[0].thumbnail,
          query: q,
          placeQuery: q,
          fly: true,
        });
        return 'Video tile · ' + items[0].title.slice(0, 48);
      }
    } catch (_) {}
    this.pinInfoFromQuery(q);
    return 'Info tile pinned for · ' + q.slice(0, 40);
  },
};
window.GlobeInfoTiles = GlobeInfoTiles;
