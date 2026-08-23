/**
 * SNSuper — Architect superuser ops via MAIN CLI only
 * No floating panels. Fleet + TX dump to SNCli.log.
 */
(function (global) {
  'use strict';

  var ARCHITECT =
    (global.SN_CONFIG && SN_CONFIG.architectEmail) || 'notisastranov@gmail.com';
  var TX_KEY = 'sn:super-tx-v1';
  var txs = [];

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (e) {}
  }

  function loadTx() {
    try {
      var raw = JSON.parse(localStorage.getItem(TX_KEY) || '[]');
      if (Array.isArray(raw)) txs = raw.slice(-200);
    } catch (e) {
      txs = [];
    }
  }

  function saveTx() {
    try {
      localStorage.setItem(TX_KEY, JSON.stringify(txs.slice(-200)));
    } catch (e) {}
  }

  function isSuper() {
    try {
      if (localStorage.getItem('sn:super') === '1') return true;
      var u = global.SNAuth && SNAuth.user;
      var em = (u && u.email && String(u.email).toLowerCase()) || '';
      if (em === String(ARCHITECT).toLowerCase()) return true;
      if (u && u.user_metadata && u.user_metadata.is_owner) return true;
    } catch (e) {}
    return false;
  }

  function pushTx(row) {
    row = row || {};
    row.t = row.t || Date.now();
    row.iso = new Date(row.t).toISOString();
    txs.unshift(row);
    if (txs.length > 200) txs.length = 200;
    saveTx();
    // Superuser sees every TX on CLI
    if (isSuper()) {
      var line =
        'TX · ' +
        (row.kind || 'tx') +
        (row.fee != null ? ' · fee +' + Number(row.fee).toFixed(2) + ' S' : '') +
        (row.total != null ? ' · total ' + Number(row.total).toFixed(2) + ' S' : '') +
        (row.why ? ' · ' + String(row.why).slice(0, 48) : '') +
        (row.who ? ' · ' + row.who : '');
      log(line, row.kind === 'platform_3pct' ? 'ok' : 'dim');
    }
    return row;
  }

  /** Dump vault + fleet + recent TX to CLI only */
  function show() {
    // Kill any leftover floating decks
    try {
      var p = document.getElementById('sn-super-panel');
      if (p && p.parentNode) p.parentNode.removeChild(p);
      var c = document.getElementById('sn-super-css');
      if (c && c.parentNode) c.parentNode.removeChild(c);
      var s = document.getElementById('sn-sim33-live');
      if (s && s.parentNode) s.parentNode.removeChild(s);
    } catch (e0) {}

    if (!isSuper()) {
      log('Super · sign in as Architect or localStorage sn:super=1', 'dim');
      return;
    }
    var vault = 0;
    var bal = 0;
    try {
      if (global.SNCurrency) {
        vault = SNCurrency.platformFees ? SNCurrency.platformFees() : 0;
        bal = SNCurrency.balance ? SNCurrency.balance() : 0;
      }
    } catch (e) {}
    log('── Super · CLI deck (no extra panels) ──', 'ok');
    log(
      'Vault 3% ' +
        (global.SNCurrency && SNCurrency.format
          ? SNCurrency.format(vault)
          : vault.toFixed(2) + ' S') +
        ' · wallet ' +
        (global.SNCurrency && SNCurrency.format
          ? SNCurrency.format(bal)
          : bal.toFixed(2) + ' S'),
      'ok'
    );
    log('Fleet · use day start for driver routine (Sim-33 removed)', 'dim');
    try {
      var drivers = (global.SNProfiles && SNProfiles.list({ role: 'driver' })) || [];
      drivers.slice(0, 12).forEach(function (d) {
        log(
          '  🛵 ' +
            (d.name || d.id) +
            (d.driverOnline ? ' · ONLINE' : '') +
            (d.vehicle ? ' · ' + d.vehicle : ''),
          'dim'
        );
      });
    } catch (eF) {}
    log('TX tape · last ' + Math.min(20, txs.length), 'dim');
    txs.slice(0, 20).forEach(function (r) {
      log(
        '  ' +
          (r.kind || 'tx') +
          (r.fee != null ? ' +' + Number(r.fee).toFixed(2) + 'S' : '') +
          (r.total != null ? ' tot ' + Number(r.total).toFixed(2) : '') +
          (r.why ? ' · ' + String(r.why).slice(0, 36) : ''),
        r.kind === 'platform_3pct' ? 'ok' : 'dim'
      );
    });
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview('Super · vault on CLI');
    } catch (e2) {}
  }

  function hide() {
    /* no panel */
  }

  function paint() {
    /* no panel */
  }

  loadTx();

  global.SNSuper = {
    isSuper: isSuper,
    pushTx: pushTx,
    show: show,
    hide: hide,
    paint: paint,
    get txs() {
      return txs.slice();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
