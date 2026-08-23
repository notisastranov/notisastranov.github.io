// === DELIVERY PRICING + WEATHER + GOOGLE WALLET ===
const DeliveryPricing = {
  PLATFORM_RATE: 0.03,
  BASE_DELIVERY_EUR: 3,
  BLOCK_EUR: 3,
  KM_BLOCK: 3,
  KG_BLOCK: 3,
  INCLUDED_KM: 3,
  INCLUDED_KG: 3,
  SURCHARGE_EUR: 3,

  _cache: null,
  _cacheAt: 0,

  blockFee(units, blockSize) {
    const extra = Math.max(0, units - blockSize);
    if (extra <= 0) return 0;
    return Math.ceil(extra / blockSize) * this.BLOCK_EUR;
  },

  isNightOrMorning(date) {
    const h = (date || new Date()).getHours();
    return h < 9 || h >= 21;
  },

  async fetchWeather(lat, lng) {
    const now = Date.now();
    if (this._cache && now - this._cacheAt < 600000) return this._cache;
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng
        + '&current=weather_code,precipitation,wind_speed_10m&timezone=auto';
      const r = await fetch(url);
      const j = await r.json();
      const c = j.current || {};
      const code = c.weather_code ?? 0;
      const precip = c.precipitation ?? 0;
      const wind = c.wind_speed_10m ?? 0;
      const bad = precip > 0.4 || wind > 40 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(code);
      this._cache = { bad, precip, wind, code, at: now };
      this._cacheAt = now;
      return this._cache;
    } catch (_) {
      return { bad: false, precip: 0, wind: 0, code: 0 };
    }
  },

  async quote(opts) {
    opts = opts || {};
    const km = Math.max(0, Number(opts.km) || 0);
    const kg = Math.max(0, Number(opts.kg) || 3);
    const subtotal = Math.max(0, Number(opts.subtotal_eur) || 0);
    const when = opts.at ? new Date(opts.at) : new Date();
    const weather = opts.weather || (opts.lat != null ? await this.fetchWeather(opts.lat, opts.lng) : { bad: false });

    const distanceFee = this.BASE_DELIVERY_EUR + this.blockFee(km, this.KM_BLOCK);
    const weightFee = this.blockFee(kg, this.KG_BLOCK);
    let surcharges = [];
    if (this.isNightOrMorning(when)) surcharges.push({ id: 'night_morning', label: 'Night / before 09:00', eur: this.SURCHARGE_EUR });
    if (weather.bad) surcharges.push({ id: 'weather', label: 'Bad weather', eur: this.SURCHARGE_EUR });

    const deliveryEur = distanceFee + weightFee + surcharges.reduce((s, x) => s + x.eur, 0);
    const goodsEur = subtotal;
    const platformEur = Math.round((goodsEur + deliveryEur) * this.PLATFORM_RATE * 100) / 100;
    const totalEur = Math.round((goodsEur + deliveryEur + platformEur) * 100) / 100;
    const driverPayoutEur = Math.round(deliveryEur * 0.85 * 100) / 100;

    return {
      currency: 'Coins',
      peg_eur: 1,
      km, kg,
      subtotal_eur: goodsEur,
      delivery_eur: deliveryEur,
      distance_fee_eur: distanceFee,
      weight_fee_eur: weightFee,
      surcharges,
      platform_fee_eur: platformEur,
      platform_rate: this.PLATFORM_RATE,
      total_eur: totalEur,
      total_avc: totalEur,
      driver_payout_eur: driverPayoutEur,
      weather,
      invoice_note: 'Monthly invoice · platform 3% · driver paid on delivery',
    };
  },

  formatQuote(q) {
    if (!q) return '';
    let s = q.total_avc.toFixed(2) + ' Coins (= ' + q.total_eur.toFixed(2) + ' EUR)';
    s += ' · delivery ' + q.delivery_eur.toFixed(2);
    if (q.surcharges?.length) s += ' · ' + q.surcharges.map(x => x.label).join(', ');
    s += ' · fee 3%';
    return s;
  },
};

const GoogleWalletPay = {
  supported() {
    try {
      return typeof PaymentRequest !== 'undefined';
    } catch (_) { return false; }
  },

  async pay(amountEur, label, opts) {
    opts = opts || {};
    if (!this.supported()) throw new Error('Google Pay / Wallet not available in this browser');
    const total = Math.max(0.01, Number(amountEur) || 0);
    const methods = [{
      supportedMethods: 'https://google.com/pay',
      data: {
        environment: opts.test ? 'TEST' : 'PRODUCTION',
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['MASTERCARD', 'VISA'],
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: { gateway: 'example', gatewayMerchantId: 'astranov' },
          },
        }],
        merchantInfo: { merchantName: 'Astranov', merchantId: opts.merchantId || 'astranov' },
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: total.toFixed(2),
          currencyCode: 'EUR',
          countryCode: 'GR',
        },
      },
    }];
    const fallback = [{
      supportedMethods: 'basic-card',
      data: { supportedNetworks: ['visa', 'mastercard'], supportedTypes: ['debit', 'credit'] },
    }];
    let pr;
    try {
      pr = new PaymentRequest(methods, { total: { label: label || 'Astranov order', amount: { currency: 'EUR', value: total.toFixed(2) } } });
      const can = await pr.canMakePayment();
      if (!can) pr = new PaymentRequest(fallback, { total: { label: label || 'Astranov order', amount: { currency: 'EUR', value: total.toFixed(2) } } });
    } catch (_) {
      pr = new PaymentRequest(fallback, { total: { label: label || 'Astranov order', amount: { currency: 'EUR', value: total.toFixed(2) } } });
    }
    const resp = await pr.show();
    const detail = {
      method: resp.methodName,
      paid: true,
      amount_eur: total,
      at: new Date().toISOString(),
      wallet: /google/i.test(resp.methodName || '') ? 'google_wallet' : 'card',
    };
    await resp.complete('success');
    return detail;
  },
};

window.DeliveryPricing = DeliveryPricing;
window.GoogleWalletPay = GoogleWalletPay;

function resizeCliInput(el) {
  if (!el) return;
  el.style.height = 'auto';
  const max = Math.min(window.innerHeight * 0.38, 220);
  el.style.height = Math.min(Math.max(el.scrollHeight, 40), max) + 'px';
}
window.resizeCliInput = resizeCliInput;
