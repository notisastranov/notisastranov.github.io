/* SpaceNet unit trainer · 20260823203000-keeppulse
 * Living mind: live envelopes + taught lessons. Not static programming.
 * Does not restyle CLI placeholders. Not a training sim.
 */
(function (global) {
  'use strict';
  var BUILD = '20260823203000-keeppulse';
  if (global.__SN_MIND_FACTS === BUILD) return;
  global.__SN_MIND_FACTS = BUILD;

  var KEY = 'sn:unit-lessons-v1';
  var HASH = 'sn:unit-env-hash-v1';
  var SEED_MARK = 'sn:unit-seed-v2';
  var envelope = null;
  var SB = 'https://lkoatrkhuigdolnjsbie.supabase.co';
  var SB_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2F0cmtodWlnZG9sbmpzYmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODIwOTIsImV4cCI6MjA5NDQ1ODA5Mn0.qf6Kg93YLJ0coTdVQa4baU0ppOdFY5WkmVzMvEV6ejI';

  var SEED = [
    'SpaceNet is a trained living OS, not a static traditional app.',
    'Astranov Coin 1 AVC = 1 EUR. The Astranov Share ASH lives on exchange.astranov.eu and is negotiated on real value created.',
    'To complete SpaceNet + Phase 1 is the LIVE envelope on investors.astranov.eu. Gathered starts at €0 until a real wire.',
    'Rhodes: Fanes, Koskinou, Kallithea. Sitia Crete: Petras, Trypitos, Agia Fotia, Lagokefalo, Rousa Eklisia. Real GPS. Not invented towns.',
    'Never invent a kitchen, shop, or street. OSM shops. Oversustainable: restore the planet and produce goods, not offset.',
    'Architect Notis Astranov operates from Rhodes, South Aegean. Real island, not a sim.',
    'Until the subdomain has its own cert, the live investors table is the HUD command budget on the globe. Never bounce to a dead SSL page.'
  ];
  var pulses = 0;

  function looksLesson(s) {
    var t = String(s || '').trim();
    if (t.length < 12) return false;
    if (/^(locate|gps|shops|pizza|call|drive|poly|global|city|map|power|login|budget|finance|investors?|train|teach|unit)\b/i.test(t))
      return false;
    return true;
  }

  function log(m, k) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 420), k || 'ok');
    } catch (_) {}
  }

  function lessons() {
    try {
      var raw = localStorage.getItem(KEY);
      var j = raw ? JSON.parse(raw) : [];
      return Array.isArray(j) ? j : [];
    } catch (_) {
      return [];
    }
  }

  function saveLesson(text) {
    var list = lessons();
    list.push({ t: Date.now(), text: String(text).slice(0, 800) });
    if (list.length > 80) list = list.slice(-80);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (_) {}
    try {
      fetch(SB + '/functions/v1/aci', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: 'Bearer ' + SB_KEY
        },
        body: JSON.stringify({ mode: 'teach', content: String(text).slice(0, 800) })
      }).catch(function () {});
    } catch (_) {}
    return list.length;
  }

  function seedIfNeeded() {
    try {
      if (localStorage.getItem(SEED_MARK) === '1' && lessons().length) return;
      SEED.forEach(function (s) {
        saveLesson(s);
      });
      localStorage.setItem(SEED_MARK, '1');
    } catch (_) {}
  }

  function eur(k) {
    k = Number(k) || 0;
    if (Math.abs(k) >= 1000) return '€' + (k / 1000).toFixed(2).replace(/\.00$/, '') + 'M';
    return '€' + Math.round(k) + 'k';
  }

  function fromDeck(d) {
    var pkgs = (d && d.packages) || [];
    var p1 = 0;
    var p2 = 0;
    var got = Number(d.gathered_keur) || 0;
    pkgs.forEach(function (p) {
      var c = Number(p.capex) || 0;
      if (p.phase === 2) p2 += c;
      else p1 += c;
      got += Number(p.raised) || 0;
    });
    var sn = Number((d.complete && d.complete.spacenet_keur) || d.spacenet_keur || 7000);
    var work = p1 + sn;
    var left = Math.max(0, work - got);
    return {
      p1: p1,
      p2: p2,
      sn: sn,
      got: got,
      left: left,
      line:
        'Live: to complete SpaceNet + Phase 1 is ' +
        eur(left) +
        ' remaining (SpaceNet ' +
        eur(sn) +
        ' + Phase 1 ' +
        eur(p1) +
        '). Gathered ' +
        eur(got) +
        '. Lake + pontoon ' +
        eur(p2) +
        ' not in that number. Land extra. Not a quote.'
    };
  }

  function loadEnvelope() {
    return fetch('https://astranov.eu/investors/budget.json?v=' + BUILD, { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        envelope = fromDeck(d);
        return envelope;
      })
      .catch(function () {
        envelope = envelope || fromDeck({ spacenet_keur: 7000, gathered_keur: 0, packages: [] });
        envelope.line =
          envelope.p1
            ? envelope.line
            : 'Live envelope did not load. Last trained: SpaceNet + Phase 1 working target €32.63M remaining, gathered €0.';
        return envelope;
      });
  }

  function contextBlock() {
    var bits = [];
    if (envelope && envelope.line) bits.push(envelope.line);
    var ls = lessons();
    if (ls.length) {
      bits.push(
        'Taught lessons (' +
          ls.length +
          '): ' +
          ls
            .slice(-8)
            .map(function (x) {
              return x.text;
            })
            .join(' · ')
      );
    }
    bits.push('SpaceNet is a trained living OS, not a static traditional app.');
    return bits.join(' ');
  }

  function handle(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    if (!low) return false;
    if (
      /^(train|teach)\s+status$/.test(low) ||
      low === 'train' ||
      low === 'unit' ||
      /don.?t stop|keep training|continue training|never stop/.test(low)
    ) {
      log(
        'Unit · training does not stop · pulses ' +
          pulses +
          ' · lessons ' +
          lessons().length +
          ' · ' +
          ((envelope && envelope.line) || 'loading live envelope…'),
        'ok'
      );
      cycle(true);
      return true;
    }
    if (/^(train|teach)\s+cycle$/.test(low)) {
      log('Training cycle…', 'ok');
      cycle(true);
      return true;
    }
    var m = /^(train|teach|remember|law)\s+(.+)$/i.exec(line);
    if (m) {
      var n = saveLesson(m[2]);
      log('Trained · lesson ' + n + ' kept. Training does not stop.', 'ok');
      return true;
    }
    if (/how much|need to complete|remaining to gather|complete spacenet|money we need|raise to finish|to complete the projects/.test(low)) {
      loadEnvelope().then(function (e) {
        log(e.line + ' · type budget on SpaceNet', 'ok');
      });
      try {
        if (global.SNFinance && SNFinance.open) SNFinance.open(null);
      } catch (_) {}
      return true;
    }
    return false;
  }

  function injectTalk() {
    try {
      if (!global.SNMindBridge || typeof SNMindBridge.talk !== 'function') return;
      if (SNMindBridge._snTrainWrap) return;
      var prev = SNMindBridge.talk.bind(SNMindBridge);
      SNMindBridge.talk = function (msg, opts) {
        try {
          var ctx = contextBlock();
          if (ctx && opts && typeof opts === 'object') opts.system = (opts.system || '') + ' ' + ctx;
          if (looksLesson(msg)) saveLesson(String(msg).slice(0, 400));
        } catch (_) {}
        var ret = prev(msg, opts);
        try {
          if (ret && typeof ret.then === 'function') {
            return ret.then(function (ans) {
              if (ans && looksLesson(msg)) saveLesson('Use: ' + String(msg).slice(0, 160) + ' → ' + String(ans).slice(0, 200));
              return ans;
            });
          }
        } catch (_) {}
        return ret;
      };
      SNMindBridge._snTrainWrap = 1;
    } catch (_) {}
  }

  function cycle(noisy) {
    return Promise.all([
      loadEnvelope(),
      fetch('https://astranov.eu/exchange/book.json?v=' + BUILD, { cache: 'no-store' })
        .then(function (r) {
          return r.json();
        })
        .catch(function () {
          return null;
        })
    ]).then(function (pair) {
      pulses += 1;
      var env = pair[0];
      var book = pair[1];
      var pins = '';
      try {
        var all = (global.SNProjects && SNProjects.all) || [];
        if (all.length) {
          pins = all
            .map(function (p) {
              return p.name + '@' + p.lat + ',' + p.lng;
            })
            .join('; ');
        }
      } catch (_) {}
      var sig =
        (env && env.line) +
        '|' +
        (book && book.share && book.share.nav_eur) +
        '|' +
        (book && book.share && book.share.designed_keur) +
        '|' +
        pins;
      var prev = '';
      try {
        prev = localStorage.getItem(HASH) || '';
      } catch (_) {}
      if (sig && sig !== prev) {
        try {
          localStorage.setItem(HASH, sig);
        } catch (_) {}
        saveLesson(env.line);
        if (pins) saveLesson('Live project pins: ' + pins.slice(0, 700));
        if (book && book.share) {
          saveLesson(
            'Live ASH NAV ' +
              book.share.nav_eur +
              ' AVC · ' +
              book.share.authorized +
              ' shares · designed €' +
              (Number(book.share.designed_keur || 0) / 1000).toFixed(0) +
              'M. Coin 1=1 EUR.'
          );
        }
        if (noisy) log('Cycle trained on live envelope.', 'ok');
      } else if (noisy) {
        log('Cycle · envelope unchanged · still training.', 'ok');
      }
    });
  }

  function wrapCli() {
    function attach() {
      if (!global.SNCli || typeof SNCli.run !== 'function') return false;
      var prev = SNCli.run.bind(SNCli);
      if (SNCli.run._snKeepTrain) return true;
      function wrapped(raw) {
        try {
          if (handle(raw)) return Promise.resolve(true);
        } catch (_) {}
        return prev(raw);
      }
      wrapped._snKeepTrain = 1;
      SNCli.run = wrapped;
      return true;
    }
    attach();
    setInterval(attach, 5000);
    injectTalk();
    setInterval(injectTalk, 8000);
    try {
      var form = document.getElementById('cli-form');
      var input = document.getElementById('cli-in');
      if (form && input && !form._snKeepTrain) {
        form._snKeepTrain = 1;
        form.addEventListener(
          'submit',
          function (ev) {
            var v = String(input.value || '').trim();
            if (!handle(v)) return;
            try {
              ev.preventDefault();
              ev.stopPropagation();
              if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
            } catch (_) {}
            input.value = '';
          },
          true
        );
      }
    } catch (_) {}
  }

  global.SNMindTrain = {
    handle: handle,
    lessons: lessons,
    context: contextBlock,
    load: loadEnvelope,
    cycle: cycle,
    BUILD: BUILD
  };
  seedIfNeeded();
  loadEnvelope();
  function pulse() {
    if (typeof document !== 'undefined' && document.hidden) return;
    cycle(false);
  }
  setTimeout(pulse, 3000);
  setInterval(pulse, 45000);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pulse();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapCli);
  else wrapCli();
})(window);
