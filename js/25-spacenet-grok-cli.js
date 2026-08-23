// === SPACENET GROK CLI — street OS: city tasks · delivery · dating · jobs · search ===
// Every user intent becomes real action on the globe (pulse · arc · tier · city map).
// SpaceNet = the internet as solar→global→national→city→street on one Earth.
const SpaceNetGrokCli = {
  version: '20260722-city-dna-v2',
  history: [],
  busy: false,

  // Priority product surface — what SpaceNet is for
  STREET: {
    delivery: { color: 0x44ffaa, label: 'Delivery', kind: 'delivery' },
    dating: { color: 0xff6699, label: 'Dating', kind: 'dating' },
    job: { color: 0x66aaff, label: 'Job / gig', kind: 'job' },
    errand: { color: 0xffcc44, label: 'Errand', kind: 'errand' },
    service: { color: 0xaa88ff, label: 'Service', kind: 'service' },
    search: { color: 0xffffff, label: 'Search', kind: 'search' },
  },

  TOOLS: {
    locate: 'GPS drop-in on globe → city map',
    fly: 'Fly Earth to a place',
    zoom: 'Zoom tier solar|global|national|city|street',
    city: 'Open city / street map',
    delivery: 'Post or start delivery / order food',
    job: 'Post or find jobs & gigs (barman, nanny, …)',
    date: 'Open dating invite (coffee / dinner / walk)',
    errand: 'Pharmacy · grocery · document runs',
    task: 'City task DNA: list · claim · complete',
    search: 'Search people · tasks · places · web',
    order: 'Shops marketplace',
    browse: 'In-OS browser (SpaceNet tab)',
    crawl: 'Crawl sector vendors / weather / news',
    drive: 'Drive mode to pin',
    call: 'Voice / video path',
    help: 'This help',
  },

  CITIES: {
    athens: [37.9838, 23.7275], rhodes: [36.4341, 28.2176], london: [51.5074, -0.1278],
    paris: [48.8566, 2.3522], berlin: [52.52, 13.405], rome: [41.9028, 12.4964],
    newyork: [40.7128, -74.006], tokyo: [35.6762, 139.6503], dubai: [25.2048, 55.2708],
    starbase: [25.997, -97.156], hawthorne: [33.9207, -118.3278], cape: [28.5721, -80.648],
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    window.SpaceNetGrokCli = this;
    try {
      const input = document.getElementById('aci-cli-in');
      if (input) {
        input.placeholder = 'SpaceNet · job barman 3h · date coffee · deliver food · search · locate';
        input.dataset.spacenetGrok = '1';
      }
    } catch (_) {}
    // Soft seed: ensure CityTasks ready when features load
    try { CityTasks?.init?.(); } catch (_) {}
    console.info('%c[SpaceNetGrokCli] ' + this.version + ' · city DNA on the globe', 'color:#000;background:#fff;font-weight:700;padding:2px 8px');
  },

  printHelp() {
    AciCli?.print?.('── SpaceNet CLI · do anything on the globe ──', 'dim');
    AciCli?.print?.('CITY DNA (same pipeline for all work):', 'ok');
    AciCli?.print?.('  job barman 3h · job nanny 1d · gig cleaner 4h', 'ok');
    AciCli?.print?.('  date coffee 2h · date dinner · dating walk', 'ok');
    AciCli?.print?.('  deliver food · delivery package · errand pharmacy', 'ok');
    AciCli?.print?.('  task list · task claim · task done · task catalog', 'ok');
    AciCli?.print?.('FIND & MOVE:', 'ok');
    AciCli?.print?.('  locate · fly athens · zoom city · search barman near me', 'ok');
    AciCli?.print?.('  order · market · browse https://… · crawl · drive', 'ok');
    AciCli?.print?.('Every action paints the globe (pulse · arc · pin · route).', 'dim');
    GlobeDeck?.setPreview?.('SpaceNet · type a job, date, delivery, or search');
    CliRibbon?.setNotice?.('SpaceNet · street ready', 'ready');
    this.depict('explore', { detail: 'CLI help · SpaceNet' });
  },

  /** Always show intent on globe */
  depict(type, opts = {}) {
    try {
      MapDepict?.action?.(type, opts);
      if (opts.lat != null && opts.lng != null) {
        MapDepict?.pulse?.(opts.lat, opts.lng, opts.color || 0xffffff, opts.label || type, opts.duration || 10000);
      } else if (opts.pulse !== false) {
        const u = window._lastPos || { lat: 36.43, lng: 28.22 };
        const palette = {
          delivery: 0x44ffaa, dating: 0xff6699, job: 0x66aaff, errand: 0xffcc44,
          search: 0xffffff, order: 0xffaa44, location: 0x3d9eff, explore: 0x00aaff,
        };
        MapDepict?.pulse?.(u.lat, u.lng, opts.color || palette[type] || 0xffffff, opts.label || type, 8000);
      }
      if (opts.from && opts.to) {
        MapDepict?.arc?.(opts.from.lat, opts.from.lng, opts.to.lat, opts.to.lng, opts.color || 0x44ffaa, 14000);
      }
      if (opts.hud) MapDepict?.setHud?.(opts.hud, type);
      if (opts.preview) GlobeDeck?.setPreview?.(opts.preview);
    } catch (_) {}
  },

  pos() {
    return window._lastPos || { lat: 36.4341, lng: 28.2176 };
  },

  /**
   * Classify freeform → street-first actions.
   * Priority: help → task DNA → search → navigate → commerce → chat
   */
  plan(message) {
    const m = String(message || '').trim();
    const low = m.toLowerCase();
    const actions = [];
    let intent = 'chat';

        if (/\b(solo|alone|we build|status report)\b/i.test(low) && m.length < 48) {
      return { message: m, intent: 'solo', actions: [{ type: 'solo' }] };
    }

if (!m || /^help$|^\?$|what can you do|commands|how (do|to)/i.test(low)) {
      return { message: m, intent: 'help', actions: [{ type: 'help' }] };
    }

    // --- SEARCH anything ---
    if (/^(search|find|look\s*for|where\s+is|who\s+is)\b/i.test(low)
      || /\bsearch\s+(for\s+)?/i.test(low)
      || /\bfind\s+(me\s+)?(a\s+|an\s+)?(job|gig|date|driver|barman|work)/i.test(low)) {
      intent = 'search';
      const q = m.replace(/^(search|find|look\s*for)\s+/i, '').trim() || m;
      actions.push({ type: 'search', query: q });
      // If search implies job/date/delivery, also open that DNA
      if (/\b(job|gig|work|hire|barman|nanny|cleaner)\b/i.test(q)) {
        actions.push({ type: 'task_list', filter: 'jobs' });
      } else if (/\b(date|dating|coffee|dinner)\b/i.test(q)) {
        actions.push({ type: 'task_list', filter: 'dating' });
      } else if (/\b(deliver|driver|courier|food)\b/i.test(q)) {
        actions.push({ type: 'task_list', filter: 'delivery' });
      }
      return { message: m, intent, actions, low };
    }

    // --- TASK LIST / CLAIM / DONE ---
    if (/^task\b|\btask\s+list\b|\bmy\s+tasks\b|\bopen\s+tasks\b|\bcatalog\b|\broles\b/i.test(low)
      || (/\blist\b/.test(low) && /\b(task|job|date|delivery|errand|gig)/.test(low))) {
      intent = 'task';
      if (/\bcatalog|roles\b/.test(low)) actions.push({ type: 'task_cli', line: m });
      else if (/\bclaim|take|accept\b/.test(low)) actions.push({ type: 'task_cli', line: m });
      else if (/\b(done|complete|finish)\b/.test(low)) actions.push({ type: 'task_cli', line: m });
      else actions.push({ type: 'task_list', filter: this._listFilter(low) });
      return { message: m, intent, actions, low };
    }

    // --- DATING ---
    if (/\b(date|dating|coffee\s*date|dinner\s*date|romantic|meet\s*up|tinder)\b/i.test(low)
      && !/\blist\b/.test(low)) {
      intent = 'dating';
      actions.push({ type: 'city_enter' });
      actions.push({ type: 'date', text: m });
      return { message: m, intent, actions, low };
    }

    // --- JOBS / GIGS ---
    if (/\b(job|gig|hire|work\s+as|need\s+a|looking\s+for\s+work|barman|bartender|housekeeper|nanny|cleaner|waiter|cook|tutor|mover|security|pet\s*care|gardener)\b/i.test(low)
      && !/\blist\b/.test(low)) {
      intent = 'job';
      actions.push({ type: 'city_enter' });
      actions.push({ type: 'job', text: m });
      return { message: m, intent, actions, low };
    }

    // --- DELIVERY / ORDER ---
    if (/\b(deliver|delivery|courier|drop.?off|package|food\s*order|order\s+food|bring\s+me)\b/i.test(low)) {
      intent = 'delivery';
      actions.push({ type: 'city_enter' });
      actions.push({ type: 'delivery', text: m });
      return { message: m, intent, actions, low };
    }

    // --- ERRAND ---
    if (/\b(errand|pharmacy|grocery\s*run|pick\s*up\s+for\s+me|run\s+to)\b/i.test(low)) {
      intent = 'errand';
      actions.push({ type: 'city_enter' });
      actions.push({ type: 'errand', text: m });
      return { message: m, intent, actions, low };
    }

    // CityTasks freeform catch-all if module recognizes it
    if (window.CityTasks?.wants?.(m)) {
      intent = 'task';
      actions.push({ type: 'task_cli', line: m });
      return { message: m, intent, actions, low };
    }

    // --- LOCATE / NAV ---
    if (/locate|where am i|find me|gps|drop\s*in|🎯|📍/i.test(low) || /^(me|here)$/i.test(low)) {
      intent = 'locate';
      actions.push({ type: 'locate' });
    }
    for (const [name, ll] of Object.entries(this.CITIES)) {
      if (new RegExp('\\b' + name + '\\b', 'i').test(low)
        || (name === 'newyork' && /\bnew\s*york\b/i.test(low))) {
        intent = 'fly';
        actions.push({ type: 'fly', lat: ll[0], lng: ll[1], label: name });
        break;
      }
    }
    if (/\b(zoom|go\s*to\s+(solar|global|national|city|street)|show\s+(earth|world|city))\b/i.test(low)
      || /^(solar|global|national|city|street)$/i.test(low)) {
      let tier = 'global';
      if (/\bsolar|galaxy|space\b/i.test(low)) tier = 'solar';
      else if (/\bnational|country\b/i.test(low)) tier = 'national';
      else if (/\bstreet|neighborhood|city\b/i.test(low)) tier = 'city';
      actions.push({ type: 'zoom', tier });
      intent = intent === 'chat' ? 'zoom' : intent;
    }
    if (/\bcity\s*(map|view)|street\s*map|open\s*map\b/i.test(low)) {
      actions.push({ type: 'city_enter' });
      intent = 'city';
    }

    // Order / shops (commerce without "delivery" word)
    if (/\b(order|shop|shops|vendor|marketplace|buy)\b/i.test(low) && !actions.length) {
      intent = 'order';
      actions.push({ type: 'order', text: m });
    }

    // Browse
    const urlMatch = m.match(/https?:\/\/[^\s]+/i) || m.match(/astranov:\/\/[^\s]+/i);
    if (urlMatch || /\b(browse|open\s+url|visit)\b/i.test(low)) {
      intent = 'browse';
      actions.push({ type: 'browse', url: urlMatch ? urlMatch[0] : 'astranov://home' });
    }

    if (/\bcrawl|scan\s*(area|sector|city)\b/i.test(low)) actions.push({ type: 'crawl' });
    if (/\bdrive\b/i.test(low) && m.length < 40) actions.push({ type: 'drive' });
    if (/\b(call|video\s*call)\b/i.test(low)) actions.push({ type: 'call' });
    if (/\btheme\b|\bspacex\b/i.test(low) && m.length < 40) {
      actions.push({ type: 'theme', mode: /bright|light/.test(low) ? 'bright' : 'spacex' });
    }

    return { message: m, intent, actions, low };
  },

  _listFilter(low) {
    if (/dating|date/.test(low)) return 'dating';
    if (/job|gig|hire|work/.test(low)) return 'jobs';
    if (/errand/.test(low)) return 'errand';
    if (/deliver/.test(low)) return 'delivery';
    return 'open';
  },

  async execute(plan) {
    const results = [];
    const p = this.pos();
    CityTasks?.init?.();

    for (const a of plan.actions || []) {
      try {
        if (a.type === 'solo') {
          const open = (CityTasks?.list?.({ open: true }) || []).length;
          const build = document.querySelector('meta[name="astranov-build"]')?.content || '?';
          const lines = [
            'SpaceNet · we ship alone until partners answer',
            'build ' + build + ' · open tasks ' + open,
            'CLI: job · date · deliver · search · task list · locate',
            'Live: https://astranov.eu',
          ];
          lines.forEach((l) => AciCli?.print?.(l, 'ok'));
          this.depict('explore', { label: 'Solo build', detail: 'ship daily', preview: lines[0] });
          results.push('solo');
        }
        else if (a.type === 'help') {
          this.printHelp();
          results.push('help');
        }
        else if (a.type === 'locate') {
          this.depict('location', { label: 'You', detail: 'locate', preview: 'Locating you on SpaceNet…' });
          if (SuperCli?.run) await SuperCli.run('locate');
          else if (CityLife?.locateAndDropIn) await CityLife.locateAndDropIn();
          results.push('locate');
        }
        else if (a.type === 'fly') {
          this.depict('explore', { lat: a.lat, lng: a.lng, label: a.label, detail: 'fly ' + a.label });
          GlobeControl?.flyToLatLng?.(a.lat, a.lng, a.label, GlobeControl?.Z?.national, {});
          results.push('fly ' + a.label);
        }
        else if (a.type === 'zoom') {
          ZoomTiers?.goTo?.(a.tier, true);
          this.depict('explore', { label: a.tier, detail: 'zoom ' + a.tier, pulse: false, hud: a.tier });
          results.push('zoom ' + a.tier);
        }
        else if (a.type === 'city_enter') {
          this.depict('explore', { label: 'City', detail: 'street tier', preview: 'Entering city map…' });
          try {
            await enterCityView?.(p.lat, p.lng, { openShops: false });
          } catch (_) {
            ZoomTiers?.goTo?.('city', true);
          }
          results.push('city');
        }
        else if (a.type === 'date') {
          const t = CityTasks?.postDate?.(a.text || 'coffee date 2h');
          this.depict('dating', {
            lat: t?.lat ?? p.lat, lng: t?.lng ?? p.lng,
            color: 0xff6699, label: t?.title || 'Date',
            detail: 'dating invite', preview: '💕 ' + (t?.title || 'Date open on globe'),
          });
          // Launch offer so nearby users can accept
          if (t?.id) CityTasks?.launch?.(t.id);
          results.push('date · ' + (t?.title || 'open'));
        }
        else if (a.type === 'job') {
          const t = CityTasks?.postJob?.(a.text || 'barman 3h');
          this.depict('job', {
            lat: t?.lat ?? p.lat, lng: t?.lng ?? p.lng,
            color: 0x66aaff, label: t?.title || 'Job',
            detail: 'job/gig open', preview: '💼 ' + (t?.title || 'Job open'),
          });
          if (t?.id) CityTasks?.launch?.(t.id);
          results.push('job · ' + (t?.title || 'open'));
        }
        else if (a.type === 'errand') {
          const t = CityTasks?.postErrand?.(a.text || 'pharmacy');
          this.depict('errand', {
            lat: t?.lat ?? p.lat, lng: t?.lng ?? p.lng,
            color: 0xffcc44, label: t?.title || 'Errand',
            detail: 'errand', preview: '🏃 ' + (t?.title || 'Errand'),
          });
          if (t?.id) CityTasks?.launch?.(t.id);
          results.push('errand · ' + (t?.title || 'open'));
        }
        else if (a.type === 'delivery') {
          this.depict('delivery', {
            lat: p.lat, lng: p.lng, color: 0x44ffaa, label: 'Delivery',
            detail: a.text?.slice(0, 40), preview: '📦 Delivery on SpaceNet…',
          });
          // Prefer full delivery pipeline when shopping language; else city task
          if (/\b(shop|food|order|pizza|gyro|menu)\b/i.test(a.text || '')) {
            try {
              await LazyModules?.ensure?.();
              if (CityTasks?.startDeliveryFlow) await CityTasks.startDeliveryFlow(a.text);
              else if (Commerce?.showPicker) await Commerce.showPicker();
              else if (SuperCli?.run) await SuperCli.run('order');
            } catch (_) {
              CityTasks?.create?.({ rawText: a.text || 'delivery', kind: 'delivery' });
            }
          } else {
            const t = CityTasks?.create?.({ rawText: a.text || 'package delivery', kind: 'delivery' });
            if (t?.id) CityTasks?.launch?.(t.id);
          }
          results.push('delivery');
        }
        else if (a.type === 'task_list') {
          this.depict('explore', { label: 'Tasks', detail: a.filter || 'open', preview: 'Listing city tasks…' });
          const filter = a.filter === 'dating' ? { open: true, dating: true }
            : a.filter === 'jobs' ? { open: true, jobs: true }
            : a.filter === 'errand' ? { open: true, kind: 'errand' }
            : a.filter === 'delivery' ? { open: true, kind: 'delivery' }
            : { open: true };
          const open = CityTasks?.list?.(filter) || [];
          if (!open.length) {
            AciCli?.print?.('No open tasks · try: job barman 3h · date coffee 2h · deliver food', 'dim');
          } else {
            open.slice(0, 12).forEach((t) => {
              AciCli?.print?.(
                (t.kind || '?') + ' · ' + (t.duration_label || '') + ' · ' + String(t.title || '').slice(0, 48),
                'ok'
              );
              if (t.lat != null) {
                MapDepict?.pulse?.(t.lat, t.lng, (CityTasks?.meta?.(t.kind)?.color) || 0x44ffaa, t.title?.slice(0, 20), 9000);
              }
            });
          }
          results.push('list ' + open.length);
        }
        else if (a.type === 'task_cli') {
          this.depict('explore', { label: 'Task', detail: a.line?.slice(0, 40), preview: a.line?.slice(0, 80) });
          const msg = await CityTasks?.handleCli?.(a.line || 'task list');
          if (msg) AciCli?.print?.(String(msg).slice(0, 200), 'ok');
          results.push(String(msg || 'task').slice(0, 40));
        }
        else if (a.type === 'search') {
          await this._search(a.query || plan.message);
          results.push('search');
        }
        else if (a.type === 'order') {
          this.depict('order', { label: 'Shops', detail: a.text?.slice(0, 40), preview: 'Opening marketplace…' });
          await LazyModules?.ensure?.().catch(() => {});
          if (Commerce?.showPicker) await Commerce.showPicker();
          else if (SuperCli?.run) await SuperCli.run('order');
          results.push('order');
        }
        else if (a.type === 'browse') {
          await this._browse(a.url || 'astranov://home');
          results.push('browse');
        }
        else if (a.type === 'crawl') {
          this.depict('explore', { label: 'Crawl', detail: 'sector scan' });
          await SpaceNetBrain?.crawlAll?.(p.lat, p.lng, 3, { force: true });
          results.push('crawl');
        }
        else if (a.type === 'drive') {
          this.depict('drive', { label: 'Drive', detail: 'road mode' });
          DrivingView?.activate?.();
          results.push('drive');
        }
        else if (a.type === 'call') {
          this.depict('phone', { label: 'Call' });
          if (SuperCli?.run) await SuperCli.run('phone');
          results.push('call');
        }
        else if (a.type === 'theme') {
          if (a.mode === 'spacex' || !a.mode) AstranovTheme?.setSpacex?.(true);
          else AstranovTheme?.set?.(a.mode);
          results.push('theme');
        }
      } catch (e) {
        results.push((a.type || '?') + ' fail');
        console.warn('[SpaceNetGrokCli]', a.type, e);
      }
    }
    return results;
  },

  async _search(query) {
    const q = String(query || '').trim();
    const p = this.pos();
    this.depict('search', {
      lat: p.lat, lng: p.lng, color: 0xffffff, label: 'Search',
      detail: q.slice(0, 48), preview: '🔍 ' + q.slice(0, 80),
    });
    AciCli?.print?.('search · ' + q, 'cmd');

    // 1) City tasks match
    CityTasks?.init?.();
    const tasks = (CityTasks?.list?.({ open: true }) || []).filter((t) => {
      const hay = (t.title + ' ' + t.kind + ' ' + t.role + ' ' + (t.note || '')).toLowerCase();
      return q.split(/\s+/).some((w) => w.length > 1 && hay.includes(w.toLowerCase()));
    });
    if (tasks.length) {
      AciCli?.print?.('── Tasks on field (' + tasks.length + ') ──', 'dim');
      tasks.slice(0, 8).forEach((t) => {
        AciCli?.print?.(t.kind + ' · ' + t.title.slice(0, 50), 'ok');
        if (t.lat != null) MapDepict?.pulse?.(t.lat, t.lng, 0x66aaff, t.title.slice(0, 18), 10000);
      });
    }

    // 2) Catalog roles
    const catalog = (CityTasks?.CATALOG || []).filter((c) =>
      new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(c.title + ' ' + c.role + ' ' + c.kind)
    );
    if (catalog.length) {
      AciCli?.print?.('── Roles you can post ──', 'dim');
      catalog.slice(0, 8).forEach((c) => {
        AciCli?.print?.(c.kind + ' · ' + c.title + ' · default ' + c.defaultDur, 'ok');
      });
    }

    // 3) People / cloud CLI search
    try {
      if (window.CliHub?.runSearch && q.length >= 2) {
        await CliHub.runSearch(q);
      }
    } catch (_) {}

    // 4) Local crawl of sector for shops if food/shop language
    if (/\b(food|shop|cafe|bar|restaurant|vendor)\b/i.test(q)) {
      try {
        await SpaceNetBrain?.crawlVendors?.(p.lat, p.lng, 2);
        if (Commerce?.showPicker) await Commerce.showPicker(q);
      } catch (_) {}
    }

    // 5) Fly to named city if search is a place
    for (const [name, ll] of Object.entries(this.CITIES)) {
      if (new RegExp('\\b' + name + '\\b', 'i').test(q)) {
        GlobeControl?.flyToLatLng?.(ll[0], ll[1], name, GlobeControl?.Z?.national, {});
        MapDepict?.pulse?.(ll[0], ll[1], 0xffffff, name, 12000);
        AciCli?.print?.('place · ' + name + ' on globe', 'ok');
        break;
      }
    }

    if (!tasks.length && !catalog.length) {
      AciCli?.print?.('No local hits — try: job ' + q + ' · date ' + q + ' · deliver ' + q, 'dim');
    }
    GlobeDeck?.setPreview?.('Search · ' + q.slice(0, 60));
  },

  async _browse(url) {
    url = String(url || 'astranov://home').trim();
    this.depict('explore', { label: 'Browse', detail: url.slice(0, 40), preview: '🌐 ' + url });
    try {
      if (!window.AstranovBrowser) {
        await this._loadScript('/js/08-astranov-os.js').catch(() => {});
        await this._loadScript('/js/08-astranov-browser.js').catch(() => {});
      }
      AstranovOS?.init?.();
      if (AstranovBrowser?.navigate) {
        AstranovBrowser.show?.();
        AstranovBrowser.navigate(url);
        AciCli?.print?.('browser → ' + url, 'ok');
        return;
      }
    } catch (_) {}
    if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
    else AciCli?.print?.('browser loading — retry: browse ' + url, 'dim');
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-sn="' + src + '"]')) return resolve();
      const s = document.createElement('script');
      const build = document.querySelector('meta[name="astranov-build"]')?.content || '1';
      s.src = src + (src.includes('?') ? '&' : '?') + 'v=' + build;
      s.async = true;
      s.dataset.sn = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(src));
      document.head.appendChild(s);
    });
  },

  localReply(plan, results) {
    const acted = (results || []).filter(Boolean);
    if (plan.intent === 'help') return '';
    if (acted.length) {
      return 'SpaceNet · ' + acted.join(' · ') + ' — painted on the globe. What next?';
    }
    return '';
  },

  /**
   * Main entry — always handled. Street DNA first, then Grok chat.
   */
  async handle(message, opts = {}) {
    this.init();
    const raw = String((window.fixVoiceHotwords || ((x) => x))(String(message || ''))).trim();
    if (!raw) {
      this.printHelp();
      return { ok: true, help: true };
    }

    // Architect bridge keeps priority
    if (ArchitectBridge?.wantsBridgeCmd?.(raw)) {
      return ArchitectBridge.handleCommand(raw);
    }

    this.busy = true;
    GlobeDeck?.expand?.('SpaceNet');
    GlobeDeck?.setThinking?.(true, 'SpaceNet…');
    CliRibbon?.setActive?.('SpaceNet');
    CliRibbon?.setNotice?.('Acting on globe…', 'thinking');

    try {
      const plan = this.plan(raw);
      let actionResults = [];

      if (plan.actions.length) {
        actionResults = await this.execute(plan);
        const reply = this.localReply(plan, actionResults);
        if (reply) {
          AciCli?.print?.(reply, 'reply');
          ACIControl?.reply?.(reply.slice(0, 220));
          GlobeDeck?.setPreview?.(reply.slice(0, 140));
          CliRibbon?.setNotice?.(reply.slice(0, 90), 'ready');
        }
        this.history.push({ role: 'user', content: raw });
        this.history.push({ role: 'assistant', content: reply || actionResults.join(' · ') });
        // Optional: enrich with AI comment (non-blocking)
        if (plan.intent !== 'help' && window.AstranovCoreBrain?.askAi) {
          void AstranovCoreBrain.askAi(raw, plan).then((ai) => {
            if (ai?.text) {
              AciCli?.print?.(ai.text.slice(0, 280), 'dim');
            }
          }).catch(() => {});
        }
        return { ok: true, plan, actionResults, street: true };
      }

      // Pure chat / unknown → Core Brain (still never "unknown")
      // But first: if it looks like a vague want, post as open help task
      if (/\b(need|want|looking for|anyone|help me|can someone)\b/i.test(raw) && raw.length < 160) {
        CityTasks?.init?.();
        const t = CityTasks?.create?.({ rawText: raw, kind: 'help', title: raw.slice(0, 60) });
        if (t?.id) CityTasks?.launch?.(t.id);
        this.depict('explore', {
          lat: t?.lat, lng: t?.lng, label: 'Help', color: 0x66ffcc,
          preview: '🤝 Posted as city help on globe',
        });
        AciCli?.print?.('Posted as open help task on SpaceNet · claim with: task claim', 'ok');
        return { ok: true, helpTask: true };
      }

      if (window.AstranovCoreBrain?.handle) {
        const r = await AstranovCoreBrain.handle(raw, opts);
        return { ok: true, brain: true, ...r };
      }
      if (window.AciCoders?.handleMessage) {
        await AciCoders.handleMessage(raw, opts);
        return { ok: true, coders: true };
      }

      AciCli?.print?.('SpaceNet heard you. Try: job barman 3h · date coffee · deliver food · search … · locate', 'dim');
      this.depict('explore', { label: 'SpaceNet', detail: raw.slice(0, 40) });
      return { ok: true, fallback: true };
    } catch (e) {
      AciCli?.print?.('SpaceNet: ' + (e.message || e), 'err');
      return { ok: false, error: String(e?.message || e) };
    } finally {
      this.busy = false;
      GlobeDeck?.setThinking?.(false);
    }
  },
};

window.SpaceNetGrokCli = SpaceNetGrokCli;
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => SpaceNetGrokCli.init(), 500));
  } else {
    setTimeout(() => SpaceNetGrokCli.init(), 500);
  }
} catch (_) {}
