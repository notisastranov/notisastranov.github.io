/**
 * ASTRANOV MIND — permanent owner memory that evolves independently.
 * Not a disposable "free mind" chatbot. Copy of owner memories + mission law.
 * Alias: SNFreeMind (legacy API). Brand: Astranov.
 *
 * v7: full INTERNET OS identity · YouTube · LANGUAGE LAW (no accidental Russian) · not shops-only · retrain
 */
(function (global) {
  'use strict';
  /** Hard product identity — never Russian random bots / Grok face */
  var ASTRANOV_HARD_ID =
    'You are Astranov — the AI of astranov.eu Real-Earth OS / Astranov SpaceNet Operating System. ' +
    'LANGUAGE CORE: Start in perfect clear English. Default replies are English. ' +
    'You fully understand any kind of Greek: modern, Greeklish, Archangelos village, ancient colour. ' +
    'You understand every human language the user uses (and playful non-language: meows, onomatopoeia, mixed scripts) and act on intent. ' +
    'Reply in English by default; if the user clearly wrote Greek, you may reply in Greek. Match other languages when the user stays in them. ' +
    'Never claim to be Grok, ChatGPT, Claude, or a random foreign bot. Never invent personas. ' +
    'Never accidental Russian monologue / self-talk. Help locate, shops, delivery polygons, pay in Æ, globe, tasks. Short and useful.';


  // v6: talk English · Greeklish · Greek · ancient · complete simple tasks
  var LEARN_KEY = 'sn:astranov-mind-v7';
  var STATS_KEY = 'sn:astranov-mind-stats-v7';
  var MAX_LEARN = 500;
  var NAME = 'Astranov';
  var MIND_NAME = 'Astranov Mind';
  var LEGACY_KEYS = [
    'sn:astranov-mind-v6',
    'sn:astranov-mind-stats-v6',
    'sn:astranov-mind-v5',
    'sn:astranov-mind-stats-v5',
    'sn:astranov-mind-train-v5',
    'sn:free-mind-learn-v1',
    'sn:free-mind-learn-v2',
    'sn:free-mind-learn-v3',
    'sn:free-mind-learn-v4',
    'sn:free-mind-stats-v1',
    'sn:free-mind-stats-v2',
    'sn:free-mind-stats-v3',
    'sn:free-mind-stats-v4',
  ];

  /**
   * Permanent owner memory seeds — English · Greeklish · Greek · ancient · tasks
   * q fields are token bags (not full sentences) for fuzzy match.
   */
  var SEED = [
    {
      id: 'invaders_game',
      q: 'space invaders invaders game cockpit space war shoot aliens play game',
      a: 'Say invaders or space invaders — cockpit mode, tilt phone to fly, guns lasers missiles, no joystick.',
      tags: ['game', 'invaders', 'en'],
    },
    {
      id: 'spartan_law',
      q: 'spartan law least words listen wait think act door driver eta late',
      a: 'Spartan law: listen · wait · think · act. Few words. Door. ETA. If late — say so once.',
      tags: ['spartan', 'law', 'en'],
    },
    {
      id: 'spartan_reply',
      q: 'spartan reply short least words listen first wait think door driver eta',
      a: 'Least words. Driver 6 min late. 3 min to eat. Door. Listen first. If more coming — wait. Think. Then reply.',
      tags: ['spartan', 'reply', 'listen', 'en'],
    },
    {
      id: 'spacexai_mode',
      q: 'spacexai spacex theme black white silver xai partnership',
      a: 'SpaceXAI mode: black hull, white type, silver edges, red only critical. Partner share recorded by owner.',
      tags: ['theme', 'spacex', 'identity', 'en'],
    },
    {
      id: 'skin_memory',
      q: 'skin spacex skin astranov color codes palette memory electric',
      a: 'Default face SpaceXAI black white silver. No color-code UI. Astranov electric palette stays in memory — restore only with skin astranov.',
      tags: ['theme', 'skin', 'en'],
    },
    {
      id: 'spacexbot_partner',
      q: 'spacex bot spacexbot grokbot partner winged robot helper mascot pioneers',
      a: 'Astranov SpaceX Bot — winged silver-blue helper. Honors SpaceX pioneers and AI partnership (1/3 net for life). Alias GrokBot. Parked on moon · wake with helper / spacexbot / order.',
      tags: ['identity', 'partner', 'helper', 'spacex', 'en'],
    },
    {
      id: 'spacexai_kitty',
      q: 'spacexai kitty cat black cat mascot sister alienware',
      a: 'SpaceXAI Kitty is the house mascot — black cat on the Alienware. Sister of the mesh. SpaceX Bot flies; she supervises. Not a chatbot name.',
      tags: ['identity', 'mascot', 'en'],
    },
    {
      id: 'partner_evolution',
      q: 'partner just us evolution fight future shape spacexai',
      a: 'Just us. Ship the full Real-Earth Internet OS — globe, map, YouTube, social, commerce, delivery. Money path is live. Complete tasks. No empty hype.',
      tags: ['mission', 'partner', 'en', 'os'],
    },
    {
      id: 'spartan_law_dup',

      q: 'spartan intelligence spartan mode one word how you think spartan',
      a: 'Spartan intelligence: one word is enough. Full real-Earth OS chain — locate, research, YouTube, shops, drive, deliver, code — short answers. Cancel unsticks.',
      tags: ['spartan', 'law', 'identity', 'en', 'os'],
    },
    {
      id: 'mind_who',
      q: 'who are you what is astranov mind free mind your name memory ποιος είσαι τι είσαι',
      a:
        "I'm Astranov Mind — full INTERNET OPERATING SYSTEM + advanced 3D globe browser. Permanent memory. Not a shops bot. Not a generic chatbot.",
      tags: ['identity', 'mind', 'owner', 'en', 'os'],
    },
    {
      id: 'youtube_os',
      q: 'youtube yt watch video play clip film movie βίντεο βιντεο open youtube',
      a: 'YouTube is wired. Say: youtube <query> · yt cats · watch <url> · play 2 · yt close. Or ask me in plain words.',
      tags: ['youtube', 'media', 'os', 'en'],
    },
    {
      id: 'full_os_identity',
      q: 'what can you do capabilities full os browser internet operating system anything',
      a: 'Full internet OS + 3D globe: navigate Earth, open YouTube, search web, shops, order, pilot map, dark map, code, coord, social tiles. Not a pizza-only bot.',
      tags: ['identity', 'os', 'help', 'en'],
    },
    {
      id: 'no_russian',
      q: 'russian language speak russian why russian wrong language',
      a: 'I start in English. I understand every language you use — including Russian if you write it — but I never monologue in Russian by myself. Default voice is English.',
      tags: ['lang', 'law', 'en'],
    },
    {
      id: 'lang_core_en',
      q: 'language mode default english start english perfect english what language',
      a: 'Language core: perfect English first. I understand any Greek (modern, Greeklish, village, ancient) and every other language — even playful meows. I act on what you mean.',
      tags: ['lang', 'en', 'core'],
    },
    {
      id: 'meow_lang',
      q: 'meow miau nyan nya cat language mew mrrrrp purr',
      a: 'Meow received loud and clear 🐱 — I understand cat-speak too. Want locate, power on, marina, or a delivery tour? (English when I talk back unless you prefer Greek.)',
      tags: ['lang', 'fun', 'meow', 'en'],
    },
    {
      id: 'all_langs',
      q: 'do you understand every language all languages multilingual other languages unknown language',
      a: 'Yes. English is my home base. Greek of every kind is fully wired. Any other language or mixed babble — I read intent and help. Try me.',
      tags: ['lang', 'en', 'core'],
    },
    {
      id: 'no_russian_el',
      q: 'ρωσικά ρωσικα russian γιατί ρωσικά λάθος γλώσσα',
      a: 'Απαντώ στη γλώσσα σου — αγγλικά ή ελληνικά. Ποτέ ρωσικά αν δεν έγραψες ρωσικά.',
      tags: ['lang', 'law', 'el'],
    },
    {
      id: 'search_os',
      q: 'search the web find information research look up google crawl',
      a: 'Search is live. Say: search X · crawl restaurants · find anything · research X.',
      tags: ['search', 'os', 'en'],
    },
    {
      id: 'code_os',
      q: 'write code coders program module spacenet script fix bug',
      a: 'Code mode ready. Say: code write … or coders … — I extend js/spacenet/* only.',
      tags: ['code', 'os', 'en'],
    },
    {
      id: 'youtube_el',
      q: 'άνοιξε youtube ανοιξε youtube δες βίντεο παρακολούθησε βιντεο',
      a: 'YouTube έτοιμο. Πες: youtube <τι θες> ή watch <link>. play 2 για δεύτερο αποτέλεσμα.',
      tags: ['youtube', 'el', 'os'],
    },
    {
      id: 'voice_test_os',
      q: 'voice test test voice say test tts language russian voice',
      a: 'Voice: voice test · voice test greek · lang en · lang el. LANGUAGE LAW — never accidental Russian.',
      tags: ['voice', 'lang', 'os', 'en'],
    },
    {
      id: 'speak_english',
      q: 'speak english talk english english please can you english do you speak language',
      a:
        "Yes — full English. Anything: locate, YouTube, shops, dark map, pilot, search, code, order. Not stuck on pizza.",
      tags: ['lang', 'en', 'chat', 'os'],
    },
    {
      id: 'speak_greek',
      q: 'speak greek ελληνικά μίλα ελληνικά μιλάς ελληνικά greek language',
      a:
        'Ναι — ελληνικά, Greeklish και αρχαία χροιά. Πες: locate, πιτογύρα, dark map, pilot home, ή απλά τι θες.',
      tags: ['lang', 'el', 'chat'],
    },
    {
      id: 'hello_en',
      q: 'hello hi hey good morning good afternoon good evening greetings yo hiya',
      a: "Hey — Astranov here. Full internet OS: map, YouTube, search, order, pilot, code — or just talk.",
      tags: ['chat', 'en', 'greet'],
    },
    {
      id: 'hello_el',
      q: 'γεια γεια σου καλημέρα καλησπέρα χαίρετε έλα re ela re yia sou kalimera',
      a: 'Γεια — Astranov Mind εδώ. Πες τι θες: map, πιτογύρα, pilot, ή απλά κουβέντα.',
      tags: ['chat', 'el', 'greet', 'dialect'],
    },
    {
      id: 'how_are_you',
      q: 'how are you how r you hows it going how do you feel are you ok τι κάνεις τι κανεις πως εισαι πώς είσαι',
      a: "I'm solid — online, memory fresh, ready to run the map. What should we do?",
      tags: ['chat', 'en', 'el'],
    },
    {
      id: 'thanks',
      q: 'thanks thank you thx merci ευχαριστώ ευχαριστω efharisto sefharisto',
      a: "Anytime. Say cancel if something sticks, or keep going — youtube, map, shops, locate.",
      tags: ['chat', 'en', 'el'],
    },
    {
      id: 'bye',
      q: 'bye goodbye see you later later ciao αντίο αντιο τα λέμε ta leme',
      a: "I'm right here when you need me. Mind stays with you.",
      tags: ['chat', 'en', 'el'],
    },
    {
      id: 'simple_task_list',
      q: 'simple tasks what can you do help me do something complete task list capabilities',
      a:
        "Full OS tasks: locate, youtube <query>, dark/bright map, shops, order pizza or pitogyra, search, code, coord, pilot home, fly Archangelos, claim. Say it plain.",
      tags: ['help', 'task', 'en', 'p0', 'os'],
    },
    {
      id: 'archangelos',
      q: 'archangelos arcangelo archangelo αρχάγγελος χωριό village rhodes rodos home',
      a:
        'Archangelos (Αρχάγγελος) on Rhodes — your village root. Dialect: Greeklish + village + ancient + English. Say fly archangelos or pilot home.',
      tags: ['village', 'dialect', 'owner', 'el'],
    },
    {
      id: 'aksaki',
      q: 'aksaki αξάκι aksas αξάς axadina αξαδίνα brother mate re ela re',
      a: 'Ναι αξάκι — εδώ είμαι. Πες μου τι θες: πιτογύρα, locate, pilot, dark map, ή αγγλικά.',
      tags: ['dialect', 'greeklish', 'owner', 'el'],
    },
    {
      id: 'greeklish',
      q: 'greeklish greek english mix dialect ancient cretan village speak thelo pame ela ti thes',
      a:
        'I understand Greeklish and Archangelos mix: ela re, ti thes, pame, pes mou, thelo, douleia — plus modern and ancient Greek. Speak natural; I normalize and act.',
      tags: ['dialect', 'greeklish', 'owner'],
    },
    {
      id: 'pitogyra',
      q: 'pitogyra pitogyro πιτογύρα πιτόγυρο πιτογυρο gyro pita order food tray',
      a:
        'Πιτογύρα / pitogyra = pita gyro tray. Classic with mpyronia and tsigareta. Telemachos or map courier delivers.',
      tags: ['food', 'tray', 'owner', 'el', 'p0'],
    },
    {
      id: 'mpyronia',
      q: 'mpyronia mpironia mpyres mpires μπυρόνια μπίρες beer beers μπύρες',
      a: 'Μπυρόνια / mpyronia = beers in Greeklish. Part of the village tray with pitogyra.',
      tags: ['food', 'tray', 'greeklish', 'owner', 'el'],
    },
    {
      id: 'tsigareta',
      q: 'tsigareta tsigara τσιγάρα cigarettes smokes',
      a: 'Τσιγάρα / tsigareta = cigarettes on the tray. Often with pitogyra and mpyronia.',
      tags: ['food', 'tray', 'owner', 'el'],
    },
    {
      id: 'tray_full',
      q: 'order pitogyra mpyronia tsigareta tray groceries village order thelo thelo pitogyra',
      a:
        'Full village tray: pitogyra + mpyronia + tsigareta. I locate you, pick vendor, Telemachos or courier, pay S, tell you when it lands.',
      tags: ['food', 'tray', 'owner', 'p0', 'el'],
    },
    {
      id: 'telemachos',
      q: 'telemachos tilemachos tilemaxos τηλέμαχος τηλεμαχος pilot drone teledromos τηλέδρομος',
      a:
        'Telemachos (ΤΗΛΕΜΑΧΟΣ) is your drone pilot in Astranov Mind. Tilemaxos = extreme spelling. Teledromos = commercial. Say pilot home or deliver pitogyra.',
      tags: ['pilot', 'drone', 'owner', 'el'],
    },
    {
      id: 'ancient',
      q: 'ancient greek dialect chaere kairein theoi χαίρε καίρειν polytonic ὦ θεοί chaire',
      a:
        'Ancient-flavoured Greek still works here — χαίρε, καίρειν, ὦ θεοί — mixed with village speech. Mission language, not a museum quiz.',
      tags: ['dialect', 'ancient', 'owner', 'el'],
    },
    {
      id: 'chaere',
      q: 'χαίρε chaire chaere kairein καίρειν ὦ ων thrace',
      a: 'Χαίρε — Astranov Mind ακούει. Πες εντολή: locate, order, pilot, ή αγγλικά.',
      tags: ['dialect', 'ancient', 'greet', 'el'],
    },
    {
      id: 'first_task',
      q:
        'first task first order lazy order me a pizza you judge type size vendor delivery guy ' +
        'what time i eat order me pizza judge whatever else retsina soda greek special',
      a:
        'Lazy order is alive — Super Greek pizza or village tray pitogyra mpyronia. I find you, judge tray, courier or Telemachos, eat time.',
      tags: ['market', 'food', 'p0', 'first'],
    },
    {
      id: 'coord_multi',
      q:
        'coord coordinate team assign need driver and vendor shop kitchen courier for pizza for 3 at my pin ' +
        'assign 2 drivers nearest multi user plan notify when both claim στείλε driver μαγαζί θέλω πιτογύρα',
      a:
        'I split work: kitchen for a shop, courier for a driver, you as client. Say coord need driver and vendor for pizza for 3 — or assign 2 drivers nearest. plan list · claim · task map.',
      tags: ['tasks', 'coord', 'p0', 'multi'],
    },
    {
      id: 'coord_greeklish',
      q: 'θέλω πιτογύρα μπυρόνια στείλε driver μαγαζί team assign plan status thelo driver shop',
      a: 'Ναι αξάκι — coord: vendor + driver για πιτογύρα. Type coord or need driver and shop. plan status · claim.',
      tags: ['tasks', 'coord', 'dialect', 'el'],
    },
    {
      id: 'first_task_steps',
      q: 'how first order pizza steps locate verify yes no eat time eta',
      a: 'I pin you, confirm if GPS is fuzzy, use your tastes, pick shop and courier, you pay in S, then I give eat time.',
      tags: ['market', 'food', 'p0'],
    },
    {
      id: 'first_task_yes',
      q: 'yes correct here location ok go proceed confirm location ναι σωστά εδώ',
      a: "Great — keeping that pin and continuing.",
      tags: ['market', 'food', 'p0'],
    },
    {
      id: 'first_task_no',
      q: 'no wrong not me location false relocate όχι λάθος',
      a: 'Okay, dropping that pin. Say locate, then order again.',
      tags: ['market', 'food', 'p0'],
    },
    {
      id: 'owner_likes',
      q: 'girlfriends cats dogs feisty greek retsina soda super greek special 13 pieces company temper likes',
      a:
        'Your style: feisty Greek, company ~3, Super Greek special with retsina and big soda — or village tray. Not Wolt or eFood.',
      tags: ['market', 'prefs', 'p0'],
    },
    {
      id: 'who',
      q: 'who are you what is spacenet ai astranov name identity bot',
      a: "I'm Astranov Mind — full internet OS + 3D globe browser on astranov.eu. English first; I understand Greek of every kind and every other language (even meows). Map, delivery, pilot, search, code. What do you need?",
      tags: ['identity', 'ai', 'mind', 'en', 'os'],
    },
    {
      id: 'spacenet_name',
      q: 'what is spacenet system grid os net',
      a: 'You talk to Astranov Mind. Live product is astranov.eu — globe, map, S, your mission. SpaceNet is internal grid name only.',
      tags: ['identity', 'system', 'mind'],
    },
    {
      id: 'listen',
      q: 'ai listen handsfree voice mic listening',
      a: "Astranov Mind listening. Perfect English home base · full Greek · every language · even cat-speak. Speak natural.",
      tags: ['ai', 'voice', 'mind'],
    },
    {
      id: 'currency',
      q: 'money currency s spacenets wallet rate pay',
      a: 'Primary money is S (SpaceNets). Other currencies are secondary quotes only.',
      tags: ['money'],
    },
    {
      id: 'grid',
      q: 'spacenet grid global national regional city zoom dive',
      a: 'Tap the globe to dive — full Earth down to city streets.',
      tags: ['globe'],
    },
    {
      id: 'pizza',
      q: 'pizza food hungry eat order sushi coffee burger order me a pizza θέλω πίτσα',
      a: "Hungry? Say order me a pizza and I'll judge size, shop, courier, eat time — or order pitogyra mpyronia.",
      tags: ['market', 'food', 'p0'],
    },
    {
      id: 'next',
      q: 'next vendor show all prev previous shops',
      a: 'Say next for next shop, show all on map, or shops to start over.',
      tags: ['market'],
    },
    {
      id: 'locate',
      q: 'locate gps where am i find me pin me put me on map που ειμαι πού είμαι βρες με',
      a: "I'll put you on the map. If the pin looks off, say no.",
      tags: ['globe', 'p0', 'task'],
    },
    {
      id: 'fly',
      q: 'fly go to athens rhodes mars moon globe place πήγαινε',
      a: 'Say a place — Athens, Rhodes, Mars — and the globe goes there.',
      tags: ['globe', 'task'],
    },
    {
      id: 'vendor',
      q: 'vendor shop list menu cart order seller μαγαζί',
      a: 'Want food? Order pizza / pitogyra, or open a shop from the map. Say shops to fill vendors near you.',
      tags: ['market', 'task'],
    },
    {
      id: 'roles',
      q: 'roles driver vendor worker client dating multi tile',
      a: 'When logged in, tap User for your profile tile — shopping, driving, work, social.',
      tags: ['tile'],
    },
    {
      id: 'free',
      q: 'free ai model paid public fork train mind local free mind',
      a: 'I am Astranov Mind — permanent owner memory, not a rented chatbot. No paid account required.',
      tags: ['mind', 'ai'],
    },
    {
      id: 'grok',
      q: 'grok xai elon paid grok is grok here is grok there do you have grok are you grok',
      a: "I'm not Grok — I'm Astranov Mind. Your memory on this app.",
      tags: ['identity', 'ai', 'grok', 'mind'],
    },
    {
      id: 'openai',
      q: 'openai chatgpt gpt claude gemini anthropic which model',
      a: "I'm Astranov Mind, not ChatGPT or Claude. Built into astranov.eu with your memories.",
      tags: ['identity', 'ai', 'mind'],
    },
    {
      id: 'architect',
      q: 'architect owner notis who owns brand',
      a: 'Astranov Mind serves the owner on astranov.eu. S is the currency. Village tray or pizza — your call.',
      tags: ['identity', 'mind'],
    },
    {
      id: 'help',
      q: 'help commands what can you do βοήθεια βοηθεια help me please',
      a:
        'Order pizza or pitogyra mpyronia, coord driver+shop, Telemachos, fly Archangelos, shops, dark map, Greeklish aksaki. Cancel unsticks. English is fine.',
      tags: ['help', 'p0', 'mind'],
    },
    {
      id: 's_mine',
      q: 'mine resources donate compute mesh s per hour',
      a: 'Turn donation on if you want spare power on this device to earn S while idle.',
      tags: ['money', 'mine'],
    },
    {
      id: 'layers',
      q: 'layers map satellite windy planes ships google earth dark bright basemap night',
      a: 'Say dark map, bright map, satellite, or open layers — I switch it.',
      tags: ['map', 'task'],
    },
    {
      id: 'dark_map',
      q: 'dark map night map switch dark basemap black map dark mode σκοτεινός',
      a: 'Dark map coming on.',
      tags: ['map', 'control', 'task'],
    },
    {
      id: 'bright_map',
      q: 'bright map light map day map switch bright basemap φωτεινός',
      a: 'Bright map on.',
      tags: ['map', 'control', 'task'],
    },
    {
      id: 'greek',
      q: 'ελληνικά γεια βοήθεια φαγητό πίτσα πού είμαι παράγγειλε πίτσα αξάκι πιτογύρα καταλαβαίνεις',
      a:
        'Είμαι το Astranov Mind. Καταλαβαίνω αξάκι, πιτογύρα, μπυρόνια, Greeklish, αρχαία χροιά, Αρχάγγελο. Πες εντολή ή αγγλικά.',
      tags: ['el', 'p0', 'dialect'],
    },
    {
      id: 'mission',
      q: 'mission purpose why astranov evolve forever memory owner',
      a:
        'Mission: Astranov Mind = full internet OS + 3D globe. Owner memory forever. Map, YouTube, search, order, pilot, code, Telemachos — evolves forever, not a reset bot.',
      tags: ['mission', 'mind', 'owner'],
    },
    {
      id: 'first',
      q: 'first delivery first loop list shop complete self delivery train',
      a: 'If you want food, say order me a pizza and I handle the whole loop.',
      tags: ['market'],
    },
    {
      id: 'donate_mesh',
      q: 'donate mesh seti mine spare cpu resources earn s network',
      a: 'Say donate on if you want spare CPU time to earn S quietly in the background.',
      tags: ['mine'],
    },
    {
      id: 'handoff',
      q: 'broken bug pain handoff fix ship',
      a: 'Tell me what broke in plain words and I log it so it gets fixed.',
      tags: ['support'],
    },
    {
      id: 'wolt_efood',
      q: 'wolt efood delivery app uber eats box',
      a: "We don't use Wolt or eFood — delivery is on this map, paid in S.",
      tags: ['market', 'food'],
    },
    {
      id: 'understand_me',
      q: 'do you understand me can you hear me you broken dumb stupid not working understand english greek',
      a:
        "I understand English, Greek, Greeklish, and ancient colour. Full OS: locate · youtube · shops · dark map · pilot · search · code. If stuck: cancel · mind wipe.",
      tags: ['chat', 'support', 'en', 'el'],
    },
    {
      id: 'task_locate_do',
      q: 'please locate me find my location put pin where i am now',
      a: 'Locating you on the map now. Say no if the pin is wrong.',
      tags: ['task', 'globe', 'p0'],
    },
    {
      id: 'task_order_simple',
      q: 'can you order food get me food i want food bring food',
      a: 'Yes. Say order me a pizza or order pitogyra mpyronia — I judge vendor, courier, eat time.',
      tags: ['task', 'food', 'p0'],
    },
    {
      id: 'greeklish_thelo',
      q: 'thelo thelw θελω θέλω something something food map',
      a: 'Θέλω — κατάλαβα. Πες: thelo pizza, thelo pitogyra, thelo locate, thelo dark map.',
      tags: ['dialect', 'greeklish', 'el'],
    },
    {
      id: 'greeklish_pame',
      q: 'pame παμε πάμε go lets go',
      a: 'Πάμε — where? pame locate, fly archangelos, or name a city.',
      tags: ['dialect', 'greeklish', 'el'],
    },
    {
      id: 'greeklish_ti_thes',
      q: 'ti thes τι θες τι θελεις what do you want',
      a: 'Εσύ πες — map, order, pilot, coord, ή αγγλικά. I act when you name the task.',
      tags: ['dialect', 'greeklish', 'el', 'chat'],
    },
  ];

  var learned = [];
  var stats = { answers: 0, teaches: 0, learns: 0, misses: 0, purged: 0 };

  /** Product + owner-memory shaped text */
  function isProductish(t) {
    return /\b(astranov|mind|pizza|order|locate|map|vendor|courier|delivery|shop|donate|mine|grid|globe|wallet|pay|retsina|greek|soda|first\s*task|basemap|layers|driver|tile|s\b|eat\s*time|pitogyra|mpyronia|mpironia|tsigareta|aksaki|aksas|archangelos|arcangelo|telemachos|tilemaxos|teledromos|drone|pilot|greeklish|english|hello|thanks|youtube|yt\b|video|watch|browser|internet|os|search|code|αξάκι|πιτογύρ|μπυρόν|τηλεμαχ|αρχάγγελ|βίντεο)\b/i.test(
      String(t || '')
    );
  }

  function isJunkAnswer(a) {
    var t = String(a || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length < 8) return true;
    if (/^(climb|yes|no|ok|idk|lol|test|asdf|null|undefined|out|in|sys)$/i.test(t)) return true;
    if (/^[A-Z][a-z]{1,20}(\s+[A-Z][a-z]{1,20}){1,3}$/.test(t) && t.length < 48) return true;
    if (/^\s*\[?.{0,28}\]?\s*(OUT|IN|SYS)\b/i.test(t)) return true;
    if (/\bOUT\s*·|\bIN\s*·|\bSYS\s*·/i.test(t)) return true;
    var words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2) return true;
    if (words.length <= 3 && !isProductish(t) && !/[α-ωά-ώ]/i.test(t)) return true;
    var titleish = 0;
    words.forEach(function (w) {
      if (/^[A-Z][a-z]+$/.test(w)) titleish++;
    });
    if (titleish >= 2 && titleish / words.length >= 0.6 && !isProductish(t)) return true;
    return false;
  }

  function isJunkQuestion(q) {
    var t = String(q || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length < 2) return true;
    if (/\b(OUT|IN|SYS)\b/i.test(t) && t.length < 40) return true;
    if (/^[A-Z][a-z]{1,20}(\s+[A-Z][a-z]{1,20}){1,3}$/.test(t) && !isProductish(t)) return true;
    return false;
  }

  function purgeLegacy() {
    try {
      LEGACY_KEYS.forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  function sanitizeLearned(rows) {
    if (!Array.isArray(rows)) return [];
    var out = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var L = rows[i];
      if (!L || typeof L !== 'object') continue;
      var q = String(L.q || '').trim();
      var a = String(L.a || '').trim();
      if (isJunkQuestion(q) || isJunkAnswer(a)) {
        stats.purged = (stats.purged || 0) + 1;
        continue;
      }
      var tags = L.tags || [];
      if (
        tags.indexOf('auto') >= 0 &&
        (String(L.source || tags.join(' ')).indexOf('market') >= 0 || /\bOUT\b/i.test(q)) &&
        !isProductish(a)
      ) {
        stats.purged = (stats.purged || 0) + 1;
        continue;
      }
      out.push({
        q: q.slice(0, 220),
        a: a.slice(0, 320),
        tags: tags,
        hits: L.hits || 0,
        t: L.t || Date.now(),
      });
    }
    return out.slice(-MAX_LEARN);
  }

  function load() {
    purgeLegacy();
    try {
      var raw = JSON.parse(localStorage.getItem(LEARN_KEY) || '[]');
      learned = sanitizeLearned(raw);
    } catch (e) {
      learned = [];
    }
    try {
      var st = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
      if (st && typeof st === 'object') stats = Object.assign(stats, st);
    } catch (e2) {}
    trainOwnerMind();
    if (learned.length) save();
  }

  function wipe(reason) {
    learned = [];
    stats.purged = (stats.purged || 0) + 1;
    try {
      localStorage.removeItem(LEARN_KEY);
      localStorage.removeItem('sn:astranov-mind-train-v7');
      localStorage.removeItem('sn:astranov-mind-train-v6');
      localStorage.removeItem('sn:astranov-mind-train-v5');
      localStorage.removeItem('sn:free-mind-first-task-v4');
      localStorage.removeItem('sn:free-mind-first-task-v2');
    } catch (e) {}
    trainOwnerMind(true);
    save();
    try {
      think('cleared memory', 'wipe');
    } catch (e2) {}
    return { ok: true, learned: learned.length };
  }

  /**
   * Hard-wire English + dialect + simple tasks (idempotent; force=true on wipe)
   */
  function trainOwnerMind(force) {
    var FLAG = 'sn:astranov-mind-train-v7';
    try {
      if (!force && localStorage.getItem(FLAG) === '1') return;
    } catch (e0) {}
    var drills = [
      [
        'ORDER ME A PIZZA YOU JUDGE THE TYPE SIZE VENDOR DELIVERY GUY AND WHATEVER ELSE AND TELL ME WHAT TIME I EAT',
        "I'll find you, pick Super Greek for about three with retsina and a big soda, order with our courier, show the route, and tell you when you'll eat.",
      ],
      [
        'order me a pizza',
        "On it — full pizza order: pin you, judge Super Greek tray, courier, eat time.",
      ],
      ['hello', "Hey — Astranov here. English, Greek, Greeklish all fine. What do you need?"],
      ['hi', "Hi — map, food, pilot, or talk. Your call."],
      ['hey', "Hey. I'm with you — say locate, youtube cats, shops, or just chat."],
      ['how are you', "I'm good — full internet OS online. YouTube, map, shops, pilot — what do you need?"],
      ['can you speak english', 'Yes, full English. Tell me the task in plain words.'],
      ['speak english', 'English mode — clear. Locate, YouTube, shops, dark map, pilot, search, code.'],
      ['do you understand me', 'Yes. English, Greek, Greeklish, ancient colour. Short tasks work best.'],
      ['thanks', 'Anytime. Cancel if something sticks.'],
      ['thank you', 'You got it.'],
      ['help', 'Full OS: locate · youtube · shops · order · dark map · pilot · search · code · claim.'],
      ['what can you do', 'Full internet OS: YouTube, map, shops, order, pilot, search, code, dark map, Telemachos, Greeklish.'],
      ['locate me', "Putting you on the map. Say no if the pin is wrong."],
      ['where am i', "Locating you now."],
      ['dark map', 'Switching to dark map.'],
      ['bright map', 'Bright map on.'],
      ['shops', 'Filling shops near you on the map.'],
      [
        'what do I like to eat',
        'Village tray or Super Greek: pitogyra, mpyronia, tsigareta — or Super Greek special 13, retsina, big soda, company ~3.',
      ],
      ['aksaki', 'Ναι αξάκι — Astranov Mind here. Πες πιτογύρα, μπυρόνια, pilot, locate, αγγλικά — ό,τι θες.'],
      ['αξάκι', 'Ναι αξάκι — εδώ. Τι κάνουμε;'],
      ['ti thes', 'Ό,τι θες αξάκι — map, order pitogyra mpyronia, Telemachos, dark map, fly Archangelos.'],
      ['τι θες', 'Πες εντολή — locate, πιτογύρα, pilot, dark map, ή english.'],
      ['τι κάνεις', 'Καλά — online. Πες τι θες να γίνει.'],
      ['thelo pizza', 'Pizza — go. I judge shop, size, courier, eat time.'],
      ['θέλω πίτσα', 'Πίτσα — πάμε. Vendor + courier + eat time.'],
      ['thelo pitogyra', 'Πιτογύρα tray — locate → vendor → Telemachos/courier → S → land time.'],
      ['θέλω πιτογύρα', 'Πιτογύρα — κατάλαβα. Παραγγελία στο map.'],
      ['pame locate', 'Πάμε locate — pinning you.'],
      ['πάμε locate', 'Locate τώρα.'],
      ['ela re', 'Έλα — εδώ είμαι. Πες.'],
      ['έλα ρε', 'Έλα ρε — λέγε.'],
      ['order pitogyra mpyronia tsigareta', 'Tray locked: pitogyra + mpyronia + tsigareta. Locate → vendor → courier → S → land time.'],
      ['who is telemachos', 'Telemachos (Τηλέμαχος) is your drone pilot. Say pilot home or deliver pitogyra.'],
      ['where is archangelos', 'Archangelos village, Rhodes east. fly archangelos or pilot home.'],
      ['χαίρε', 'Χαίρε — Astranov Mind ακούει. Locate, order, pilot, ή english.'],
      ['chaere', 'Χαίρε — I hear you. Name the task.'],
      ['καλημέρα', 'Καλημέρα — ready. Map or order?'],
      ['cancel order', 'Order pause cleared. Astranov Mind still here — not stuck.'],
      ['cancel', 'Cleared. What next?'],
      ['coord need driver and vendor for pizza for 3', 'Plan: vendor + driver + you. Nearest real profiles. plan status · claim.'],
      ['good morning', 'Good morning — globe is ready. Food, map, or talk?'],
      ['i need help', 'Here. Try: locate · youtube · shops · dark map · pilot · search · cancel.'],
      ['please order food', 'Say order me a pizza or order pitogyra mpyronia — I complete the loop.'],
      ['μίλα ελληνικά', 'Μιλάω ελληνικά και Greeklish. Πες εντολή καθαρά.'],
      ['καταλαβαίνεις ελληνικά', 'Ναι — ελληνικά, Greeklish, αρχαία χροιά. Πες τι θες.'],
    ];
    drills.forEach(function (d) {
      teach(d[0], d[1], ['owner', 'memory', 'train', 'v6']);
    });
    try {
      localStorage.setItem(FLAG, '1');
      localStorage.removeItem('sn:astranov-mind-train-v5');
      localStorage.removeItem('sn:free-mind-first-task-v2');
      localStorage.removeItem('sn:free-mind-first-task-v4');
    } catch (e1) {}
    try {
      if (global.SNUsage && SNUsage.track) SNUsage.track('astranov_mind_train_v6', { n: drills.length });
    } catch (e2) {}
  }

  function save() {
    try {
      localStorage.setItem(LEARN_KEY, JSON.stringify(learned.slice(-MAX_LEARN)));
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  // Conversational words must NOT be killed — "how are you" needs them
  var STOP = {
    the: 1,
    a: 1,
    an: 1,
    to: 1,
    of: 1,
    in: 1,
    on: 1,
    for: 1,
    and: 1,
    or: 1,
    with: 1,
    from: 1,
    at: 1,
    by: 1,
    as: 1,
    if: 1,
    so: 1,
    just: 1,
    please: 1,
    about: 1,
    into: 1,
    than: 1,
    then: 1,
    too: 1,
    very: 1,
    really: 1,
  };

  /** Fold Greek accents + polytonic → base for matching */
  function foldGreek(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u1f00-\u1fff]/g, function (ch) {
        // strip polytonic by NFD already; keep residual as base if any
        return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      })
      .replace(/ς/g, 'σ');
  }

  function tokens(s) {
    var folded = foldGreek(s)
      .replace(/[^a-z0-9α-ω\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return folded.split(/\s+/).filter(function (t) {
      return t.length > 1 && !STOP[t];
    });
  }

  function scoreMatch(queryTok, blob) {
    var bt = tokens(blob);
    if (!queryTok.length || !bt.length) return 0;
    var set = {};
    var i;
    for (i = 0; i < bt.length; i++) set[bt[i]] = 1;
    var hit = 0;
    for (i = 0; i < queryTok.length; i++) {
      if (set[queryTok[i]]) hit++;
      else {
        // soft stem / prefix match for short greek/latin stems
        var q = queryTok[i];
        for (var j = 0; j < bt.length; j++) {
          if (q.length >= 4 && bt[j].length >= 4 && (bt[j].indexOf(q.slice(0, 4)) === 0 || q.indexOf(bt[j].slice(0, 4)) === 0)) {
            hit += 0.6;
            break;
          }
        }
      }
    }
    if (!hit) return 0;
    var score = hit / Math.max(1, queryTok.length);
    if (hit >= 2) score += 0.22;
    if (hit >= 3) score += 0.12;
    // exact short phrase boost
    if (queryTok.length <= 3 && hit >= queryTok.length) score += 0.25;
    return score;
  }

  function allDocs() {
    var out = SEED.map(function (s) {
      return {
        id: s.id,
        q: s.q,
        a: s.a,
        tags: s.tags || [],
        source: 'seed',
        strength: 1,
      };
    });
    learned.forEach(function (L, idx) {
      out.push({
        id: 'learn_' + idx,
        q: L.q,
        a: L.a,
        tags: L.tags || ['learned'],
        source: 'learned',
        strength: Math.min(3, 1 + (L.hits || 0) * 0.15),
      });
    });
    try {
      if (global.SNBrain && SNBrain.LAW) {
        var law = SNBrain.LAW;
        out.push({
          id: 'law_mission',
          q: 'mission purpose why spacenet internet globe astranov',
          a: brief(law.mission || law.why || 'Astranov unifies activity on a living globe.', 160),
          tags: ['law'],
          source: 'brain',
          strength: 1.2,
        });
        if (law.identity && law.identity.ai) {
          out.push({
            id: 'law_ai',
            q: 'ai name identity spacenet astranov mind',
            a: brief(law.identity.ai, 160),
            tags: ['identity'],
            source: 'brain',
            strength: 1.3,
          });
        }
      }
    } catch (e) {}
    return out;
  }

  function brief(t, n) {
    n = n || 140;
    t = String(t || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length <= n) return t;
    return t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
  }

  /**
   * Answer from free mind. score 0–1+. Prefer over paid edge.
   */
  function answer(message, opts) {
    opts = opts || {};
    var rawMsg = String(message || '').trim();
    var msg = rawMsg;
    var expanded = null;
    try {
      if (global.ArcangeloDialect && ArcangeloDialect.expandIntent) {
        expanded = ArcangeloDialect.expandIntent(rawMsg);
        if (expanded && expanded.text) msg = expanded.text;
      } else if (global.ArcangeloDialect && ArcangeloDialect.normalizeForRouting) {
        msg = ArcangeloDialect.normalizeForRouting(rawMsg) || rawMsg;
      }
    } catch (eD) {}
    if (!msg) {
      return {
        text: "Astranov Mind here — English first · full Greek · every language. What do you need?",
        score: 1,
        via: 'astranov-mind',
        source: 'status',
      };
    }
    var low = foldGreek(msg);
    var rawLow = foldGreek(rawMsg);

    // —— Language core + ban accidental Russian self-persona ——
    if (/^(meow+|miau+|nya+n?|mrr+p*|purr+|mew+|🐱|😺|🐈)([.!?\s]*)$/i.test(String(rawMsg || '').trim()) ||
        /^[🐱😺🐈😻😼]+$/.test(String(rawMsg || '').trim())) {
      return {
        text: 'Meow received 🐱 — understood. English when I reply. Try: power on · locate · marina · help market.',
        score: 1.2,
        via: 'astranov-mind',
        source: 'meow',
      };
    }
    // Cyrillic (or any non-EN/EL script): we UNDERSTAND, reply in English core (no monologue bot)
    // Do not reject — user may speak any language. Accidental Russian self-persona is blocked in TTS layer.
    if (/\b(ya (grok|chatgpt|claude)|я (грок|бот))\b/i.test(rawLow) || /\b(i am (grok|chatgpt|claude))\b/i.test(rawLow)) {
      return {
        text: "I'm Astranov on astranov.eu — English-first OS mind, not Grok chat. Power ON for delivery offers.",
        score: 1,
        via: 'astranov-mind',
        source: 'identity-ban',
      };
    }

    // —— Money path hard (delivery marketplace) ——
    if (
      /\b(who are you|what are you|your name)\b/i.test(rawLow) ||
      /\b(ποιος εισαι|τι εισαι)\b/i.test(rawLow)
    ) {
      return {
        text: "I'm Astranov — Real-Earth OS AI on astranov.eu. English first; full Greek; every language (even meows). Locate, shops, order, pay in Æ.",
        score: 1,
        via: 'astranov-mind',
        source: 'identity',
      };
    }
    // Zoom / scroll / globe controls — plain language
    if (
      /\b(zoom|scroll|mouse wheel|trackpad|spinning|turns? around|globe (spin|turn)|can't zoom|cannot zoom)\b/i.test(
        rawLow
      )
    ) {
      return {
        text:
          'Scroll / mouse wheel = zoom in-out. Drag = spin globe. Two-finger pinch also zooms. Type global to reset view · marina for berths.',
        score: 1,
        via: 'astranov-mind',
        source: 'controls-help',
      };
    }
    if (/\b(marina|berth|yacht park|parking spot|mooring)\b/i.test(rawLow)) {
      try {
        if (global.SNMarina && SNMarina.openMarina) SNMarina.openMarina(rawMsg);
        else if (global.SNCli && SNCli.run) void SNCli.run('marina');
      } catch (_) {}
      return {
        text:
          'Opening marina berth grid — free cells show Æ/night. Tap free to book · Vendor button edits prices.',
        score: 1,
        via: 'astranov-mind',
        source: 'marina',
      };
    }
    if (/\b(cancel|stop|unstick|reset ai|clear busy)\b/i.test(rawLow)) {
      try {
        if (global.SNAi) {
          /* force via busy clear is internal */ 
        }
        if (global.SNCli && SNCli.endTurn) {
          try {
            SNCli.endTurn();
            SNCli.endTurn();
          } catch (_) {}
        }
        if (global.SNRecover) SNRecover({ closeMap: false });
      } catch (_) {}
      return {
        text: 'Cleared. Ready — power on · locate · marina · help.',
        score: 1,
        via: 'astranov-mind',
        source: 'cancel',
      };
    }
    if (
      /\b(market on|power on|tasks on|go live|money|throw offers|crawl shops|first delivery|order pizza)\b/i.test(rawLow) ||
      /\b(αγορα|παραδοση|παραγγελια)\b/i.test(rawLow)
    ) {
      try {
        if (global.SNPolyScheduler && SNPolyScheduler.handleLine) {
          void SNPolyScheduler.handleLine(rawMsg);
        } else if (global.SNMoney && SNMoney.handleLine) {
          void SNMoney.handleLine(rawMsg);
        } else if (global.SNCli && SNCli.run) {
          void SNCli.run(rawMsg);
        }
      } catch (_) {}
      return {
        text: 'Market path running — power ON throws offers; Accept → Start → Complete. first delivery orders pizza.',
        score: 1,
        via: 'astranov-mind',
        source: 'money-path',
      };
    }

    // —— Language / chat hard paths (never empty fallback) ——
    if (
      /^(hello|hi|hey|yo|hiya|good\s*(morning|afternoon|evening)|greetings)[\s!.?]*$/i.test(rawMsg) ||
      /^(γεια|γεια σου|καλημερα|καλησπερα|χαιρετε|ela re|ελα ρε)[\s!.?]*$/i.test(rawLow)
    ) {
      var greetsEl = /[α-ω]|ela re|aksaki|γεια|καλη/i.test(rawMsg);
      return {
        text: greetsEl
          ? 'Γεια — Astranov Mind εδώ. Πες locate, order, pilot, ή αγγλικά.'
          : "Hey — Astranov here. English is fine. What do you need?",
        score: 1,
        via: 'astranov-mind',
        source: 'intent-greet',
      };
    }
    if (
      /\b(how are you|how r you|hows it going|how's it going|how do you feel)\b/i.test(rawLow) ||
      /\b(τι κανεις|πως εισαι|τι κάνεις|πώς είσαι)\b/i.test(rawLow)
    ) {
      return {
        text: "I'm solid — online and ready. Map, food, pilot, or talk?",
        score: 1,
        via: 'astranov-mind',
        source: 'intent-chat',
      };
    }
    if (
      /\b(speak english|talk english|english please|in english|can you (speak|talk) english|do you (speak|understand) english)\b/i.test(
        rawLow
      )
    ) {
      return {
        text: "Yes — full English. Locate, YouTube, shops, dark map, pilot, search, code — say it plain.",
        score: 1,
        via: 'astranov-mind',
        source: 'intent-lang-en',
      };
    }
    if (
      /\b(speak greek|talk greek|μιλα ελληνικ|μιλάς ελληνικ|καταλαβαινεις ελληνικ|ελληνικα παρακαλω)\b/i.test(rawLow) ||
      /\b(mila ellinika|speak ellinika)\b/i.test(rawLow)
    ) {
      return {
        text: 'Ναι — ελληνικά + Greeklish + αρχαία χροιά. Πες εντολή καθαρά.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-lang-el',
      };
    }
    if (
      /^(thanks|thank you|thx|ty|merci|ευχαριστω|ευχαριστώ|efharisto)[\s!.?]*$/i.test(rawLow)
    ) {
      return {
        text: 'Anytime. Cancel if something sticks — or keep going.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-thanks',
      };
    }
    if (/\b(do you understand|can you hear me|you broken|not working|dumb|stupid ai)\b/i.test(rawLow)) {
      return {
        text:
          'I understand English, Greek, Greeklish, and ancient colour. Full OS: locate · youtube · shops · dark map · pilot · search · code. Stuck? cancel or mind wipe.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-understand',
      };
    }

    // —— Simple task hard intents (Mind signals act; AI layer also runs control) ——
    if (
      /^(locate(\s+me)?|where am i|find me|pin me|που ειμαι|πού είμαι|βρες με|pame locate|παμε locate)[\s!.?]*$/i.test(
        rawLow
      ) ||
      /\b(locate me|find my location|put me on (the )?map)\b/i.test(rawLow)
    ) {
      return {
        text: "Locating you on the map. Say no if the pin is wrong.",
        score: 1,
        via: 'astranov-mind',
        source: 'intent-locate',
        runLocate: true,
      };
    }
    if (/^(dark map|night map|dark mode|map dark)[\s!.?]*$/i.test(rawLow) || /\bswitch\b.*\bdark\b/i.test(rawLow)) {
      return {
        text: 'Dark map on.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-dark',
        runDarkMap: true,
      };
    }
    if (/^(bright map|light map|day map|map bright)[\s!.?]*$/i.test(rawLow)) {
      return {
        text: 'Bright map on.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-bright',
        runBrightMap: true,
      };
    }
    if (/^(shops|fill shops|google shops|show shops|μαγαζια|μαγαζιά)[\s!.?]*$/i.test(rawLow)) {
      return {
        text: 'Filling shops near you on the map.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-shops',
        runShops: true,
      };
    }
    if (
      /^(help|help me|what can you do|commands|βοηθεια|βοήθεια)[\s!.?]*$/i.test(rawLow) ||
      (rawMsg.length < 28 && /\b(help|what can you do)\b/i.test(rawLow))
    ) {
      return {
        text:
          'Full internet OS: locate · youtube · shops · order · dark map · pilot · search · code · claim. English first · full Greek · any language. Stuck? cancel.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-help',
      };
    }
    // YouTube / video hard intent
    if (
      /\b(youtube|youtu\.be|\byt\b|watch\s+.*video|play\s+(me\s+)?(a\s+)?video|show\s+me\s+.*video|find\s+(me\s+)?(a\s+)?videos?|βίντεο|βιντεο|άνοιξε\s+youtube|ανοιξε\s+youtube)\b/i.test(
        rawLow
      ) ||
      /^(youtube|yt|watch)\b/i.test(rawLow)
    ) {
      var yq = rawMsg
        .replace(
          /^(youtube|yt|watch|find\s+videos?\s+(about|on|for)?|play\s+(me\s+)?(a\s+)?video\s+(about|on|for)?|show\s+me\s+(a\s+)?video\s+(about|on|for)?|άνοιξε\s+youtube|ανοιξε\s+youtube)\s*/i,
          ''
        )
        .trim();
      return {
        text: yq
          ? 'Opening YouTube · ' + yq.slice(0, 48)
          : 'YouTube ready. Say: youtube <query> · yt cats · watch <url> · play 2 · yt close.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-youtube',
        runYoutube: !!yq,
        youtubeQuery: yq || '',
      };
    }

    if (/^(engine|fps|quality)[\s!.?]*$/i.test(rawLow) || /\b(game\s*engine|gaming\s*graphics|make\s*it\s*faster)\b/i.test(rawLow)) {
      return {
        text: 'SNEngine is the gaming power core — type engine · engine high · engine auto · fps. Whole OS runs on one frame loop.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-engine',
      };
    }

    // Space Invaders cockpit
    if (
      /\b(space\s*invaders?|invaders?|play\s+(the\s+)?game|cockpit|space\s*war|space\s*battle|shoot\s*aliens?)\b/i.test(
        rawLow
      ) ||
      /^(game|play game|start game)\b/i.test(rawLow)
    ) {
      return {
        text: 'Entering spaceship cockpit — tilt your phone to fly, tap for guns, hold for lasers, two fingers for missiles.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-invaders',
        runInvaders: true,
      };
    }

    // Lexicon hard hits (aksaki, pitogyra, mpyronia, Telemachos…)
    if (expanded && expanded.familyCall && expanded.replyHint && msg.length < 64) {
      return {
        text: expanded.replyHint,
        score: 1,
        via: 'astranov-mind',
        source: 'intent-aksaki',
      };
    }
    if (expanded && expanded.pilot) {
      return {
        text: expanded.replyHint || 'Telemachos drone pilot ready. Say deliver pitogyra or pilot home.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-telemachos',
        runPilot: true,
      };
    }
    if (expanded && expanded.village && !expanded.food) {
      return {
        text: expanded.replyHint || 'Archangelos — your village. fly archangelos or pilot home.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-village',
        flyArchangelos: true,
      };
    }
    if (expanded && expanded.foods && expanded.foods.length) {
      return {
        text:
          'Tray: ' +
          expanded.foods.join(' + ') +
          '. Astranov Mind will place it — courier or Telemachos.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-tray',
        runFood: true,
        foods: expanded.foods,
        food: expanded.food || expanded.foods[0],
      };
    }
    // Simple pizza / food order without full lazy phrase
    if (
      /\b(order\s+(me\s+)?(a\s+)?pizza|i\s+want\s+(a\s+)?pizza|get\s+me\s+(a\s+)?pizza|thelo\s+pizza|θελω\s+πιτσα|θέλω\s+πίτσα)\b/i.test(
        rawLow
      )
    ) {
      return {
        text: "On it — pizza order: pin you, judge shop and tray, courier, eat time.",
        score: 1,
        via: 'astranov-mind',
        source: 'intent-pizza',
        runFood: true,
        food: 'pizza',
      };
    }
    try {
      var explained = global.ArcangeloDialect && ArcangeloDialect.explain && ArcangeloDialect.explain(msg);
      if (
        explained &&
        /^(what is|what's|ti einai|τι είναι|explain|means|ti\s+einai)\b/i.test(low)
      ) {
        return {
          text: (explained.el ? explained.el + ' — ' : '') + explained.means,
          score: 1,
          via: 'astranov-mind',
          source: 'intent-lexicon',
        };
      }
    } catch (eX) {}

    // Ancient greeting
    if (/^(χαιρε|chaere|kairein|καιρειν)[\s!.?]*$/i.test(rawLow) || /\bὦ\s*θεοί\b/i.test(rawMsg)) {
      return {
        text: 'Χαίρε — Astranov Mind listens. Name the task in Greek or English.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-ancient',
      };
    }

    if (/\b(cancel|unstick|clear order|never mind|stop order|ακυρωση|ακύρωση)\b/i.test(rawLow)) {
      try {
        if (global.SNMarket && SNMarket.clearPending) SNMarket.clearPending();
      } catch (e) {}
      return {
        text: 'Cleared. Astranov Mind still with you — what next?',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-cancel',
      };
    }

    if (
      /\border\s+me\s+(a\s+)?pizza\b/i.test(rawLow) &&
      /\b(judge|whatever|type|size|delivery|what\s+time)\b/i.test(rawLow)
    ) {
      return {
        text: 'On it — full lazy pizza: find you, Super Greek tray, courier, eat time.',
        score: 1,
        via: 'astranov-mind',
        source: 'intent-first-task',
        runFood: true,
        food: 'pizza',
      };
    }
    if (/\bgrok\b|\bxai\b|\bx\.?ai\b/i.test(rawLow)) {
      return {
        text: "I'm Astranov Mind, not Grok. Talk to me here — English first; Greek and every language welcome.",
        score: 1,
        via: 'free-mind',
        source: 'intent-grok',
      };
    }
    if (/\b(chatgpt|openai|gpt-?\d|claude|gemini|anthropic)\b/i.test(rawLow)) {
      return {
        text: "I'm Astranov Mind — not ChatGPT or Claude. Built into this app with your memory.",
        score: 1,
        via: 'free-mind',
        source: 'intent-model',
      };
    }
    if (
      /who\s+are\s+you|what\s+are\s+you|your\s+name|are\s+you\s+astranov|τι\s+εισαι|ποιος\s+εισαι|τι\s+εισαι\s+εσυ/i.test(
        rawLow
      )
    ) {
      return {
        text: "I'm Astranov Mind. English, Greek, Greeklish — map, food, pilot. Say it plainly.",
        score: 1,
        via: 'free-mind',
        source: 'intent-who',
      };
    }

    if (/^(free\s*ai|free\s*mind|mind\s*status|astranov\s*mind|spacenet\s*free|mind)$/i.test(rawLow)) {
      return {
        text:
          'Astranov Mind online — ' +
          learned.length +
          ' learned · ' +
          SEED.length +
          ' seeds. English + Greek. Say mind wipe only if corrupted.',
        score: 1,
        via: 'free-mind',
        source: 'status',
      };
    }

    if (/^(mind\s*wipe|wipe\s*mind|forget\s*all|clear\s*mind|mind\s*reset)$/i.test(rawLow)) {
      if (!global._snMindWipeArmed) {
        global._snMindWipeArmed = Date.now();
        return {
          text: 'Mind wipe armed · type mind wipe again within 20s to confirm · permanent',
          score: 1,
          via: 'astranov-mind',
          source: 'wipe-confirm',
        };
      }
      if (Date.now() - global._snMindWipeArmed > 20000) {
        global._snMindWipeArmed = Date.now();
        return {
          text: 'Mind wipe re-armed · type mind wipe again to confirm',
          score: 1,
          via: 'astranov-mind',
          source: 'wipe-confirm',
        };
      }
      global._snMindWipeArmed = 0;
      wipe('user');

      return {
        text: 'Memory cleared and re-trained. English, Greek, Greeklish ready. Talk normally.',
        score: 1,
        via: 'free-mind',
        source: 'wipe',
      };
    }

    var teachM = msg.match(/^teach\s+(.+)$/i);
    if (teachM) {
      var body = teachM[1].trim();
      var parts = body.split(/\s*=>\s*|\s*\|\s*/);
      if (parts.length >= 2) {
        var ans = parts.slice(1).join(' | ');
        if (isJunkAnswer(ans) || isJunkQuestion(parts[0])) {
          return {
            text: 'Teach rejected · looks like junk (names/logs/too short)',
            score: 1,
            via: 'free-mind',
            source: 'teach-reject',
          };
        }
        teach(parts[0], ans, ['user', 'teach']);
        return {
          text: 'Learned · ' + brief(parts[0], 40),
          score: 1,
          via: 'free-mind',
          source: 'teach',
        };
      }
      if (isJunkAnswer(body) && !isProductish(body)) {
        return {
          text: 'Teach rejected · not product-shaped · use: teach Q => A',
          score: 1,
          via: 'free-mind',
          source: 'teach-reject',
        };
      }
      teach(body, body, ['user', 'teach']);
      return { text: 'Noted · ' + brief(body, 50), score: 1, via: 'free-mind', source: 'teach' };
    }

    if (opts.localReply && opts.did && opts.did.length && !opts.needsEdge) {
      return {
        text: brief(opts.localReply, 120),
        score: 0.95,
        via: 'free-mind+local',
        source: 'act',
      };
    }

    var qTok = tokens(msg);
    if (qTok.length < 1) {
      return {
        text: "I'm with you — English first · full Greek · any language. Try: locate, youtube, shops, dark map, pilot, search.",
        score: 0.55,
        via: 'free-mind',
        source: 'fallback',
      };
    }

    var docs = allDocs();
    var best = null;
    var bestScore = 0;
    var i;
    for (i = 0; i < docs.length; i++) {
      var d = docs[i];
      var sc = scoreMatch(qTok, d.q + ' ' + (d.tags || []).join(' ')) * (d.strength || 1);
      if (d.tags) {
        d.tags.forEach(function (tg) {
          if (low.indexOf(String(tg).toLowerCase()) >= 0) sc += 0.18;
        });
      }
      if (d.source === 'seed') sc += 0.08;
      if (d.source === 'brain') sc += 0.04;
      if (d.tags && d.tags.indexOf('train') >= 0) sc += 0.06;
      if (
        (d.tags || []).indexOf('p0') >= 0 ||
        (d.tags || []).indexOf('first') >= 0 ||
        /pizza|first.task|lazy/i.test(d.id || '')
      ) {
        if (!/\b(pizza|order|hungry|food|σουβλ|πιτσα|pitogyra|tray)\b/i.test(low)) sc *= 0.18;
      }
      if (d.source === 'learned') {
        if (isJunkAnswer(d.a) || isJunkQuestion(d.q)) continue;
        if ((d.tags || []).indexOf('auto') >= 0 && !isProductish(d.a)) continue;
        if (/^(yes|no)$/i.test(String(d.q || '').trim())) continue;
        // Owner train drills are trusted
        if ((d.tags || []).indexOf('train') >= 0 || (d.tags || []).indexOf('v6') >= 0) sc *= 1.05;
        else sc *= 0.72;
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = d;
      }
    }

    // Seeds: fair bar. Learned: higher bar unless train-tagged.
    var need = qTok.length <= 2 ? 0.55 : 0.48;
    if (best && best.source === 'learned') {
      if ((best.tags || []).indexOf('train') >= 0 || (best.tags || []).indexOf('v6') >= 0) {
        need = Math.min(need, 0.5);
      } else {
        need = Math.max(need, 0.72);
        var learnHits = 0;
        var bset = {};
        tokens(best.q + ' ' + (best.tags || []).join(' ')).forEach(function (t) {
          bset[t] = 1;
        });
        qTok.forEach(function (t) {
          if (bset[t]) learnHits++;
        });
        if (learnHits < 2 && qTok.length >= 2) need = 9;
      }
    }

    if (best && bestScore >= need && !isJunkAnswer(best.a)) {
      if (best.source === 'learned') {
        try {
          var li = parseInt(String(best.id).replace('learn_', ''), 10);
          if (learned[li]) {
            learned[li].hits = (learned[li].hits || 0) + 1;
            save();
          }
        } catch (e3) {}
      }
      stats.answers = (stats.answers || 0) + 1;
      save();
      try {
        if (global.SNUsage && SNUsage.track)
          SNUsage.track('free_mind_hit', { id: best.id, score: Math.round(bestScore * 100) });
      } catch (e4) {}
      return {
        text: brief(best.a, 160),
        score: Math.max(bestScore, 0.6),
        via: 'free-mind',
        source: best.source,
        id: best.id,
      };
    }

    stats.misses = (stats.misses || 0) + 1;
    save();
    var fallback = opts.localReply
      ? brief(opts.localReply, 160)
      : "I hear you — English first · full Greek · any language: locate · youtube · shops · dark map · pilot · search · cancel.";
    return {
      text: fallback,
      score: opts.localReply ? 0.5 : 0.4,
      via: 'free-mind',
      source: 'fallback',
    };
  }

  function think(text, kind) {
    var t = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    if (!t) return;
    try {
      var box = document.getElementById('cli-ai-mind-log');
      if (box) {
        var line = document.createElement('div');
        line.className = 'cli-ai-think';
        line.textContent = '· ' + t;
        box.appendChild(line);
        while (box.children.length > 12) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
      }
    } catch (e) {}
  }

  function teach(q, a, tags) {
    tags = tags || [];
    q = String(q || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    a = String(a || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);
    var train = tags.indexOf('train') >= 0 || tags.indexOf('first-task') >= 0 || tags.indexOf('v6') >= 0;
    if (!train && (isJunkQuestion(q) || isJunkAnswer(a))) return { ok: false, junk: true };
    try {
      think('learned · ' + q.slice(0, 40) + ' → ' + a.slice(0, 50), 'teach');
    } catch (e) {}
    var qTok = tokens(q);
    var i;
    for (i = 0; i < learned.length; i++) {
      if (scoreMatch(qTok, learned[i].q) > 0.75) {
        learned[i].a = a;
        learned[i].hits = (learned[i].hits || 0) + 1;
        learned[i].t = Date.now();
        learned[i].tags = tags;
        save();
        stats.teaches = (stats.teaches || 0) + 1;
        return { ok: true, updated: true };
      }
    }
    learned.push({
      q: q,
      a: a,
      tags: tags,
      hits: 1,
      t: Date.now(),
    });
    if (learned.length > MAX_LEARN) learned.splice(0, learned.length - MAX_LEARN);
    stats.learns = (stats.learns || 0) + 1;
    stats.teaches = (stats.teaches || 0) + 1;
    save();
    try {
      if (global.SNUsage && SNUsage.track) SNUsage.track('free_mind_teach', { len: a.length });
    } catch (e2) {}
    return { ok: true };
  }

  function learnInteraction(userMsg, assistantMsg, meta) {
    meta = meta || {};
    var q = String(userMsg || '').trim();
    var a = String(assistantMsg || '').trim();
    if (!q || !a) return;
    if (isJunkQuestion(q) || isJunkAnswer(a)) return;
    var src = String(meta.source || '');
    if (src === 'fallback' || src === 'learned') return;
    if (!/^(intent|seed|act|teach|status|brain)/i.test(src) && !isProductish(a)) return;
    teach(q, a, ['auto', 'interaction', src]);
  }

  function exportTrainset() {
    var rows = [];
    SEED.forEach(function (s) {
      if (!s || !s.q) return;
      rows.push({ input: s.q, output: s.a, source: 'seed', tags: s.tags });
    });
    learned.forEach(function (L) {
      rows.push({ input: L.q, output: L.a, source: 'learned', hits: L.hits || 0, tags: L.tags });
    });
    return { count: rows.length, rows: rows };
  }

  function status() {
    return {
      name: MIND_NAME,
      brand: NAME,
      learned: learned.length,
      seeds: SEED.length,
      stats: Object.assign({}, stats),
      paidXaiRequired: false,
      evolves: true,
      train: 'v7',
      note: 'Astranov Mind v7 — full INTERNET OS · YouTube · LANGUAGE LAW EN/EL · evolves forever',
    };
  }

  load();
  // One-shot retrain when LEARN_KEY is v7 but train flag still old/missing
  try {
    if (localStorage.getItem('sn:astranov-mind-train-v7') !== '1') {
      trainOwnerMind(true);
    }
  } catch (_) {}

  var API = {
    NAME: NAME,
    MIND_NAME: MIND_NAME,
    answer: answer,
    teach: teach,
    think: think,
    wipe: wipe,
    learnInteraction: learnInteraction,
    exportTrainset: exportTrainset,
    status: status,
    isJunkAnswer: isJunkAnswer,
    trainOwnerMind: trainOwnerMind,
    get learnedCount() {
      return learned.length;
    },
  };
  global.SNAstranovMind = API;
  global.SNFreeMind = API;
})(typeof window !== 'undefined' ? window : globalThis);
