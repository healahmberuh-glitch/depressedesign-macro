// api/predict.js — DEPRESSEDESIGN Macro Predictor Backend
// Vercel Serverless Function (Node.js)

const axios = require("axios");

// ─── API KEY (server-side only, never exposed to the browser) ───────────────
const FMP_API_KEY = "9bady1cwzAU6GokvaTllwCpYhFoMxm4n";
const FMP_BASE = "https://financialmodelingprep.com/api/v3";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch economic calendar events from FMP filtered by a keyword.
 * Returns the most recent entry that has both an `actual` and `estimate` value.
 */
async function fetchFMPIndicator(eventName) {
  try {
    // Pull the last 90 days of economic calendar data
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 90);

    const fmt = (d) => d.toISOString().split("T")[0];

    const url = `${FMP_BASE}/economic_calendar?from=${fmt(from)}&to=${fmt(today)}&apikey=${FMP_API_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });

    if (!res.data || !Array.isArray(res.data)) return null;

    // Find entries whose event name contains our keyword (case-insensitive)
    const keyword = eventName.toLowerCase();
    const matches = res.data.filter(
      (e) =>
        e.event &&
        e.event.toLowerCase().includes(keyword) &&
        e.actual !== null &&
        e.actual !== undefined
    );

    if (matches.length === 0) return null;

    // Sort descending by date — most recent first
    matches.sort((a, b) => new Date(b.date) - new Date(a.date));
    return matches[0]; // { event, date, actual, estimate, previous, country }
  } catch (err) {
    console.error(`FMP fetch error [${eventName}]:`, err.message);
    return null;
  }
}

/**
 * Fetch Crude Oil (CL=F) current price and 30-day average via yahoo-finance2.
 */
async function fetchCrudeOil() {
  try {
    // Dynamic import to handle ESM/CJS boundary
    // yahoo-finance2 v2.x exports a class — instantiate it
    const YahooFinance = (await import("yahoo-finance2")).default;
    const yf = new YahooFinance();

    // Current quote
    const quote = await yf.quote("CL=F");
    const currentPrice = quote?.regularMarketPrice ?? null;

    if (currentPrice === null) return { current: null, avg30: null };

    // Historical data — last 35 days to ensure 30 trading days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 35);

    const historical = await yf.historical("CL=F", {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    if (!historical || historical.length === 0) {
      return { current: currentPrice, avg30: null };
    }

    // Take the last 30 sessions
    const closes = historical
      .slice(-30)
      .map((d) => d.close)
      .filter((c) => c !== null && c !== undefined);

    const avg30 =
      closes.length > 0
        ? closes.reduce((sum, v) => sum + v, 0) / closes.length
        : null;

    return { current: currentPrice, avg30 };
  } catch (err) {
    console.error("Yahoo Finance error:", err.message);
    return { current: null, avg30: null };
  }
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

function scoreNFP(adpData, ismData, joltsData) {
  let score = 0;
  const components = {};

  // ADP Nonfarm (+/-50)
  if (adpData && adpData.actual !== null && adpData.estimate !== null) {
    const pts = adpData.actual > adpData.estimate ? 50 : -50;
    score += pts;
    components.adp = {
      event: adpData.event,
      date: adpData.date,
      actual: adpData.actual,
      estimate: adpData.estimate,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.adp = {
      event: "ADP Nonfarm Employment",
      actual: null,
      estimate: null,
      points: 0,
      status: "NO DATA",
    };
  }

  // ISM PMI Employment (+/-30) — we look for the overall ISM reading
  if (ismData && ismData.actual !== null) {
    const pts = ismData.actual > 50 ? 30 : -30;
    score += pts;
    components.ism = {
      event: ismData.event,
      date: ismData.date,
      actual: ismData.actual,
      estimate: ismData.estimate,
      points: pts,
      threshold: 50,
      status: pts > 0 ? "EXPANSIONARY (>50)" : "CONTRACTIONARY (<50)",
    };
  } else {
    components.ism = {
      event: "ISM Manufacturing PMI",
      actual: null,
      estimate: null,
      points: 0,
      status: "NO DATA",
    };
  }

  // JOLTs (+/-20)
  if (joltsData && joltsData.actual !== null && joltsData.estimate !== null) {
    const pts = joltsData.actual > joltsData.estimate ? 20 : -20;
    score += pts;
    components.jolts = {
      event: joltsData.event,
      date: joltsData.date,
      actual: joltsData.actual,
      estimate: joltsData.estimate,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.jolts = {
      event: "JOLTs Job Openings",
      actual: null,
      estimate: null,
      points: 0,
      status: "NO DATA",
    };
  }

  let signal;
  if (score > 40) signal = "GOOD USD (SELL XAU)";
  else if (score < -40) signal = "BAD USD (BUY XAU)";
  else signal = "MIXED (WAIT & SEE)";

  return { score, signal, components };
}

function scoreCPI(ppiData, crudeOil) {
  let score = 0;
  const components = {};

  // PPI (+/-60)
  if (ppiData && ppiData.actual !== null && ppiData.estimate !== null) {
    const pts = ppiData.actual > ppiData.estimate ? 60 : -60;
    score += pts;
    components.ppi = {
      event: ppiData.event,
      date: ppiData.date,
      actual: ppiData.actual,
      estimate: ppiData.estimate,
      points: pts,
      status: pts > 0 ? "BEAT" : "MISSED",
    };
  } else {
    components.ppi = {
      event: "Producer Price Index (PPI)",
      actual: null,
      estimate: null,
      points: 0,
      status: "NO DATA",
    };
  }

  // Crude Oil (+/-40)
  if (crudeOil.current !== null && crudeOil.avg30 !== null) {
    const pts = crudeOil.current > crudeOil.avg30 ? 40 : -40;
    score += pts;
    components.crude = {
      event: "Crude Oil WTI (CL=F)",
      current: parseFloat(crudeOil.current.toFixed(2)),
      avg30: parseFloat(crudeOil.avg30.toFixed(2)),
      points: pts,
      status:
        pts > 0
          ? `ABOVE 30-DAY AVG ($${crudeOil.avg30.toFixed(2)})`
          : `BELOW 30-DAY AVG ($${crudeOil.avg30.toFixed(2)})`,
    };
  } else {
    components.crude = {
      event: "Crude Oil WTI (CL=F)",
      current: null,
      avg30: null,
      points: 0,
      status: "NO DATA",
    };
  }

  let signal;
  if (score > 40) signal = "HIGH INFLATION / GOOD USD (SELL XAU)";
  else if (score < -40) signal = "LOW INFLATION / BAD USD (BUY XAU)";
  else signal = "MIXED (WAIT & SEE)";

  return { score, signal, components };
}

// ─── Serverless Handler ───────────────────────────────────────────────────────

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    console.log("Fetching macro indicators...");

    // Parallel fetch all data sources
    const [adpData, ismData, joltsData, ppiData, crudeOil] = await Promise.all([
      fetchFMPIndicator("ADP Nonfarm"),
      fetchFMPIndicator("ISM Manufacturing PMI"),
      fetchFMPIndicator("JOLTs Job Openings"),
      fetchFMPIndicator("Producer Price Index"),
      fetchCrudeOil(),
    ]);

    const nfp = scoreNFP(adpData, ismData, joltsData);
    const cpi = scoreCPI(ppiData, crudeOil);

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      nfp,
      cpi,
      meta: {
        dataSource: "Financial Modeling Prep + Yahoo Finance",
        note: "Scores are forward-looking proxies. Not financial advice.",
      },
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Predict handler error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error. Please try again.",
      timestamp: new Date().toISOString(),
    });
  }
};
