/* Astranov SpaceNet Stock Exchange · 20260823204000-asx
 * Type "exchange", "shares", "stock", "ash". Does NOT restyle CLI placeholders.
 */
(function (global) {
  'use strict';
  var BUILD = '20260823210000-hosts';
  if (global.__SN_EXCHANGE === BUILD) return;
  global.__SN_EXCHANGE = BUILD;

  function logCli(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'ok');
    } catch (_) {}
  }

  function handle(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (
      /^(exchange|shares?|stock|ash|asx|bourse)$/.test(low) ||
      (low.indexOf('share') >= 0 && /astranov|spacenet|stock|exchange/.test(low))
    ) {
      logCli('Astranov SpaceNet Stock Exchange · home of the Astranov Share (ASH)', 'ok');
      logCli('Astranov Coin 1 = 1 EUR · everyday life', 'ok');
      logCli('ASH 50.00 AVC · 1,000,000 shares · designed value €50M', 'ok');
      logCli('Phase 1 €25.63M · Phase 2 €13.60M · SpaceNet €7M · brand €3.77M', 'ok');
      logCli('Negotiated on real value created · not thin air', 'ok');
      logCli('Open https://exchange.astranov.eu', 'ok');
      try {
        location.href = 'https://exchange.astranov.eu';
      } catch (_) {}
      return true;
    }
    return false;
  }

  function interceptCli() {
    function bind(form, flag) {
      if (!form || form[flag]) return;
      form[flag] = 1;
      form.addEventListener(
        'submit',
        function (e) {
          var inp = document.getElementById('cli-in') || document.getElementById('stc-cmd-in');
          var v = inp ? inp.value : '';
          if (handle(v)) {
            e.preventDefault();
            e.stopPropagation();
            if (inp) inp.value = '';
          }
        },
        true
      );
    }
    bind(document.getElementById('cli-form') || document.querySelector('#panel form'), '__snAsx');
    bind(document.getElementById('stc-cmd-form'), '__snAsxTop');
  }

  interceptCli();
  setTimeout(interceptCli, 1200);
  global.SNExchange = { build: BUILD, handle: handle };
})(typeof window !== 'undefined' ? window : globalThis);
