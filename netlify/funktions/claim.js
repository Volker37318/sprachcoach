// netlify/functions/claim.js
import crypto from "crypto";
import { PRODUCTS } from "./_catalog.js";

const clamp = (n, min, max) => Math.min(max, Math.max(min, n | 0));
const addMonths = (ts, m) => { const d = new Date(ts); d.setMonth(d.getMonth() + m); return d.getTime(); };

function sign(input) {
  const secret = process.env.CLAIM_SECRET || "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(input).digest("hex").slice(0, 32);
}

const json = (status, obj) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  },
  body: JSON.stringify(obj),
});

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Ungültiges JSON" });
  }

  const email     = String(payload.email || "").trim().toLowerCase();
  const orderId   = String(payload.orderId || "").trim();
  const productId = String(payload.productId || "").trim().toUpperCase(); // PG/PD/PK oder echte ID
  const months    = clamp(Number(payload.months || 1), 1, 12);

  if (!email || !orderId || !productId) {
    return json(400, { error: "E-Mail, Bestell-ID und Produkt-ID erforderlich" });
  }

  const product = PRODUCTS[productId];
  if (!product) return json(400, { error: "Unbekanntes Produkt" });

  const now = Date.now();
  const expiresAt = addMonths(now, months);

  // Token an Bestellung + Paket + Laufzeit binden
  const key = `${orderId}|${email}|${productId}|${months}`;
  const proToken = `pro_${sign(key)}`;

  return json(200, {
    proToken,
    entitlements: product.entitlements,
    expiresAt,
    productId,
    months,
    productLabel: product.name || productId
  });
}
