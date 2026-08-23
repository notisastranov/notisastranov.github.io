// === MAP PLACE MENU — tap globe/map · plus field · classified triangles ===
const MapPlaceMenu = {
  _pin: null,

  formatCoords(lat, lng) {
    return Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4);
  },

  pointFromGlobeHit(point) {
    const dir = point.clone().normalize();
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI;
    let lng = Math.atan2(dir.z, -dir.x) * 180 / Math.PI - 180;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    return { lat, lng };
  },

  openPlusField() {
    // + field → multi-tile (unified profile / vendor / driver / post)
    if (window.MultiTile?.openFromPlus) {
      MultiTile.openFromPlus();
      return;
    }
    const pos = window._lastPos || CityMap?.globeCenterLatLng?.() || TrackballGuard?.facingLatLng?.() || { lat: 36.44, lng: 28.22 };
    this.openAt(pos.lat, pos.lng, { source: 'Plus field', hint: 'Type what you want to do — AI shows top 3', focusIntent: true });
  },

  _showPlaceMenu(show) {
    const place = document.getElementById('ge-hud-place-menu');
    const entityRow = document.getElementById('ge-hud-row');
    if (place) place.classList.toggle('open', !!show);
    if (entityRow) entityRow.style.display = show ? 'none' : '';
  },

  openAt(lat, lng, opts) {
    opts = opts || {};
    if (lat == null || lng == null) return;
    // Default: stop camera so menu feels settled. keepFly: national-entry path is mid-flight.
    if (!opts.keepFly) window._globeFly = null;
    GlobeEntity?.clearSelection?.();
    this._pin = { lat, lng, entity: opts.entity || null, limited: !!opts.limited };
    const hud = document.getElementById('globe-entity-hud');
    if (!hud) return;
    hud.classList.add('open');
    this._showPlaceMenu(true);
    document.getElementById('ge-hud-type').textContent = '▸ ' + (opts.source || 'Map');
    document.getElementById('ge-hud-title').textContent = opts.label || this.formatCoords(lat, lng);
    document.getElementById('ge-hud-desc').textContent = opts.hint || 'Type what you want to do — top 3 triangle options';
    const intent = document.getElementById('ge-hud-intent');
    if (intent) {
      intent.value = opts.prefill || '';
      if (opts.focusIntent) setTimeout(() => intent.focus(), 80);
    }
    const limited = !!opts.limited;
    const ranked = limited
      ? ClassifiedTriangles._contextTop3(this._pin)
      : ClassifiedTriangles.defaultTop3().concat(ClassifiedTriangles.defaultMore());
    if (opts?.entity?.type === 'vendor') {
      const order = ClassifiedTriangles.CATALOG.find(c => c.id === 'order');
      if (order && !limited) ranked.unshift(order);
    }
    ClassifiedTriangles.render(ranked.slice(0, 3), limited ? [] : ranked.slice(3), this._pin, { limited });
    void SpaceNetBrain?.crawlArea?.(lat, lng, 2);
    MapDepict?.pulse?.(lat, lng, 0x00ddff, opts.label || 'here', 8000);
    GlobeDeck?.setPreview?.('▸ Plus field · ' + (opts.label || this.formatCoords(lat, lng)));
    AciCli?.print?.('▸ plus field · ' + (opts.label || this.formatCoords(lat, lng)), 'map');
  },

  close() {
    this._pin = null;
    document.getElementById('globe-entity-hud')?.classList.remove('open');
    this._showPlaceMenu(false);
    const intent = document.getElementById('ge-hud-intent');
    if (intent) intent.value = '';
    document.getElementById('classified-triangles-more')?.classList.remove('open');
    GlobeEntity?.clearSelection?.();
  },

  _runMedia(action, pin) {
    const p = pin || this._pin;
    if (p) window._pendingShopLatLng = { lat: p.lat, lng: p.lng };
    const go = async () => {
      await LazyModules.ensure();
      SuperAdd?.open?.();
      if (action === 'upload_photo') {
        ACIControl?.reply?.('Super Add · snap or upload photo for this place');
      } else if (action === 'upload_video') {
        ACIControl?.reply?.('Super Add · record video for this place');
      } else {
        ACIControl?.reply?.('Super Add · post at this location');
      }
    };
    void go();
    this.close();
  },

  _run(action) {
    const p = this._pin;
    if (!p) return;
    const lat = p.lat;
    const lng = p.lng;
    if (action === 'drive' || action === 'route') {
      const go = async () => {
        await LazyModules.ensure();
        DrivingView?.setDestination?.(lat, lng);
        DrivingView?.activate?.();
      };
      void go();
      this.close();
      return;
    }
    if (action === 'client_addr') {
      const go = async () => {
        await LazyModules.ensure();
        if (!Auth?.user) {
          Auth?.openLoginModal?.('Sign in to set delivery address');
          return;
        }
        if (window.MapPins?.setClientDelivery) {
          MapPins.setClientDelivery(lat, lng, 'Deliver to ' + this.formatCoords(lat, lng));
        } else {
          window._clientDelivery = { lat, lng, label: 'Deliver to ' + this.formatCoords(lat, lng) };
          try { localStorage.setItem('astranov_client_delivery', JSON.stringify(window._clientDelivery)); } catch (_) {}
          ACIControl?.reply?.('Delivery address set · ' + this.formatCoords(lat, lng));
        }
      };
      void go();
      this.close();
      return;
    }
    if (action === 'driver_base') {
      const go = async () => {
        await LazyModules.ensure();
        if (!Auth?.user) {
          Auth?.openLoginModal?.('Sign in to set driver base');
          return;
        }
        if (window.MapPins?.setDriverBase) {
          await MapPins.setDriverBase(lat, lng, 'Driver base · ' + this.formatCoords(lat, lng));
        } else {
          window._driverBase = { lat, lng, label: 'Driver base · ' + this.formatCoords(lat, lng) };
          try { localStorage.setItem('astranov_driver_base', JSON.stringify(window._driverBase)); } catch (_) {}
          ACIControl?.reply?.('Driver base set · ' + this.formatCoords(lat, lng));
        }
      };
      void go();
      this.close();
      return;
    }
    if (action === 'shop') {
      window._pendingShopLatLng = { lat, lng };
      const go = async () => {
        await LazyModules.ensure();
        if (!Auth?.user) {
          Auth?.openLoginModal?.('Sign in to set up your shop profile');
          return;
        }
        await ProfileSite?.openShopEditor?.(lat, lng);
      };
      void go();
      MapDepict?.pulse?.(lat, lng, 0xff8844, 'new shop', 8000);
      ACIControl?.reply?.('Shop editor — logo, menu photos & prices');
      AppShortcuts?.track?.('add', 'Shop');
      this.close();
      return;
    }
    if (action === 'order') {
      const v = p.entity?.data?.vendor;
      const go = async () => {
        await LazyModules.ensure();
        if (v) window.Commerce?.openVendor?.(v);
        else window.Commerce?.showPicker?.();
      };
      void go();
      this.close();
      return;
    }
    if (action === 'explore') {
      window._lastPos = { lat, lng };
      const go = async () => {
        await LazyModules.ensure();
        await window.Commerce?.loadVendors?.();
        window.Commerce?.showPicker?.();
      };
      void go();
      MapDepict?.action?.('vendor', { lat, lng, detail: 'shops near here' });
      this.close();
      return;
    }
    if (action === 'zoom') {
      const pt = latLngToPos(lat, lng, 1.04);
      flyToPoint?.(new THREE.Vector3(pt.x, pt.y, pt.z), GlobeControl?.Z?.national || 1.82, { dur: 1100 });
      GlobeControl?.noteAutoFly?.();
      this.close();
      return;
    }
    if (action === 'open_city') {
      void CityPick?.enter?.(lat, lng, CityPick?.nearestName?.(lat, lng) || 'City');
      this.close();
    }
  },
};
window.MapPlaceMenu = MapPlaceMenu;
