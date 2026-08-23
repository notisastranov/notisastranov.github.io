// === ASTRANOV SITES PROVISION — instant {slug}.astranov.eu web presence ===
const AstranovSitesProvision = {
  BASE_DOMAIN: 'astranov.eu',

  slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
  },

  parseAsk(text) {
    const raw = String(text || '').trim();
    const low = raw.toLowerCase();
    const m = raw.match(/(?:create|make|start|open|provision|build)\s+(?:my\s+)?(?:astranov\s+)?(?:sites?|shop|page|presence|profile|booking|superbook(?:er|ing)?)\s*(?:at|on|for)?\s*([a-z0-9][a-z0-9-]{1,30}[a-z0-9])?/i)
      || raw.match(/([a-z0-9][a-z0-9-]{1,30}[a-z0-9])\.astranov\.eu/i)
      || raw.match(/(?:^|\s)([a-z0-9][a-z0-9-]{2,30}[a-z0-9])(?:\s|$)/i);
    let slug = m?.[1] ? this.slugify(m[1]) : '';
    let name = '';
    if (/diving|scuba|dive/.test(low)) name = 'Diving school';
    else if (/yacht|charter|boat/.test(low)) name = 'Yacht charter';
    else if (/restaurant|tavern|food|cafe/.test(low)) name = 'Restaurant';
    else if (/hotel|rooms|stay/.test(low)) name = 'Hotel';
    else if (/rental|car/.test(low)) name = 'Rental';
    const businessType = /yacht|charter|boat/.test(low) ? 'yacht_charter'
      : /diving|scuba/.test(low) ? 'diving_school'
      : /restaurant|tavern|food|cafe/.test(low) ? 'restaurant'
      : /hotel/.test(low) ? 'hotel'
      : /rental|car/.test(low) ? 'rental_car'
      : 'generic';
    const mode = /charter|yacht|week|range/.test(low) ? 'range' : 'slot';
    if (!slug) {
      const words = raw.replace(/\.astranov\.eu/gi, '').split(/\s+/).filter(w => w.length > 2 && !/^(my|the|a|an|for|at|on|create|make|site|sites|shop|page|astranov)$/i.test(w));
      slug = this.slugify(words.slice(0, 2).join('-') || Auth?.user?.email?.split('@')[0] || 'my-place');
    }
    if (!name) name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { slug, name, businessType, mode };
  },

  async provision(opts = {}) {
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in to provision site');
      throw new Error('Sign in (G) to create your Astranov Site.');
    }
    const slug = this.slugify(opts.slug);
    if (!slug || slug.length < 3) throw new Error('Choose a subdomain (3+ letters, e.g. my-shop).');

    const pos = window._lastPos || {};
    const headers = await Auth.authHeaders();
    const r = await fetch(SB_URL + '/functions/v1/site-provision', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        slug,
        business_name: opts.business_name || opts.name || slug,
        business_type: opts.business_type || 'generic',
        mode: opts.mode || 'slot',
        vendor_id: opts.vendor_id || null,
        lat: pos.lat,
        lng: pos.lng,
        branding: opts.branding || {},
        contact: opts.contact || {},
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.message || 'Site provision failed');

    if (j.pending_approval) {
      ACIControl?.reply('Subdomain ' + (j.domain || j.slug + '.astranov.eu') + ' requested — pending admin approval. Profile page is live on map.');
      AciCli?.print('site pending approval · ' + j.slug, 'dim');
      return j;
    }
    this._onLive(j, opts);
    return j;
  },

  _onLive(result, opts = {}) {
    const url = result.url || ('https://' + (result.domain || result.slug + '.astranov.eu'));
    const pos = window._lastPos || { lat: 36.44, lng: 28.22 };
    const title = opts.business_name || result.slug;

    GlobeEntity?.register?.({
      id: 'site-' + result.site_id,
      type: 'place',
      lat: pos.lat,
      lng: pos.lng,
      title,
      subtitle: result.domain,
      actionLabel: 'Open site',
      onTap: () => (window.AstranovSiteShell?.open ? AstranovSiteShell.open(url, { domain: result.domain, site_id: result.site_id, title }) : window.open(url, '_blank', 'noopener')),
      urgency: 2,
    });

    MapDepict?.pulse?.(pos.lat, pos.lng, 0x49b7ff, title + ' · live', 14000);
    FieldBrain?.pulse?.('commerce', 'astranov site live · ' + result.domain, { role: 'client', props: { site_id: result.site_id } });
    AciCli?.print('Astranov Site live → ' + url, 'ok');
    ACIControl?.reply('Your Astranov Site is live: ' + url);
    GlobeDeck?.setPreview?.('◎ ' + result.domain);
    if (window.AstranovSiteShell?.open) AstranovSiteShell.open(url, { domain: result.domain, site_id: result.site_id, title });
  },

  async cli(parts) {
    const sub = (parts[1] || 'create').toLowerCase();
    if (sub === 'list' || sub === 'mine') {
      if (!Auth?.user) return { error: 'login_required' };
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/booker_sites?select=id,slug,domain,business_type,mode,active&owner_id=eq.' + Auth.user.id + '&order=created_at.desc', { headers });
      const rows = r.ok ? await r.json() : [];
      return { sites: rows };
    }
    if (sub === 'open' && parts[2]) {
      const slug = this.slugify(parts[2]);
      const url = 'https://' + slug + '.' + this.BASE_DOMAIN;
      if (window.AstranovSiteShell?.open) AstranovSiteShell.open(url, { domain: slug + '.' + this.BASE_DOMAIN, title: slug });
      return { url };
    }
    if (sub === 'approve' && parts[2]) {
      if (!Auth?.isOwner) return { error: 'admin_required' };
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/rpc/booker_approve_site', {
        method: 'POST', headers,
        body: JSON.stringify({ p_site_id: parts[2], p_approve: parts[3] !== 'reject' }),
      });
      const j = r.ok ? await r.json() : {};
      ACIControl?.reply(r.ok ? 'Site ' + parts[2] + ' approved' : (j.message || 'approve failed'));
      return j;
    }
    if (sub === 'create' || sub === 'open' || sub === 'provision') {
      const slug = parts[2] || '';
      const name = parts.slice(3).join(' ') || slug;
      return this.provision({ slug, business_name: name });
    }
    return { error: 'usage: site create <slug> [name] | site list  (aliases: sites, book)' };
  },
};
window.SuperBookingProvision = AstranovSitesProvision;
window.AstranovSitesProvision = AstranovSitesProvision;
