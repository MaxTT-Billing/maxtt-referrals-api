export type Credit = {
  id: number;
  invoiceId: number | string;
  customerCode: string;
  refCode: string;
  subtotal: number;
  gst: number;
  litres: number;
  createdAt: string;
  ts: string;
};

const credits: Credit[] = [];
let seq = 1;

export function addCredit(rec: Omit<Credit, "id" | "ts">): Credit {
  const row: Credit = { id: seq++, ts: new Date().toISOString(), ...rec };
  credits.push(row);
  return row;
}

export function listCredits(filter?: {
  refCode?: string; customerCode?: string; from?: string; to?: string;
}): Credit[] {
  let out = credits.slice().reverse();
  if (filter?.refCode) {
    const rc = filter.refCode.trim().toUpperCase();
    out = out.filter(c => c.refCode.toUpperCase() === rc);
  }
  if (filter?.customerCode) {
    const cc = filter.customerCode.trim().toUpperCase();
    out = out.filter(c => c.customerCode.toUpperCase() === cc);
  }
  if (filter?.from) {
    const t = Date.parse(filter.from); if (!isNaN(t)) out = out.filter(c => Date.parse(c.createdAt) >= t);
  }
  if (filter?.to) {
    const t = Date.parse(filter.to); if (!isNaN(t)) out = out.filter(c => Date.parse(c.createdAt) <= t);
  }
  return out;
}
