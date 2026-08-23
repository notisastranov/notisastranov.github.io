// ═══════════════════════════════════════════════════════════════
// ASTRANOV — Marketplace Comms (vendors · clients · drivers)
// Same polygon + glowing lines + cloud chat as MapComms teams.
// Clients pick from available delivery drivers on map + in cloud.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const MC = {
    active: false,
    orderId: null,
    vendor: null,
    drivers: [],
    wants: '',
    preferredDriverId: null,
    seekingDriver: false,
    _poll: null,
  };

  function uid() {
    return Auth?.user?.id || null;
  }

  function displayName(p) {
    return p?.display_name || p?.name || (p?.id ? String(p.id).slice(0, 8) : 'User');
  }

  function emojiFor(role) {
    if (role === 'driver') return '🚚';
    if (role === 'vendor') return '🏬';
    return '🛒';
  }

  function myRole() {
    const u = uid();
    if (!u) return 'client';
    if (MC.drivers.some((d) => d.id === u)) return 'driver';
    if (MC.vendor?.id === u || MC.vendor?.owner_id === u) return 'vendor';
    return 'client';
  }

  function coords(p) {
    const lat = p?.lat ?? p?.field_lat ?? null;
    const lng = p?.lng ?? p?.field_lng ?? null;
    return lat != null && lng != null ? { lat, lng } : null;
  }

  function toMapMember(p, role) {
    const c = coords(p);
    if (!p?.id || !c) return null;
    return {
      id: p.id,
      name: displayName(p),
      lat: c.lat,
      lng: c.lng,
      emoji: p.avatar_emoji || p.emoji || emojiFor(role),
      role,
    };
  }

  function membersFromContext() {
    const out = [];
    const seen = new Set();
    const add = (p, role) => {
      const m = toMapMember(p, role);
      if (!m || seen.has(m.id)) return;
      seen.add(m.id);
      out.push(m);
    };

    const p = window._lastPos;
    if (uid() && p) {
      add({
        id: uid(),
        display_name: AstranovPresence?.displayName?.() || me?.name || 'You',
        lat: p.lat,
        lng: p.lng,
      }, myRole());
    }

    if (MC.vendor) add(MC.vendor, 'vendor');
    (MC.drivers || []).forEach((d) => add(d, 'driver'));
    return out;
  }

  function cloudTitle() {
    if (MC.orderId) {
      const short = String(MC.orderId).slice(0, 8);
      return `📦 Task ${short}${MC.seekingDriver ? ' · pick driver' : ''}`;
    }
    if (MC.vendor) return `🛒 ${displayName(MC.vendor)} · order chat`;
    return '🛒 Marketplace';
  }

  function syncCloud() {
    if (!window.MapComms || !Auth?.user) return;
    const members = membersFromContext();
    const sessionId = MC.orderId
      ? ('maptask-' + MC.orderId)
      : ('maptask-browse-' + (MC.vendor?.id || Date.now().toString(36)));
    window.MapComms.openSession({
      id: sessionId,
      kind: 'task',
      name: cloudTitle(),
      members,
      persist: false,
      orderId: MC.orderId,
      showDriverPicker: MC.seekingDriver && myRole() === 'client' && MC.drivers.length > 0,
      drivers: MC.drivers,
      selfRole: myRole(),
    });
    MC.active = true;
  }

  function hide() {
    MC.active = false;
    MC.orderId = null;
    MC.vendor = null;
    MC.drivers = [];
    MC.wants = '';
    MC.preferredDriverId = null;
    MC.seekingDriver = false;
    if (MC._poll) {
      clearInterval(MC._poll);
      MC._poll = null;
    }
    if (window.MapComms) window.MapComms.leaveTeam();
  }

  async function fetchOrderDrivers() {
    const C = window.Commerce;
    if (!C?.fetchNearbyDrivers) return [];
    const u = C.userLatLng?.() || window._lastPos || {};
    if (u.lat == null) return [];
    return C.fetchNearbyDrivers(u.lat, u.lng);
  }

  async function refreshOrder(orderId) {
    if (!Auth?.client || !orderId) return null;
    const { data } = await Auth.client
      .from('orders')
      .select('id,status,driver_id,customer_id,vendor_id')
      .eq('id', orderId)
      .maybeSingle();
    return data;
  }

  function startOrderPoll(orderId) {
    if (MC._poll) clearInterval(MC._poll);
    MC._poll = setInterval(async () => {
      const o = await refreshOrder(orderId);
      if (!o) return;
      MC.seekingDriver = !o.driver_id && (o.status === 'seeking_driver' || o.status === 'pending');
      if (o.driver_id && MC.preferredDriverId !== o.driver_id) {
        MC.preferredDriverId = o.driver_id;
        const d = MC.drivers.find((x) => x.id === o.driver_id);
        window.MapComms?.postSystem?.(`${emojiFor('driver')} Driver ${displayName(d || { id: o.driver_id })} assigned`);
      }
      if (!MC.seekingDriver) window.MapComms?.hideDriverPicker?.();
      syncCloud();
    }, 8000);
  }

  /** Pre-order: client browsing vendor + nearby drivers */
  function openForBrowse(opts) {
    opts = opts || {};
    MC.orderId = null;
    MC.vendor = opts.vendor || null;
    MC.drivers = opts.drivers || [];
    MC.wants = opts.wants || '';
    MC.preferredDriverId = opts.preferredDriverId || Commerce?._preferredDriverId || null;
    MC.seekingDriver = myRole() === 'client' && MC.drivers.length > 0 && !MC.preferredDriverId;
    syncCloud();
    if (MC.wants) window.MapComms?.postSystem?.(`Order: ${MC.wants.slice(0, 120)}`);
    window.MapComms?.postSystem?.(
      MC.drivers.length
        ? `${MC.drivers.length} driver(s) nearby — tap map marker or pick in cloud`
        : 'No drivers on map yet — order will broadcast to field'
    );
  }

  /** Post-order task thread: client, vendor, drivers */
  async function openForOrder(opts) {
    opts = opts || {};
    MC.orderId = opts.order?.id || opts.orderId || null;
    MC.vendor = opts.vendor || null;
    MC.drivers = opts.drivers || [];
    if (!MC.drivers.length) MC.drivers = await fetchOrderDrivers();
    MC.wants = opts.order?.items?.map?.((i) => i.name || i).join(', ') || opts.wants || '';
    MC.preferredDriverId = opts.order?.driver_id || opts.preferredDriverId || null;
    MC.seekingDriver = opts.seeking_driver ?? (!MC.preferredDriverId);
    syncCloud();
    window.MapComms?.postSystem?.(`📦 Order placed${MC.wants ? ': ' + MC.wants.slice(0, 80) : ''}`);
    if (MC.orderId) startOrderPoll(MC.orderId);
  }

  async function selectDriver(driverId, driverObj) {
    if (!driverId) return;
    if (driverObj && !MC.drivers.some((x) => x.id === driverId)) MC.drivers.push(driverObj);
    const d = MC.drivers.find((x) => x.id === driverId)
      || driverObj
      || { id: driverId, display_name: 'Driver' };
    MC.preferredDriverId = driverId;
    MC.seekingDriver = false;
    Commerce._preferredDriverId = driverId;
    Commerce._preferredDriver = d;

    syncCloud();
    window.MapComms?.postSystem?.(`${emojiFor('driver')} Selected ${displayName(d)}`);
    ACIControl?.reply('Driver ' + displayName(d) + (MC.orderId ? ' assigned to order' : ' — will use on checkout'));

    if (MC.orderId) {
      try {
        const headers = Auth?.authHeaders ? await Auth.authHeaders() : {};
        await fetch(SB_URL + '/functions/v1/order-intake', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'assign_driver', order_id: MC.orderId, driver_id: driverId }),
        });
      } catch (e) {
        console.warn('[MarketplaceComms] assign_driver', e);
      }
    } else if (Commerce?.renderCompare && Commerce._suggestion) {
      Commerce.renderCompare(
        [Commerce._suggestion],
        MC.drivers,
        Commerce._lastWants || [],
        Commerce._balance
      );
    }
  }

  function listDriversText() {
    if (!MC.drivers.length) return 'No delivery drivers on map.';
    const u = Commerce?.userLatLng?.() || {};
    return MC.drivers
      .map((d, i) => {
        const km = u.lat != null
          ? Commerce.haversineKm(u.lat, u.lng, d.field_lat, d.field_lng).toFixed(1)
          : '?';
        return `${i + 1}. ${displayName(d)} · ${km} km`;
      })
      .join('\n');
  }

  function init() {
    window.MarketplaceComms = {
      openForBrowse,
      openForOrder,
      selectDriver,
      hide,
      membersFromContext,
      get state() { return MC; },
      listDriversText,
    };
    console.log('[MarketplaceComms] ready — vendor/client/driver polygon chats');
  }

  init();
})();
