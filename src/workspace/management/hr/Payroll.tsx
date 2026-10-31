import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, NumberBox, Row, Sheet, Skeleton, Stack, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, formatDateTime, uuid } from '@/lib/format';
import { ListFooter } from '@/components/list-footer';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TONE: Record<string, Tone> = { UNPAID: 'danger', PARTIAL: 'warning', PAID: 'success' };
type Receipt = { paymentId?: string; receiptNo: string; paidAt: string; fullName: string; matricule: string; position?: string; cycleReference: string; periodStart: string; periodEnd: string; netPay: number; amount: number; method?: string; settlement?: boolean; remaining: number; note?: string };
type Line = { id: string; fullName: string; matricule: string; position?: string; grade?: string; baseSalary: number; generalAdjustment: number; personalAdjustment: number; adjustmentReason?: string; netPay: number; paidTotal: number; status: string; payments: { id: string; receiptNo: string; paidAt: string; amount: number }[] };
type Cycle = { id: string; reference: string; label?: string; periodStart: string; periodEnd: string; status: string; totalNet: number; totalPaid: number; remaining: number; headcount: number; adjustDirection?: string; adjustMode?: string; adjustValue?: number; adjustReason?: string };
type CycleView = { cycle: Cycle; lines: Line[]; skipped: string[] };

/** Recu de versement : tout vient de la ligne figee, rien n'est relu depuis la fiche actuelle. */
export function PayReceipt({ r, onClose }: { r: Receipt; onClose: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const s = shop.ws.shop.settings as Record<string, any>;
  const text = [s.name, [s.address, s.city].filter(Boolean).join(', '), '', `${t('pay.receipt')} ${r.receiptNo}`, formatDateTime(r.paidAt, lang), '',
    `${t('pay.beneficiary')} : ${r.fullName}`, `${t('hr.matricule')} : ${r.matricule}`, `${t('pay.cycle')} : ${r.cycleReference}`, `${t('pay.netDue')} : ${shop.money(r.netPay)}`,
    `${t('pay.amountPaid')} : ${shop.money(r.amount)}`, r.method ? `${t('ws.paymentMethod')} : ${t(`ws.m.${r.method}`)}` : '', `${r.settlement ? t('pay.settled') : t('pay.remaining')} : ${r.settlement ? '✓' : shop.money(r.remaining)}`, '', 'Vylaxo · DSI SARL'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  const row = (label: string, value: string, big?: boolean) => <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="small" style={{ flex: 1 }}>{label}</ThemedText><ThemedText type="smallBold" style={{ fontSize: big ? 17 : 14 }}>{value}</ThemedText></View>;
  return (
    <Sheet visible tall title={`${t('pay.receipt')} ${r.receiptNo}`} onClose={onClose} footer={<View style={{ gap: 8 }}><Btn icon="share-nodes" title={t('mob.share')} onPress={() => void Share.share({ message: text })} />{r.paymentId ? <PdfButton path={`/api/shop/pdf/payroll/receipts/${r.paymentId}`} name={`recu-${r.receiptNo}.pdf`} label="PDF" /> : null}</View>}>
      <Card style={{ gap: 6 }}>
        <ThemedText type="smallBold" style={{ textAlign: 'center', fontSize: 17 }}>{s.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>{[s.address, s.city, s.phone].filter(Boolean).join(' · ')}</ThemedText>
        <View style={{ height: 1, backgroundColor: th.progressTrack, marginVertical: 6 }} />
        {row(t('pay.beneficiary'), r.fullName)}
        {row(t('hr.matricule'), r.matricule)}
        {r.position ? row(t('hr.position'), r.position) : null}
        {row(t('pay.cycle'), r.cycleReference)}
        {row(t('pay.period'), `${formatDate(r.periodStart, lang, { day: 'numeric', month: 'short' })} → ${formatDate(r.periodEnd, lang, { day: 'numeric', month: 'short', year: 'numeric' })}`)}
        {row(t('pay.netDue'), shop.money(r.netPay))}
        {row(t('pay.amountPaid'), shop.money(r.amount), true)}
        {r.method ? row(t('ws.paymentMethod'), t(`ws.m.${r.method}`)) : null}
        {row(r.settlement ? t('pay.settled') : t('pay.remaining'), r.settlement ? '✓' : shop.money(r.remaining))}
        {r.note ? <ThemedText type="small" themeColor="textSecondary">{r.note}</ThemedText> : null}
      </Card>
    </Sheet>
  );
}

function CycleSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (v: CycleView) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const now = new Date();
  const [f, setF] = useState({ label: '', periodStart: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), periodEnd: iso(new Date(now.getFullYear(), now.getMonth(), 0)), adjust: false, adjustDirection: 'INCREASE', adjustMode: 'PERCENT', adjustValue: '', adjustReason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { id: id.current, label: f.label, periodStart: f.periodStart, periodEnd: f.periodEnd, ...(f.adjust && f.adjustValue ? { adjustDirection: f.adjustDirection, adjustMode: f.adjustMode, adjustValue: Number(f.adjustValue), adjustReason: f.adjustReason } : {}) };
      onSaved(await shop.call<CycleView>('/api/shop/hr/payroll/cycles', { method: 'POST', body }));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('pay.newCycle')} onClose={onClose} footer={<Btn icon="check" title={t('pay.createCycle')} loading={busy} onPress={submit} />}>
      <Hint icon="lightbulb">{t('pay.newCycleHint')}</Hint>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={t('pay.label')} value={f.label} onChangeText={set('label')} maxLength={150} placeholder={t('pay.labelHint')} autoCapitalize="sentences" />
      <DateField label={t('pay.from')} value={f.periodStart} onChange={set('periodStart')} max={f.periodEnd} />
      <DateField label={t('pay.to')} value={f.periodEnd} onChange={set('periodEnd')} min={f.periodStart} />
      <Switch value={f.adjust} onChange={(v) => setF((s) => ({ ...s, adjust: v }))} label={t('pay.generalAdjust')} hint={t('pay.generalAdjustHint')} />
      {f.adjust ? (
        <>
          <Chips scroll={false} value={f.adjustDirection} onChange={set('adjustDirection')} options={[{ value: 'INCREASE', label: t('pay.increase'), icon: 'arrow-trend-up' }, { value: 'DECREASE', label: t('pay.decrease'), icon: 'arrow-trend-down' }]} />
          <Chips scroll={false} value={f.adjustMode} onChange={set('adjustMode')} options={[{ value: 'PERCENT', label: '%' }, { value: 'AMOUNT', label: shop.currency }]} />
          <NumberBox label={t('pay.value')} value={f.adjustValue} onChange={set('adjustValue')} />
          <TextBox label={t('pay.reason')} value={f.adjustReason} onChangeText={set('adjustReason')} maxLength={200} placeholder={t('pay.reasonHint')} autoCapitalize="sentences" />
        </>
      ) : null}
    </Sheet>
  );
}

function PaySheet({ line, onClose, onPaid }: { line: Line; onClose: () => void; onPaid: (r: Receipt) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const remaining = Number(line.netPay) - Number(line.paidTotal);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState(shop.ws.manifest.paymentMethods?.[0] ?? 'CASH');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { onPaid(await shop.call<Receipt>(`/api/shop/hr/payroll/lines/${line.id}/payments`, { method: 'POST', body: { id: id.current, amount: Number(amount), method, note } })); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('pay.payTitle', { name: line.fullName })} onClose={onClose} footer={<Btn icon="coins" title={t('pay.confirmPay')} loading={busy} disabled={busy || !(Number(amount) > 0) || Number(amount) > remaining} onPress={submit} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <Card tone="info" style={{ gap: 6 }}>
        <Fact label={t('pay.netDue')} value={shop.money(line.netPay)} /><Fact label={t('pay.alreadyPaid')} value={shop.money(line.paidTotal)} /><Fact label={t('pay.remaining')} value={shop.money(remaining)} strong />
      </Card>
      <NumberBox label={`${t('pay.amountPaid')} (${shop.currency})`} value={amount} onChange={setAmount} suffix={shop.currency} hint={Number(amount) < remaining ? t('pay.partialHint') : t('pay.fullHint')} autoFocus />
      <View style={{ gap: 8 }}><ThemedText type="smallBold">{t('ws.paymentMethod')}</ThemedText><Chips scroll={false} value={method} onChange={setMethod} options={(shop.ws.manifest.paymentMethods ?? ['CASH']).map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} /></View>
      <TextBox label={t('ws.note')} value={note} onChangeText={setNote} maxLength={200} autoCapitalize="sentences" />
    </Sheet>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type={strong ? 'smallBold' : 'small'} style={{ flex: 1 }}>{label}</ThemedText><ThemedText type="smallBold">{value}</ThemedText></View>;
}

function CycleDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<CycleView>(`/api/shop/hr/payroll/cycles/${id}`);
  const [v, setV] = useState<CycleView | null>(null);
  const [paying, setPaying] = useState<Line | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [adjusting, setAdjusting] = useState<Line | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = v ?? q.data;
  const reload = async () => { setV(await shop.call<CycleView>(`/api/shop/hr/payroll/cycles/${id}`)); onChanged(); };
  async function closeCycle() {
    if (!(await confirmAction(t('pay.closeTitle'), t('pay.closeText'), t('pay.close'), t('common.cancel'), false))) return;
    try { setV(await shop.call<CycleView>(`/api/shop/hr/payroll/cycles/${id}/close`, { method: 'POST' })); toast(t('pay.closed')); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  const open = d?.cycle.status === 'OPEN';
  const c = d?.cycle;
  return (
    <Sheet visible tall title={c ? `${c.reference}${c.label ? ` · ${c.label}` : ''}` : '…'} onClose={onClose}
      footer={c ? <View style={{ gap: 8 }}>{open && shop.can('HR_PAYROLL', 'update') ? <Btn icon="lock" title={t('pay.close')} onPress={closeCycle} /> : null}<PdfButton path={`/api/shop/pdf/payroll/cycles/${c.id}`} name={`paie-${c.reference}.pdf`} label={t('pdf.document')} /></View> : undefined}>
      {!d || !c ? (q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={80} />) : (
        <>
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={open ? 'info' : 'success'}>{t(open ? 'pay.open' : 'pay.closedTag')}</Badge>
            <ThemedText type="small" themeColor="textSecondary">{formatDate(c.periodStart, lang)} → {formatDate(c.periodEnd, lang)}</ThemedText>
          </View>
          {c.adjustDirection ? <Hint icon="circle-info">{t('pay.generalApplied', { sign: c.adjustDirection === 'INCREASE' ? '+' : '−', value: Number(c.adjustValue), unit: c.adjustMode === 'PERCENT' ? '%' : shop.currency, reason: c.adjustReason ?? '' })}</Hint> : null}
          {d.skipped.length > 0 ? <Hint icon="triangle-exclamation" tone="warning">{t('pay.skipped', { names: d.skipped.join(', ') })}</Hint> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Mini label={t('pay.netDue')} value={shop.money(c.totalNet)} /><Mini label={t('pay.alreadyPaid')} value={shop.money(c.totalPaid)} /><Mini label={t('pay.remaining')} value={shop.money(c.remaining)} />
          </View>
          {d.lines.length === 0 ? <Empty icon="users" title={t('pay.noLines')} text={t('pay.noLinesText')} /> : d.lines.map((l) => (
            <Card key={l.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText type="smallBold" numberOfLines={1}>{l.fullName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{[l.matricule, l.position, l.grade].filter(Boolean).join(' · ')}</ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(l.netPay)}</ThemedText><Badge tone={TONE[l.status]}>{t(`pay.status.${l.status}`)}</Badge></View>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('pay.breakdown', { base: shop.money(l.baseSalary), general: shop.money(l.generalAdjustment), personal: shop.money(l.personalAdjustment) })} · {t('pay.paidOf', { paid: shop.money(l.paidTotal) })}</ThemedText>
              {l.adjustmentReason ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{l.adjustmentReason}</ThemedText> : null}
              {l.payments.map((p) => (
                <Pressable key={p.id} onPress={async () => setReceipt(await shop.call<Receipt>(`/api/shop/hr/payroll/receipts/${p.id}`))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="receipt" size={12} /><ThemedText type="small" themeColor="primary" style={{ flex: 1 }}>{p.receiptNo} · {formatDateTime(p.paidAt, lang)}</ThemedText><ThemedText type="smallBold">{shop.money(p.amount)}</ThemedText>
                </Pressable>
              ))}
              {open ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {l.status !== 'PAID' && shop.can('HR_PAYROLL', 'create') ? <Btn small icon="coins" title={t('pay.pay')} onPress={() => setPaying(l)} /> : null}
                  {shop.can('HR_PAYROLL', 'update') ? <Btn small variant="secondary" icon="pen" title={t('pay.adjust')} onPress={() => setAdjusting(l)} /> : null}
                </View>
              ) : null}
            </Card>
          ))}
          {paying ? <PaySheet line={paying} onClose={() => setPaying(null)} onPaid={(r) => { setPaying(null); setReceipt(r); void reload(); }} /> : null}
          {adjusting ? <AdjustSheet line={adjusting} onClose={() => setAdjusting(null)} onDone={(nv) => { setAdjusting(null); setV(nv); onChanged(); }} /> : null}
          {receipt ? <PayReceipt r={receipt} onClose={() => setReceipt(null)} /> : null}
        </>
      )}
    </Sheet>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <View style={{ flex: 1, minWidth: 0 }}><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }} numberOfLines={1}>{label}</ThemedText><ThemedText type="smallBold" numberOfLines={1} adjustsFontSizeToFit>{value}</ThemedText></View>;
}

function AdjustSheet({ line, onClose, onDone }: { line: Line; onClose: () => void; onDone: (v: CycleView) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [amount, setAmount] = useState(String(line.personalAdjustment));
  const [reason, setReason] = useState(line.adjustmentReason ?? '');
  const [error, setError] = useState<string | null>(null);
  async function go() {
    try { onDone(await shop.call<CycleView>(`/api/shop/hr/payroll/lines/${line.id}/adjustment`, { method: 'PATCH', body: { amount: Number(amount || 0), reason } })); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <Sheet visible title={t('pay.adjustTitle', { name: line.fullName })} onClose={onClose} footer={<Btn icon="check" title={t('common.save')} onPress={go} />}>
      <Hint icon="circle-info">{t('pay.adjustText')}</Hint>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={`${t('pay.adjustAmount')} (${shop.currency})`} value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" hint={t('pay.adjustSign')} />
      <TextBox label={t('pay.reason')} value={reason} onChangeText={setReason} maxLength={200} autoCapitalize="sentences" />
    </Sheet>
  );
}

function Receipts({ register }: { register?: (fn: (() => void) | null) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const [open, setOpen] = useState<(Receipt & { paymentId: string }) | null>(null);
  const list = useInfinite<Receipt & { paymentId: string }>('/api/shop/hr/payroll/receipts', {});
  useEffect(() => { register?.(list.loadMore); return () => register?.(null); });
  return (
    <Stack gap={8}>
      {list.loading && list.items.length === 0 ? <Skeleton rows={3} height={64} /> : list.items.length === 0 ? <Empty icon="receipt" title={t('pay.noReceipts')} /> : list.items.map((r) => (
        <Row key={r.paymentId} icon="receipt" title={r.receiptNo} subtitle={`${r.fullName} · ${r.cycleReference} · ${formatDateTime(r.paidAt, lang)}`} onPress={() => setOpen(r)}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(r.amount)}</ThemedText>{r.settlement ? <Badge tone="success">{t('pay.settled')}</Badge> : null}</View>} />
      ))}
      <ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} />
      {open ? <PayReceipt r={open} onClose={() => setOpen(null)} /> : null}
    </Stack>
  );
}

export default function Payroll({ register }: { register?: (fn: (() => void) | null) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const [view, setView] = useState('cycles');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Cycle>('/api/shop/hr/payroll/cycles', {});
  useEffect(() => { if (view === 'cycles') register?.(list.loadMore); return () => register?.(null); });
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{t('hr.tab.payroll')}</ThemedText>
        {shop.can('HR_PAYROLL', 'create') && view === 'cycles' ? <Btn small icon="plus" title={t('pay.newCycle')} onPress={() => setForm(true)} /> : null}
      </View>
      <Chips value={view} onChange={setView} options={[{ value: 'cycles', label: t('pay.cycles') }, { value: 'receipts', label: t('pay.receipts') }]} />
      {view === 'receipts' ? <Receipts register={register} /> : (
        list.loading && list.items.length === 0 ? <Skeleton rows={3} height={90} /> : list.items.length === 0 ? <Empty icon="coins" title={t('pay.empty')} text={t('pay.emptyText')} /> : (
          <Stack gap={8}>
            {list.items.map((c) => {
              const pct = Number(c.totalNet) > 0 ? Math.min(100, (Number(c.totalPaid) / Number(c.totalNet)) * 100) : 0;
              return (
                <Pressable key={c.id} onPress={() => setOpen(c.id)} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: th.backgroundElement, borderRadius: 18, padding: 14, gap: 8, opacity: pressed ? 0.75 : 1 })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText type="smallBold" numberOfLines={1}>{c.reference}{c.label ? ` · ${c.label}` : ''}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{formatDate(c.periodStart, lang)} → {formatDate(c.periodEnd, lang)} · {t('hr.peopleCount', { count: c.headcount })}</ThemedText>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(c.totalNet)}</ThemedText>
                      <Badge tone={c.status === 'CLOSED' ? 'success' : Number(c.remaining) > 0 ? 'warning' : 'info'}>{c.status === 'CLOSED' ? t('pay.closedTag') : Number(c.remaining) > 0 ? shop.money(c.remaining) : t('pay.allPaid')}</Badge></View>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: th.progressTrack, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: 6, backgroundColor: th.success }} /></View>
                </Pressable>
              );
            })}
            <ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} />
          </Stack>
        )
      )}
      {form ? <CycleSheet onClose={() => setForm(false)} onSaved={(v) => { setForm(false); toast(t('pay.cycleCreated', { ref: v.cycle.reference })); void list.reload(); setOpen(v.cycle.id); }} /> : null}
      {open ? <CycleDetail id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </View>
  );
}
