/**
 * SPACENET — the pilot fly grid net
 * ==================================
 * Without SPACENET, flying on the net is not possible.
 *
 *   GLOBAL → NATIONAL → REGIONAL → CITY
 *
 * Progression uses the **committed dive tier** (not lagging camera z), so each
 * click always steps one cell deeper even mid-zoom animation.
 *
 * Mechanical: window.SPACENET · SNGlobe.diveInAt / flyNear / flyPulse
 */
(function (global) {
  'use strict';

  var CELLS = ['global', 'national', 'regional', 'city'];
  var LADDER = ['solar', 'global', 'national', 'regional', 'city'];

  /**
   * Dramatic camera Z per cell — spreads must be obvious to the eye.
   * Closer = lower z. Wheel/scroll snaps to these only (never free continuous zoom).
   * GLOBAL = full Earth in space. NATIONAL = country + major cities.
   * REGIONAL = metro cluster. CITY = street map handoff.
   */
  var Z = {
    solar: 12,
    global: 5.4,
    national: 2.05,
    regional: 1.42,
    city: 1.16,
    street: 1.08,
  };


  var LABELS = {
    solar: 'SOLAR',
    global: 'GLOBAL',
    national: 'NATIONAL',
    regional: 'REGIONAL',
    city: 'CITY',
    street: 'STREET',
  };

  /** Same-place radius (degrees) — wide so successive taps stick */
  var SAME_DEG = {
    solar: 45,
    global: 32,
    national: 18,
    regional: 10,
    city: 5,
  };

  function tierFromZ(z) {
    if (z == null || !isFinite(z)) return 'global';
    // Midpoints between snapped Z values
    if (z >= 8.2) return 'solar';
    if (z >= 3.5) return 'global';
    if (z >= 1.7) return 'national';
    if (z >= 1.28) return 'regional';
    if (z >= 1.11) return 'city';
    return 'street';
  }

  function cellIndex(name) {
    var i = CELLS.indexOf(String(name || '').toLowerCase());
    if (i >= 0) return i;
    if (name === 'solar') return -1;
    if (name === 'street') return CELLS.length - 1;
    return 0;
  }

  function ladderIndex(name) {
    var i = LADDER.indexOf(String(name || '').toLowerCase());
    return i >= 0 ? i : LADDER.indexOf('global');
  }

  function nextCell(cur) {
    var t = String(cur || 'global').toLowerCase();
    if (t === 'solar') return 'global';
    if (t === 'street') return 'city';
    var i = cellIndex(t);
    if (i < 0) return 'global';
    if (i >= CELLS.length - 1) return 'city';
    return CELLS[i + 1];
  }

  function prevCell(cur) {
    var t = String(cur || 'global').toLowerCase();
    if (t === 'street' || t === 'city') return 'regional';
    var i = ladderIndex(t);
    if (i <= 0) return 'solar';
    return LADDER[i - 1];
  }

  function degDist(aLat, aLng, bLat, bLng) {
    var dLat = Math.abs(aLat - bLat);
    var dLng = Math.abs(aLng - bLng);
    if (dLng > 180) dLng = 360 - dLng;
    return Math.max(dLat, dLng);
  }

  function isSameCell(anchor, lat, lng, tier) {
    if (!anchor || anchor.lat == null || lat == null || lng == null) return false;
    var thr = SAME_DEG[tier] != null ? SAME_DEG[tier] : SAME_DEG.global;
    if (thr < 14) thr = 14; // never tighter than metro until city
    if (tier === 'city') thr = SAME_DEG.city;
    return degDist(anchor.lat, anchor.lng, lat, lng) <= thr;
  }

  /**
   * Next SPACENET cell for a single tap.
   * Uses committed diveTier first so mid-animation z lag cannot re-pick the same cell.
   */
  function nextDive(state) {
    state = state || {};
    var lat = state.lat;
    var lng = state.lng;
    var z = state.z != null ? state.z : Z.global;
    var committed = String(state.diveTier || state.tier || tierFromZ(z) || 'global').toLowerCase();
    if (committed === 'center' || committed === 'street') {
      committed = committed === 'street' ? 'city' : 'global';
    }
    var same = isSameCell(state.anchor, lat, lng, committed);

    // New place: always dive to NATIONAL (clear zoom from GLOBAL default)
    if (!same) {
      if (committed === 'solar' || z > Z.global + 0.4) {
        return pack('global', false);
      }
      return pack('national', false);
    }

    // Same place: ALWAYS one cell deeper from committed tier (never re-fire same cell)
    var deeper = nextCell(committed);
    // If stuck somehow on same as committed, force step by index
    if (deeper === committed && committed !== 'city') {
      var idx = cellIndex(committed);
      deeper = CELLS[Math.min(CELLS.length - 1, idx + 1)];
    }
    return pack(deeper, true);
  }

  function pack(cell, same) {
    var step = cellIndex(cell);
    var nxt = nextCell(cell);
    return {
      cell: cell,
      step: step < 0 ? 0 : step,
      same: !!same,
      openMap: cell === 'city',
      label: LABELS[cell] || cell,
      z: Z[cell] != null ? Z[cell] : Z.national,
      hint:
        cell === 'city'
          ? 'SPACENET · CITY · operational tiles'
          : 'SPACENET · ' +
            (LABELS[cell] || cell) +
            ' · tap → ' +
            (LABELS[nxt] || nxt),
    };
  }

  function pathString() {
    return 'GLOBAL → NATIONAL → REGIONAL → CITY';
  }

  global.SPACENET = {
    name: 'SPACENET',
    title: 'SPACENET pilot fly grid',
    law: 'Pilot fly grid net — without SPACENET, flying on the net is not possible',
    CELLS: CELLS,
    LADDER: LADDER,
    Z: Z,
    LABELS: LABELS,
    SAME_DEG: SAME_DEG,
    pathString: pathString,
    tierFromZ: tierFromZ,
    cellIndex: cellIndex,
    ladderIndex: ladderIndex,
    nextCell: nextCell,
    prevCell: prevCell,
    degDist: degDist,
    isSameCell: isSameCell,
    nextDive: nextDive,
  };

  global.SpaceNetGrid = global.SPACENET;
})(typeof window !== 'undefined' ? window : globalThis);
