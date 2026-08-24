import * as THREE from "three";

const canvas = document.getElementById("g");
const listEl = document.getElementById("list");
const goEl = document.getElementById("go");
const form = document.getElementById("f");
const input = document.getElementById("in");
const lineEl = document.getElementById("line");

const CUISINE = { pizza: 1, burger: 1, coffee: 1, sushi: 1, kebab: 1, tacos: 1 };
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

let here = null;
let vendors = [];
let selected = null;
let look = null;
const pins = [];

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050608);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(0, 0.35, 2.55);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

function grid() {
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
  const mat = new THREE.LineBasicMaterial({ color: 0x9ec8e8, transparent: true, opacity: 0.42 });
  scene.add(new THREE.LineSegments(geo, mat));
}
grid();

const pinGroup = new THREE.Group();
scene.add(pinGroup);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
resize();
addEventListener("resize", resize);

let dragging = false;
let lx = 0;
let ly = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lx = e.clientX;
  ly = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", () => {
  dragging = false;
});
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
});

function setPins(rows) {
  while (pinGroup.children.length) pinGroup.remove(pinGroup.children[0]);
  pins.length = 0;
  if (here) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xdfe6ee }),
    );
    m.position.copy(latLngToVec(here.lat, here.lng, 1.02));
    pinGroup.add(m);
  }
  rows.forEach((v) => {
    const on = v.id === selected;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(on ? 0.016 : 0.01, 10, 10),
      new THREE.MeshBasicMaterial({ color: on ? 0xf2f4f7 : 0x9ec8e8 }),
    );
    m.position.copy(latLngToVec(v.lat, v.lng, 1.025));
    pinGroup.add(m);
    pins.push(m);
  });
}

function flyTo(lat, lng) {
  look = latLngToVec(lat, lng, 2.55);
}

function tick() {
  if (look) {
    camera.position.lerp(look, 0.08);
    camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(look) < 0.04) look = null;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (p) => {
      here = { lat: p.coords.latitude, lng: p.coords.longitude, name: "" };
      setPins(vendors);
    },
    () => {},
    { maximumAge: 600000, timeout: 8000 },
  );
}

async function geocode(q) {
  try {
    const r = await fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=1", {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const f = j.features && j.features[0];
    const c = f && f.geometry && f.geometry.coordinates;
    if (!c) return null;
    return { lng: c[0], lat: c[1], name: (f.properties && (f.properties.name || f.properties.city)) || q };
  } catch {
    return null;
  }
}

async function overpass(product, city) {
  const amenity = product === "coffee" ? "cafe" : "restaurant";
  const q = `[out:json][timeout:10];(nwr["amenity"="${amenity}"]["cuisine"~"${product}",i](around:7000,${city.lat},${city.lng});nwr["amenity"="fast_food"]["name"~"${product}",i](around:7000,${city.lat},${city.lng});nwr["amenity"="restaurant"]["name"~"${product}",i](around:7000,${city.lat},${city.lng}););out center 20;`;
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const seen = new Set();
      const out = [];
      for (const el of j.elements || []) {
        const lat = el.lat ?? (el.center && el.center.lat);
        const lng = el.lon ?? (el.center && el.center.lon);
        const name = el.tags && el.tags.name && el.tags.name.trim();
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
          km: Math.round(km(city, { lat, lng }) * 10) / 10,
        });
      }
      out.sort((a, b) => a.km - b.km);
      if (out.length) return out.slice(0, 16);
    } catch {
      /* next */
    }
  }
  return [];
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
    s.textContent = v.km + " km · €" + v.price;
    b.append(n, s);
    b.onclick = () => {
      selected = v.id;
      flyTo(v.lat, v.lng);
      renderList();
    };
    listEl.appendChild(b);
  });
  goEl.style.display = vendors.length ? "block" : "none";
  goEl.textContent = selected ? "Order" : "Order";
}

goEl.onclick = () => {
  const v = vendors.find((x) => x.id === selected) || vendors[0];
  if (!v) return;
  say(v.name + " · €" + v.price);
};

const runtime = { commands: new Map() };
const kernel = {
  hunt: (p, c) => hunt(c ? p + " " + c : p),
  command: (name, fn) => runtime.commands.set(String(name).toLowerCase(), fn),
  css: (t) => {
    let s = document.getElementById("kcss");
    if (!s) {
      s = document.createElement("style");
      s.id = "kcss";
      document.head.appendChild(s);
    }
    s.textContent += t;
  },
  log: say,
};

function applyCode(code) {
  new Function("kernel", '"use strict";\n' + code)(kernel);
}

async function hunt(raw) {
  const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return;
  const word = parts[0];
  const kcmd = runtime.commands.get(word);
  if (kcmd) {
    await kcmd(raw);
    return;
  }
  let city = here;
  let product = word;
  if (parts.length > 1) {
    const place = parts.slice(1).join(" ");
    const g = await geocode(place);
    if (g) {
      city = g;
      product = parts[0];
      flyTo(g.lat, g.lng);
    }
  }
  if (!CUISINE[product]) {
    const g = await geocode(raw);
    if (g) {
      flyTo(g.lat, g.lng);
      return;
    }
    product = "pizza";
  }
  if (!city) return;
  flyTo(city.lat, city.lng);
  say("…");
  vendors = await overpass(product, city);
  selected = vendors[0] ? vendors[0].id : null;
  setPins(vendors);
  renderList();
  say("");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const t = input.value.trim();
  input.value = "";
  input.blur();
  if (t) hunt(t);
});

window.SN = { kernel, applyCode, hunt };
