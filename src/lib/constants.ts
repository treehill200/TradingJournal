/** Balance rows that move real cash and are not already captured by trades.
 *  Kept free of Node imports so both client and server code can use it. */
export const CASH_FLOW_KINDS = new Set([
  "deposit",
  "withdrawal",
  "transfer",
  "adjustment",
  "interest",
  "dividend",
]);

export const BALANCE_KINDS = [
  "deposit",
  "withdrawal",
  "transfer",
  "adjustment",
  "interest",
  "dividend",
  "fee",
  "pnl",
  "unknown",
] as const;
