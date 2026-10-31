import { sellable, type Product } from './format';

/**
 * Index de recherche en memoire du catalogue local (meme logique que le site : stockfrontweb/src/offline/catalogIndex.js).
 * Champs normalises une seule fois a l'insertion ; mise a jour article par article ; la recherche ne garde que les meilleurs resultats.
 */
export const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Entry = { p: Product; name: string; hay: string };
export type BarcodeHit = { product: Product; unitId: string | null };

const entryOf = (p: Product): Entry => ({
  p,
  name: norm(p.name),
  hay: norm([p.name, p.sku, p.barcode, ...(p.units ?? []).map((u) => u.barcode), p.attributes?.dci, p.attributes?.brand, p.categoryName].filter(Boolean).join(' ')),
});

export class CatalogIndex {
  entries: Entry[] = [];
  pos = new Map<string, number>();
  codes = new Map<string, BarcodeHit>();

  get size() { return this.entries.length; }

  items(): Product[] { return this.entries.map((e) => e.p); }

  get(id: string): Product | undefined { const i = this.pos.get(id); return i === undefined ? undefined : this.entries[i].p; }

  /** Construit l'index par tranches pour ne pas figer l'interface sur 20 000 articles. */
  async build(items: Product[], chunk = 2000) {
    this.entries = []; this.pos = new Map(); this.codes = new Map();
    for (let i = 0; i < items.length; i += chunk) {
      const end = Math.min(items.length, i + chunk);
      for (let k = i; k < end; k++) this.push(items[k]);
      if (end < items.length) await new Promise((r) => setTimeout(r, 0));
    }
  }

  private push(p: Product) {
    this.pos.set(p.id, this.entries.length);
    this.entries.push(entryOf(p));
    this.addCodes(p);
  }

  private addCodes(p: Product) {
    if (p.barcode) this.codes.set(String(p.barcode).trim(), { product: p, unitId: null });
    for (const u of p.units ?? []) if (u.active && u.barcode) this.codes.set(String(u.barcode).trim(), { product: p, unitId: u.id });
  }

  private removeCodes(p: Product) {
    const drop = (c: string | null | undefined) => { if (!c) return; const k = String(c).trim(); if (this.codes.get(k)?.product.id === p.id) this.codes.delete(k); };
    drop(p.barcode);
    for (const u of p.units ?? []) drop(u.barcode);
  }

  upsert(p: Product) {
    const i = this.pos.get(p.id);
    if (i === undefined) { this.push(p); return; }
    this.removeCodes(this.entries[i].p);
    this.entries[i] = entryOf(p);
    this.addCodes(p);
  }

  remove(ids: string[]): boolean {
    const gone = new Set(ids);
    if (![...gone].some((id) => this.pos.has(id))) return false;
    for (const id of gone) { const i = this.pos.get(id); if (i !== undefined) this.removeCodes(this.entries[i].p); }
    this.entries = this.entries.filter((e) => !gone.has(e.p.id));
    this.pos = new Map(this.entries.map((e, i) => [e.p.id, i]));
    return true;
  }

  byBarcode(code: string): BarcodeHit | undefined {
    const c = String(code ?? '').trim();
    return c ? this.codes.get(c) : undefined;
  }

  search(query: string, limit = 40): Product[] {
    const q = norm(query).trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    const w0 = words[0];
    const rest = words.length > 1 ? words.slice(1) : null;
    const best: { p: Product; score: number }[] = [];
    for (const e of this.entries) {
      if (!e.p.isActive) continue;
      if (!e.hay.includes(w0)) continue;
      if (rest && !rest.every((w) => e.hay.includes(w))) continue;
      const score = (e.name.startsWith(q) ? 0 : e.name.includes(q) ? 1 : 2) * 1000 + (sellable(e.p) > 0 ? 0 : 500) + e.name.length;
      if (best.length >= limit && score >= best[best.length - 1].score) continue;
      let i = best.length;
      while (i > 0 && best[i - 1].score > score) i--;
      best.splice(i, 0, { p: e.p, score });
      if (best.length > limit) best.pop();
    }
    return best.map((x) => x.p);
  }
}
