export type Account = {
  id: string;
  user_id: string;
  name: string;
  broker: string;
  kind: "paper" | "live";
  currency: string;
  starting_balance: number;
  risk_mode: "fixed" | "percent";
  risk_value: number;
  timezone: string;
  is_default: number;
  archived: number;
  created_at: string;
  updated_at: string;
};

export type Trade = {
  id: string;
  account_id: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entry_price: number | null;
  exit_price: number | null;
  stop_price: number | null;
  opened_at: string | null;
  closed_at: string;
  close_date: string;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  risk_amount: number | null;
  r_multiple: number | null;
  tags: string;
  notes: string;
  source: string;
};

export type BalanceEvent = {
  id: string;
  account_id: string;
  kind: string;
  amount: number;
  balance: number | null;
  occurred_at: string;
  event_date: string;
  note: string;
  source: string;
};

export type DayEntry = {
  id: string;
  account_id: string;
  date: string;
  net_pnl: number;
  trades: number;
  wins: number;
  losses: number;
  r_multiple: number | null;
};

export type DayNote = {
  id: string;
  account_id: string;
  date: string;
  title: string;
  body: string;
  mood: string;
  rating: number | null;
  tags: string;
  updated_at: string;
};

export type ImportRecord = {
  id: string;
  filename: string;
  dataset: string;
  format: string;
  rows_read: number;
  inserted: number;
  duplicates: number;
  skipped: number;
  created_at: string;
};

export type Filters = {
  from?: string;
  to?: string;
  symbols: string[];
  sides: ("long" | "short")[];
  tags: string[];
  result: "all" | "wins" | "losses";
  search?: string;
};

export const EMPTY_FILTERS: Filters = {
  symbols: [],
  sides: [],
  tags: [],
  result: "all",
};
