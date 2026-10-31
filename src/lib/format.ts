export type Product = {
  id: string; name: string; sku?: string; barcode?: string; unit: string; salePrice: number | string; costPrice?: number | string;
  stock: number | string; expiredQuantity?: number | string; trackStock: boolean; trackLots?: boolean; isActive: boolean; minStockAlert?: number | string; minStock?: number | string; nextExpiry?: string;
  categoryId?: string; categoryName?: string; image?: Image | null; units?: Unit[]; attributes?: Record<string, any>; [k: string]: any;
};
/** Conditionnement (carton, 500 g...) : `factor` unites de base ; `price` = prix effectif de CETTE unite. */
export type Unit = { id: string; label: string; factor: number | string; price: number | string; fixedPrice: boolean; barcode?: string | null; isDefault: boolean; active: boolean };
export type Image = { id: string; variants: Record<string, { webp: string; avif?: string; width: number; height: number }> };

/** Quantite reellement vendable : le stock moins les lots perimes. */
export const sellable = (p: Product) => Number(p.stock) - Number(p.expiredQuantity ?? 0);
export const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

export const formatDate = (iso: string | null | undefined, lang: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? new Intl.DateTimeFormat(lang, opts).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : '';
export const formatDateTime = (iso: string | null | undefined, lang: string) =>
  iso ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';

export const uuid = (): string => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

export function pctDelta(current: unknown, previous: unknown): number | null {
  const p = Number(previous);
  return p > 0 ? Math.round(((Number(current) - p) / p) * 100) : null;
}
