import { ApiError } from './api';

/** Pack « services professionnels » : types du contrat (docs/PRO_PACK.md) et petits utilitaires partages par les six ecrans. */
export const PRO_API = '/api/shop/pro';

export const CASE_KINDS = ['CONSULTING', 'ACCOUNTING', 'LEGAL', 'DESIGN', 'ENGINEERING', 'TRAINING', 'IT', 'MARKETING', 'OTHER'];
export const BILLING_MODES = ['HOURLY', 'FIXED', 'RETAINER', 'NONE'];
export const CASE_STATUSES = ['OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED'];
export const EXPENSE_CATEGORIES = ['TRAVEL', 'MEAL', 'LODGING', 'SUPPLIES', 'FEES', 'OTHER'];
export const MEMBER_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#db2777', '#475569'];

export type Num = number | string | null | undefined;
export type Member = { id: string; name: string; title?: string | null; phone?: string | null; email?: string | null; color?: string | null; hourlyRate?: Num; costRate?: Num; employeeId?: string | null; isOwner?: boolean; active: boolean; openCases?: number; minutesMonth?: number };
export type Task = { id: string; caseId: string; title: string; dueOn?: string | null; doneAt?: string | null; assigneeId?: string | null; assigneeName?: string | null; priority: string; notes?: string | null; overdue?: boolean; caseNumber?: string; caseTitle?: string; partyName?: string };
export type Milestone = { id: string; caseId: string; label: string; amount: Num; dueOn?: string | null; status: string; documentId?: string | null; position?: number };
export type CaseInvoice = { id: string; documentId: string; number: string; kind: string; amount: Num; periodFrom?: string | null; periodTo?: string | null; issuedAt?: string | null; paymentStatus?: string | null; status?: string | null; caseNumber?: string; caseTitle?: string; partyName?: string; total?: Num; paid?: Num; balance?: Num };
export type CaseRow = {
  id: string; number: string; title: string; partyId?: string | null; partyName?: string | null; kind: string; status: string; billingMode: string; responsibleId?: string | null; responsibleName?: string | null;
  openedOn?: string | null; dueOn?: string | null; overdue?: boolean; minutes: number; budgetHours?: Num; budgetPct?: Num; openTasks?: number; unbilledAmount?: Num; billedTotal?: Num;
};
export type CaseView = CaseRow & {
  description?: string | null; reference?: string | null; hourlyRate?: Num; fixedFee?: Num; retainerFee?: Num; retainerDay?: number | null; retainerFrom?: string | null; budgetAmount?: Num;
  rates?: { memberId: string; memberName?: string; rate: Num }[]; tasks?: Task[]; milestones?: Milestone[]; invoices?: CaseInvoice[];
  totals?: { minutes: number; billableMinutes: number; unbilledMinutes: number; unbilledTime?: Num; unbilledExpenses?: Num; billedTotal?: Num; paidTotal?: Num; balance?: Num; cost?: Num; margin?: Num };
  closedOn?: string | null; cancelReason?: string | null; version?: number;
};
export type Entry = {
  id: string; caseId: string; caseNumber?: string; caseTitle?: string; partyName?: string; memberId?: string; memberName?: string; workDate: string; minutes: number; description?: string | null;
  billable: boolean; rate?: Num; amount?: Num; status: string; running?: boolean; startedAt?: string | null; documentId?: string | null;
};
export type Expense = {
  id: string; caseId: string; caseNumber?: string; caseTitle?: string; memberId?: string; memberName?: string; incurredOn: string; label: string; category?: string | null; amount: Num;
  rebillable: boolean; markupPct?: Num; billedAmount?: Num; status: string; receiptMediaId?: string | null; receipt?: { id?: string; variants?: Record<string, { webp: string; avif?: string }> } | null; documentId?: string | null;
};
export type Overview = {
  openCases: number; overdueCases: number; tasksDueWeek: number; tasksOverdue: number; minutesMonth: number; billableMinutesMonth: number; utilizationPct: number;
  unbilledTotal?: Num; billedMonth?: Num; receivable?: Num; runningTimers: number;
};
export type QueueRow = {
  caseId: string; number: string; title: string; partyId?: string | null; partyName?: string | null; billingMode: string; unbilledMinutes: number; unbilledTime: Num; unbilledExpenses: Num;
  readyMilestones: Milestone[]; retainerDue?: { period: string; amount: Num } | null; total: Num; oldestUnbilledOn?: string | null;
};
export type Preview = { lines: { kind: string; label: string; quantity: Num; unit?: string | null; unitPrice: Num; amount: Num }[]; subtotal: Num; discount: Num; taxRate: Num; taxTotal: Num; total: Num; currency?: string; dueDate?: string | null };

/** 125 -> « 2 h 05 » ; 45 -> « 45 min » ; 120 -> « 2 h ». */
export function fmtMinutes(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}

/** Duree ecoulee d'un chronometre : 3725000 ms -> « 1:02:05 ». */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDate(d); };
/** Lundi de la semaine qui contient `iso`. */
export const mondayOf = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return addDays(iso, -((d.getDay() + 6) % 7)); };

export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (status) {
    case 'OPEN': case 'PAID': return 'success';
    case 'ON_HOLD': case 'UNBILLED': case 'READY': case 'PARTIAL': return 'warning';
    case 'CANCELLED': case 'WRITTEN_OFF': case 'UNPAID': return 'danger';
    case 'BILLED': return 'info';
    default: return 'neutral';
  }
}

/** Message lisible pour une erreur d'appel. */
export function errMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}
