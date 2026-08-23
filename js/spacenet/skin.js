/**
 * SNSkin — product face
 * Default: Astranov deep neon electric blue (gaming hull)
 * SpaceXAI void face available via CLI: skin spacex
 * No color-picker UI. No hex codes on chrome.
 */
(function (g) {
  'use strict';
  var KEY = 'sn:skin-v1';
  var DEFAULT = 'spacex';

  /** Product faces */
  var MEMORY = {
    spacex: {
      id: 'spacex',
      label: 'SpaceXAI',
      note: 'Void black · white type · silver edge · red critical only',
      tokens: {
        '--bg': '#000000',
        '--bg-deep': '#000000',
        '--void': '#000000',
        '--text': '#f4f6f8',
        '--text-bright': '#ffffff',
        '--accent': '#14c3f3',
        '--bright': '#7ee9ff',
        '--glow': '#14c3f3',
        '--ice': '#9ad8ea',
        '--electric': '#14c3f3',
        '--err': '#e82127',
        '--border': 'rgba(20,195,243,0.38)',
      },
    },
    astranov: {
      id: 'astranov',
      label: 'Astranov electric',
      note: 'Deep neon glowing blue — gaming hull',
      tokens: {
        '--bg': '#01040e',
        '--bg-deep': '#000208',
        '--void': '#000105',
        '--text': '#b8cfff',
        '--text-bright': '#e8eeff',
        '--accent': '#0040ff',
        '--bright': '#1a5cff',
        '--glow': '#2a6aff',
        '--ice': '#3d7bff',
        '--electric': '#0050ff',
        '--err': '#ff5e7a',
        '--border': 'rgba(0,70,255,0.55)',
      },
    },
  };

  function read() {
    try {
      var s = localStorage.getItem(KEY);
      if (s === 'astranov' || s === 'classic' || s === 'electric' || s === 'deep' || s === 'neon')
        return 'astranov';
      if (s === 'spacex' || s === 'sx' || s === 'spacexai' || s === 'imagine') return 'spacex';
    } catch (_) {}
    return DEFAULT;
  }

  function applyTokens(id) {
    var pack = MEMORY[id] || MEMORY.astranov;
    var root = document.documentElement;
    if (!root || !root.style) return;
    var t = pack.tokens || {};
    Object.keys(t).forEach(function (k) {
      try {
        root.style.setProperty(k, t[k]);
      } catch (_) {}
    });
  }

  function apply(id, opts) {
    opts = opts || {};
    id = id === 'spacex' ? 'spacex' : 'astranov';
    // Imagine version auto-enables AI graphics engine
    try {
      if (opts.imagine !== false && global.SNAIGraphics && SNAIGraphics.setMode) {
        SNAIGraphics.setMode('imagine');
      }
    } catch (_) {}
    try {
      localStorage.setItem(KEY, id);
    } catch (_) {}
    var root = document.documentElement;
    if (root) {
      root.classList.remove('skin-spacex', 'skin-astranov');
      root.classList.add(id === 'astranov' ? 'skin-astranov' : 'skin-spacex');
      root.setAttribute('data-sn-skin', id);
      // Gaming hull: always dark chrome (no pale wash)
      root.classList.remove('theme-light');
      root.classList.add('theme-dark');
    }
    applyTokens(id);
    try {
      if (g.SNAi && SNAi.showOnGlobe && !opts.silent) {
        SNAi.showOnGlobe(id === 'spacex' ? 'SpaceXAI' : 'Deep neon blue');
      }
    } catch (_) {}
    return MEMORY[id];
  }

  function boot() {
    try {
      if (!localStorage.getItem('sn:skin-v2')) {
        localStorage.setItem(KEY, 'spacex');
        localStorage.setItem('sn:skin-v2', 'grok');
      }
    } catch (_) {}
    return apply(read(), { silent: true });
  }

  g.SNSkin = {
    KEY: KEY,
    DEFAULT: DEFAULT,
    MEMORY: MEMORY,
    read: read,
    apply: apply,
    boot: boot,
    list: function () {
      return Object.keys(MEMORY);
    },
  };

  // Early if DOM ready
  if (document.documentElement) {
    try {
      boot();
    } catch (_) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
