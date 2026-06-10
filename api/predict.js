// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js) - V10 (ULTIMATE UNBREAKABLE ENGINE)

const axios = require("axios");

// ─── TELEGRAM CONFIGURATION ──────────────────────────────────────────────────
const TELEGRAM_TOKEN = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU"; 
const TELEGRAM_CHAT_ID = "5595296615";

// Fungsi Telegram Laporan Terminal Lengkap
async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  try {
    const isSell = totalScore >= 40;
    const mainIcon = isSell ? "🔴" : "🟢";
    const actionText = isSell ? "SELL XAU/USD" : "BUY XAU/USD";
    const biasText = isSell ? "USD Menguat (Fokus cari setup Sell Gold)" : "USD Melemah (Fokus cari setup Buy Gold)";

    const getIcon = (score) => score > 0 ? "🟥" : score < 0 ? "🟩" : "🟨";
    const getSign = (score) => score > 0 ? "+" : "";

    const message = `
<b>${mainIcon} DEPRESSEDESIGN MACRO TERMINAL ${mainIcon}</b>
━━━━━━━━━━━━━━━━━━━━━━
🎯 <b>SIGNAL:</b> ${actionText}
📊 <b>SCORE:</b> ${getSign(totalScore)}${totalScore}
💵 <b>DXY LIVE:</b> ${dxy.current} <i>(${dxy.status})</i>
━━━━━━━━━━━━━━━━━━━━━━
⚙️ <b>ENGINE BREAKDOWN:</b>
${getIcon(nfp.score)} <b>NFP</b>: ${getSign(nfp.score)}${nfp.score} pts
${getIcon(cpi.score)} <b>CPI</b>: ${getSign(cpi.score)}${cpi.score} pts
${getIcon(growth.score)} <b>GROWTH</b>: ${getSign(growth.score)}${growth.score} pts
${getIcon(fed.score)} <b>FED</b>: ${getSign(fed.score)}${fed.score} pts
━━━━━━━━━━━━━━━━━━━━━━
💡 <i>Bias: ${biasText}</i>
`;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } catch (err) {
    console.error("Telegram send error:", err.message);
  }
}

// Fungsi Telegram Pre-News Warning (5 Menit Sebelum Berita)
async function sendPreNewsWarning(newsItem) {
  try {
    const forecastText = newsItem.forecast !== undefined && newsItem.forecast !== null ? newsItem.forecast : "N/A";
    const message = `
⏳ <b>PRE-NEWS WARNING</b> ⏳
━━━━━━━━━━━━━━━━━━━━━━
🚨 <b>${newsItem.title || newsItem.indicator || "USD High Impact News"}</b> 
Akan rilis dalam <b>5 MENIT!</b>

📊 <b>Forecast Market:</b> ${forecastText}
⚠️ <i>Siap-siap volatilitas tinggi. Amankan SL atau hindari entry!</i>
`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML"
    });
  } catch (err) {
    console.error("Warning Telegram Error:", err.message);
  }
}

// ─── DATA FETCHERS ───────────────────────────────────────────────────────────
async function fetchDXY() {
  try {
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d';
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    const current = result.meta.regularMarketPrice;
    const previous = result.meta.previousClose;
    const changePercent = ((current - previous) / previous) * 100;
    return { 
      current: parseFloat(current.toFixed(2)), 
      changePercent: parseFloat(changePercent.toFixed(2)),
      status: changePercent >= 0 ? "BULLISH (UP)" : "BEARISH (DOWN)"
    };
  } catch (err) { 
    return { current: "N/A", changePercent: "N/A", status: "OFFLINE" }; 
  }
}

async function fetchTradingViewData() {
  try {
    const today = new Date();
    const fromDate = new Date(today); fromDate.setDate(today.getDate() - 45); 
    const toDate = new Date(today); toDate.setDate(today.getDate() + 15);   
    const url = `https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`;
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    return res.data && res.data.result ? res.data.result : [];
  } catch (err) { return []; }
}

async function fetchCrudeOil() {
  try {
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d';
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(c => c !== null);
    if (closes.length === 0) return { current: null, avg30: null };
    const current = closes[closes.length - 1];
    const avg30 = closes.slice(-30).reduce((a,b) => a+b, 0) / Math.min(closes.length, 30);
    return { current, avg30 };
  } catch (err) { return { current: null, avg30: null }; }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e => {
    const title = (e.title || e.indicator || "").toLowerCase();
    const isMatch = keywords.some(kw => title.includes(kw.toLowerCase()));
    const hasActual = e.actual !== undefined && e.actual !== null && e.actual !== "";
    return isMatch && hasActual;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0]; 
}

function hasData(val) {
  return val !== null && val !== undefined && val !== "";
}

function getUpcomingNews(events) {
  const now = new Date();
  const upcoming = events.filter(e => new Date(e.date) > now && (e.country === "US" || e.currency === "USD"));
  upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
  return upcoming.slice(0, 5).map(e => ({
    event: e.title || e.indicator,
    date: e.date,
    forecast: hasData(e.forecast) ? e.forecast : "N/A"
  }));
}

// ─── DETECT CORE REAL-TIME OVERRIDES ─────────────────────────────────────────
function checkNFPOverride(events) {
  const nfp = findLatestReleasedEvent(events, ["nonfarm payrolls"]);
  if (nfp) {
    const todayStr = new Date().toISOString().split('T')[0];
    const eventStr = new Date(nfp.date).toISOString().split('T')[0];
    if (todayStr === eventStr && hasData(nfp.actual) && hasData(nfp.forecast)) {
      return nfp.actual > nfp.forecast ? 150 : -150;
    }
  }
  return null;
}

// Mengecek jika CPI Utama rilis hari ini, maka ambil alih skor total CPI
function checkCPIOverride(events) {
  const cpi = findLatestReleasedEvent(events, ["consumer price index", "cpi yoy", "inflation rate yoy"]);
  if (cpi) {
    const todayStr = new Date().toISOString().split('T')[0];
    const eventStr = new Date(cpi.date).toISOString().split('T')[0];
    if (todayStr === eventStr && hasData(cpi.actual) && hasData(cpi.forecast)) {
      return cpi.actual > cpi.forecast ? 150 : -150;
    }
  }
  return null;
}

// ─── EXPANDED SCORING ENGINES (100% UI SAFE) ─────────────────────────────────
function scoreNFP(events) {
  let score = 0; const components = {};
  const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp && hasData(adp.actual) && hasData(adp.forecast)) {
    const pts = adp.actual > adp.forecast ? 40 : -40; score += pts;
    components.adp = { event: adp.title, actual: adp.actual, estimate: adp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.adp = { event: "ADP Nonfarm", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  if (ism) {
    const pts = ism.actual > 50 ? 30 : -30; score += pts;
    components.ism = { event: ism.title, actual: ism.actual, estimate: 50.0, points: pts, status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY" };
  } else components.ism = { event: "ISM PMI", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const jolts = findLatestReleasedEvent(events, ["jolts"]);
  if (jolts && hasData(jolts.actual) && hasData(jolts.forecast)) {
    const pts = jolts.actual > jolts.forecast ? 30 : -30; score += pts;
    components.jolts = { event: jolts.title, actual: jolts.actual, estimate: jolts.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.jolts = { event: "JOLTs Job Openings", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  // Apply Live Override if active
  const overrideScore = checkNFPOverride(events);
  if (overrideScore !== null) score = overrideScore;

  return { score, signal: score >= 20 ? "GOOD USD (SELL XAU)" : score <= -20 ? "BAD USD (BUY XAU)" : "MIXED (WAIT)", components };
}

function scoreCPI(events, crudeOil) {
  let score = 0; const components = {};
  const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi && hasData(ppi.actual) && hasData(ppi.forecast)) {
    const pts = ppi.actual > ppi.forecast ? 60 : -60; score += pts;
    components.ppi = { event: ppi.title, actual: ppi.actual, estimate: ppi.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.ppi = { event: "Producer Price Index", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  if (crudeOil && crudeOil.current !== null && crudeOil.avg30 !== null) {
    const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40; score += pts;
    components.crude = { event: "Crude Oil WTI", current: parseFloat(crudeOil.current.toFixed(2)), avg30: parseFloat(crudeOil.avg30.toFixed(2)), points: pts, status: pts > 0 ? "ABOVE 30-DAY AVG" : "BELOW 30-DAY AVG" };
  } else components.crude = { event: "Crude Oil WTI", current: "N/A", avg30: "N/A", points: 0, status: "FETCH FAILED" };

  // Apply Live Override if active
  const overrideScore = checkCPIOverride(events);
  if (overrideScore !== null) score = overrideScore;

  return { score, signal: score >= 20 ? "HIGH INFLATION (SELL XAU)" : score <= -20 ? "LOW INFLATION (BUY XAU)" : "MIXED (WAIT)", components };
}

function scoreGrowth(events) {
  let score = 0; const components = {};
  const gdp = findLatestReleasedEvent(events, ["gdp growth rate", "gross domestic product"]);
  if (gdp && hasData(gdp.actual) && hasData(gdp.forecast)) {
    const pts = gdp.actual > gdp.forecast ? 50 : -50; score += pts;
    components.gdp = { event: gdp.title, actual: gdp.actual, estimate: gdp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.gdp = { event: "GDP Growth Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  const retail = findLatestReleasedEvent(events, ["retail sales m/m", "core retail sales"]);
  if (retail && hasData(retail.actual) && hasData(retail.forecast)) {
    const pts = retail.actual > retail.forecast ? 50 : -50; score += pts;
    components.retail = { event: retail.title, actual: retail.actual, estimate: retail.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" };
  } else components.retail = { event: "Retail Sales", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  return { score, signal: score >= 20 ? "STRONG ECONOMY (SELL XAU)" : score <= -20 ? "WEAK ECONOMY (BUY XAU)" : "MIXED (WAIT)", components };
}

function scoreFed(events) {
  let score = 0; const components = {};
  const fed = findLatestReleasedEvent(events, ["fed interest rate decision", "interest rate decision"]);
  if (fed && hasData(fed.actual) && hasData(fed.forecast)) {
    const pts = fed.actual >= fed.forecast ? 100 : -100; score += pts;
    components.fed = { event: fed.title, actual: fed.actual, estimate: fed.forecast, points: pts, status: pts > 0 ? "HAWKISH" : "DOVISH" };
  } else components.fed = { event: "Fed Interest Rate", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };

  return { score, signal: score > 0 ? "HAWKISH (SELL XAU)" : score < 0 ? "DOVISH (BUY XAU)" : "MIXED (WAIT)", components };
}

// ─── PROCESSOR CALCULATION BLOCK ─────────────────────────────────────────────
async function runMacroCalculations() {
  const [events, crudeOil, dxy] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY() ]);
  const nfp = scoreNFP(events);
  const cpi = scoreCPI(events, crudeOil);
  const growth = scoreGrowth(events);
  const fed = scoreFed(events);

  const totalScore = nfp.score + cpi.score + growth.score + fed.score;
  let masterSignal = "NEUTRAL / CHOPPY MARKET";
  if (totalScore >= 40) masterSignal = "STRONG SELL XAU";
  if (totalScore <= -40) masterSignal = "STRONG BUY XAU";

  return { events, dxy, nfp, cpi, growth, fed, totalScore, masterSignal };
}

// ─── MAIN ROUTER HANDLER ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // A. JALUR TELEGRAM WEBHOOK INCOMING (Command /refresh dari HP)
  if (req.method === "POST" && req.body && req.body.message) {
    const text = req.body.message.text;
    if (text === "/refresh") {
      const calc = await runMacroCalculations();
      await sendTelegramAlert(calc.masterSignal, calc.totalScore, calc.dxy, calc.nfp, calc.cpi, calc.growth, calc.fed);
      return res.status(200).json({ success: true, message: "Telegram route synchronized successfully." });
    }
    return res.status(200).json({ success: true });
  }

  // B. JALUR BROWSER REFRESH / AUTOMATION CRON ROUTE
  const isCron = req.query.cron === "true";

  try {
    const calc = await runMacroCalculations();

    if (isCron) {
      // Logic Robot: Scan data rilis 5 menit ke depan
      const now = Date.now();
      const upcoming = calc.events.filter(e => {
        if (e.country !== "US" && e.currency !== "USD") return false;
        const eventTime = new Date(e.date).getTime();
        const diffMins = (eventTime - now) / (1000 * 60);
        return diffMins > 0 && diffMins <= 5;
      });

      for (const news of upcoming) {
        await sendPreNewsWarning(news);
      }
    } else {
      // Logic Manual Refresh Website: Tembak Telegram Full Terminal
      await sendTelegramAlert(calc.masterSignal, calc.totalScore, calc.dxy, calc.nfp, calc.cpi, calc.growth, calc.fed);
    }

    // Payload data utuh wajib dikembalikan ke Frontend HTML
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      dxy_live: calc.dxy,
      master_signal: { signal: calc.masterSignal, total_score: calc.totalScore },
      nfp: calc.nfp,
      cpi: calc.cpi,
      growth: calc.growth,
      fed: calc.fed,
      upcoming_news: getUpcomingNews(calc.events)
    });

  } catch (err) {
    console.error("Critical Runtime Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
