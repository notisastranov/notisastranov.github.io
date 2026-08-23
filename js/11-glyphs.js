// === ASTRO GLYPHS — high-contrast icons for globe HUD (readable at small size) ===
const AstroGlyphs = {
  client: '🧑',
  driver: '🚚',
  vendor: '🏬',
  shop: '🛍️',
  order: '🛒',
  locate: '🎯',
  mic: '🎤',
  cli: '💻',
  stop: '🛑',
  vhf: '📡',
  phone: '☎️',
  news: '📰',
  drive: '🚗',
  fast: '⚡',
  send: '➡️',
  close: '✖️',
  ok: '✔️',
  err: '❌',
  pilot: '🛸',
  beer: '🍻',
  menu: '📋',
};

const CATEGORY_GLYPH = {
  restaurant: '🍴', cafe: '☕', fast_food: '🍟', bakery: '🥖', bar: '🍻',
  pharmacy: '💊', supermarket: '🛒', shop: '🛍️', service: '💇', fitness: '🏃',
  hotel: '🏨', health: '🏥',
};

const LEGACY_VENDOR_EMOJI = new Set(['🎪', '🏪', '🍽️', '🍔', '🥐', '🍦', '🍺', '👗', '📱', '📚', '⚽', '✂️', '🏋️']);

function vendorIcon(v) {
  if (!v) return AstroGlyphs.shop;
  const e = v.emoji;
  if (e && !LEGACY_VENDOR_EMOJI.has(e)) return e;
  return CATEGORY_GLYPH[v.category] || AstroGlyphs.shop;
}

const LEGACY_DRIVER_EMOJI = new Set(['🚴', '👤', '🛵']);

function driverIcon(d) {
  const e = d && (d.avatar_emoji || d.emoji);
  if (e && !LEGACY_DRIVER_EMOJI.has(e)) return e;
  return AstroGlyphs.driver;
}

window.AstroGlyphs = AstroGlyphs;
window.vendorIcon = vendorIcon;
window.driverIcon = driverIcon;
