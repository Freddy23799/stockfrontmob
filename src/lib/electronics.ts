/** Telephonie / electronique : types et constantes partages par les ecrans de l'atelier, du parc d'appareils, des garanties et du credit. */
import { ApiError } from './api';

export const API = '/api/shop';
export { num } from './format';

export const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export type LaborLine = { name: string; price: number | string; warrantyDays?: number | null };
export type Checks = { defects?: string[]; powersOn?: boolean; dataRisk?: boolean };
export type Repair = {
  id: string; number: string; status: string; partyId: string; customerName: string; customerPhone?: string | null; deviceBrand?: string | null; deviceModel: string; deviceColor?: string | null;
  serial?: string | null; accessories?: string | null; passcodeProvided: boolean; conditionNotes?: string | null; problem: string; diagnosis?: string | null; technicianName?: string | null;
  priority: string; promisedDate?: string | null; late: boolean; laborAmount: number | string; discount: number | string; partsTotal: number | string; total: number | string; depositTotal: number | string;
  balance: number | string; estimateStatus: string; underWarranty: boolean; warrantyCode?: string | null; warrantyEndsOn?: string | null; warrantyNote?: string | null; saleNumber?: string | null;
  issuedWarrantyCode?: string | null; cancelReason?: string | null; ageDays: number; createdAt: string;
  parts: { id: string; productId: string; description: string; quantity: number | string; unitPrice: number | string; available?: number | string | null }[];
  deposits: { id: string; direction: string; method: string; amount: number | string; paidAt: string }[];
  events: { kind: string; toStatus?: string | null; note?: string | null; at: string }[];
  checks: Checks; laborLines: LaborLine[];
};
export type Service = { id: string; name: string; deviceKind: string; brand?: string | null; laborPrice: number | string; estMinutes?: number | null; warrantyDays?: number | null; active: boolean };

export const DEFECTS = ['SCREEN_CRACKED', 'SCREEN_DEAD', 'TOUCH_FAULTY', 'WATER_DAMAGE', 'BATTERY_SWOLLEN', 'BATTERY_DRAIN', 'DOES_NOT_POWER', 'CHARGING_PORT', 'BUTTONS_FAULTY',
  'CAMERA_FAULTY', 'SPEAKER_MIC', 'BACK_DAMAGED', 'FRAME_BENT', 'SIM_TRAY_MISSING', 'ACCOUNT_LOCKED', 'SCREW_MISSING'];
export const KINDS = ['PHONE', 'TABLET', 'COMPUTER', 'TV_AUDIO', 'OTHER'];
export const FILTERS = ['OPEN', 'RECEIVED', 'DIAGNOSING', 'QUOTE_PENDING', 'APPROVED', 'WAITING_PARTS', 'IN_REPAIR', 'READY', 'DELIVERED', 'UNREPAIRABLE', 'CANCELLED', ''];
export const NEXT: Record<string, string[]> = {
  RECEIVED: ['DIAGNOSING', 'WAITING_PARTS', 'IN_REPAIR', 'UNREPAIRABLE'], DIAGNOSING: ['WAITING_PARTS', 'IN_REPAIR', 'UNREPAIRABLE'], APPROVED: ['WAITING_PARTS', 'IN_REPAIR', 'UNREPAIRABLE'],
  WAITING_PARTS: ['IN_REPAIR', 'UNREPAIRABLE'], IN_REPAIR: ['WAITING_PARTS', 'READY', 'UNREPAIRABLE'], READY: ['IN_REPAIR'],
};
export const REPAIR_TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
  RECEIVED: 'info', DIAGNOSING: 'info', QUOTE_PENDING: 'warning', APPROVED: 'info', WAITING_PARTS: 'warning', IN_REPAIR: 'warning', READY: 'success', DELIVERED: 'success', UNREPAIRABLE: 'danger', CANCELLED: 'danger',
};
export const prettyImei = (s: string | null | undefined) => (s && /^\d{15}$/.test(s) ? `${s.slice(0, 2)} ${s.slice(2, 8)} ${s.slice(8, 14)} ${s.slice(14)}` : s ?? '');
