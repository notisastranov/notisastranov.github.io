/**
 * SpaceNet Cosmos — ALL of known space (+ sci‑fi dimensions) is navigable address space
 * ---------------------------------------------------------------------------
 * LAW (SPECS.md): Every planet, black hole, solar system, constellation, and
 * any known or sci‑fi dimension is a real place on the net. Zoom / go there →
 * leave files, call, market, or just exist.
 *
 * window.SpaceNetCosmos
 */
(function SpaceNetCosmosBoot() {
  'use strict';

  /** Sol — every major body humans catalog */
  const SOL = [
    { id: 'sol-sun', name: 'Sun', kind: 'star', emoji: '☀️', tier: 'orbit', body: 'sun', dist: 0, c: 0xffcc33, r: 0.35, desc: 'G2V · Sol barycenter' },
    { id: 'sol-mercury', name: 'Mercury', kind: 'planet', emoji: '☿', tier: 'orbit', body: 'mercury', dist: 0.7, periodDays: 87.969, incl: 7.005, omega: 48.331, M0: 174.8, c: 0xaaaaaa, r: 0.04, desc: 'Rocky · no atmosphere' },
    { id: 'sol-venus', name: 'Venus', kind: 'planet', emoji: '♀', tier: 'orbit', body: 'venus', dist: 1.0, periodDays: 224.7, incl: 3.39, omega: 76.68, M0: 50.4, c: 0xddbb88, r: 0.06, desc: 'Greenhouse · retrograde' },
    { id: 'sol-earth', name: 'Earth', kind: 'planet', emoji: '🌍', tier: 'global', body: 'earth', dist: 1.2, periodDays: 365.25, incl: 0, omega: 0, M0: 0, c: 0x4488ff, r: 0.065, desc: 'Home · SpaceNet ground layer' },
    { id: 'sol-moon', name: 'Moon', kind: 'moon', emoji: '🌙', tier: 'orbit', body: 'moon', parent: 'sol-earth', dist: 1.28, c: 0xcccccc, r: 0.02, desc: 'Luna · Mare Tranquillitatis' },
    { id: 'sol-mars', name: 'Mars', kind: 'planet', emoji: '♂', tier: 'orbit', body: 'mars', dist: 1.5, periodDays: 686.98, incl: 1.85, omega: 49.56, M0: 19.37, c: 0xff6644, r: 0.05, desc: 'Red planet · Cydonia · Olympus' },
    { id: 'sol-phobos', name: 'Phobos', kind: 'moon', emoji: '🪨', tier: 'orbit', body: 'phobos', parent: 'sol-mars', dist: 1.52, c: 0x886655, r: 0.012, desc: 'Mars moon · Stickney crater' },
    { id: 'sol-deimos', name: 'Deimos', kind: 'moon', emoji: '🪨', tier: 'orbit', body: 'deimos', parent: 'sol-mars', dist: 1.54, c: 0x776655, r: 0.01, desc: 'Mars outer moon' },
    { id: 'sol-ceres', name: 'Ceres', kind: 'dwarf', emoji: '◯', tier: 'orbit', body: 'ceres', dist: 1.85, periodDays: 1681, c: 0x999988, r: 0.025, desc: 'Dwarf · asteroid belt' },
    { id: 'sol-jupiter', name: 'Jupiter', kind: 'planet', emoji: '♃', tier: 'orbit', body: 'jupiter', dist: 2.2, periodDays: 4332.6, incl: 1.3, omega: 100.5, M0: 20, c: 0xccaa77, r: 0.12, desc: 'Gas giant · Great Red Spot' },
    { id: 'sol-io', name: 'Io', kind: 'moon', emoji: '🟡', tier: 'orbit', body: 'io', parent: 'sol-jupiter', dist: 2.28, c: 0xffcc44, r: 0.018, desc: 'Volcanic moon' },
    { id: 'sol-europa', name: 'Europa', kind: 'moon', emoji: '🧊', tier: 'orbit', body: 'europa', parent: 'sol-jupiter', dist: 2.32, c: 0xaaddff, r: 0.018, desc: 'Ice ocean world' },
    { id: 'sol-ganymede', name: 'Ganymede', kind: 'moon', emoji: '🌑', tier: 'orbit', body: 'ganymede', parent: 'sol-jupiter', dist: 2.36, c: 0x998866, r: 0.022, desc: 'Largest moon' },
    { id: 'sol-callisto', name: 'Callisto', kind: 'moon', emoji: '🌑', tier: 'orbit', body: 'callisto', parent: 'sol-jupiter', dist: 2.4, c: 0x887766, r: 0.02, desc: 'Cratered ice' },
    { id: 'sol-saturn', name: 'Saturn', kind: 'planet', emoji: '♄', tier: 'orbit', body: 'saturn', dist: 3.0, periodDays: 10759, incl: 2.49, omega: 113.7, M0: 317, c: 0xddcc99, r: 0.1, desc: 'Rings · Cassini division' },
    { id: 'sol-titan', name: 'Titan', kind: 'moon', emoji: '🟠', tier: 'orbit', body: 'titan', parent: 'sol-saturn', dist: 3.08, c: 0xcc8844, r: 0.022, desc: 'Thick atmosphere · lakes' },
    { id: 'sol-enceladus', name: 'Enceladus', kind: 'moon', emoji: '💎', tier: 'orbit', body: 'enceladus', parent: 'sol-saturn', dist: 3.05, c: 0xeeffff, r: 0.014, desc: 'Geysers · subsurface ocean' },
    { id: 'sol-uranus', name: 'Uranus', kind: 'planet', emoji: '⛢', tier: 'orbit', body: 'uranus', dist: 3.7, periodDays: 30688, incl: 0.77, omega: 74, M0: 142, c: 0x88ddcc, r: 0.08, desc: 'Ice giant · tipped axis' },
    { id: 'sol-neptune', name: 'Neptune', kind: 'planet', emoji: '♆', tier: 'orbit', body: 'neptune', dist: 4.3, periodDays: 60182, incl: 1.77, omega: 131.8, M0: 256, c: 0x4466ff, r: 0.078, desc: 'Ice giant · Great Dark Spot' },
    { id: 'sol-triton', name: 'Triton', kind: 'moon', emoji: '🔵', tier: 'orbit', body: 'triton', parent: 'sol-neptune', dist: 4.35, c: 0x99aacc, r: 0.016, desc: 'Retrograde moon' },
    { id: 'sol-pluto', name: 'Pluto', kind: 'dwarf', emoji: '♇', tier: 'orbit', body: 'pluto', dist: 4.9, periodDays: 90560, c: 0xccbbaa, r: 0.03, desc: 'Kuiper · Tombaugh Regio' },
    { id: 'sol-charon', name: 'Charon', kind: 'moon', emoji: '🌑', tier: 'orbit', body: 'charon', parent: 'sol-pluto', dist: 4.95, c: 0x998888, r: 0.015, desc: 'Pluto binary' },
    { id: 'sol-eris', name: 'Eris', kind: 'dwarf', emoji: '◯', tier: 'orbit', body: 'eris', dist: 5.4, c: 0xddddff, r: 0.028, desc: 'Scattered disk' },
    { id: 'sol-haumea', name: 'Haumea', kind: 'dwarf', emoji: '◯', tier: 'orbit', body: 'haumea', dist: 5.1, c: 0xeeeeff, r: 0.022, desc: 'Elongated · rings' },
    { id: 'sol-makemake', name: 'Makemake', kind: 'dwarf', emoji: '◯', tier: 'orbit', body: 'makemake', dist: 5.2, c: 0xeeddcc, r: 0.022, desc: 'Kuiper classical' },
    { id: 'sol-iss', name: 'ISS', kind: 'station', emoji: '🛰️', tier: 'orbit', body: 'iss', dist: 1.072, c: 0x00ffcc, r: 0.014, desc: 'LEO station · ~400 km' },
    { id: 'sol-vesta', name: 'Vesta', kind: 'asteroid', emoji: '🪨', tier: 'orbit', body: 'vesta', dist: 1.75, c: 0xaaa090, r: 0.018, desc: 'Belt asteroid' },
    { id: 'sol-pallas', name: 'Pallas', kind: 'asteroid', emoji: '🪨', tier: 'orbit', body: 'pallas', dist: 1.9, c: 0x998877, r: 0.016, desc: 'Belt asteroid' },
    { id: 'sol-halley', name: '1P/Halley', kind: 'comet', emoji: '☄️', tier: 'orbit', body: 'halley', dist: 3.4, c: 0x88ccff, r: 0.015, desc: 'Periodic comet' },
    { id: 'sol-oort', name: 'Oort Cloud', kind: 'region', emoji: '☁️', tier: 'orbit', body: 'oort', dist: 6.2, c: 0x6688aa, r: 0.4, desc: 'Comet reservoir · edge of Sol' },
  ];

  /** Black holes & extreme compact objects (known / named) */
  const BLACK_HOLES = [
    { id: 'bh-sgr-a', name: 'Sagittarius A*', kind: 'blackhole', emoji: '🕳️', tier: 'galactic', body: 'sgr-a', ra: 17.7611, dec: -29.0078, distLy: 26000, c: 0xff2200, desc: 'Milky Way central SMBH' },
    { id: 'bh-m87', name: 'M87*', kind: 'blackhole', emoji: '🕳️', tier: 'galaxy', body: 'm87star', ra: 12.5137, dec: 12.3911, distLy: 53000000, c: 0xff4400, desc: 'First imaged · EHT 2019' },
    { id: 'bh-cygx1', name: 'Cygnus X-1', kind: 'blackhole', emoji: '🕳️', tier: 'galactic', body: 'cygx1', ra: 19.973, dec: 35.2016, distLy: 6070, c: 0xff6622, desc: 'First stellar BH candidate' },
    { id: 'bh-v404', name: 'V404 Cygni', kind: 'blackhole', emoji: '🕳️', tier: 'galactic', body: 'v404', ra: 20.4, dec: 33.87, distLy: 7800, c: 0xff5533, desc: 'Microquasar outbursts' },
    { id: 'bh-gw150914', name: 'GW150914 remnant', kind: 'blackhole', emoji: '〰️', tier: 'galaxy', body: 'gw150914', ra: 8, dec: -70, distLy: 1300000000, c: 0xaa44ff, desc: 'LIGO first merger · ~62 M☉' },
    { id: 'bh-ton618', name: 'TON 618', kind: 'blackhole', emoji: '🕳️', tier: 'galaxy', body: 'ton618', ra: 12.47, dec: 31.46, distLy: 10400000000, c: 0xff0066, desc: 'Ultramassive quasar BH' },
    { id: 'bh-phoenix', name: 'Phoenix A', kind: 'blackhole', emoji: '🕳️', tier: 'galaxy', body: 'phoenix-a', ra: 23.74, dec: -42.72, distLy: 5700000000, c: 0xff3366, desc: 'Cluster central BH' },
  ];

  /** Major constellations (IAU) — RA/Dec of traditional center / alpha star region */
  const CONSTELLATIONS = [
    { id: 'con-ori', name: 'Orion', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'orion', ra: 5.6, dec: 0, desc: 'Hunter · Belt · Nebula M42' },
    { id: 'con-uma', name: 'Ursa Major', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'uma', ra: 11.0, dec: 50, desc: 'Great Bear · Big Dipper' },
    { id: 'con-umi', name: 'Ursa Minor', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'umi', ra: 15.0, dec: 75, desc: 'Little Bear · Polaris' },
    { id: 'con-cas', name: 'Cassiopeia', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'cas', ra: 1.0, dec: 60, desc: 'W queen' },
    { id: 'con-cyg', name: 'Cygnus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'cyg', ra: 20.5, dec: 40, desc: 'Swan · Northern Cross' },
    { id: 'con-lyr', name: 'Lyra', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'lyr', ra: 18.6, dec: 38, desc: 'Vega · Ring Nebula' },
    { id: 'con-sco', name: 'Scorpius', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'sco', ra: 16.9, dec: -30, desc: 'Antares · galactic center path' },
    { id: 'con-sgr', name: 'Sagittarius', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'sgr', ra: 19.0, dec: -25, desc: 'Teapot · toward Sgr A*' },
    { id: 'con-tau', name: 'Taurus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'tau', ra: 4.5, dec: 16, desc: 'Aldebaran · Pleiades · Crab' },
    { id: 'con-gem', name: 'Gemini', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'gem', ra: 7.0, dec: 22, desc: 'Castor · Pollux' },
    { id: 'con-leo', name: 'Leo', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'leo', ra: 10.5, dec: 15, desc: 'Lion · Regulus' },
    { id: 'con-vir', name: 'Virgo', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'vir', ra: 13.0, dec: -5, desc: 'Spica · Virgo cluster' },
    { id: 'con-and', name: 'Andromeda', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'and', ra: 1.0, dec: 38, desc: 'M31 host constellation' },
    { id: 'con-per', name: 'Perseus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'per', ra: 3.5, dec: 45, desc: 'Double cluster' },
    { id: 'con-aqr', name: 'Aquarius', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'aqr', ra: 22.5, dec: -10, desc: 'Water bearer' },
    { id: 'con-psc', name: 'Pisces', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'psc', ra: 0.5, dec: 10, desc: 'Fishes' },
    { id: 'con-ari', name: 'Aries', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'ari', ra: 2.5, dec: 20, desc: 'Ram' },
    { id: 'con-cnc', name: 'Cancer', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'cnc', ra: 8.5, dec: 20, desc: 'Crab · Beehive' },
    { id: 'con-lib', name: 'Libra', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'lib', ra: 15.2, dec: -15, desc: 'Scales' },
    { id: 'con-cap', name: 'Capricornus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'cap', ra: 21.0, dec: -20, desc: 'Sea goat' },
    { id: 'con-crx', name: 'Crux', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'crx', ra: 12.5, dec: -60, desc: 'Southern Cross' },
    { id: 'con-cen', name: 'Centaurus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'cen', ra: 13.5, dec: -50, desc: 'Alpha Centauri · Proxima' },
    { id: 'con-car', name: 'Carina', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'car', ra: 9.0, dec: -60, desc: 'Eta Carinae · Canopus' },
    { id: 'con-dra', name: 'Draco', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'dra', ra: 17.0, dec: 65, desc: 'Dragon' },
    { id: 'con-her', name: 'Hercules', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'her', ra: 17.0, dec: 30, desc: 'M13 cluster' },
    { id: 'con-oph', name: 'Ophiuchus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'oph', ra: 17.3, dec: -5, desc: 'Serpent bearer · 13th zodiac' },
    { id: 'con-aqu', name: 'Aquila', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'aqu', ra: 19.8, dec: 5, desc: 'Altair' },
    { id: 'con-peg', name: 'Pegasus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'peg', ra: 22.5, dec: 20, desc: 'Great Square' },
    { id: 'con-cet', name: 'Cetus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'cet', ra: 1.5, dec: -10, desc: 'Sea monster · Mira' },
    { id: 'con-eri', name: 'Eridanus', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'eri', ra: 3.5, dec: -20, desc: 'River · Achernar' },
    { id: 'con-hya', name: 'Hydra', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'hya', ra: 10.0, dec: -15, desc: 'Largest constellation' },
    { id: 'con-pup', name: 'Puppis', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'pup', ra: 7.5, dec: -30, desc: 'Stern of Argo' },
    { id: 'con-vel', name: 'Vela', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'vel', ra: 9.5, dec: -45, desc: 'Sails · Vela pulsar' },
    { id: 'con-pho', name: 'Phoenix', kind: 'constellation', emoji: '⭐', tier: 'galactic', body: 'pho', ra: 0.5, dec: -45, desc: 'Southern bird' },
  ];

  /** Exoplanet host systems (known) */
  const EXO = [
    { id: 'exo-proxima', name: 'Proxima Centauri', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'proxima', ra: 14.4966, dec: -62.68, distLy: 4.24, desc: 'Nearest star · Proxima b,c,d' },
    { id: 'exo-acen', name: 'Alpha Centauri', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'acen', ra: 14.66, dec: -60.83, distLy: 4.37, desc: 'Binary A/B · nearest system' },
    { id: 'exo-trappist1', name: 'TRAPPIST-1', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'trappist1', ra: 23.063, dec: -5.043, distLy: 40.7, desc: '7 rocky worlds' },
    { id: 'exo-k452', name: 'Kepler-452', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'k452', ra: 19.112, dec: 44.271, distLy: 1402, desc: 'Earth-analog candidate' },
    { id: 'exo-55cnc', name: '55 Cancri', kind: 'system', emoji: '🔭', tier: 'galactic', body: '55cnc', ra: 8.748, dec: 28.662, distLy: 41, desc: '5 planets · f rocky' },
    { id: 'exo-tauceti', name: 'Tau Ceti', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'tauceti', ra: 1.674, dec: -15.938, distLy: 11.9, desc: '4 candidates' },
    { id: 'exo-gj581', name: 'GJ 581', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'gj581', ra: 15.286, dec: -7.721, distLy: 20.4, desc: 'Super-Earths' },
    { id: 'exo-k186', name: 'Kepler-186', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'k186', ra: 19.563, dec: 43.633, distLy: 492, desc: 'Kepler-186f' },
    { id: 'exo-k218', name: 'K2-18', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'k218', ra: 11.558, dec: 7.59, distLy: 124, desc: 'Water vapor · hycean?' },
    { id: 'exo-lhs1140', name: 'LHS 1140', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'lhs1140', ra: 0.595, dec: -15.31, distLy: 40.7, desc: 'Rocky super-Earth' },
    { id: 'exo-hd209458', name: 'HD 209458', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'hd209458', ra: 22.094, dec: 18.884, distLy: 159, desc: 'Osiris · first transit' },
    { id: 'exo-wasp12', name: 'WASP-12', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'wasp12', ra: 6.591, dec: 29.091, distLy: 1400, desc: 'Hot Jupiter' },
    { id: 'exo-toi700', name: 'TOI-700', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'toi700', ra: 6.772, dec: -62.601, distLy: 101, desc: 'TOI-700d hab zone' },
    { id: 'exo-barnard', name: "Barnard's Star", kind: 'system', emoji: '🔭', tier: 'galactic', body: 'barnard', ra: 17.955, dec: 4.668, distLy: 5.96, desc: 'High proper motion' },
    { id: 'exo-wolf359', name: 'Wolf 359', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'wolf359', ra: 10.279, dec: 7.0, distLy: 7.86, desc: 'Red dwarf · candidate planets' },
    { id: 'exo-gj1214', name: 'GJ 1214', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'gj1214', ra: 17.569, dec: 4.96, distLy: 48, desc: 'Mini-Neptune' },
    { id: 'exo-hd10180', name: 'HD 10180', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'hd10180', ra: 1.468, dec: -60.318, distLy: 127, desc: 'Up to 9 planets' },
    { id: 'exo-kepler22', name: 'Kepler-22', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'k22', ra: 19.28, dec: 47.88, distLy: 620, desc: 'Kepler-22b' },
    { id: 'exo-kepler62', name: 'Kepler-62', kind: 'system', emoji: '🔭', tier: 'galactic', body: 'k62', ra: 18.88, dec: 45.34, distLy: 1200, desc: 'Multi · e/f hab' },
    { id: 'exo-teegarden', name: "Teegarden's Star", kind: 'system', emoji: '🔭', tier: 'galactic', body: 'teegarden', ra: 2.88, dec: 16.88, distLy: 12.5, desc: 'b & c Earth-size' },
  ];

  /** Galaxies & deep-sky anchors */
  const GALAXIES = [
    { id: 'gal-mw', name: 'Milky Way', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'milkyway', ra: 17.76, dec: -29, distLy: 0, desc: 'Home galaxy · bar + arms' },
    { id: 'gal-m31', name: 'Andromeda M31', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'm31', ra: 0.712, dec: 41.269, distLy: 2500000, desc: 'Nearest major spiral' },
    { id: 'gal-m33', name: 'Triangulum M33', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'm33', ra: 1.564, dec: 30.66, distLy: 2730000, desc: 'Local Group' },
    { id: 'gal-lmc', name: 'LMC', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'lmc', ra: 5.39, dec: -69.76, distLy: 163000, desc: 'Large Magellanic Cloud' },
    { id: 'gal-smc', name: 'SMC', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'smc', ra: 0.88, dec: -72.8, distLy: 200000, desc: 'Small Magellanic Cloud' },
    { id: 'gal-m51', name: 'Whirlpool M51', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'm51', ra: 13.5, dec: 47.2, distLy: 23000000, desc: 'Interacting spiral' },
    { id: 'gal-m81', name: 'Bode M81', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'm81', ra: 9.93, dec: 69.07, distLy: 12000000, desc: 'Grand design spiral' },
    { id: 'gal-m87', name: 'Virgo A M87', kind: 'galaxy', emoji: '🌌', tier: 'galaxy', body: 'm87', ra: 12.51, dec: 12.39, distLy: 53000000, desc: 'Hosts M87*' },
  ];

  /**
   * Other dimensions — sci‑fi / theoretical address layers
   * (navigable places on the net; not physical claims)
   */
  const DIMENSIONS = [
    { id: 'dim-prime', name: 'Prime continuum', kind: 'dimension', emoji: '◎', tier: 'global', body: 'earth', sciFi: true, desc: 'Default reality layer · Earth SpaceNet' },
    { id: 'dim-subspace', name: 'Subspace', kind: 'dimension', emoji: '📡', tier: 'galactic', body: 'dim-subspace', sciFi: true, ra: 12, dec: 0, c: 0x44ffcc, desc: 'Faster channels · comms layer (Trek‑class SF)' },
    { id: 'dim-hyperspace', name: 'Hyperspace', kind: 'dimension', emoji: '🚀', tier: 'galaxy', body: 'dim-hyperspace', sciFi: true, ra: 6, dec: 30, c: 0x8866ff, desc: 'Jump lanes · SW / Asimov‑class SF' },
    { id: 'dim-wormhole', name: 'Wormhole network', kind: 'dimension', emoji: '🌀', tier: 'galaxy', body: 'dim-wormhole', sciFi: true, ra: 18, dec: -20, c: 0x66aaff, desc: 'Einstein–Rosen / Bajoran‑class corridors' },
    { id: 'dim-mirror', name: 'Mirror universe', kind: 'dimension', emoji: '🪞', tier: 'galactic', body: 'dim-mirror', sciFi: true, ra: 0, dec: -40, c: 0xff4488, desc: 'Inverted ethics layer · Trek SF' },
    { id: 'dim-q', name: 'Q Continuum', kind: 'dimension', emoji: '⚡', tier: 'galaxy', body: 'dim-q', sciFi: true, ra: 21, dec: 55, c: 0xffff66, desc: 'Extra‑dimensional court · Trek SF' },
    { id: 'dim-warp', name: 'Warp field', kind: 'dimension', emoji: '💫', tier: 'orbit', body: 'dim-warp', sciFi: true, dist: 5.8, c: 0x66ffaa, desc: 'Alcubierre‑inspired bubble layer' },
    { id: 'dim-slipstream', name: 'Quantum slipstream', kind: 'dimension', emoji: '💠', tier: 'galaxy', body: 'dim-slipstream', sciFi: true, ra: 3, dec: 70, c: 0x00ffdd, desc: 'Corridor FTL · Voyager SF' },
    { id: 'dim-astral', name: 'Astral plane', kind: 'dimension', emoji: '🔮', tier: 'galactic', body: 'dim-astral', sciFi: true, ra: 14, dec: 20, c: 0xcc88ff, desc: 'Mythic / fantasy adjacent layer' },
    { id: 'dim-void', name: 'The Void', kind: 'dimension', emoji: '⬛', tier: 'galaxy', body: 'dim-void', sciFi: true, ra: 8, dec: -80, c: 0x111122, desc: 'Empty interstitial · horror SF' },
    { id: 'dim-matrix', name: 'Simulated layer', kind: 'dimension', emoji: '💾', tier: 'galactic', body: 'dim-matrix', sciFi: true, ra: 10, dec: -10, c: 0x00ff66, desc: 'Nested simulation · Matrix‑class SF' },
    { id: 'dim-timelike', name: 'Closed timelike curve', kind: 'dimension', emoji: '⏳', tier: 'galaxy', body: 'dim-ctc', sciFi: true, ra: 16, dec: 10, c: 0xffaa00, desc: 'Causal loop address · theoretical' },
    { id: 'dim-bulk', name: 'Bulk (branes)', kind: 'dimension', emoji: '📐', tier: 'galaxy', body: 'dim-bulk', sciFi: true, ra: 4, dec: 40, c: 0xaa88ff, desc: 'Higher‑D bulk · brane cosmology SF' },
    { id: 'dim-limbo', name: 'Limbo / dreamscape', kind: 'dimension', emoji: '💭', tier: 'galactic', body: 'dim-limbo', sciFi: true, ra: 22, dec: 5, c: 0x8899ff, desc: 'Shared dream address · SF/fantasy' },
    { id: 'dim-null', name: 'Null sector', kind: 'dimension', emoji: '🚫', tier: 'galaxy', body: 'dim-null', sciFi: true, ra: 11, dec: -55, c: 0x444466, desc: 'No‑signal manifold · SF' },
  ];

  function allCatalog() {
    return []
      .concat(SOL.map((x) => ({ ...x, realm: 'sol' })))
      .concat(BLACK_HOLES.map((x) => ({ ...x, realm: 'blackhole' })))
      .concat(CONSTELLATIONS.map((x) => ({ ...x, realm: 'constellation' })))
      .concat(EXO.map((x) => ({ ...x, realm: 'exo' })))
      .concat(GALAXIES.map((x) => ({ ...x, realm: 'galaxy' })))
      .concat(DIMENSIONS.map((x) => ({ ...x, realm: 'dimension' })));
  }

  function raDecToVec(raH, decDeg, radius) {
    const lat = decDeg;
    const lng = raH * 15 - 180;
    if (typeof window.latLngToPos === 'function') {
      const p = latLngToPos(lat, lng, radius);
      return new THREE.Vector3(p.x, p.y, p.z);
    }
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = (lng * Math.PI) / 180;
    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }

  const SpaceNetCosmos = {
    VERSION: 2,
    LAW:
      'ALL of space is SpaceNet address space: every planet, moon, black hole, solar system, ' +
      'constellation, galaxy — and sci‑fi / theoretical dimensions. If it can be named, you can go there and leave data.',
    catalog: allCatalog(),
    _markers: new Map(),
    _group: null,
    _ready: false,
    _focusId: null,

    init() {
      if (this._ready) return;
      this._ready = true;
      this._injectCss();
      this._injectUi();
      this._ensureCosmicBodies();
      this.syncMarkers();
      setInterval(() => {
        if (document.hidden) return;
        const lv = window.CosmicZoom?.level;
        if (lv === 'galactic' || lv === 'galaxy' || lv === 'orbit') this.syncMarkers();
      }, 15000);
    },

    list(filter) {
      const f = String(filter || '').toLowerCase();
      if (!f || f === 'all') return this.catalog.slice();
      if (f === 'sol' || f === 'planets') return this.catalog.filter((c) => c.realm === 'sol');
      if (f === 'bh' || f === 'blackhole' || f === 'blackholes') return this.catalog.filter((c) => c.realm === 'blackhole');
      if (f === 'stars' || f === 'constellation') return this.catalog.filter((c) => c.realm === 'constellation');
      if (f === 'exo' || f === 'systems') return this.catalog.filter((c) => c.realm === 'exo');
      if (f === 'galaxy' || f === 'galaxies') return this.catalog.filter((c) => c.realm === 'galaxy');
      if (f === 'dim' || f === 'dimension' || f === 'scifi') return this.catalog.filter((c) => c.realm === 'dimension');
      return this.catalog.filter(
        (c) =>
          c.id.includes(f) ||
          c.name.toLowerCase().includes(f) ||
          (c.body && c.body.includes(f)) ||
          (c.kind && c.kind.includes(f)) ||
          (c.desc && c.desc.toLowerCase().includes(f)),
      );
    },

    get(id) {
      return this.catalog.find((c) => c.id === id || c.body === id || c.name.toLowerCase() === String(id).toLowerCase()) || null;
    },

    resolve(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return null;
      // aliases
      const aliases = {
        cydonia: 'sol-mars',
        'black hole': 'bh-sgr-a',
        'sgr a': 'bh-sgr-a',
        'sgr a*': 'bh-sgr-a',
        'sag a': 'bh-sgr-a',
        'milky way': 'gal-mw',
        andromeda: 'gal-m31',
        'alpha centauri': 'exo-acen',
        proxima: 'exo-proxima',
        trappist: 'exo-trappist1',
        jupiter: 'sol-jupiter',
        saturn: 'sol-saturn',
        neptune: 'sol-neptune',
        uranus: 'sol-uranus',
        pluto: 'sol-pluto',
        mercury: 'sol-mercury',
        venus: 'sol-venus',
        earth: 'sol-earth',
        mars: 'sol-mars',
        moon: 'sol-moon',
        luna: 'sol-moon',
        sun: 'sol-sun',
        sol: 'sol-sun',
        iss: 'sol-iss',
        orion: 'con-ori',
        hyperspace: 'dim-hyperspace',
        subspace: 'dim-subspace',
        wormhole: 'dim-wormhole',
        mirror: 'dim-mirror',
        void: 'dim-void',
        astral: 'dim-astral',
        matrix: 'dim-matrix',
      };
      if (aliases[q]) return this.get(aliases[q]);
      let hit = this.get(q);
      if (hit) return hit;
      hit = this.catalog.find((c) => c.name.toLowerCase().includes(q));
      if (hit) return hit;
      const list = this.list(q);
      return list[0] || null;
    },

    /** Expand CosmicZoom solar system to full Sol catalog */
    _ensureCosmicBodies() {
      const CZ = window.CosmicZoom;
      const THREE = window.THREE;
      if (!CZ || !THREE || !CZ.solarGroup) return;
      if (CZ._spacenetFullSol) return;
      CZ._spacenetFullSol = true;

      const have = new Set((CZ.planets || []).map((m) => m.userData?.name));
      SOL.filter((p) => p.kind === 'planet' || p.kind === 'dwarf' || p.kind === 'asteroid' || p.kind === 'comet' || p.id === 'sol-sun')
        .forEach((p) => {
          if (p.id === 'sol-sun' || p.id === 'sol-earth') return; // Earth is main globe; Sun already exists
          if (have.has(p.name)) return;
          if (p.dist == null) return;
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(p.r || 0.04, 10, 10),
            new THREE.MeshBasicMaterial({ color: p.c || 0xaaaaaa }),
          );
          m.userData = {
            dist: p.dist,
            periodDays: p.periodDays || 1000,
            incl: p.incl || 0,
            omega: p.omega || 0,
            M0: p.M0 || 0,
            name: p.name,
            desc: p.desc || '',
            spacenetId: p.id,
            body: p.body,
          };
          CZ.solarGroup.add(m);
          CZ.planets.push(m);
          have.add(p.name);
          try {
            CZ.makeInclinedOrbit?.(m.userData, p.c || 0x888888, 0.14, CZ.solarGroup, { body: p.name, dash: 0.03, gap: 0.1 });
          } catch (_) {}
        });
    },

    _skyGroup() {
      const THREE = window.THREE;
      const scene = window.scene;
      if (!THREE || !scene) return null;
      if (this._group && this._group.parent) return this._group;
      const g = new THREE.Group();
      g.name = 'SpaceNetCosmosMarkers';
      scene.add(g);
      this._group = g;
      return g;
    },

    syncMarkers() {
      const THREE = window.THREE;
      const g = this._skyGroup();
      if (!THREE || !g) return;
      const tier = window.ZoomTiers?.current?.();
      const cosmic = tier?.cosmic || 'earth';
      const showDeep = cosmic === 'galactic' || cosmic === 'galaxy' || cosmic === 'orbit';
      g.visible = showDeep;

      // Solar body markers ride CosmicZoom planets; deep-sky get RA/Dec points
      const deep = this.catalog.filter((c) => c.ra != null || c.realm === 'dimension' || c.realm === 'blackhole' || c.realm === 'constellation' || c.realm === 'exo' || c.realm === 'galaxy');
      const keep = new Set();
      const radius = cosmic === 'galaxy' ? 14 : cosmic === 'galactic' ? 6.5 : 4.2;

      deep.forEach((c, i) => {
        if (!showDeep && c.realm !== 'dimension') return;
        keep.add(c.id);
        let m = this._markers.get(c.id);
        if (!m) {
          const col = c.c || (c.sciFi ? 0xcc66ff : c.kind === 'blackhole' ? 0xff3300 : 0xaaccff);
          m = new THREE.Mesh(
            new THREE.SphereGeometry(c.kind === 'blackhole' ? 0.06 : c.kind === 'galaxy' ? 0.05 : 0.028, 8, 8),
            new THREE.MeshBasicMaterial({
              color: col,
              transparent: true,
              opacity: c.kind === 'blackhole' ? 0.95 : 0.75,
            }),
          );
          m.userData = { cosmosId: c.id, name: c.name };
          g.add(m);
          this._markers.set(c.id, m);
        }
        const ra = c.ra != null ? c.ra : (i * 0.7) % 24;
        const dec = c.dec != null ? c.dec : ((i * 17) % 140) - 70;
        const r = c.distLy != null ? Math.min(radius * 0.95, 2.5 + Math.log10(1 + c.distLy) * 0.35) : radius * 0.7;
        const v = raDecToVec(ra, dec, r);
        m.position.copy(v);
        m.visible = showDeep || !!c.sciFi;
      });

      for (const [id, m] of this._markers) {
        if (!keep.has(id)) {
          g.remove(m);
          this._markers.delete(id);
        }
      }
    },

    async flyTo(ref) {
      const c = typeof ref === 'string' ? this.resolve(ref) || this.get(ref) : ref;
      if (!c) {
        this._toast('Unknown destination — try Jupiter, Orion, Sgr A*, Hyperspace…');
        return false;
      }
      this._focusId = c.id;
      if (window.SpaceNetSpatial) {
        window.SpaceNetSpatial._focusBody = c.body || c.id;
      }

      const tierId = c.tier || 'galactic';
      try {
        window.ZoomTiers?.goTo?.(tierId, true);
      } catch (_) {}

      // Sol bodies → solar group / planet mesh
      if (c.realm === 'sol' || c.body === 'earth') {
        if (c.body === 'earth' || c.id === 'sol-earth') {
          try {
            window.ZoomTiers?.goTo?.('global', true);
            window.CosmicZoom?.update?.(window.camera?.position?.z, { cosmic: 'earth', label: 'EARTH' });
          } catch (_) {}
          this._toast('Earth · SpaceNet ground layer');
          this.openCard(c);
          return true;
        }
        try {
          this._ensureCosmicBodies();
          window.CosmicZoom?.update?.(5.2, { cosmic: 'orbit', label: (c.name || '').toUpperCase() });
          const mars = (window.CosmicZoom?.planets || []).find(
            (m) => m.userData?.name === c.name || m.userData?.spacenetId === c.id || m.userData?.body === c.body,
          );
          if (mars && typeof window.flyToPoint === 'function') {
            const wp = new THREE.Vector3();
            mars.getWorldPosition(wp);
            if (wp.lengthSq() < 0.01) {
              // place at orbital radius if not yet animated
              wp.set(c.dist || 2, 0.1, 0);
            }
            window.flyToPoint(wp.clone().multiplyScalar(1.2), c.tier === 'orbit' ? 5.2 : 4.5, { dur: 2600 });
          } else if (window.camera) {
            window.camera.position.z = 5.2;
          }
        } catch (_) {}
        // Special: Mars Cydonia spatial seed
        if (c.body === 'mars' && window.SpaceNetSpatial?.flyTo) {
          setTimeout(() => SpaceNetSpatial.flyTo('seed-cydonia-music'), 400);
        }
        this._toast((c.emoji || '') + ' ' + c.name + ' · Sol');
        this.openCard(c);
        return true;
      }

      // Deep sky / dimensions — galactic or galaxy tier + RA/Dec vector
      try {
        const z = tierId === 'galaxy' ? 16 : tierId === 'galactic' ? 7.2 : 5.2;
        window.CosmicZoom?.update?.(z, {
          cosmic: tierId === 'orbit' ? 'orbit' : tierId === 'galaxy' ? 'galaxy' : 'galactic',
          label: (c.name || 'COSMOS').toUpperCase().slice(0, 18),
        });
        if (window.camera) window.camera.position.z = z;
        this.syncMarkers();
        const m = this._markers.get(c.id);
        if (m && typeof window.flyToPoint === 'function') {
          const wp = new THREE.Vector3();
          m.getWorldPosition(wp);
          window.flyToPoint(wp.clone().multiplyScalar(1.05), z * 0.92, { dur: 2800 });
        }
      } catch (_) {}

      this._toast((c.emoji || '◎') + ' ' + c.name + (c.sciFi ? ' · sci‑fi dimension' : ''));
      this.openCard(c);
      return true;
    },

    openCard(c) {
      const panel = document.getElementById('spacenet-cosmos-panel');
      if (!panel) return;
      panel.classList.add('open');
      panel.hidden = false;
      const title = document.getElementById('snc-title');
      const sub = document.getElementById('snc-sub');
      const body = document.getElementById('snc-body');
      const actions = document.getElementById('snc-actions');
      if (title) title.textContent = (c.emoji || '◎') + ' ' + c.name;
      if (sub) {
        sub.textContent =
          (c.realm || c.kind || '') +
          ' · ' +
          (c.kind || '') +
          (c.distLy != null ? ' · ~' + this._fmtLy(c.distLy) + ' ly' : '') +
          (c.sciFi ? ' · sci‑fi layer' : ' · catalogued');
      }
      if (body) {
        body.innerHTML =
          '<p class="snc-note">' +
          this._esc(c.desc || 'SpaceNet destination') +
          '</p>' +
          '<p class="snc-note">Body id: <code>' +
          this._esc(c.body || c.id) +
          '</code> — drop files here with Talk: put notes on ' +
          this._esc(c.name) +
          '</p>';
      }
      if (actions) {
        actions.innerHTML = '';
        const add = (label, fn) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.onclick = (e) => {
            e.stopPropagation();
            fn();
          };
          actions.appendChild(b);
        };
        add('Fly again', () => void this.flyTo(c.id));
        add('Drop file here', () => {
          const name = window.prompt('File name at ' + c.name, 'beacon.txt');
          if (!name) return;
          window.SpaceNetSpatial?.put?.({
            body: c.body || c.id,
            lat: c.dec != null ? c.dec : 0,
            lng: c.ra != null ? c.ra * 15 - 180 : 0,
            kind: 'file',
            name,
            title: name + ' · ' + c.name,
            description: 'Placed on ' + c.name,
            payload: { text: name + '\n\nAddress: ' + c.id + '\n' + (c.desc || '') },
            visibilityKm: 1e9,
            minZ: c.tier === 'galaxy' ? 12 : c.tier === 'galactic' ? 6 : 4,
          });
          this._toast('Placed on ' + c.name);
        });
        add('Close', () => this.closeBrowser());
      }
    },

    showBrowser(filter) {
      this.init();
      const panel = document.getElementById('spacenet-cosmos-panel');
      if (!panel) return;
      panel.classList.add('open');
      panel.hidden = false;
      const title = document.getElementById('snc-title');
      const sub = document.getElementById('snc-sub');
      const body = document.getElementById('snc-body');
      const actions = document.getElementById('snc-actions');
      const list = this.list(filter || 'all');
      if (title) title.textContent = '◎ SpaceNet Cosmos — all destinations';
      if (sub) {
        sub.textContent =
          list.length +
          ' places · Sol · black holes · constellations · exo · galaxies · dimensions';
      }
      if (body) {
        const groups = ['sol', 'blackhole', 'constellation', 'exo', 'galaxy', 'dimension'];
        let html = '<div class="snc-filters">';
        ['all', 'sol', 'blackholes', 'constellation', 'exo', 'galaxy', 'scifi'].forEach((f) => {
          html +=
            '<button type="button" class="snc-chip" data-f="' +
            f +
            '">' +
            f +
            '</button>';
        });
        html += '</div>';
        groups.forEach((realm) => {
          const rows = list.filter((c) => c.realm === realm);
          if (!rows.length) return;
          html += '<div class="snc-realm">' + realm.toUpperCase() + '</div>';
          rows.forEach((c) => {
            html +=
              '<button type="button" class="snc-row" data-cid="' +
              this._esc(c.id) +
              '"><span>' +
              (c.emoji || '◎') +
              ' <b>' +
              this._esc(c.name) +
              '</b></span><small>' +
              this._esc(c.kind + (c.sciFi ? ' · sci‑fi' : '')) +
              '</small></button>';
          });
        });
        body.innerHTML = html;
        body.querySelectorAll('[data-cid]').forEach((btn) => {
          btn.onclick = () => void this.flyTo(btn.dataset.cid);
        });
        body.querySelectorAll('[data-f]').forEach((btn) => {
          btn.onclick = () => this.showBrowser(btn.dataset.f);
        });
      }
      if (actions) {
        actions.innerHTML = '';
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Close';
        b.onclick = () => this.closeBrowser();
        actions.appendChild(b);
      }
    },

    closeBrowser() {
      const panel = document.getElementById('spacenet-cosmos-panel');
      if (panel) {
        panel.classList.remove('open');
        panel.hidden = true;
      }
    },

    handleTalk(line) {
      const t = String(line || '').trim();
      if (!t) return { handled: false };
      const low = t.toLowerCase();

      if (/^(cosmos|destinations|atlas|all\s*space|universe)\b/i.test(low)) {
        this.showBrowser('all');
        return { handled: true, action: 'cosmos' };
      }

      const go = t.match(
        /^(?:go\s*to|fly\s*to|zoom\s*to|open|visit|warp\s*to|jump\s*to)\s+(.+)$/i,
      );
      if (go) {
        const dest = go[1].trim();
        const c = this.resolve(dest);
        if (c) {
          void this.flyTo(c);
          return { handled: true, action: 'fly' };
        }
      }

      // bare names of major destinations
      const bare = this.resolve(low.replace(/^(the|a|an)\s+/, ''));
      if (
        bare &&
        /^(jupiter|saturn|mars|venus|mercury|neptune|uranus|pluto|orion|hyperspace|subspace|wormhole|andromeda|proxima|trappist|sgr|sagittarius|black\s*hole|void|mirror|moon|iss)\b/i.test(
          low,
        )
      ) {
        void this.flyTo(bare);
        return { handled: true, action: 'fly' };
      }

      // put X on <cosmos name> (non-Earth garage phrases stay with SpaceNetSpatial)
      const put = t.match(/^(?:put|hide|leave|drop|place)\s+(.+?)\s+(?:on|at|in)\s+(.+)$/i);
      if (put) {
        const thing = put[1].trim();
        const where = put[2].trim();
        if (!/garage|here|this\s*spot|my\s*location/i.test(where)) {
          const c = this.resolve(where);
          if (c && !(c.body === 'earth' && /earth|home/i.test(where) && !/mars|jupiter|moon/i.test(where))) {
            if (c.body !== 'earth' || c.realm !== 'sol' || /mars|jupiter|saturn|europa|titan|moon|luna|pluto|neptune|uranus|mercury|venus/i.test(where)) {
              window.SpaceNetSpatial?.put?.({
                body: c.body || c.id,
                lat: c.dec != null ? c.dec : 0,
                lng: c.ra != null ? c.ra * 15 - 180 : 0,
                kind: /folder|album|playlist/i.test(thing) ? 'folder' : 'file',
                name: thing.slice(0, 60),
                title: thing + ' · ' + c.name,
                description: 'On ' + c.name,
                payload: { text: thing + '\n@' + c.id },
                visibilityKm: 1e12,
                minZ: 5,
              });
              void this.flyTo(c);
              this._toast('Placed on ' + c.name);
              return { handled: true, action: 'put-cosmos' };
            }
          }
        }
      }

      return { handled: false };
    },

    _fmtLy(n) {
      if (n < 1000) return String(Math.round(n));
      if (n < 1e6) return (n / 1000).toFixed(1) + 'k';
      if (n < 1e9) return (n / 1e6).toFixed(1) + 'M';
      return (n / 1e9).toFixed(1) + 'G';
    },

    _esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    _toast(msg) {
      try {
        window.SpaceNetShell?.setStatus?.(msg);
        window.AciCli?.print?.('cosmos · ' + msg, 'ok');
        window.GlobeDeck?.setPreview?.(msg);
      } catch (_) {}
    },

    _injectCss() {
      if (document.getElementById('spacenet-cosmos-css')) return;
      const s = document.createElement('style');
      s.id = 'spacenet-cosmos-css';
      s.textContent = [
        '#spacenet-cosmos-panel{display:none;position:fixed;left:50%;top:48%;transform:translate(-50%,-50%);',
        'z-index:201;width:min(440px,96vw);max-height:min(82vh,620px);flex-direction:column;',
        'background:rgba(0,6,18,0.95);border:1px solid rgba(120,160,255,0.45);border-radius:16px;',
        'box-shadow:0 16px 48px rgba(0,0,0,0.65),0 0 28px rgba(80,120,255,0.25);color:#cfe0ff;',
        'font:12px/1.4 system-ui,sans-serif;overflow:hidden}',
        '#spacenet-cosmos-panel.open{display:flex}',
        '#spacenet-cosmos-panel header{padding:12px 14px 8px;border-bottom:1px solid rgba(100,140,220,0.25)}',
        '#snc-title{font-weight:700;font-size:14px;color:#a8c8ff}',
        '#snc-sub{font-size:10px;color:#7a90b0;margin-top:4px}',
        '#snc-body{flex:1;overflow:auto;padding:8px 10px}',
        '.snc-filters{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}',
        '.snc-chip{font-size:10px;padding:4px 8px;border-radius:999px;border:1px solid rgba(100,140,220,0.4);',
        'background:rgba(20,40,80,0.6);color:#9eb8e0;cursor:pointer}',
        '.snc-realm{font-size:10px;font-weight:700;color:#6a8ec0;margin:10px 0 4px;letter-spacing:0.06em}',
        '.snc-row{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:8px 10px;margin-bottom:4px;',
        'border-radius:10px;border:1px solid rgba(80,120,200,0.28);background:rgba(8,20,48,0.55);color:inherit;cursor:pointer}',
        '.snc-row:hover{border-color:#6af}',
        '.snc-row small{color:#7a90b0;font-size:10px}',
        '.snc-note{color:#9aafc8;margin:0 0 8px}',
        '#snc-actions{display:flex;flex-wrap:wrap;gap:6px;padding:10px;border-top:1px solid rgba(100,140,220,0.25)}',
        '#snc-actions button{flex:1;min-width:90px;padding:9px;border-radius:10px;border:1px solid rgba(100,140,220,0.4);',
        'background:rgba(20,48,100,0.75);color:#cfe0ff;font-weight:600;cursor:pointer}',
      ].join('');
      document.head.appendChild(s);
    },

    _injectUi() {
      if (document.getElementById('spacenet-cosmos-panel')) return;
      const el = document.createElement('div');
      el.id = 'spacenet-cosmos-panel';
      el.hidden = true;
      el.setAttribute('role', 'dialog');
      el.innerHTML =
        '<header><div id="snc-title">Cosmos</div><div id="snc-sub"></div></header>' +
        '<div id="snc-body"></div><div id="snc-actions"></div>';
      document.body.appendChild(el);
    },
  };

  window.SpaceNetCosmos = SpaceNetCosmos;
  window.SpaceNetCosmosLaw = SpaceNetCosmos.LAW;

  function boot() {
    try {
      SpaceNetCosmos.init();
    } catch (e) {
      console.error('[SpaceNetCosmos]', e);
    }
  }
  if (document.readyState === 'complete') setTimeout(boot, 1100);
  else window.addEventListener('load', () => setTimeout(boot, 1100));
  setTimeout(boot, 3200);
})();
