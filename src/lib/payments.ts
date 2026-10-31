/**
 * Encaissement en un ou plusieurs moyens de paiement (meme logique que le web : stockfrontweb/src/lib/payments.js).
 * - mode simple : une ligne, un montant vide = le total du ;
 * - mode partage : plusieurs lignes, chacune avec son montant ;
 * - les especes peuvent depasser le du (monnaie a rendre), les autres moyens jamais ; le reste part en credit client.
 */
export type PayRow = { key: string; method: string; amount: string; reference: string };
export type Pay = { split: boolean; rows: PayRow[] };

const toNum = (v: string | number | undefined | null) => {
  const x = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : 0;
};
const round = (v: number) => Math.round(v * 100) / 100;
let counter = 0;
export const newRow = (method: string, amount = ''): PayRow => ({ key: `p${Date.now().toString(36)}${counter++}`, method, amount, reference: '' });

export const initPay = (method: string): Pay => ({ split: false, rows: [newRow(method)] });
export const resetPay = (pay: Pay): Pay => ({ split: false, rows: [newRow(pay.rows[0]?.method ?? 'CASH')] });

export function settle(pay: Pay, due: number) {
  const rows = pay.rows.map((r) => ({ ...r, value: pay.split ? toNum(r.amount) : (r.amount === '' ? due : toNum(r.amount)) }));
  const nonCash = rows.filter((r) => r.method !== 'CASH').reduce((s, r) => s + r.value, 0);
  const cash = rows.filter((r) => r.method === 'CASH').reduce((s, r) => s + r.value, 0);
  const change = round(Math.max(0, cash - Math.max(0, due - nonCash)));
  const received = nonCash + cash;
  const paid = round(Math.min(due, received));
  const remaining = round(Math.max(0, due - received));
  const nonCashOver = pay.split ? round(Math.max(0, nonCash - due)) : 0;
  const payments = rows.filter((r) => r.value > 0).map((r) => ({
    method: r.method,
    amount: r.method === 'CASH' ? round(r.value) : round(pay.split ? r.value : Math.min(r.value, due)),
    reference: r.reference.trim() || undefined,
  }));
  return { rows, payments, paid, change, remaining, onCredit: remaining, nonCashOver, tendered: cash, received, valid: nonCashOver === 0 };
}
export type Settlement = ReturnType<typeof settle>;

export const nextMethod = (pay: Pay, methods: string[]) => methods.find((m) => !pay.rows.some((r) => r.method === m)) ?? methods[0];
export function startSplit(pay: Pay, due: number, methods: string[]): Pay {
  const first = pay.rows[0];
  return { split: true, rows: [{ ...first, amount: first.amount === '' ? String(due) : first.amount }, newRow(nextMethod(pay, methods))] };
}
export const endSplit = (pay: Pay): Pay => ({ split: false, rows: [{ ...pay.rows[0], amount: '' }] });
export const setRow = (pay: Pay, key: string, patch: Partial<PayRow>): Pay => ({ ...pay, rows: pay.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
export function fillRow(pay: Pay, key: string, due: number): Pay {
  const others = pay.rows.filter((r) => r.key !== key).reduce((s, r) => s + toNum(r.amount), 0);
  return setRow(pay, key, { amount: String(round(Math.max(0, due - others))) });
}
export function addRow(pay: Pay, due: number, methods: string[]): Pay {
  const used = pay.rows.reduce((s, r) => s + toNum(r.amount), 0);
  const rest = round(Math.max(0, due - used));
  return { ...pay, rows: [...pay.rows, newRow(nextMethod(pay, methods), rest > 0 ? String(rest) : '')] };
}
export function removeRow(pay: Pay, key: string): Pay {
  const rows = pay.rows.filter((r) => r.key !== key);
  return rows.length ? { ...pay, rows, split: pay.split && rows.length > 1 } : pay;
}
export function evenSplit(pay: Pay, due: number): Pay {
  const n = pay.rows.length;
  const part = Math.floor((due / n) * 100) / 100;
  return { ...pay, rows: pay.rows.map((r, i) => ({ ...r, amount: String(i === n - 1 ? round(due - part * (n - 1)) : part) })) };
}
