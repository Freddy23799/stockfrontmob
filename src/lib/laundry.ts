/**
 * Pressing / blanchisserie : constantes et calculs (copie fidele de stockfrontweb/src/lib/laundry.js).
 * Le serveur reste maitre des prix ; le calcul local sert a l'estimation immediate et au depot hors ligne.
 */
import * as Crypto from 'expo-crypto';

export type Status = 'RECEIVED' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'DISPUTE' | 'ABANDONED' | 'CANCELLED';
export type Item = { id: string; tagCode: string; garmentName: string; serviceName: string; pricingMode?: string; quantity: number | string; weightKg?: number | string | null; color?: string; brand?: string; size?: string; defects?: string[]; conditionNotes?: string; instructions?: string; status: Status; lineTotal: number | string; covered?: boolean; rack?: string; redoCount?: number | string };
export type Order = {
  id: string; number: string; status: Status; prevStatus?: Status; express?: boolean; partyId?: string | null; partyName?: string | null; customerName?: string | null; customerPhone?: string | null;
  receivedAt?: string; promisedAt?: string; overdue?: boolean; daysLate?: number; waitingDays?: number; pickupCode?: string; saleNumber?: string; total: number | string; paidTotal: number | string; balance: number | string;
  itemsCount: number; readyCount?: number; deliveredCount?: number; rack?: string | null; remindersCount?: number; lastReminderAt?: string; openClaims?: number; notes?: string; cancelReason?: string;
  deliveryRequested?: boolean; deliveryAddress?: string; items: Item[]; payments?: { id: string; method: string; amount: number | string; reference?: string; paidAt?: string; direction?: string }[];
  reminderDue?: boolean; holdExpired?: boolean; abandonable?: boolean; pending?: boolean;
};
export type Catalog = {
  setupNeeded?: boolean; config: Record<string, any>;
  garmentTypes: { id: string; name: string; family?: string; sortOrder?: number; active?: boolean }[];
  services: { id: string; name: string; pricingMode: string; turnaroundDays?: number; expressable?: boolean; basePrice: number | string; active?: boolean }[];
  tariffs: { serviceId: string; garmentTypeId: string; price: number | string }[]; defects?: string[];
};
export type Line = { key: string; garmentTypeId: string; garmentName: string; serviceId: string; quantity: string; weightKg: string; color: string; brand: string; size: string; defects: string[]; conditionNotes: string; instructions: string; unitPrice: string; open: boolean };
export const API = '/api/shop/laundry';

export const BOARD: Status[] = ['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED'];
export const ALL_STATUS = ['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'DISPUTE', 'ABANDONED', 'CANCELLED'];
export const TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = { RECEIVED: 'info', IN_PROGRESS: 'warning', READY: 'success', DELIVERED: 'success', DISPUTE: 'danger', ABANDONED: 'danger', CANCELLED: 'info' };
export const NEXT: Partial<Record<Status, Status>> = { RECEIVED: 'IN_PROGRESS', IN_PROGRESS: 'READY' };
export const STATUS_ICON: Record<string, string> = { RECEIVED: 'inbox', IN_PROGRESS: 'sync', READY: 'check-double', DELIVERED: 'check', DISPUTE: 'warning', ABANDONED: 'ban', CANCELLED: 'ban' };
export const CLAIM_KINDS = ['DAMAGE', 'LOSS', 'STAIN', 'SHRINKAGE', 'COLOR', 'DELAY', 'OVERCHARGE', 'OTHER'];
export const CLAIM_STATUS = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED'];
export const CLAIM_TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = { OPEN: 'danger', INVESTIGATING: 'warning', RESOLVED: 'success', REJECTED: 'info' };
export const RESOLUTIONS = ['REFUND_CASH', 'STORE_CREDIT', 'REDO', 'NONE'];
export const CHANNELS = ['WHATSAPP', 'SMS', 'CALL', 'OTHER'];
export const PLAN_KINDS = ['PIECES', 'KG', 'AMOUNT'];
export const STOP_TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = { PENDING: 'warning', DONE: 'success', FAILED: 'danger', CANCELLED: 'info' };
export const ROUTE_TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = { PLANNED: 'info', IN_PROGRESS: 'warning', DONE: 'success', CANCELLED: 'info' };

export const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
export const round2 = (v: number) => Math.round(v * 100) / 100;
export const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
export const today = () => new Date().toISOString().slice(0, 10);

/** Code de retrait a 6 chiffres genere sur l'appareil (le ticket provisoire hors ligne en a besoin avant d'avoir joint le serveur). */
export function newPickupCode(): string {
  const n = Crypto.getRandomValues(new Uint32Array(1))[0];
  return String(n % 1000000).padStart(6, '0');
}

/** Numero provisoire d'un ticket garde sur l'appareil (remplace par le numero definitif a l'envoi). */
export const tempRef = () => `TMP-${Date.now().toString(36).slice(-5).toUpperCase()}`;

export function tariffMap(catalog: Catalog | null | undefined) {
  const m = new Map<string, number>();
  (catalog?.tariffs ?? []).forEach((c) => m.set(`${c.serviceId}|${c.garmentTypeId}`, num(c.price)));
  return m;
}

type PriceInput = { garmentTypeId: string; serviceId: string; quantity?: string | number; weightKg?: string | number; unitPrice?: string | number | null };
export type LinePrice = { unitPrice: number; baseAmount: number; surcharge: number; lineTotal: number; error: string | null; covered?: boolean };

/** Une ligne : prix unitaire (grille, sinon prix de base), montant de base, supplement express. */
export function priceLine(catalog: Catalog | null | undefined, map: Map<string, number>, line: PriceInput, express: boolean): LinePrice {
  const svc = (catalog?.services ?? []).find((s) => s.id === line.serviceId);
  if (!svc) return { unitPrice: 0, baseAmount: 0, surcharge: 0, lineTotal: 0, error: 'UNKNOWN_SERVICE' };
  const cell = map.get(`${line.serviceId}|${line.garmentTypeId}`);
  const manual = line.unitPrice !== '' && line.unitPrice != null ? num(line.unitPrice) : null;
  const unit = manual ?? cell ?? num(svc.basePrice);
  const perKg = svc.pricingMode === 'PER_KG';
  const qty = perKg ? num(line.weightKg) : Math.max(1, num(line.quantity));
  const baseAmount = round2(unit * qty);
  const pct = num(catalog?.config?.expressSurchargePercent ?? 50);
  const surcharge = express && svc.expressable ? round2((baseAmount * pct) / 100) : 0;
  const error = manual == null && cell == null && num(svc.basePrice) === 0 ? 'NO_TARIFF' : null;
  return { unitPrice: unit, baseAmount, surcharge, lineTotal: round2(baseAmount + surcharge), error };
}

export type Quote = { items: LinePrice[]; subtotal: number; discountTotal: number; deliveryFee: number; total: number; minDeposit: number; promisedAt: string };

export function quoteLocal(catalog: Catalog | null | undefined, lines: PriceInput[], o: { express: boolean; discountPercent: number; deliveryFee: number }): Quote {
  const map = tariffMap(catalog);
  const items = lines.map((l) => priceLine(catalog, map, l, o.express));
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const discountTotal = round2((subtotal * Math.min(100, num(o.discountPercent))) / 100);
  const fee = num(o.deliveryFee);
  const total = round2(subtotal - discountTotal + fee);
  const dep = num(catalog?.config?.minDepositPercent);
  return { items, subtotal, discountTotal, deliveryFee: fee, total, minDeposit: round2((total * dep) / 100), promisedAt: promisedLocal(catalog, lines, o.express) };
}

/** Date promise estimee : plus long delai des prestations (ou delai express), dimanche saute si configure. */
export function promisedLocal(catalog: Catalog | null | undefined, lines: PriceInput[], express: boolean): string {
  const cfg = catalog?.config ?? {};
  const services = lines.map((l) => (catalog?.services ?? []).find((s) => s.id === l.serviceId)).filter(Boolean) as Catalog['services'];
  const days = express ? 0 : Math.max(num(cfg.defaultTurnaroundDays ?? 3), ...services.map((s) => num(s.turnaroundDays)));
  const d = new Date();
  if (express) d.setHours(d.getHours() + num(cfg.expressHours ?? 24)); else d.setDate(d.getDate() + days);
  if (cfg.skipSunday === true && d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export const daysBetween = (a: string, b: Date = new Date()) => Math.max(0, Math.floor((b.getTime() - new Date(a).getTime()) / 86400000));
