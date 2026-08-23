/* SNGreeklish — Greek · Greeklish · Cretan · village → English routing
 * NOTE: JS \b does NOT work on Greek letters — use edge helpers.
 */
(function (g) {
  'use strict';

  // edge: start/non-letter  …  end/non-letter  (Latin + Greek)
  function re(body, flags) {
    return new RegExp(
      '(?:^|[^A-Za-zΑ-Ωα-ωΆ-ώ])(?:' + body + ')(?=$|[^A-Za-zΑ-Ωα-ωΆ-ώ])',
      flags || 'gi'
    );
  }

  /** [regex, replacement] — longer / more specific first */
  var PHRASES = [
    [re('aksaki|aksako|αξάκι|αξακι'), ' aksaki '],
    [re('aksas|αξάς|αξας'), ' aksas '],
    [re('ela\\s*re|έλα\\s*ρε|ελα\\s*ρε'), ' aksaki '],
    [re('pou\\s*eimai|pou\\s*ime|πού\\s*είμαι|που\\s*ειμαι|που\\s*είμαι|πού\\s*ειμαι'), ' locate me '],
    [re('vres\\s*me|βρες\\s*με|βρεςμε'), ' locate me '],
    [re('topothesia|τοποθεσία|τοποθεσια'), ' locate me '],
    [re('paraggeile|paraggele|paragelia|paraggelia|παράγγειλε|παραγγειλε|παραγγελία|παραγγελια'), ' order '],
    [re('fere|ferto|φέρτο|φερε|φέρε'), ' bring '],
    [re('kane|κάνε|κανε|kame|κάμε'), ' do '],
    [re('thelo|thelw|θέλω|θελω|θέλει|θελει'), ' want '],
    [re('pitza|pitsa|pizza|πίτσα|πιτσα|πιτσες|pitses'), ' pizza '],
    [re('pitogyra|pitogyro|pitogira|πιτογύρα|πιτόγυρο|πιτογυρο|πιτογυρα|gyro|gyros|γύρο|γυρο'), ' pitogyra '],
    [re('souvlaki|souvla|σουβλάκι|σουβλακι|σουβλα'), ' souvlaki '],
    [re('mpyronia|mpironia|mpyres|mpires|mpira|mpyra|μπυρόνια|μπυρονια|μπίρες|μπιρες|μπίρα|μπιρα|μπυρα'), ' beer '],
    [re('kafes|kafe|cafe|coffee|καφέ|καφε|espresso|φραπέ|frape|freddo'), ' coffee '],
    [re('burger|mpurger|μπεργκερ|μπέργκερ|hamburger'), ' burger '],
    [re('sushi|σούσι|σουσι'), ' sushi '],
    [re('salata|σαλάτα|σαλατα|salad'), ' salad '],
    [re('fagito|faghto|φαγητό|φαγητο|food|trofi|τροφή'), ' food '],
    [re('peinao|πεινάω|πειναω|πεινώ|hungry'), ' hungry '],
    [re('tsigareta|tsigara|τσιγάρα|τσιγαρα'), ' cigarettes '],
    [re('retsina|ρετσίνα|ρετσινα|krasi|κρασί|κρασι|wine|oinos|οίνος|οινος|οίνον|οινον'), ' wine '],
    [re('nero|νερό|νερο|water|anapsyktiko|αναψυκτικό|soda|cola'), ' drink '],
    [re('magazia|magazi|μαγαζιά|μαγαζια|shops|stores|εστιατόρια|estiatoria'), ' shops '],
    [re('xarti|χάρτη|χαρτη'), ' map '],
    [re('skoteino|σκοτεινό|σκοτεινο'), ' dark '],
    [re('foteino|φωτεινό|φωτεινο'), ' bright '],
    [re('odigos|οδηγός|οδηγος|courier|driver'), ' driver '],
    [re('paradosi|παράδοση|παραδοση|deliver|delivery'), ' deliver '],
    [re('grigora|γρήγορα|γρηγορα|fast|quick'), ' fast '],
    [re('akyrose|akyrwse|ακύρωσε|ακυρωσε|ακυρο|cancel|stamat|σταμάτα|σταματα|stop'), ' cancel '],
    [re('spiti|σπίτι|σπιτι|home'), ' home '],
    [re('pame|πάμε|παμε'), ' go '],
    [re('tilemaxos|telemachos|τηλέμαχος|τηλεμαχος|τηλεμαχ'), ' telemachos '],
    [re('archangelos|arcangelo|αρχάγγελος|αρχαγγελος|αρχαγγελ'), ' archangelos '],
    [re('yia|geia|γεια|γεια\\s*σου|γεια\\s*σας'), ' hello '],
    [re('kalimera|καλημέρα|καλημερα'), ' good morning '],
    [re('kalispera|καλησπέρα|καλησπερα'), ' good evening '],
    [re('efharisto|efxaristo|ευχαριστώ|ευχαριστω'), ' thanks '],
    [re('parakalo|παρακαλώ|παρακαλω'), ' please '],
    [re('ne|ναι|yes|ok|εντάξει|entaxi'), ' yes '],
    [re('oxi|όχι|οχι|no'), ' no '],
    [re('voitheia|βοήθεια|βοηθεια|help'), ' help '],
    [re('edw|edo|εδώ|εδω|here'), ' here '],
    // cretan particles → drop
    [re('re|πρε|pre|ντε|nte|τζαι|tzai|μαν'), ' '],
    // ancient
    [re('χαίρε|χαιρε|chaere|chaire'), ' hello '],
    [re('δός|δος|dos'), ' order '],
    [re('ἴθι|ithi|elthe'), ' go '],
  ];

  var FOOD = [
    'pizza',
    'pitogyra',
    'gyros',
    'souvlaki',
    'burger',
    'sushi',
    'salad',
    'coffee',
    'beer',
    'wine',
    'drink',
    'food',
    'cigarettes',
  ];

  function normalize(s) {
    var out = ' ' + String(s || '').trim() + ' ';
    if (out === '  ') return '';
    var i;
    for (i = 0; i < PHRASES.length; i++) {
      out = out.replace(PHRASES[i][0], PHRASES[i][1]);
    }
    out = out.replace(/\s+/g, ' ').trim().toLowerCase();
    if (/\bwant\b/.test(out) && FOOD.some(function (f) { return out.indexOf(f) >= 0; })) {
      out = out.replace(/\bwant\b/g, 'order');
    }
    if (/\bbring\b/.test(out) && FOOD.some(function (f) { return out.indexOf(f) >= 0; })) {
      out = out.replace(/\bbring\b/g, 'order');
    }
    if (/\bdo\b/.test(out) && FOOD.some(function (f) { return out.indexOf(f) >= 0; })) {
      out = out.replace(/\bdo\b/g, 'order');
    }
    if (/\bhungry\b/.test(out) && !FOOD.some(function (f) { return out.indexOf(f) >= 0; })) {
      out = (out + ' order food').replace(/\bhungry\b/g, '').replace(/\s+/g, ' ').trim();
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function foodTokens(s) {
    var n = normalize(s);
    var found = [];
    FOOD.forEach(function (f) {
      if (n.indexOf(f) >= 0) found.push(f);
    });
    // aliases market/tests expect
    if (n.indexOf('pitogyra') >= 0 && found.indexOf('gyros') < 0) found.push('gyros');
    if (n.indexOf('gyros') >= 0 && found.indexOf('pitogyra') < 0 && n.indexOf('pitogyra') < 0) {
      /* keep gyros alone */
    }
    return found;
  }

  function toEnglishCommand(s) {
    var n = normalize(s);
    if (!n) return '';
    var foods = foodTokens(n);
    if (foods.length && !/\border\b/.test(n)) {
      return 'order me ' + foods[0];
    }
    if (/\border\b/.test(n) && foods.length) {
      return 'order me ' + foods[0];
    }
    if (/\border\b/.test(n) && !foods.length) {
      return 'order me food';
    }
    if (/\bgo\b/.test(n) && /\bhome\b/.test(n)) return 'pilot home';
    if (n === 'home') return 'pilot home';
    if (n === 'here' || n === 'locate me' || n === 'locate') return 'locate me';
    if (/\blocate\b/.test(n)) return 'locate me';
    if (/\bshops\b/.test(n)) return 'fill shops';
    if (n === 'dark' || n === 'dark map' || /\bdark\b/.test(n) && /\bmap\b/.test(n)) return 'dark map';
    if (n === 'bright' || /\bbright\b/.test(n)) return 'bright map';
    if (n === 'driver' || /\bdriver\b/.test(n)) return 'drive on';
    if (/\bdeliver\b/.test(n)) return 'deliver me';
    if (/\bcancel\b/.test(n)) return 'cancel';
    if (n === 'telemachos') return 'telemachos';
    if (n === 'archangelos') return 'go archangelos';
    if (n === 'aksaki' || n === 'aksas') return 'aksaki';
    if (/\bhello\b/.test(n) || /\bgood morning\b/.test(n) || /\bgood evening\b/.test(n)) return 'hello';
    if (/\bthanks\b/.test(n)) return 'thanks';
    if (/\bhelp\b/.test(n)) return 'help';
    if (/\byes\b/.test(n)) return 'yes';
    if (/\bno\b/.test(n)) return 'no';
    return n;
  }

  function looksGreekish(s) {
    var t = String(s || '');
    if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(t)) return true;
    return /\b(thelo|thelw|pame|ela|vres|pou|pitza|pitsa|mpyr|kafes|magazi|paragge|souvl|gyro|aksak|re|pre|tzai|kane|fere|oxi|ne|yia|geia|kalimera|efharisto|peinao|akyrose|spiti|odigos)\b/i.test(
      t
    );
  }

  g.SNGreeklish = {
    normalize: normalize,
    foodTokens: foodTokens,
    toEnglishCommand: toEnglishCommand,
    looksGreekish: looksGreekish,
  };
})(typeof window !== 'undefined' ? window : globalThis);
