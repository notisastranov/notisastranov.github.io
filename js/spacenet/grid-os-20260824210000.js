import * as THREE from "three";

const canvas = document.getElementById("g");
const cityEl = document.getElementById("city");
const listEl = document.getElementById("list");
const lineEl = document.getElementById("line");
const form = document.getElementById("f");
const input = document.getElementById("in");
const orderBtn = document.getElementById("order");
const callBtn = document.getElementById("call");
const hailBtn = document.getElementById("hail");
const meBtn = document.getElementById("me");
const mapBtn = document.getElementById("mapbtn");

const CUISINE = { pizza: 1, burger: 1, coffee: 1, sushi: 1, kebab: 1, tacos: 1, food: 1 };
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

let here = null;
let vendors = [];
let selected = null;
let look = null;
let dist = 2.55;
let mapOn = false;
let leaflet = null;
let busy = false;
const history = [];
const missions = [];
const calls = [];
const pinGroup = new THREE.Group();
const arcGroup = new THREE.Group();

function say(t) {
  lineEl.textContent = t || "";
}

function latLngToVec(lat, lng, r = 1) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function km(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function curve(from, to) {
  const a = latLngToVec(from.lat, from.lng, 1.02);
  const b = latLngToVec(to.lat, to.lng, 1.02);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.normalize().multiplyScalar(1.22);
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050608);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(0, 0.35, dist);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
scene.add(pinGroup);
scene.add(arcGroup);

(function grid() {
  const pos = [];
  for (let lng = -180; lng < 180; lng += 15) {
    for (let lat = -90; lat < 90; lat += 5) {
      const a = latLngToVec(lat, lng);
      const b = latLngToVec(lat + 5, lng);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lng = -180; lng < 180; lng += 5) {
      const a = latLngToVec(lat, lng);
      const b = latLngToVec(lat, lng + 5);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9ec8e8, transparent: true, opacity: 0.42 })));
})();

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  if (leaflet) leaflet.invalidateSize();
}
resize();
addEventListener("resize", resize);

let dragging = false, lx = 0, ly = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lx = e.clientX;
  ly = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lx;
  const dy = e.clientY - ly;
  lx = e.clientX;
  ly = e.clientY;
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.005);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.005);
  camera.position.applyQuaternion(qy).applyQuaternion(qx);
  camera.up.applyQuaternion(qy).applyQuaternion(qx);
  camera.lookAt(0, 0, 0);
  dist = camera.position.length();
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  dist = Math.min(6.5, Math.max(1.18, dist * (e.deltaY > 0 ? 1.08 : 0.92)));
  camera.position.setLength(dist);
}, { passive: false });

let pinch0 = 0;
canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    const a = e.touches[0], b = e.touches[1];
    pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
}, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length !== 2 || !pinch0) return;
  const a = e.touches[0], b = e.touches[1];
  const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  dist = Math.min(6.5, Math.max(1.18, dist * (pinch0 / d)));
  camera.position.setLength(dist);
  pinch0 = d;
}, { passive: true });

function flyTo(lat, lng, r) {
  look = latLngToVec(lat, lng, r || dist);
}

function setPins() {
  while (pinGroup.children.length) pinGroup.remove(pinGroup.children[0]);
  if (here) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), new THREE.MeshBasicMaterial({ color: 0xdfe6ee }));
    m.position.copy(latLngToVec(here.lat, here.lng, 1.02));
    pinGroup.add(m);
  }
  vendors.forEach((v) => {
    const on = v.id === selected;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(on ? 0.016 : 0.01, 10, 10),
      new THREE.MeshBasicMaterial({ color: on ? 0xf2f4f7 : 0x9ec8e8 }),
    );
    m.position.copy(latLngToVec(v.lat, v.lng, 1.025));
    pinGroup.add(m);
  });
}

function drawArcs() {
  while (arcGroup.children.length) arcGroup.remove(arcGroup.children[0]);
  const items = [...missions, ...calls];
  items.forEach((m) => {
    const c = curve(m.from, m.to);
    const pts = c.getPoints(40);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const color = m.kind === "call" ? 0xb8c4d4 : 0x9ec8e8;
    arcGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), new THREE.MeshBasicMaterial({ color: 0xf2f4f7 }));
    ball.userData = { curve: c, mission: m };
    arcGroup.add(ball);
  });
}

function tick() {
  if (look) {
    camera.position.lerp(look, 0.09);
    camera.lookAt(0, 0, 0);
    dist = camera.position.length();
    if (camera.position.distanceTo(look) < 0.035) look = null;
  }
  missions.forEach((m) => {
    if (m.status !== "live") return;
    m.progress = Math.min(1, m.progress + 0.004);
    if (m.progress >= 1) m.status = "done";
  });
  calls.forEach((m) => {
    m.progress = (m.progress + 0.01) % 1;
  });
  arcGroup.children.forEach((ch) => {
    if (!ch.userData.curve) return;
    const m = ch.userData.mission;
    ch.position.copy(ch.userData.curve.getPoint(m.progress));
    ch.visible = m.kind === "call" || m.status === "live";
  });
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

function sel() {
  return vendors.find((v) => v.id === selected) || vendors[0] || null;
}

function renderList() {
  listEl.innerHTML = "";
  vendors.forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    if (v.id === selected) b.className = "on";
    const n = document.createElement("b");
    n.textContent = v.name;
    const s = document.createElement("span");
    s.textContent = v.km.toFixed(1) + " km · €" + v.price;
    b.append(n, s);
    b.onclick = () => {
      selected = v.id;
      flyTo(v.lat, v.lng, 1.35);
      renderList();
      syncMap();
    };
    listEl.appendChild(b);
  });
  const v = sel();
  orderBtn.disabled = !v;
  callBtn.disabled = !v;
  hailBtn.disabled = !v;
}

function syncMap() {
  if (!leaflet || !mapOn) return;
  leaflet.eachLayer((l) => {
    if (l instanceof L.CircleMarker || l instanceof L.Marker) leaflet.removeLayer(l);
  });
  if (here) {
    L.circleMarker([here.lat, here.lng], { radius: 8, color: "#dfe6ee", fillColor: "#dfe6ee", fillOpacity: 1 }).addTo(leaflet);
    leaflet.setView([here.lat, here.lng], Math.max(leaflet.getZoom(), 14));
  }
  vendors.forEach((v) => {
    const m = L.circleMarker([v.lat, v.lng], {
      radius: v.id === selected ? 9 : 6,
      color: v.id === selected ? "#f2f4f7" : "#9ec8e8",
      fillColor: v.id === selected ? "#f2f4f7" : "#9ec8e8",
      fillOpacity: 0.95,
    }).addTo(leaflet);
    m.on("click", () => {
      selected = v.id;
      flyTo(v.lat, v.lng, 1.35);
      renderList();
      syncMap();
    });
  });
  missions.filter((m) => m.status === "live").forEach((m) => {
    L.polyline([[m.from.lat, m.from.lng], [m.to.lat, m.to.lng]], { color: "#9ec8e8", weight: 3 }).addTo(leaflet);
  });
}

function openMap() {
  mapOn = !mapOn;
  cityEl.classList.toggle("on", mapOn);
  mapBtn.textContent = mapOn ? "GLOBE" : "MAP";
  if (!mapOn) return;
  const c = here || sel() || { lat: 0, lng: 0 };
  if (!leaflet) {
    leaflet = L.map(cityEl, { zoomControl: true, attributionControl: false }).setView([c.lat, c.lng], 14);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(leaflet);
  } else {
    leaflet.setView([c.lat, c.lng], 14);
    leaflet.invalidateSize();
  }
  syncMap();
}

async function geocode(q) {
  try {
    const r = await fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=1", { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = await r.json();
    const f = j.features && j.features[0];
    const c = f && f.geometry && f.geometry.coordinates;
    if (!c) return null;
    const p = f.properties || {};
    return { lng: c[0], lat: c[1], name: p.name || p.city || q };
  } catch {
    return null;
  }
}

async function overpass(product, city) {
  const amenity = product === "coffee" ? "cafe" : "restaurant";
  const q = `[out:json][timeout:12];(
    nwr["amenity"="${amenity}"]["cuisine"~"${product}",i](around:8000,${city.lat},${city.lng});
    nwr["amenity"="fast_food"]["name"~"${product}",i](around:8000,${city.lat},${city.lng});
    nwr["amenity"="restaurant"]["name"~"${product}",i](around:8000,${city.lat},${city.lng});
    nwr["amenity"="cafe"](around:5000,${city.lat},${city.lng});
  );out center 30;`;
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const seen = new Set();
      const out = [];
      for (const el of j.elements || []) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        const tags = el.tags || {};
        const name = (tags.name || "").trim();
        if (lat == null || lng == null || !name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: String(el.id),
          name,
          lat,
          lng,
          product,
          price: 12,
          km: km(city, { lat, lng }),
          phone: tags.phone || tags["contact:phone"] || "",
          website: tags.website || tags["contact:website"] || "",
        });
      }
      out.sort((a, b) => a.km - b.km);
      if (out.length) return out.slice(0, 20);
    } catch { /* next */ }
  }
  return [];
}

async function huntAround(product, city) {
  if (!city) return;
  flyTo(city.lat, city.lng, 1.45);
  say("…");
  vendors = await overpass(product || "pizza", city);
  selected = vendors[0]?.id || null;
  setPins();
  renderList();
  syncMap();
  say(vendors.length ? vendors.length + " · " + (city.name || "") : "");
}

function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        here = { lat: p.coords.latitude, lng: p.coords.longitude, name: "" };
        setPins();
        flyTo(here.lat, here.lng, 1.4);
        resolve(here);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

function orderVendor(v) {
  if (!v) return;
  const dest = here || v;
  const mission = {
    id: "o" + Date.now(),
    kind: "order",
    label: v.name + " · €" + v.price,
    from: { lat: v.lat, lng: v.lng, name: v.name },
    to: dest,
    status: "live",
    progress: 0,
  };
  missions.unshift(mission);
  if (missions.length > 8) missions.pop();
  drawArcs();
  flyTo(v.lat, v.lng, 1.35);
  say(mission.label);
  if (!mapOn) openMap();
  else syncMap();
}

function hailVendor(v, ring) {
  if (!v) return;
  const from = here || v;
  const call = {
    id: "c" + Date.now(),
    kind: "call",
    from,
    to: { lat: v.lat, lng: v.lng, name: v.name },
    status: "live",
    progress: 0,
  };
  calls.unshift(call);
  if (calls.length > 6) calls.pop();
  drawArcs();
  flyTo(v.lat, v.lng, 1.3);
  if (ring && v.phone) location.href = "tel:" + v.phone.replace(/\s+/g, "");
  say(v.name + (v.phone ? " · " + v.phone : ""));
}

async function grok(msg) {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: msg,
      history: history.slice(-8),
      gift: true,
      allow_paid: true,
      force_paid: true,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return String(j.text || j.error || "").trim();
}

async function run(raw) {
  const t = raw.trim();
  if (!t || busy) return;
  const low = t.toLowerCase();
  if (/^(me|locate|here|gps)$/.test(low)) {
    const p = await locate();
    if (p) await huntAround("pizza", p);
    else say("");
    return;
  }
  if (/^map$/.test(low)) {
    openMap();
    return;
  }
  if (/^globe$/.test(low) && mapOn) {
    openMap();
    return;
  }
  if (/^order\b/.test(low)) {
    orderVendor(sel());
    return;
  }
  if (/^call\b/.test(low)) {
    hailVendor(sel(), true);
    return;
  }
  if (/^hail\b/.test(low)) {
    hailVendor(sel(), false);
    return;
  }

  const parts = low.split(/\s+/).filter(Boolean);
  let product = parts[0];
  let city = here;
  if (CUISINE[product]) {
    if (parts.length > 1) {
      const g = await geocode(parts.slice(1).join(" "));
      if (g) city = g;
    }
    if (!city) city = await locate();
    if (city) await huntAround(product === "food" ? "pizza" : product, city);
    return;
  }
  if (/^(go|in|near|around)\s+/.test(low)) {
    const place = low.replace(/^(go|in|near|around)\s+/, "");
    const g = await geocode(place);
    if (g) {
      flyTo(g.lat, g.lng, 1.45);
      await huntAround("pizza", g);
      return;
    }
  }

  busy = true;
  say("…");
  try {
    history.push({ role: "user", content: t });
    const text = await grok(t);
    if (text) {
      history.push({ role: "assistant", content: text });
      say(text);
    } else say("");
  } catch {
    say("");
  } finally {
    busy = false;
  }
}

orderBtn.onclick = () => orderVendor(sel());
callBtn.onclick = () => hailVendor(sel(), true);
hailBtn.onclick = () => hailVendor(sel(), false);
meBtn.onclick = () => run("me");
mapBtn.onclick = () => openMap();
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const t = input.value.trim();
  input.value = "";
  input.blur();
  if (t) run(t);
});

(async function boot() {
  const p = await locate();
  if (p) await huntAround("pizza", p);
})();
