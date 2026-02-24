const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function normalizeSymbol(raw) {
  return String(raw || "").trim().toUpperCase();
}

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FirebaseFunctions/1.0)" }
  });

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.quoteResponse?.result?.[0];
  const price = Number(result?.regularMarketPrice);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Yahoo: preço inválido ou símbolo não encontrado");
  }

  return price;
}

exports.api = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).send("");

  if (req.path !== "/quote") return res.status(404).json({ error: "not_found" });

  try {
    const symbol = normalizeSymbol(req.query.symbol);
    if (!symbol) return res.status(400).json({ error: "missing_symbol" });

    const now = Date.now();
    const cached = cache.get(symbol);
    if (cached && (now - cached.ts) < CACHE_TTL_MS) {
      return res.status(200).json({ symbol, price: cached.price, cached: true });
    }

    const price = await fetchYahooQuote(symbol);
    cache.set(symbol, { price, ts: now });

    return res.status(200).json({ symbol, price, cached: false });
  } catch (e) {
    return res.status(500).json({ error: "quote_failed", message: e?.message || String(e) });
  }
});
