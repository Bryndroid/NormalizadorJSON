// Reglas declarativas: aliases, formatos aceptados y pistas de detección.
export const RULES_NORMALIZATION = Object.freeze({
  maxIdLength: 30,
  fieldAliases: {
    id: ["id", "transaction_id", "transactionId", "reference", "ref"],
    amount: ["amount", "total", "value", "price"],
    currency: ["currency", "currency_code", "currencyCode"],
    timestamp: ["timestamp", "date", "datetime", "created_at", "createdAt"],
    status: ["status", "state", "result"],
  },
  amountPattern: /^[+-]?(?:\d+|\d{1,3}(?:[.,\s]\d{3})+)(?:[.,]\d+)?$/,
  currencySymbols: {
    "$": "USD",
    "€": "EUR",
  },
  currencyAliases: {
    USD: "USD",
    US$: "USD",
    "$": "USD",
    DOLLAR: "USD",
    DOLLARS: "USD",
    EUR: "EUR",
    "€": "EUR",
    EURO: "EUR",
    EUROS: "EUR",
  },
  statusAliases: {
    SUCCESS: ["success", "successful", "completed", "complete", "ok", "paid", "approved", "done"],
    FAILED: ["failed", "failure", "rejected", "error", "declined", "cancelled", "canceled"],
    PENDING: ["pending", "processing", "in_progress", "in progress", "queued", "waiting"],
  },
  sourcePatterns: [
    { source: "bank", keys: ["iban", "bic", "swift", "bank_account", "bankAccount", "routing_number"] },
    { source: "paypal", keys: ["paypal_id", "paypalId", "payer_id", "payerId"] },
    { source: "crypto", keys: ["wallet", "wallet_address", "walletAddress", "txid", "transaction_hash", "transactionHash"] },
  ],
});
