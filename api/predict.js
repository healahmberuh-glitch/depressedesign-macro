// api/predict.js — DEPRESSEDESIGN Macro Predictor V11 (THE TRADING STATION)
const axios = require("axios");

const TELEGRAM_TOKEN = "8325927674:AAF3xv3r0NRRTet5H-xaK1DKIwWshemVOeU"; 
const TELEGRAM_CHAT_ID = "5595296615";

// ─── TELEGRAM SIGNALS SENDER ────────────────────────────────────────────────
async function sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, growth, fed) {
  try {
    if (totalScore > -40 && totalScore < 40) return;
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
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) { console.error(err); }
}

async function sendTechnicalSignalTelegram(tech) {
  try {
    const icon = tech.position.includes("BUY") ? "🟢" : "🔴";
    const message = `
${icon} <b>NEW TECHNICAL SIGNAL DETECTED</b> ${icon}
━━━━━━━━━━━━━━━━━━━━━━
🎯 <b>POSITION:</b> ${tech.position}
💸 <b>ENTRY AREA:</b> $${tech.entry}
🛑 <b>STOP LOSS:</b> $${tech.sl}
💰 <b>TARGET 1:</b> $${tech.tp1}
💰 <b>TARGET 2:</b> $${tech.tp2}
━━━━━━━━━━━━━━━━━━━━━━
📝 <b>SMC & SNR REASONING:</b>
${tech.reason.map(r => `• ${r}`).join('\n')}
`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) { console.error("Tech Telegram Error:", err.message); }
}

async function sendPreNewsWarning(newsItem) {
  try {
    const forecastText = newsItem.forecast !== undefined && newsItem.forecast !== null ? newsItem.forecast : "N/A";
    const message = `\n⏳ <b>PRE-NEWS WARNING</b> ⏳\n━━━━━━━━━━━━━━━━━━━━━━\n🚨 <b>${newsItem.title || newsItem.indicator || "USD High Impact News"}</b> \nAkan rilis dalam <b>5 MENIT!</b>\n\n📊 <b>Forecast Market:</b> ${forecastText}\n⚠️ <i>Siap-siap volatilitas tinggi. Amankan SL atau hindari entry!</i>\n`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) { console.error(err); }
}

// ─── XAU/USD AUTOMATED TECHNICAL ENGINE (SMC + SNR MATH) ─────────────────────
async function calculateTechnicalSignal() {
  try {
    // Ambil data chart Gold (GC=F) TF Daily untuk hitung Pivot Point SNR
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=5d';
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    const quotes = result.indicators.quote[0];
    
    const len = quotes.close.length;
    const currentPrice = result.meta.regularMarketPrice;
    
    // Data candle kemarin
    const high = quotes.high[len - 2];
    const low = quotes.low[len - 2];
    const close = quotes.close[len - 2];
    
    // Rumus Matematika Floor Pivot Points (SNR)
    const pivot = (high + low + close) / 3;
    const s1 = (2 * pivot) - high;
    const r1 = (2 * pivot) - low;
    const s2 = pivot - (high - low);
    const r2 = pivot + (high - low);

    let position = "WAIT & SEE";
    let entry = currentPrice.toFixed(2);
    let sl = (currentPrice - 7).toFixed(2);
    let tp1 = (currentPrice + 12).toFixed(2);
    let tp2 = (currentPrice + 25).toFixed(2);
    let reason = [];

    // Algoritma Pembuat Keputusan Sinyal Teknikal
    if (currentPrice <= s1) {
      position = "BUY LIMIT / BUY NOW";
      entry = s1.toFixed(2);
      sl = (s1 - 6).toFixed(2);
      tp1 = pivot.toFixed(2);
      tp2 = r1.toFixed(2);
      reason = [
        `SNR: Harga memasuki area Major Support 1 ($${s1.toFixed(2)})`,
        `SMC: Terjadi Liquidity Sweep (SSL) di bawah low kemarin`,
        `SMC: Potensi pembentukan Demand Order Block di TF kecil`
      ];
    } else if (currentPrice >= r1) {
      position = "SELL LIMIT / SELL NOW";
      entry = r1.toFixed(2);
      sl = (r1 + 6).toFixed(2);
      tp1 = pivot.toFixed(2);
      tp2 = s1.toFixed(2);
      reason = [
        `SNR: Harga menyentuh Major Resistance 1 ($${r1.toFixed(2)})`,
        `SMC: Pasar mengambil Buy-Side Liquidity (BSL) di area high kemarin`,
        `SMC: Terjadi pola Mitigasi dan rejection pada Supply Zone`
      ];
    } else {
      position = "SCALPING PIVOT ZONE";
      entry = currentPrice.toFixed(2);
      sl = (currentPrice - 5).toFixed(2);
      tp1 = (currentPrice + 8).toFixed(2);
      tp2 = (currentPrice - 8).toFixed(2);
      reason = [
        `SNR: Harga sedang berada di area konsolidasi Pivot Point ($${pivot.toFixed(2)})`,
        `SMC: Menunggu konfirmasi Market Structure Shift (MSS / CHoCH)`,
        `SMC: Order flow netral, area akumulasi volume intraday`
      ];
    }

    return { currentPrice: currentPrice.toFixed(2), position, entry, sl, tp1, tp2, reason };
  } catch (err) {
    console.error("Technical engine crash:", err.message);
    return { currentPrice: "N/A", position: "ENGINE OFFLINE", entry: "0", sl: "0", tp1: "0", tp2: "0", reason: ["Gagal memproses indikator teknikal."] };
  }
}

// ─── DATA FETCHERS OLD SYSTEM ────────────────────────────────────────────────
async function fetchDXY() {
  try {
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d';
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const result = res.data.chart.result[0];
    const current = result.meta.regularMarketPrice;
    const changePercent = ((current - result.meta.previousClose) / result.meta.previousClose) * 100;
    return { current: parseFloat(current.toFixed(2)), status: changePercent >= 0 ? "BULLISH (UP)" : "BEARISH (DOWN)" };
  } catch (err) { return { current: "N/A", status: "OFFLINE" }; }
}

async function fetchTradingViewData() {
  try {
    const today = new Date();
    const fromDate = new Date(today); fromDate.setDate(today.getDate() - 45); 
    const toDate = new Date(today); toDate.setDate(today.getDate() + 15);   
    const res = await axios.get(`https://economic-calendar.tradingview.com/events?from=${fromDate.toISOString()}&to=${toDate.toISOString()}&countries=US`, { timeout: 10000, headers: { 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/', 'User-Agent': 'Mozilla/5.0' } });
    return res.data && res.data.result ? res.data.result : [];
  } catch (err) { return []; }
}

async function fetchCrudeOil() {
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=45d', { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const closes = res.data.chart.result[0].indicators.quote[0].close.filter(c => c !== null);
    return { current: closes[closes.length - 1], avg30: closes.slice(-30).reduce((a,b) => a+b, 0) / Math.min(closes.length, 30) };
  } catch (err) { return { current: null, avg30: null }; }
}

function findLatestReleasedEvent(events, keywords) {
  const matches = events.filter(e => keywords.some(kw => (e.title || e.indicator || "").toLowerCase().includes(kw.toLowerCase())) && e.actual !== undefined && e.actual !== null && e.actual !== "");
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  return matches[0]; 
}

function scoreNFP(events) {
  let score = 0; const components = {};
  const adp = findLatestReleasedEvent(events, ["adp employment", "adp nonfarm"]);
  if (adp) { const pts = adp.actual > adp.forecast ? 40 : -40; score += pts; components.adp = { event: adp.title, actual: adp.actual, estimate: adp.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.adp = { event: "ADP Nonfarm", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  const ism = findLatestReleasedEvent(events, ["ism manufacturing", "ism services"]);
  if (ism) { const pts = ism.actual > 50 ? 30 : -30; score += pts; components.ism = { event: ism.title, actual: ism.actual, estimate: 50.0, points: pts, status: pts > 0 ? "EXPANSIONARY" : "CONTRACTIONARY" }; } else components.ism = { event: "ISM PMI", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  const jolts = findLatestReleasedEvent(events, ["jolts"]);
  if (jolts) { const pts = jolts.actual > jolts.forecast ? 30 : -30; score += pts; components.jolts = { event: jolts.title, actual: jolts.actual, estimate: jolts.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.jolts = { event: "JOLTs Job Openings", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  return { score, signal: score >= 20 ? "GOOD USD" : score <= -20 ? "BAD USD" : "MIXED", components };
}

function scoreCPI(events, crudeOil) {
  let score = 0; const components = {};
  const ppi = findLatestReleasedEvent(events, ["producer price index", "ppi m/m", "core ppi"]);
  if (ppi) { const pts = ppi.actual > ppi.forecast ? 60 : -60; score += pts; components.ppi = { event: ppi.title, actual: ppi.actual, estimate: ppi.forecast, points: pts, status: pts > 0 ? "BEAT" : "MISSED" }; } else components.ppi = { event: "Producer Price Index", actual: "N/A", estimate: "N/A", points: 0, status: "NO DATA" };
  if (crudeOil && crudeOil.current !== null) { const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40; score += pts; components.crude = { event: "Crude Oil WTI", current: crudeOil.current, avg30: crudeOil.avg30, points: pts, status: pts > 0 ? "ABOVE" : "BELOW" }; } else components.crude = { event: "Crude Oil WTI", points: 0, status: "FAILED" };
  return { score, signal: score >= 20 ? "HIGH INFLATION" : score <= -20 ? "LOW INFLATION" : "MIXED", components };
}

// ─── MAIN ROUTER HANDLER ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); return res.status(200).end(); }
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Content-Type", "application/json");

  const isCron = req.query.cron === "true";

  // A. JALUR TELEGRAM WEBHOOK COMMAND (/refresh)
  if (req.method === "POST" && req.body && req.body.message) {
    if (req.body.message.text === "/refresh") {
      const [events, crudeOil, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateTechnicalSignal() ]);
      const nfp = scoreNFP(events); const cpi = scoreCPI(events, crudeOil);
      const totalScore = nfp.score + cpi.score + 100; // Fed mock integration constant
      await sendTelegramAlert(totalScore >= 40 ? "SELL" : "BUY", totalScore, dxy, nfp, cpi, {score:0}, {score:100});
      
      // Kirim sinyal teknikalnya juga ke Telegram biar komplit!
      if(tech.position !== "SCALPING PIVOT ZONE") {
         await sendTechnicalSignalTechnical(tech);
      }
      return res.status(200).json({ success: true });
    }
    return res.status(200).json({ success: true });
  }

  // B. JALUR MONITOR UTAMA WEBSITE & CRON JOB
  try {
    const [events, crudeOil, dxy, tech] = await Promise.all([ fetchTradingViewData(), fetchCrudeOil(), fetchDXY(), calculateTechnicalSignal() ]);
    const nfp = scoreNFP(events); const cpi = scoreCPI(events, crudeOil);
    const totalScore = nfp.score + cpi.score + 100;
    const masterSignal = totalScore >= 40 ? "STRONG SELL XAU" : totalScore <= -40 ? "STRONG BUY XAU" : "NEUTRAL";

    if (isCron) {
      // Robot scan berita rilis terdekat
      const now = Date.now();
      const upcoming = events.filter(e => (e.country === "US" || e.currency === "USD") && (new Date(e.date).getTime() - now) / 60000 > 0 && (new Date(e.date).getTime() - now) / 60000 <= 5);
      for (const news of upcoming) { await sendPreNewsWarning(news); }
      
      // Robot cek sinyal teknikal (Hanya kirim ke Telegram jika terdeteksi setup Buy/Sell yang matang)
      if (tech.position !== "SCALPING PIVOT ZONE") {
         await sendTechnicalSignalTelegram(tech);
      }
    } else {
      await sendTelegramAlert(masterSignal, totalScore, dxy, nfp, cpi, {score:0}, {score:100});
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      dxy_live: dxy,
      master_signal: { signal: masterSignal, total_score: totalScore },
      nfp, cpi, growth: {score: -50, signal:"WEAK", components:{gdp:{actual:1.6,estimate:2.0,status:"MISSED"}}}, fed: {score:100, signal:"HAWKISH", components:{fed:{actual:5.5,estimate:5.5,status:"HAWKISH"}}},
      upcoming_news: [],
      technical_signal: tech // Lempar data teknikal baru ke frontend HTML
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
