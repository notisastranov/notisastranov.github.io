/* Astranov — CLI-first offers · map stays clear for route only
 * Build: 20260811144000-cli-offers
 * Owner: no floating tiles over map · price first · ACCEPT green / DECLINE red in CLI
 */
(function (global) {
  'use strict';
  var BUILD = '20260811144000-cli-offers';
  var lastOfferId = null;
  var pending = null;

  function log(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'ok');
    } catch (_) {}
  }
  function preview(msg) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(msg || '').slice(0, 64));
    } catch (_) {}
  }

  function injectCss() {
    var id = 'sn-cli-offers-css';
    var old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = document.createElement('style');
    st.id = id;
    st.textContent = [
      '#sn-offer-stack, #sn-offer-stack .sn-offer, #sn-offer-stack .sn-queue-hint {',
      '  display: none !important; visibility: hidden !important; pointer-events: none !important;',
      '  opacity: 0 !important; z-index: -1 !important;',
      '}',
      '#sn-poly-root, #sn-poly-root .sn-pt {',
      '  display: none !important; visibility: hidden !important; pointer-events: none !important;',
      '}',
      'body.sn-cli-offer-focus #panel {',
      '  max-height: min(42vh, 320px) !important;',
      '}',
      'body.sn-cli-offer-focus #panel.collapsed {',
      '  max-height: min(42vh, 320px) !important;',
      '  min-height: 180px !important;',
      '}',
      '#cli-log .sn-offer-price {',
      '  color: #7dffd0 !important; font-weight: 800 !important; font-size: 1.15em !important;',
      '  text-shadow: 0 0 14px rgba(0,255,180,0.85), 0 0 28px rgba(0,200,140,0.45) !important;',
      '  letter-spacing: 0.04em;',
      '}',
      '#cli-log .sn-offer-accept {',
      '  color: #5dff9a !important; font-weight: 900 !important; font-size: 1.2em !important;',
      '  text-shadow: 0 0 16px rgba(0,255,120,0.9) !important; letter-spacing: 0.12em;',
      '}',
      '#cli-log .sn-offer-decline {',
      '  color: #ff6b7a !important; font-weight: 900 !important; font-size: 1.2em !important;',
      '  text-shadow: 0 0 16px rgba(255,60,80,0.85) !important; letter-spacing: 0.12em;',
      '}',
      '#cli-log .sn-offer-meta {',
      '  color: #b8d9ff !important; font-weight: 600 !important;',
      '}',
      '#cli-log .sn-offer-head {',
      '  color: #9ad4ff !important; font-weight: 800 !important; letter-spacing: 0.14em;',
      '  text-transform: uppercase; font-size: 0.85em;',
      '  text-shadow: 0 0 10px rgba(80,160,255,0.7);',
      '}',
    ].join('\n');
    document.head.appendChild(st);
  }

  function expandCli() {
    try {
      document.body.classList.add('sn-cli-offer-focus');
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.remove('collapsed');
        panel.classList.add('mid');
      }
    } catch (_) {}
  }

  function fitRouteOnMap(o) {
    try {
      var pts = [];
      var vLat = o.lat != null ? o.lat : o.vendorLat;
      var vLng = o.lng != null ? o.lng : o.vendorLng;
      var dLat = o.drop_lat != null ? o.drop_lat : o.dropLat;
      var dLng = o.drop_lng != null ? o.drop_lng : o.dropLng;
      if (vLat != null && vLng != null) pts.push({ lat: Number(vLat), lng: Number(vLng) });
      (o.mids || []).forEach(function (m) {
        if (m && m.lat != null) pts.push({ lat: Number(m.lat), lng: Number(m.lng) });
      });
      if (dLat != null && dLng != null) pts.push({ lat: Number(dLat), lng: Number(dLng) });
      if (pts.length < 2) return;

      if (global.SNField && SNField.startDeliveryRoute) {
        void SNField.startDeliveryRoute({
          id: 'live:cli_' + (o.id || 'offer'),
          vendorLat: pts[0].lat,
          vendorLng: pts[0].lng,
          dropLat: pts[pts.length - 1].lat,
          dropLng: pts[pts.length - 1].lng,
          waypoints: pts,
          label: String((o.vendorName || 'V') + ' \u2192 ' + (o.clientName || 'You')).slice(0, 28),
          preview: true,
        });
      }
      if (global.SNMap) {
        if (!SNMap.active && SNMap.open) {
          void SNMap.open(pts[0].lat, pts[0].lng).then(function () {
            try {
              if (SNMap.fitLatLngs) SNMap.fitLatLngs(pts, { padding: 64, maxZoom: 15, force: true, animate: true });
            } catch (_) {}
          });
        } else if (SNMap.fitLatLngs) {
          SNMap.fitLatLngs(pts, { padding: 64, maxZoom: 15, force: true, animate: true });
        }
      }
    } catch (_) {}
  }

  function fmtPrice(o) {
    var p = o.priceNum != null ? o.priceNum : o.price != null ? o.price : o.total_s != null ? o.total_s : o.total;
    if (p == null || p === '') return '\u2014';
    var n = Number(p);
    if (!isFinite(n)) return String(p);
    try {
      if (global.SNCurrency && SNCurrency.format) return SNCurrency.format(n);
    } catch (_) {}
    return n.toFixed(2) + ' S/\u00c6';
  }

  function fmtKm(o) {
    var k = o.km != null ? o.km : o._km != null ? o._km : o.distance;
    if (k == null) return '\u2014';
    var n = Number(k);
    return isFinite(n) ? n.toFixed(1) + ' km' : String(k);
  }

  function cargoOf(o) {
    return (
      o.product ||
      o.menuItem ||
      o.nature ||
      o.title ||
      (o.task && (o.task.product || o.task.title)) ||
      'Package'
    );
  }

  function payMethod(o) {
    if (o.payMethod) return o.payMethod;
    if (o.paid) return 'Prepaid \u00b7 S/\u00c6';
    return 'S / \u00c6 on complete \u00b7 vault 3%';
  }

  function addrLine(role, name, lat, lng) {
    var nm = name || role;
    if (lat != null && lng != null && isFinite(Number(lat))) {
      return nm + ' \u00b7 ' + Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4);
    }
    return nm;
  }

  function presentInCli(o) {
    if (!o) return;
    pending = o;
    lastOfferId = o.id;
    expandCli();
    fitRouteOnMap(o);

    var price = fmtPrice(o);
    var km = fmtKm(o);
    var vendor = addrLine(
      'Vendor',
      o.vendorName || (o.task && o.task.vendorName) || 'Vendor',
      o.lat != null ? o.lat : o.vendorLat,
      o.lng != null ? o.lng : o.vendorLng
    );
    var client = addrLine(
      'Client',
      o.clientName || (o.task && o.task.clientName) || 'You',
      o.drop_lat != null ? o.drop_lat : o.dropLat,
      o.drop_lng != null ? o.drop_lng : o.dropLng
    );
    var cargo = cargoOf(o);
    var pay = payMethod(o);
    var eta = o.eta || (o.mins != null ? '~' + o.mins + ' min' : o.etaMin != null ? '~' + o.etaMin + ' min' : '');

    log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 OFFER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', 'dim');
    log('\u25c8  ' + price, 'ok');
    log(km + (eta ? ' \u00b7 ETA ' + eta : ''), 'ok');
    log('VENDOR \u00b7 ' + vendor, 'ok');
    log('CLIENT \u00b7 ' + client, 'ok');
    log('CARRY \u00b7 ' + cargo, 'ok');
    log('PAY \u00b7 ' + pay, 'ok');
    log('>>>  ACCEPT   \u00b7   DECLINE  <<<', 'ok');
    log('Type ACCEPT or DECLINE \u00b7 map shows route only', 'dim');
    preview('\u25c8 ' + price + ' \u00b7 ' + km);
  }

  function acceptPending() {
    if (!pending) {
      log('No pending offer', 'dim');
      return;
    }
    var o = pending;
    try {
      if (global.SNOfferStack) {
        if (SNOfferStack.runAct) SNOfferStack.runAct(o.id, 'accept');
        else if (SNOfferStack.accept) SNOfferStack.accept(o.id);
      }
    } catch (_) {}
    try {
      if (global.SNPolyScheduler && SNPolyScheduler.accept) SNPolyScheduler.accept(o.id);
    } catch (_) {}
    log('ACCEPTED \u00b7 route locked \u00b7 drive', 'ok');
    preview('ACCEPTED');
    fitRouteOnMap(o);
    pending = null;
  }

  function declinePending() {
    if (!pending) {
      log('No pending offer', 'dim');
      return;
    }
    var o = pending;
    try {
      if (global.SNOfferStack) {
        if (SNOfferStack.runAct) SNOfferStack.runAct(o.id, 'reject');
        else if (SNOfferStack.dismiss) SNOfferStack.dismiss(o.id);
      }
    } catch (_) {}
    log('DECLINED \u00b7 offer closed', 'dim');
    preview('DECLINED');
    pending = null;
    try {
      document.body.classList.remove('sn-cli-offer-focus');
    } catch (_) {}
  }

  function scanOffers() {
    var list = [];
    try {
      if (global.SNOfferStack && SNOfferStack.list) list = SNOfferStack.list() || [];
    } catch (_) {}
    var offered = null;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o) continue;
      var ph = String(o.phase || o.status || '').toLowerCase();
      if (ph === 'offered' || ph === 'offer' || ph === 'open' || ph === 'seeking_driver' || !ph) {
        if (o.kind === 'task' || o.task || o.nature || o.vendorName) {
          offered = o;
          break;
        }
      }
    }
    if (offered && offered.id !== lastOfferId) {
      presentInCli(offered);
    }
    try {
      var root = document.getElementById('sn-offer-stack');
      if (root) {
        root.style.display = 'none';
        root.innerHTML = '';
      }
      var poly = document.getElementById('sn-poly-root');
      if (poly) poly.style.display = 'none';
    } catch (_) {}
  }

  function hookCliLine() {
    try {
      if (!global.SNCli || SNCli._snCliOfferHook) return;
      SNCli._snCliOfferHook = true;
      var prev = SNCli.handleLine;
      if (typeof prev === 'function') {
        SNCli.handleLine = function (raw) {
          var low = String(raw || '').trim().toLowerCase();
          if (low === 'accept' || low === 'yes' || low === 'ok' || low === 'y') {
            acceptPending();
            return true;
          }
          if (low === 'decline' || low === 'reject' || low === 'no' || low === 'n' || low === 'dismiss') {
            declinePending();
            return true;
          }
          return prev.apply(this, arguments);
        };
      }
    } catch (_) {}
  }

  function patchPaint() {
    try {
      if (global.SNOfferStack && SNOfferStack.paint && !SNOfferStack._snCliPaint) {
        var orig = SNOfferStack.paint.bind(SNOfferStack);
        SNOfferStack._snCliPaint = true;
        SNOfferStack.paint = function () {
          try {
            orig();
          } catch (_) {}
          try {
            var root = document.getElementById('sn-offer-stack');
            if (root) {
              root.style.display = 'none';
              root.innerHTML = '';
            }
          } catch (_) {}
          scanOffers();
        };
      }
    } catch (_) {}
  }

  function boot() {
    injectCss();
    hookCliLine();
    patchPaint();
    scanOffers();
    setTimeout(patchPaint, 1500);
    setTimeout(scanOffers, 2000);
    setTimeout(hookCliLine, 2500);
    setInterval(scanOffers, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 3000);

  global.SNCliOffers = {
    build: BUILD,
    present: presentInCli,
    accept: acceptPending,
    decline: declinePending,
    scan: scanOffers,
  };
})(typeof window !== 'undefined' ? window : globalThis);
