# DEPRESSEDESIGN Macro Predictor

Macroeconomic Sentiment Predictor for Forex & Gold (XAU/USD).

## Stack
- **Frontend**: `public/index.html` — Tailwind CSS (CDN), Vanilla JS
- **Backend**: `api/predict.js` — Vercel Serverless Function (Node.js)
- **Data**: Financial Modeling Prep API + Yahoo Finance (yahoo-finance2)

## Project Structure
```
depressedesign-macro/
├── public/
│   └── index.html        ← Dashboard UI
├── api/
│   └── predict.js        ← Serverless function
├── package.json
├── vercel.json
└── README.md
```

## Scoring Logic

### NFP Predictor (±100 pts)
| Indicator | Weight | Rule |
|-----------|--------|------|
| ADP Nonfarm | ±50 | actual > estimate → +50, else −50 |
| ISM Mfg PMI | ±30 | actual > 50 → +30, else −30 |
| JOLTs | ±20 | actual > estimate → +20, else −20 |

**Result**: Score > 40 = SELL XAU | Score < -40 = BUY XAU | else WAIT

### CPI Predictor (±100 pts)
| Indicator | Weight | Rule |
|-----------|--------|------|
| PPI | ±60 | actual > estimate → +60, else −60 |
| Crude Oil | ±40 | current > 30-day avg → +40, else −40 |

**Result**: Score > 40 = SELL XAU | Score < -40 = BUY XAU | else WAIT

## Deploy to Vercel

### Prerequisites
- Node.js 18+
- Vercel CLI: `npm i -g vercel`

### Steps
```bash
# 1. Install dependencies
npm install

# 2. Test locally
vercel dev

# 3. Deploy to production
vercel --prod
```

The app will be live at `https://your-project.vercel.app`.

## API Endpoint

`GET /api/predict`

Returns JSON:
```json
{
  "success": true,
  "timestamp": "2024-01-15T12:00:00.000Z",
  "nfp": {
    "score": 70,
    "signal": "GOOD USD (SELL XAU)",
    "components": { "adp": {...}, "ism": {...}, "jolts": {...} }
  },
  "cpi": {
    "score": -60,
    "signal": "LOW INFLATION / BAD USD (BUY XAU)",
    "components": { "ppi": {...}, "crude": {...} }
  }
}
```

## Notes
- API key is server-side only, never exposed to the browser.
- Data from FMP Economic Calendar (90-day lookback).
- Crude Oil data: Yahoo Finance real-time + 30-day historical average.
- **Not financial advice. For research purposes only.**
