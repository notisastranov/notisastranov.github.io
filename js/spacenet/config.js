/* SpaceNet public config — anon key is designed for client use */
(function (g) {
  'use strict';
  /**
   * Auth branding law (owner 2026-07-30): users sign in to ASTRANOV / astranov.eu only.
   * Never present raw project-ref.supabase.co as product identity.
   * Preferred path: Google GIS + signInWithIdToken (auth.js).
   * Custom domain api.astranov.eu must be active for full OAuth host branding.
   */
  g.SN_CONFIG = {
    build: (document.querySelector('meta[name="astranov-build"]') || {}).content || '0',
    sbUrl: 'https://lkoatrkhuigdolnjsbie.supabase.co',
    sbKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2F0cmtodWlnZG9sbmpzYmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODIwOTIsImV4cCI6MjA5NDQ1ODA5Mn0.qf6Kg93YLJ0coTdVQa4baU0ppOdFY5WkmVzMvEV6ejI',
    live: 'https://astranov.eu',
    /**
     * Google OAuth Web client (GIS). Must match Google Cloud Credentials client.
     * Error "no registered origin" / invalid_client = this origin missing on THIS client.
     * Override here if you create a new Web client, then redeploy.
     */
    googleClientId:
      '73846897360-va7gcqngfc370gfp7rl059no0vd4ts11.apps.googleusercontent.com',
    /**
     * Auth branding law: Google must show ASTRANOV / astranov.eu only.
     * preferCustomAuth: true only when api.astranov.eu health is green (auth auto-probes).
     * Login path is Google GIS + id_token on this origin — never OAuth redirect via *.supabase.co.
     */
    preferCustomAuth: false,
    authHost: 'https://api.astranov.eu',


    brand: {
      name: 'ASTRANOV',
      domain: 'astranov.eu',
      site: 'https://astranov.eu',
      privacy: 'https://astranov.eu/privacy.html',
      terms: 'https://astranov.eu/terms.html',
      architect: 'Astranov',
      ai: 'Astranov',
      system: 'ASTRANOV',
      authHost: 'https://api.astranov.eu',
    },
    /**
     * Map / Google Earth / Google Places (Business Profile data)
     * Free basemaps work with no keys.
     * For photos · hours · phone · website · ratings on vendor tiles:
     * 1) Google Cloud → enable Maps JavaScript API + Places API + Elevation (+ billing)
     * 2) Restrict key to https://astranov.eu/*
     * 3) Uncomment googleMapsKey below
     * Note: Google does not publish full dish menus for most shops — we show price-band order slots in S.
     */
    layers: {
      // googleMapsKey: 'AIza…',
      // googleMapId: '…',
      // googleTiles: 'https://…{z}/{x}/{y}…',  // alternate tile template
      // w3wKey: 'your-what3words-api-key',
    },
    /**
     * Street routing (OSRM)
     * 1) osrmBase — your self-hosted OSRM (https://osrm.astranov.eu) when VPS is up
     * 2) useGateway — Supabase edge osrm-route (set secret OSRM_URL to same host)
     * 3) publicFallback — router.project-osrm.org
     * See deploy/osrm/README.md
     */
    routing: {
      osrmBase: '', // e.g. 'https://osrm.astranov.eu'
      useGateway: true,
      publicFallback: 'https://router.project-osrm.org',
      profile: 'driving',
      timeoutMs: 10000,
    },
  };
  g.SB_URL = g.SN_CONFIG.sbUrl;
  g.SB_KEY = g.SN_CONFIG.sbKey;
})(window);
