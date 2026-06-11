// api/predict.js — DEPRESSEDESIGN Advanced Trading Station Backend
// Vercel Serverless Function (Node.js) - V6
// CHANGES: All-country news, impact color metadata, live signal tracking, Telegram on NEW/INVALID signal

const axios = require("axios");

// ─── TELEGRAM CONFIG ─────────────────────────────────────────────────────────
const TELEGRAM_TOKEN   = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU";
const TELEGRAM_CHAT_ID = "5595296615";

// ─── IN-MEMORY SIGNAL STATE (persists across requests within same serverless instance) ─────
// Vercel warm instances reuse this; cold starts reset it (acceptable — new signal fires alert)
let lastTechSignal = null;   // { position, entry, sl, tp1, tp2, hash }
let lastMacroScore = null;   // number

function hashSignal(tech) {
  if (!tech) return null;
  return `${tech.position}|${tech.entry}|${tech.sl}|${tech.tp1}|${tech.tp2}`;
}

// ─── TELEGRAM SENDER ─────────────────────────────────────────────────────────
async function sendTelegram(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
    console.log("✅ Telegram sent.");
  } catch (err) {
    console.error("❌ Telegram error:", err.message);
  }
}

async function sendMacroAlert(masterSignal, totalScore, scores, dxyCurrent) {
  const emoji  = totalScore >= 40 ? "🔴" : "🟢";
  const action = totalScore >= 40 ? "SELL XAU/USD" : "BUY XAU/USD";
  const msg = `
${emoji} *DEPRESSEDESIGN MACRO TERMINAL* ${emoji}

📊 *SIGNAL:* ${action}
📈 *SCORE:* ${totalScore}
💵 *DXY LIVE:* ${dxyCurrent}

⚙️ *ENGINE BREAKDOWN:*
🔴 NFP: ${scores.nfp > 0 ? "+" : ""}${scores.nfp} pts
🟡 CPI: ${scores.cpi > 0 ? "+" : ""}${scores.cpi} pts
🟢 GROWTH: ${scores.growth > 0 ? "+" : ""}${scores.growth} pts
🔵 FED: ${scores.fed > 0 ? "+" : ""}${scores.fed} pts

[🔗 Buka Dashboard](https://depressedesign-macro.vercel.app/)
  `.trim();
  await sendTelegram(msg);
}

async function sendTechAlert(tech, isNew) {
  const pos = (tech.position || "").toUpperCase();
  let emoji = "🟡";
  if (pos.includes("BUY"))   emoji = "🟢";
  if (pos.includes("SELL"))  emoji = "🔴";
  if (pos.includes("SCALP")) emoji = "⚡";

  const tag = isNew ? "🆕 *NEW SIGNAL*" : "♻️ *SIGNAL UPDATE*";
  const reasons = (tech.reason || []).slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join("\n");

  const msg = `
${emoji} *DEPRESSEDESIGN TECH SIGNAL* ${emoji}
${tag}

📍 *POSITION:* ${pos}
🎯 *ENTRY:* $${tech.entry}
🛑 *STOP LOSS:* $${tech.sl}
✅ *TP1:* $${tech.tp1}
✅ *TP2:* $${tech.tp2}

📋 *REASONING:*
${reasons || "— No reasoning provided —"}

[🔗 Buka Dashboard](https://depressedesign-macro.vercel.app/)
  `.trim();
  await sendTelegram(msg);
}

async function sendInvalidSignalAlert(prevSignal) {
  const msg = `
⚠️ *SIGNAL INVALID / CLOSED*

Sinyal teknikal sebelumnya telah berakhir atau tidak valid lagi.

📍 *WAS:* ${prevSignal.position}
🎯 *Entry:* $${prevSignal.entry}
🛑 *SL:* $${prevSignal.sl}

_Signal baru akan dikirim otomatis saat terdeteksi._

[🔗 Buka Dashboard](https://depressedesign-macro.vercel.app/)
  `.trim();
  await sendTelegram(msg);
}

// ─── FETCH DXY ────────────────────────────────────────────────────────────────
async function fetchDXY() {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d";
    const res = await axios.get(url, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
    const result = res.data.chart.result[0];
    const current  = result.meta.regularMarketPrice;
    const previous = result.meta.previousClose;
    const changePercent = ((current - previous) / previous) * 100;
    return {
      current:       parseFloat(current.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      status:        changePercent >= 0 ? "BULLISH (UP)" : "BEARISH (DOWN)"
    };
  } catch (err) {
    console.error("DXY fetch error:", err.message);
    return { current: "N/A", changePercent: "N/A", status: "FETCH FAILED" };
  }
}

// ─── FETCH TRADINGVIEW CALENDAR (ALL COUNTRIES) ──────────────────────────────
async function fetchTradingViewData() {
  try {
    const today    = new Date();
    const fromDate = new Date(today); fromDate.setDate(today.getDate() - 45);
    const toDate   = new Date(today); toDate.setDate(today.getDate() + 15);
    // Remove &countries=US filter — fetch ALL countries
    const url = `https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}`;
    const res = await axios.get(url, {
      timeout: 12000,
      headers: {
        "Origin":     "https://www.tradingview.com",
        "Referer":    "https://www.tradingview.com/",
        "User-Agent": "Mozilla/5.0"
      }
    });
    return res.data && res.data.result ? res.data.result : [];
  } catch (err) {
    console.error("TV Calendar error:", err.message);
    return [];
  }
}

// ─── FETCH CRUDE OIL ─────────────────────────────────────────────────────────
async function fetchCrudeOil() {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d";
    const res = await axios.get(url, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
    const result = res.data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(c => c !== null);
    if (!closes.length) return { current: null, avg30: null };
    const current = closes[closes.length - 1];
    const avg30   = closes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(closes.length, 30);
    return { current, avg30 };
  } catch (err) {
    return { current: null, avg30: null };
  }
}

// ─── FETCH XAU/USD LIVE PRICE (for technical signal) ─────────────────────────
async function fetchXAUPrice() {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1m&range=5d";
    const res = await axios.get(url, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
    const result = res.data.chart.result[0];
    const closes  = result.indicators.quote[0].close.filter(c => c !== null);
    const highs   = result.indicators.quote[0].high.filter(c => c !== null);
    const lows    = result.indicators.quote[0].low.filter(c => c !== null);
    const volumes = result.indicators.quote[0].volume || [];

    // Need at least 60 candles for proper M1 analysis
    if (closes.length < 30) return null;

    return {
      closes,
      highs,
      lows,
      volumes,
      current: closes[closes.length - 1],
      prev:    closes[closes.length - 2] || closes[closes.length - 1]
    };
  } catch (err) {
    console.error("XAU price fetch error:", err.message);
    return null;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e => {
    const title   = (e.title || e.indicator || "").toLowerCase();
    const isMatch = keywords.some(kw => title.includes(kw.toLowerCase()));
    const hasActual = e.actual !== undefined && e.actual !== null && e.actual !== "";
    return isMatch && hasActual;
  });
  if (!matches.length) return null;
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0];
}

// Map TradingView importance numbers (1/2/3) OR string to standard labels
function normalizeImpact(e) {
  const imp = e.importance || e.impact || e.level || "";
  if (typeof imp === "number") {
    if (imp >= 3)  return "HIGH";
    if (imp === 2) return "MEDIUM";
    return "LOW";
  }
  const s = String(imp).toUpperCase();
  if (s.includes("HIGH") || s === "3") return "HIGH";
  if (s.includes("MED")  || s === "2") return "MEDIUM";
  return "LOW";
}

// Get upcoming news — ALL countries, sorted by time, next 20 events
function getUpcomingNews(events) {
  const now = new Date();
  const upcoming = events
    .filter(e => new Date(e.date) > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 20);

  return upcoming.map(e => {
    const impact = normalizeImpact(e);
    // Check if event is "live" — within 30 min window
    const eventTime   = new Date(e.date);
    const diffMinutes = (eventTime - now) / 60000;
    const isLive      = diffMinutes >= -5 && diffMinutes <= 30;

    return {
      event:    e.title || e.indicator || "Unknown Event",
      date:     e.date,
      country:  e.country || e.currency || "—",
      currency: e.currency || e.country || "—",
      forecast: e.forecast !== undefined && e.forecast !== null ? e.forecast : null,
      previous: e.previous !== undefined && e.previous !== null ? e.previous : null,
      impact,
      isLive
    };
  });
}

// ─── SMC / SNR TECHNICAL SIGNAL ENGINE (M1 Aggressive) ───────────────────────
function generateTechnicalSignal(priceData) {
  if (!priceData) return null;

  const { closes, highs, lows, current } = priceData;
  const n = closes.length;
  if (n < 20) return null;

  // ── EMAs ────────────────────────────────────
  function ema(data, period) {
    const k = 2 / (period + 1);
    let e = data[0];
    for (let i = 1; i < data.length; i++) e = data[i] * k + e * (1 - k);
    return e;
  }
  const ema8  = ema(closes.slice(-20), 8);
  const ema21 = ema(closes.slice(-40), 21);
  const ema50 = ema(closes.slice(-60), 50);

  // ── ATR (14) ────────────────────────────────
  function atr(h, l, c, period) {
    const trs = [];
    for (let i = 1; i < h.length; i++) {
      trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i-1]), Math.abs(l[i] - c[i-1])));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
  const atrVal = atr(
    highs.slice(-20), lows.slice(-20), closes.slice(-20), 14
  );

  // ── Structure (last 20 candles) ─────────────
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow  = Math.min(...lows.slice(-20));
  const mid20      = (recentHigh + recentLow) / 2;

  // ── Momentum ────────────────────────────────
  const momentum5  = current - closes[n - 6];
  const momentum10 = current - closes[n - 11];
  const bullMom    = momentum5 > 0 && momentum10 > 0;
  const bearMom    = momentum5 < 0 && momentum10 < 0;

  // ── RSI-like (simplified) ───────────────────
  let gains = 0, losses = 0;
  for (let i = n - 14; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains  += diff;
    else          losses -= diff;
  }
  const rs  = gains / (losses || 1);
  const rsi = 100 - (100 / (1 + rs));

  // ── Support / Resistance levels ─────────────
  // Key swing points (SNR)
  const snrResist = Math.max(...highs.slice(-50, -1));
  const snrSupport = Math.min(...lows.slice(-50, -1));

  // ── Score each condition ─────────────────────
  let bullScore = 0, bearScore = 0;
  const reasons = [];

  // EMA alignment
  if (ema8 > ema21 && ema21 > ema50) {
    bullScore += 2;
    reasons.push({ dir: "bull", text: `EMA stack bullish (8>${ema8.toFixed(2)} > 21>${ema21.toFixed(2)} > 50>${ema50.toFixed(2)})` });
  } else if (ema8 < ema21 && ema21 < ema50) {
    bearScore += 2;
    reasons.push({ dir: "bear", text: `EMA stack bearish (8<${ema8.toFixed(2)} < 21<${ema21.toFixed(2)} < 50<${ema50.toFixed(2)})` });
  } else {
    reasons.push({ dir: "neut", text: `EMA mixed — no clear stack alignment` });
  }

  // Price vs structure midpoint
  if (current > mid20 + atrVal * 0.3) {
    bullScore += 1;
    reasons.push({ dir: "bull", text: `Price above 20-candle structure midpoint ($${mid20.toFixed(2)})` });
  } else if (current < mid20 - atrVal * 0.3) {
    bearScore += 1;
    reasons.push({ dir: "bear", text: `Price below 20-candle structure midpoint ($${mid20.toFixed(2)})` });
  }

  // Momentum
  if (bullMom) {
    bullScore += 2;
    reasons.push({ dir: "bull", text: `Bullish momentum: +${momentum5.toFixed(2)} (5c), +${momentum10.toFixed(2)} (10c)` });
  } else if (bearMom) {
    bearScore += 2;
    reasons.push({ dir: "bear", text: `Bearish momentum: ${momentum5.toFixed(2)} (5c), ${momentum10.toFixed(2)} (10c)` });
  } else {
    reasons.push({ dir: "neut", text: `Mixed momentum — ${momentum5.toFixed(2)} (5c), ${momentum10.toFixed(2)} (10c)` });
  }

  // RSI
  if (rsi < 35) {
    bullScore += 2;
    reasons.push({ dir: "bull", text: `RSI oversold at ${rsi.toFixed(1)} — reversal bias` });
  } else if (rsi > 65) {
    bearScore += 2;
    reasons.push({ dir: "bear", text: `RSI overbought at ${rsi.toFixed(1)} — rejection bias` });
  } else {
    reasons.push({ dir: "neut", text: `RSI neutral at ${rsi.toFixed(1)}` });
  }

  // SNR proximity
  const distToResist  = (snrResist - current) / atrVal;
  const distToSupport = (current - snrSupport) / atrVal;
  if (distToResist < 1.5) {
    bearScore += 1;
    reasons.push({ dir: "bear", text: `Near SNR resistance: $${snrResist.toFixed(2)} (${distToResist.toFixed(1)} ATR away)` });
  }
  if (distToSupport < 1.5) {
    bullScore += 1;
    reasons.push({ dir: "bull", text: `Near SNR support: $${snrSupport.toFixed(2)} (${distToSupport.toFixed(1)} ATR away)` });
  }

  // ── Decide position ──────────────────────────
  const slMultiplier = 1.2;
  const tp1Multiplier = 1.5;
  const tp2Multiplier = 3.0;
  let position, entry, sl, tp1, tp2;

  if (bullScore >= 4 && bullScore > bearScore) {
    position = "BUY LIMIT / BUY NOW (LTF SNIPER)";
    entry = parseFloat(current.toFixed(2));
    sl    = parseFloat((entry - atrVal * slMultiplier).toFixed(2));
    tp1   = parseFloat((entry + atrVal * tp1Multiplier).toFixed(2));
    tp2   = parseFloat((entry + atrVal * tp2Multiplier).toFixed(2));
  } else if (bearScore >= 4 && bearScore > bullScore) {
    position = "SELL LIMIT / SELL NOW (LTF SNIPER)";
    entry = parseFloat(current.toFixed(2));
    sl    = parseFloat((entry + atrVal * slMultiplier).toFixed(2));
    tp1   = parseFloat((entry - atrVal * tp1Multiplier).toFixed(2));
    tp2   = parseFloat((entry - atrVal * tp2Multiplier).toFixed(2));
  } else {
    position = "SCALPING / WAIT FOR STRUCTURE";
    entry = parseFloat(current.toFixed(2));
    sl    = parseFloat((entry - atrVal * 0.8).toFixed(2));
    tp1   = parseFloat((entry + atrVal * 1.0).toFixed(2));
    tp2   = parseFloat((entry + atrVal * 2.0).toFixed(2));
  }

  return {
    position,
    entry,
    sl,
    tp1,
    tp2,
    reason:     reasons.map(r => r.text),
    bullScore,
    bearScore,
    rsi:        parseFloat(rsi.toFixed(1)),
    atr:        parseFloat(atrVal.toFixed(2)),
    timestamp:  new Date().toISOString()
  };
}

// ─── MACRO SCORING ENGINE ─────────────────────────────────────────────────────
function scoreNFP(events) {
  let score = 0;
  const components = {};
  const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp && adp.forecast != null) {
    const pts = adp.actual > adp.forecast ? 40 : -40; score += pts;
    components.adp = { actual: adp.actual, estimate: adp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED", date: adp.date };
  } else components.adp = { actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  if (ism) {
    const pts = ism.actual > 50 ? 30 : -30; score += pts;
    components.ism = { actual: ism.actual, estimate: 50.0, points: pts, status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY", date: ism.date };
  } else components.ism = { actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const jolts = findLatestReleasedEvent(events, ["jolts"]);
  if (jolts && jolts.forecast != null) {
    const pts = jolts.actual > jolts.forecast ? 30 : -30; score += pts;
    components.jolts = { actual: jolts.actual, estimate: jolts.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED", date: jolts.date };
  } else components.jolts = { actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  return { score, signal: score >= 20 ? "GOOD USD (SELL XAU)" : score <= -20 ? "BAD USD (BUY XAU)" : "MIXED (WAIT)", components };
}

function scoreCPI(events, crudeOil) {
  let score = 0;
  const components = {};
  const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi && ppi.forecast != null) {
    const pts = ppi.actual > ppi.forecast ? 60 : -60; score += pts;
    components.ppi = { actual: ppi.actual, estimate: ppi.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED", date: ppi.date };
  } else components.ppi = { actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  if (crudeOil && crudeOil.current != null && crudeOil.avg30 != null) {
    const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40; score += pts;
    components.crude = { current: parseFloat(crudeOil.current.toFixed(2)), avg30: parseFloat(crudeOil.avg30.toFixed(2)), points: pts, status: pts > 0 ? "ABOVE 30-DAY AVG" : "BELOW 30-DAY AVG" };
  } else components.crude = { current: "N/A", avg30: "N/A", points: 0, status: "FETCH FAILED" };

  return { score, signal: score >= 20 ? "HIGH INFLATION (SELL XAU)" : score <= -20 ? "LOW INFLATION (BUY XAU)" : "MIXED (WAIT)", components };
}

function scoreGrowth(events) {
  let score = 0;
  const components = {};
  const gdp = findLatestReleasedEvent(events, ["gdp growth rate", "gross domestic product"]);
  if (gdp && gdp.forecast != null) {
    const pts = gdp.actual > gdp.forecast ? 50 : -50; score += pts;
    components.gdp = { actual: gdp.actual, estimate: gdp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED", date: gdp.date };
  } else components.gdp = { actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const retail = findLatestReleasedEvent(events, ["retail sales m/m", "core retail sales"]);
  if (retail && retail.forecast != null) {
    const pts = retail.actual > retail.forecast ? 50 : -50; score += pts;
    components.retail = { actual: retail.actual, estimate: retail.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED", date: retail.date };
  } else components.retail = { actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  return { score, signal: score >= 20 ? "STRONG ECONOMY (SELL XAU)" : score <= -20 ? "WEAK ECONOMY (BUY XAU)" : "MIXED (WAIT)", components };
}

function scoreFed(events) {
  let score = 0;
  const components = {};
  const fed = findLatestReleasedEvent(events, ["fed interest rate decision", "interest rate decision"]);
  if (fed && fed.forecast != null) {
    const pts = fed.actual >= fed.forecast ? 100 : -100; score += pts;
    // Restructure to match frontend expectations
    components.fed_rate = {
      current:  fed.actual,
      previous: fed.forecast,
      change:   (fed.actual - fed.forecast) * 100,
      bias:     pts > 0 ? "HAWKISH" : "DOVISH",
      points:   pts,
      date:     fed.date
    };
  } else {
    components.fed_rate = { current: "N/A", previous: "N/A", change: 0, bias: "NO DATA", points: 0 };
  }

  return { score, signal: score > 0 ? "HAWKISH (SELL XAU)" : score < 0 ? "DOVISH (BUY XAU)" : "MIXED (WAIT)", components };
}

// ─── SERVERLESS HANDLER ───────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const [events, crudeOil, dxy, xauData] = await Promise.all([
      fetchTradingViewData(),
      fetchCrudeOil(),
      fetchDXY(),
      fetchXAUPrice()
    ]);

    // ── Macro scoring ──
    const nfp    = scoreNFP(events);
    const cpi    = scoreCPI(events, crudeOil);
    const growth = scoreGrowth(events);
    const fed    = scoreFed(events);

    const totalScore = nfp.score + cpi.score + growth.score + fed.score;
    let masterSignal = "NEUTRAL / CHOPPY MARKET";
    if (totalScore >= 40)  masterSignal = "STRONG SELL XAU";
    if (totalScore <= -40) masterSignal = "STRONG BUY XAU";

    // ── Macro Telegram: only if STRONG and score changed ──
    const macroChanged = lastMacroScore !== totalScore;
    if ((totalScore >= 40 || totalScore <= -40) && macroChanged) {
      await sendMacroAlert(masterSignal, totalScore, {
        nfp: nfp.score, cpi: cpi.score, growth: growth.score, fed: fed.score
      }, dxy.current);
    }
    lastMacroScore = totalScore;

    // ── Technical signal ──
    const techSignal    = generateTechnicalSignal(xauData);
    const newTechHash   = hashSignal(techSignal);
    const prevTechHash  = hashSignal(lastTechSignal);

    if (techSignal) {
      if (!lastTechSignal) {
        // First signal ever — send as new
        await sendTechAlert(techSignal, true);
      } else if (newTechHash !== prevTechHash) {
        // Signal changed
        const wasValid   = lastTechSignal && lastTechSignal.position && !lastTechSignal.position.includes("SCALP");
        const isNowScalp = techSignal.position.includes("SCALP");

        if (wasValid && isNowScalp) {
          // Previous signal went invalid
          await sendInvalidSignalAlert(lastTechSignal);
        } else if (!isNowScalp) {
          // Brand new actionable signal
          await sendTechAlert(techSignal, true);
        }
      }
      lastTechSignal = { ...techSignal, hash: newTechHash };
    }

    // ── News (all countries, with impact + isLive) ──
    const upcomingNews = getUpcomingNews(events);

    return res.status(200).json({
      success:    true,
      timestamp:  new Date().toISOString(),
      dxy_live:   dxy,
      master_signal: { signal: masterSignal, total_score: totalScore },
      nfp, cpi, growth, fed,
      technical_signal: techSignal,
      upcoming_news:    upcomingNews
    });

  } catch (err) {
    console.error("Predict handler error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
};
