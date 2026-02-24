import admin from "firebase-admin";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeTicker(raw) {
  return String(raw || "").trim().toUpperCase();
}

function isBrazilLikeTicker(ticker) {
  return /[0-9]$/.test(ticker) || ticker.endsWith(".SA");
}

function toQuoteDocIdCandidates(rawTicker) {
  const t = normalizeTicker(rawTicker);
  if (!t) return [];

  if (isBrazilLikeTicker(t)) {
    const withSA = t.endsWith(".SA") ? t : `${t}.SA`;
    return Array.from(new Set([withSA, t]));
  }

  return Array.from(new Set([t, `${t}.SA`]));
}

async function fetchAlphaVantageQuote(symbol, apiKey) {
  const url =
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`AlphaVantage HTTP ${res.status}`);
  const data = await res.json();

  if (data?.Note) throw new Error(`AlphaVantage rate limit: ${data.Note}`);
  if (data?.Information) throw new Error(`AlphaVantage: ${data.Information}`);
  if (data?.["Error Message"]) throw new Error(`AlphaVantage: ${data["Error Message"]}`);

  const quote = data?.["Global Quote"];
  const price = Number(quote?.["05. price"]);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid price");

  return price;
}

async function fetchAlphaVantageUsdBrl(apiKey) {
  const url =
    `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=BRL&apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`AlphaVantage FX HTTP ${res.status}`);
  const data = await res.json();

  if (data?.Note) throw new Error(`AlphaVantage rate limit: ${data.Note}`);
  if (data?.Information) throw new Error(`AlphaVantage: ${data.Information}`);
  if (data?.["Error Message"]) throw new Error(`AlphaVantage: ${data["Error Message"]}`);

  const fx = data?.["Realtime Currency Exchange Rate"];
  // Campo vem como string tipo "5.0123"
  const rate = Number(fx?.["5. Exchange Rate"]);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid USD/BRL exchange rate");

  return rate;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const sa = JSON.parse(mustEnv("FIREBASE_SERVICE_ACCOUNT_JSON"));
  const apiKey = mustEnv("ALPHAVANTAGE_KEY");

  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  // Alpha Vantage é bem restrito no free tier; evita spammar
  const DELAY_MS = 15000; // 15s entre requests

  // 0) Atualiza USD/BRL primeiro (doc quotes/USD-BRL)
  try {
    const usdBrl = await fetchAlphaVantageUsdBrl(apiKey);

    await db.collection("quotes").doc("USD-BRL").set(
      {
        symbol: "USD-BRL",
        price: usdBrl,
        source: "alphavantage",
        error: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    console.log(`OK USD-BRL = ${usdBrl}`);
  } catch (e) {
    console.log(`FAIL USD-BRL: ${e?.message || e}`);
    await db.collection("quotes").doc("USD-BRL").set(
      {
        symbol: "USD-BRL",
        source: "alphavantage",
        error: e?.message || String(e),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } finally {
    await sleep(DELAY_MS);
  }

  // 1) Descobrir tickers em transactions
  const snap = await db.collection("transactions").get();
  const tickers = new Set();

  snap.forEach((d) => {
    const x = d.data();
    if (x?.tipo !== "investimento") return;
    if (x?.investKind === "cdb") return;
    const t = normalizeTicker(x?.ticker);
    if (t) tickers.add(t);
  });

  const list = Array.from(tickers);
  console.log("Tickers found:", list);

  // 2) Atualizar tickers
  for (const rawTicker of list) {
    const candidates = toQuoteDocIdCandidates(rawTicker);
    let saved = false;

    for (const sym of candidates) {
      try {
        const price = await fetchAlphaVantageQuote(sym, apiKey);

        await db.collection("quotes").doc(sym).set(
          {
            symbol: sym,
            price,
            source: "alphavantage",
            error: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        console.log(`OK ${rawTicker} -> ${sym} = ${price}`);
        saved = true;
        break;
      } catch (e) {
        console.log(`FAIL ${rawTicker} -> ${sym}: ${e?.message || e}`);
      } finally {
        await sleep(DELAY_MS);
      }
    }

    if (!saved) {
      await db.collection("quotes").doc(rawTicker).set(
        {
          symbol: rawTicker,
          source: "alphavantage",
          error: "Could not fetch any candidate symbol",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
