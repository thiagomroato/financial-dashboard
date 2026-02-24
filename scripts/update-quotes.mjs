import admin from "firebase-admin";

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseSymbols() {
  // Você pode trocar para ler do Firestore depois; por enquanto vem de env
  const raw = (process.env.QUOTE_SYMBOLS || "AAPL,MSFT,ITSA4.SA").trim();
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; github-actions/1.0)" }
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.quoteResponse?.result?.[0];
  const price = Number(r?.regularMarketPrice);
  const currency = r?.currency ?? null;
  const name = r?.shortName ?? r?.longName ?? null;

  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid price");
  return { price, currency, name };
}

async function main() {
  // Autenticação via Service Account JSON (secret)
  const saJson = JSON.parse(env("FIREBASE_SERVICE_ACCOUNT_JSON"));
  admin.initializeApp({ credential: admin.credential.cert(saJson) });

  const db = admin.firestore();
  const symbols = parseSymbols();
  const now = admin.firestore.FieldValue.serverTimestamp();

  console.log("Updating symbols:", symbols);

  for (const symbol of symbols) {
    try {
      const q = await fetchYahoo(symbol);
      await db.collection("quotes").doc(symbol).set(
        {
          symbol,
          price: q.price,
          currency: q.currency,
          name: q.name,
          updatedAt: now,
          source: "yahoo"
        },
        { merge: true }
      );
      console.log(`OK ${symbol} = ${q.price}`);
    } catch (e) {
      console.error(`FAIL ${symbol}`, e?.message || e);
      await db.collection("quotes").doc(symbol).set(
        {
          symbol,
          error: e?.message || String(e),
          updatedAt: now,
          source: "yahoo"
        },
        { merge: true }
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
