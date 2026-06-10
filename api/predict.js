// api/predict.js — DEPRESSEDESIGN Macro Predictor V9 (News Sniper)
const axios = require("axios");

const TELEGRAM_TOKEN = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU"; 
const TELEGRAM_CHAT_ID = "5595296615";

// ─── TELEGRAM ENGINE ────────────────────────────────────────────────────────
async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  try {
    const isSell = totalScore >= 40;
    const mainIcon = isSell ? "🔴" : "🟢";
    const actionText = isSell ? "SELL XAU/USD" : "BUY XAU/USD";
    const biasText = isSell ? "USD Menguat" : "USD Melemah";
    const getIcon = (score) => score > 0 ? "🟥" : score < 0 ? "🟩" : "🟨";

    const message = `<b>${mainIcon} DEPRESSEDESIGN MACRO TERMINAL ${mainIcon}</b>\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>SIGNAL:</b> ${actionText}\n📊 <b>TOTAL SCORE:</b> ${totalScore}\n💵 <b>DXY:</b> ${dxy.current} (${dxy.status})\n━━━━━━━━━━━━━━━━━━━━━━\n⚙️ <b>ENGINE BREAKDOWN:</b>\n${getIcon(nfp.score)} NFP: ${nfp.score} pts\n${getIcon(cpi.score)} CPI: ${cpi.score} pts\n${getIcon(growth.score)} GROWTH: ${growth.score} pts\n${getIcon(fed.score)} FED: ${fed.score} pts\n━━━━━━━━━━━━━━━━━━━━━━\n💡 <i>Bias: ${biasText}</i>`;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML"
    });
  } catch (err) { console.error("Telegram Error:", err.message); }
}

// ─── OVERRIDE LOGIC (The News Sniper) ──────────────────────────────────────
function getDominantNFP(events) {
  const nfp = findLatestReleasedEvent(events, ["nonfarm payrolls"]);
  if (nfp && nfp.actual !== null) {
    const pts = nfp.actual > nfp.forecast ? 150 : -150;
    return { score: pts, event: nfp.title };
  }
  return null;
}

function getDominantCPI(events) {
  const cpi = findLatestReleasedEvent(events, ["cpi", "consumer price index"]);
  if (cpi && cpi.actual !== null) {
    const pts = cpi.actual > cpi.forecast ? 150 : -150;
    return { score: pts, event: cpi.title };
  }
  return null;
}

// ─── HELPERS & FETCHERS ─────────────────────────────────────────────────────
async function fetchTradingViewData() {
  try {
    const today = new Date();
    const fromDate = new Date(today); fromDate.setDate(today.getDate() - 45); 
    const toDate = new Date(today); toDate.setDate(today.getDate() + 15);   
    const url = `https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`;
    const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.data && res.data.result ? res.data.result : [];
  } catch (err) { return []; }
}

async function fetchDXY() {
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d', { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const meta = res.data.chart.result[0].meta;
    const change = ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100;
    return { current: meta.regularMarketPrice.toFixed(2), status: change >= 0 ? "BULLISH" : "BEARISH" };
  } catch (err) { return { current: "N/A", status: "OFFLINE" }; }
}

function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e => {
    const title = (e.title || "").toLowerCase();
    return keywords.some(kw => title.includes(kw.toLowerCase())) && e.actual !== null;
  });
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0];
}

// ─── SCORING ENGINE ────────────────────────────────────────────────────────
function scoreNFP(events) {
  const adp = findLatestReleasedEvent(events, ["adp"]);
  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  const score = (adp ? (adp.actual > adp.forecast ? 40 : -40) : 0) + (ism ? (ism.actual > 50 ? 30 : -30) : 0);
  return { score };
}

function scoreCPI(events) {
  const ppi = findLatestReleasedEvent(events, ["ppi"]);
  const score = ppi ? (ppi.actual > ppi.forecast ? 60 : -60) : 0;
  return { score };
}

function scoreGrowth(events) {
  const gdp = findLatestReleasedEvent(events, ["gdp"]);
  const score = gdp ? (gdp.actual > gdp.forecast ? 50 : -50) : 0;
  return { score };
}

function scoreFed(events) {
  const fed = findLatestReleasedEvent(events, ["fed interest rate"]);
  const score = fed ? (fed.actual >= fed.forecast ? 100 : -100) : 0;
  return { score };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const events = await fetchTradingViewData();
    const dxy = await fetchDXY();

    const nfpBase = scoreNFP(events);
    const cpiBase = scoreCPI(events);
    const growth = scoreGrowth(events);
    const fed = scoreFed(events);

    // SNIPER OVERRIDE
    const nfpFinal = getDominantNFP(events) || nfpBase;
    const cpiFinal = getDominantCPI(events) || cpiBase;

    const totalScore = nfpFinal.score + cpiFinal.score + growth.score + fed.score;
    
    // Telegram Alert Trigger (Hanya kirim kalau skor signifikan)
    if (Math.abs(totalScore) >= 40) {
      await sendTelegramAlert(totalScore >= 40 ? "SELL" : "BUY", totalScore, dxy, nfpFinal, cpiFinal, growth, fed);
    }

    return res.status(200).json({ success: true, totalScore, masterSignal: totalScore >= 40 ? "STRONG SELL" : "STRONG BUY" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
