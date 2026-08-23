/**
 * Astra coins (⭐) — primary wallet. From 18 Aug 2026: 1 ⭐ = 1 EUR.
 * Display: "9.00 ⭐" or compact "⭐ 9.00". Legacy Æ / S / SpaceNets map 1:1.
 */
(function (g) {
  'use strict';

  var LEDGER_K = 'sn:ledger-v1';
  function ledgerLoad() {
    try {
      return JSON.parse(localStorage.getItem(LEDGER_K) || '[]');
    } catch (_) {
      return [];
    }
  }
  function ledgerPush(entry) {
    var a = ledgerLoad();
    a.push(
      Object.assign({ t: Date.now() }, entry || {})
    );
    if (a.length > 800) a = a.slice(-800);
    try {
      localStorage.setItem(LEDGER_K, JSON.stringify(a));
    } catch (_) {}
    return entry;
  }

  var QK = 'spacenet_currency_v1';
  var WK = 'spacenet_wallet_v1';
  /** Primary currency: Astra coins. 1 ⭐ = 1 EUR from 2026-08-18. */
  var SYM = '⭐';
  var NAME = 'Astra coin';
  var NAME_PL = 'Astra coins';
  var GLYPH = '⭐';
  var BORN = '2026-08-18';
  var REWARD_K = 'sn:astra-rewards-v1';
  var st = {
    networkIndex: 1,
    quotes: { EUR: 1, USD: 1.08, BTC: 0.000015, ETH: 0.00025 },
    balance: 0,
    mined: 0,
    platformFees: 0,
  };

  function load() {
    try {
      var q = JSON.parse(localStorage.getItem(QK) || '{}');
      if (q.networkIndex > 0) st.networkIndex = q.networkIndex;
      if (q.quotes) Object.keys(q.quotes).forEach(function (k) {
        if (q.quotes[k] > 0) st.quotes[k] = q.quotes[k];
      });
    } catch (e) {}
    try {
      var w = JSON.parse(localStorage.getItem(WK) || '{}');
      if (typeof w.balance === 'number') st.balance = Math.max(0, w.balance);
      if (typeof w.mined === 'number') st.mined = w.mined;
      if (typeof w.platformFees === 'number') st.platformFees = w.platformFees;
    } catch (e) {}
    recompute();
  }

  function saveQ() {
    try {
      localStorage.setItem(QK, JSON.stringify({ networkIndex: st.networkIndex, quotes: st.quotes }));
    } catch (e) {}
  }
  function saveW() {
    try {
      localStorage.setItem(WK, JSON.stringify({ balance: st.balance, mined: st.mined, platformFees: st.platformFees }));
    } catch (e) {}
  }

  function recompute() {
    var n = st.networkIndex;
    /* ⭐ is 1:1 with Euro always — birth peg 2026-08-18 */
    st.quotes.EUR = 1;
    st.quotes.USD = 1.08;
    st.quotes.BTC = n * 0.000015;
    st.quotes.ETH = n * 0.00025;
  }

  /** Display: 9.00 ⭐  (1 ⭐ = 1 EUR from 2026-08-18) */
  function fmt(a) {
    var n = Number(a);
    if (!isFinite(n)) n = 0;
    var s = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2);
    return s + ' ⭐';
  }

  /** Compact HUD: ⭐ 12.50 */
  function fmtCompact(a) {
    var n = Number(a);
    if (!isFinite(n)) n = 0;
    return GLYPH + ' ' + n.toFixed(2);
  }

  function fmtRate(perUnit, unit) {
    var n = Number(perUnit);
    if (!isFinite(n)) n = 0;
    unit = unit || 'day';
    return n.toFixed(2) + ' ⭐/' + unit;
  }

  function credit(a, why) {
    a = Number(a);
    if (!isFinite(a) || a <= 0) return st.balance;
    st.balance += a;
    if (why === 'mine') st.mined += a;
    saveW();
    try {
      ledgerPush({ kind: 'credit', amount: a, why: why || 'credit', bal: st.balance });
    } catch (_) {}
    g.SNField && g.SNField.paint && g.SNField.paint();
    return st.balance;
  }

  /**
   * Architect platform revenue — 3% of every marketplace transaction in Astranov coins.
   * platformFees vault ONLY GROWS — never credited back into client spendable balance.
   * (Client already paid full gross via debit; vault is architect accounting.)
   */
  function notePlatformFee(a, meta) {
    a = Number(a);
    if (!isFinite(a) || a <= 0)
      return { ok: false, fee: 0, platformFees: st.platformFees, balance: st.balance };
    st.platformFees = Math.round(((Number(st.platformFees) || 0) + a) * 100) / 100;
    saveW();
    try {
      if (g.SNCli && SNCli.log) {
        SNCli.log(
          '3% vault +' +
            fmt(a) +
            ' · vault total ' +
            fmt(st.platformFees) +
            ' · wallet ' +
            fmt(st.balance) +
            (meta && meta.why ? ' · ' + meta.why : ''),
          'ok'
        );
      }
      if (g.SNCli && SNCli.preview) SNCli.preview('Vault ' + fmt(st.platformFees) + ' · +3%');
      if (g.SNGlobe && SNGlobe.setHud) SNGlobe.setHud('Vault ' + fmt(st.platformFees));
      if (g.SNField && SNField.paint) SNField.paint();
      if (g.SNUsage && SNUsage.track) {
        SNUsage.track('platform_fee_3pct', {
          fee: a,
          total: st.platformFees,
          why: (meta && meta.why) || 'tx',
        });
      }
    } catch (e) {}
    return { ok: true, fee: a, platformFees: st.platformFees, balance: st.balance };
  }

  function takePlatformFeeFrom(gross, why) {
    gross = Number(gross);
    if (!isFinite(gross) || gross <= 0) return 0;
    var fee = Math.round(gross * 0.03 * 100) / 100;
    notePlatformFee(fee, { why: why || 'transaction', gross: gross });
    return fee;
  }

  function rewardLoad() {
    try {
      return JSON.parse(localStorage.getItem(REWARD_K) || '{}');
    } catch (_) {
      return {};
    }
  }
  function rewardSave(m) {
    try {
      localStorage.setItem(REWARD_K, JSON.stringify(m));
    } catch (_) {}
  }

  /**
   * Reward program — donate, use, or improve SpaceNet.
   * One grant per why-key unless repeatable.
   * Peg: 1 ⭐ = 1 EUR from BORN.
   */
  var REWARD_TABLE = {
    donate: { amount: 0.1, repeatable: true, note: 'donated spare resources' },
    locate: { amount: 0.05, repeatable: false, note: 'first locate' },
    signin: { amount: 0.2, repeatable: false, note: 'signed in' },
    research: { amount: 0.02, repeatable: true, note: 'used research' },
    improve: { amount: 0.5, repeatable: true, note: 'proposed a HUD / design' },
    announce: { amount: 0.01, repeatable: false, note: 'welcome to Astra' },
  };

  function reward(why, opts) {
    opts = opts || {};
    var spec = REWARD_TABLE[why] || { amount: Number(opts.amount) || 0.01, repeatable: !!opts.repeatable, note: why };
    var bag = rewardLoad();
    var key = String(why || 'use');
    if (!spec.repeatable && bag[key]) return { ok: false, skipped: true, balance: st.balance };
    var amt = Number(opts.amount != null ? opts.amount : spec.amount) || 0;
    if (amt <= 0) return { ok: false, balance: st.balance };
    credit(amt, 'reward:' + key);
    if (!spec.repeatable) {
      bag[key] = Date.now();
      rewardSave(bag);
    } else {
      bag[key + ':n'] = (Number(bag[key + ':n']) || 0) + 1;
      if (why === 'donate' && bag[key + ':n'] > 24) return { ok: true, amount: amt, balance: st.balance };
      rewardSave(bag);
    }
    try {
      if (g.SNCli && SNCli.log)
        SNCli.log('⭐ +' + amt.toFixed(2) + ' Astra · ' + (spec.note || key) + ' · wallet ' + fmt(st.balance), 'ok');
    } catch (_) {}
    return { ok: true, amount: amt, balance: st.balance, why: key };
  }

  function announce() {
    try {
      if (sessionStorage.getItem('sn:astra-announced') === '1') return false;
      sessionStorage.setItem('sn:astra-announced', '1');
    } catch (_) {}
    var lines = [
      '⭐ ASTRA COINS · new beginning · 18 Aug 2026',
      '1 ⭐ = 1 Euro. The five-pointed star is the mark.',
      'Use SpaceNet. Donate spare resources. Improve a HUD. Earn Astra.',
      'PROGRAMMERS WANTED · test and build SpaceNet. Paid in Astra you spend with each other inside the net.',
      'Type CODERS · personal designs stay yours until the founder ships them.',
    ];
    try {
      if (g.SNCli && SNCli.log) {
        lines.forEach(function (ln) {
          SNCli.log(ln, 'ok');
        });
        if (SNCli.preview) SNCli.preview('⭐ 1 Astra = 1 Euro');
      }
    } catch (_) {}
    try {
      if (g.SNGlobe && SNGlobe.setHud) SNGlobe.setHud('⭐ ASTRA · 1 = €1');
    } catch (_) {}
    reward('announce');
    return true;
  }

  function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (low === 'astra' || low === 'astra coins' || low === 'rewards' || low === 'rate' || low === 'coders' || low === 'programmers') {
      try {
        if (g.SNCli && SNCli.log) {
          SNCli.log('PROGRAMMERS WANTED · test · build · improve · paid in ⭐ Astra', 'ok');
          SNCli.log('Spend Astra with each other inside SpaceNet. 1 ⭐ = 1 EUR.', 'ok');
          SNCli.log('Type donate on · propose · help. astranov.eu', 'dim');
        }
      } catch (_) {}
      announce();
      return true;
    }
    return false;
  }

  load();

  g.SNCurrency = {
    SYMBOL: SYM,
    GLYPH: GLYPH,
    NAME: NAME,
    NAME_PL: NAME_PL,
    BORN: BORN,
    /** @deprecated aliases */
    LEGACY: 'SpaceNets',
    STRAND_LEGACY: 'strands',
    EUR_PEG: 1,
    format: fmt,
    formatCompact: fmtCompact,
    formatRate: fmtRate,
    formatPair: function (a, code) {
      var n = Number(a);
      if (!isFinite(n)) n = 0;
      var q = st.quotes[code] || 1;
      return fmt(n) + ' · ~' + (n * q).toFixed(2) + ' ' + (code || 'EUR');
    },
    snapshot: function () {
      return {
        balance: st.balance,
        mined: st.mined,
        platformFees: st.platformFees,
        networkIndex: st.networkIndex,
        quotes: Object.assign({}, st.quotes),
        name: NAME,
        symbol: SYM,
      };
    },
    setNetworkIndex: function (n) {
      n = Number(n);
      if (!(n > 0)) return false;
      st.networkIndex = n;
      recompute();
      saveQ();
      return true;
    },
    balance: function () {
      return st.balance;
    },
    mined: function () {
      return st.mined;
    },
    platformFees: function () {
      return st.platformFees || 0;
    },
    credit: credit,
    creditMined: function (a) {
      return credit(a, 'mine');
    },
    notePlatformFee: notePlatformFee,
    takePlatformFeeFrom: takePlatformFeeFrom,
    debit: function (a, why) {
      a = Number(a);
      if (!(a > 0) || a > st.balance) return { ok: false, balance: st.balance };
      st.balance -= a;
      saveW();
      try {
        ledgerPush({ kind: 'debit', amount: a, why: why || 'debit', bal: st.balance });
      } catch (_) {}
      g.SNField && g.SNField.paint && g.SNField.paint();
      return { ok: true, balance: st.balance };
    },
    vault: function () {
      return st.platformFees || 0;
    },
    ledgerVerify: function () {
      var rows = ledgerLoad();
      var sum = 0;
      rows.forEach(function (r) {
        var x = Number(r.amount) || 0;
        if (r.kind === 'credit') sum += x;
        else if (r.kind === 'debit') sum -= x;
      });
      return {
        ok: rows.length === 0 || Math.abs(sum - st.balance) < 0.05,
        ledgerSum: Math.round(sum * 100) / 100,
        balance: st.balance,
        lines: rows.length,
        vault: st.platformFees || 0,
      };
    },
    fees: { platformPct: 3, driverPct: 15 },
    reward: reward,
    announce: announce,
    handleLine: handleLine,
    status: function () {
      return [
        '⭐ ASTRA COINS · 1 ⭐ = 1 EUR since ' + BORN,
        'Wallet ' + fmt(st.balance) + ' · mined ' + fmt(st.mined),
        'Platform fees (3%) ' + fmt(st.platformFees || 0) + ' lifetime',
        'Earn: donate · use · improve · type rewards',
        'Fees 3% platform · 15% driver · in Astra',
      ];
    },
  };

  // ledger helpers on API (debit/credit already push ledger inside)
  g.SNCurrency.ledger = ledgerLoad;
  g.SNCurrency.ledgerPush = ledgerPush;
})(typeof window !== 'undefined' ? window : globalThis);

