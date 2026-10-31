import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, Linking, View } from 'react-native';

import { IntakeChecks, LaborEditor, linesPayload, linesTotal, toEdit, type EditLine } from '@/components/repair-tools';
import { ListFooter } from '@/components/list-footer';
import { PartyPicker } from '@/components/party-picker';
import { PdfButton } from '@/components/pdf-button';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, errText, FILTERS, NEXT, num, prettyImei, REPAIR_TONE, type Checks, type Repair } from '@/lib/electronics';
import { formatDate, uuid, type Product } from '@/lib/format';
import { LIST_PROPS } from '@/lib/list';
import { useInfinite } from '@/lib/query';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const REFUNDS = ['CASH', 'MOBILE_MONEY', 'CARD', 'TRANSFER', 'CHEQUE', 'CREDIT'];

function RepairForm({ onClose, onSaved }: { onClose: () => void; onSaved: (r: Repair | null) => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [id] = useState(uuid);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [f, setF] = useState({ customerName: '', customerPhone: '', deviceBrand: '', deviceModel: '', deviceColor: '', serial: '', problem: '', conditionNotes: '', accessories: '', passcodeProvided: false,
    technicianName: '', urgent: false, promisedDate: '', deposit: '', method: methods[0] });
  const [checks, setChecks] = useState<Checks>({});
  const [lines, setLines] = useState<EditLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.deviceModel.trim() && f.problem.trim() && (partyId || f.customerName.trim());

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = {
        id, partyId: partyId ?? undefined, customerName: !partyId ? f.customerName.trim() : undefined, customerPhone: !partyId && f.customerPhone.trim() ? f.customerPhone.trim() : undefined,
        deviceBrand: f.deviceBrand.trim() || undefined, deviceModel: f.deviceModel.trim(), deviceColor: f.deviceColor.trim() || undefined, serial: f.serial.trim() || undefined,
        accessories: f.accessories.trim() || undefined, passcodeProvided: f.passcodeProvided, conditionNotes: f.conditionNotes.trim() || undefined, problem: f.problem.trim(),
        technicianName: f.technicianName.trim() || undefined, priority: f.urgent ? 'URGENT' : 'NORMAL', promisedDate: f.promisedDate.trim() || undefined,
        checks: Object.keys(checks).length ? checks : undefined, laborLines: lines.length ? linesPayload(lines) : undefined,
        deposit: num(f.deposit) > 0 ? { id: uuid(), method: f.method, amount: num(f.deposit) } : undefined,
      };
      const res = await offline.submit<Repair>({ id, shopId: shop.shopId, method: 'POST', path: `${API}/repairs`, body, kind: 'repair-intake',
        queuedBody: { ...body, offline: true, at: new Date().toISOString() }, label: `${t('el.repairNew')} · ${f.deviceModel.trim()}` });
      onSaved(res.queued ? null : res.data);
    } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('el.repairNew')} onClose={onClose} footer={<Btn title={t('el.repairCreate')} disabled={!valid} loading={busy} onPress={() => void submit()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} onChange={(v) => setPartyId(v)} />
      {!partyId ? <>
        <TextBox label={`${t('el.customerName')} *`} value={f.customerName} onChangeText={set('customerName')} maxLength={120} />
        <TextBox label={t('el.phone')} value={f.customerPhone} onChangeText={set('customerPhone')} keyboardType="phone-pad" maxLength={40} />
      </> : null}
      <TextBox label={t('el.brand')} value={f.deviceBrand} onChangeText={set('deviceBrand')} placeholder="Apple, Samsung…" />
      <TextBox label={`${t('el.model')} *`} value={f.deviceModel} onChangeText={set('deviceModel')} placeholder="iPhone 13" />
      <TextBox label={t('el.color')} value={f.deviceColor} onChangeText={set('deviceColor')} />
      <TextBox label={t('el.imeiOptional')} hint={t('el.repairImeiHint')} value={f.serial} onChangeText={set('serial')} autoCapitalize="characters" autoCorrect={false} />
      <TextBox label={`${t('el.problem')} *`} value={f.problem} onChangeText={set('problem')} multiline placeholder={t('el.problemHint')} />
      <IntakeChecks value={checks} onChange={setChecks} />
      <TextBox label={t('el.conditionNotes')} value={f.conditionNotes} onChangeText={set('conditionNotes')} multiline placeholder={t('el.conditionHint')} />
      <TextBox label={t('el.accessories')} value={f.accessories} onChangeText={set('accessories')} placeholder={t('el.accessoriesHint')} />
      <Switch value={f.passcodeProvided} onChange={(v) => setF({ ...f, passcodeProvided: v })} label={t('el.passcodeGiven')} />
      <TextBox label={t('el.technician')} value={f.technicianName} onChangeText={set('technicianName')} />
      <Switch value={f.urgent} onChange={(v) => setF({ ...f, urgent: v })} label={t('el.prio.URGENT')} />
      <TextBox label={t('el.promised')} value={f.promisedDate} onChangeText={set('promisedDate')} placeholder="AAAA-MM-JJ" autoCapitalize="none" />
      <LaborEditor lines={lines} onChange={setLines} />
      {lines.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('el.estimate')} : {shop.money(linesTotal(lines))}</ThemedText> : null}
      {shop.can('SALES', 'create') ? <>
        <NumberBox label={t('el.deposit')} hint={t('el.depositHint')} value={f.deposit} onChange={set('deposit')} />
        {num(f.deposit) > 0 ? <Chips scroll={false} value={f.method} onChange={set('method')} options={methods.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} /> : null}
      </> : null}
    </Sheet>
  );
}

type Part = { key: string; productId: string; name: string; quantity: string; unitPrice: string };

function EstimateForm({ r, onClose, onSaved }: { r: Repair; onClose: () => void; onSaved: (r: Repair) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [diagnosis, setDiagnosis] = useState(r.diagnosis ?? '');
  const [technician, setTechnician] = useState(r.technicianName ?? '');
  const [promised, setPromised] = useState(r.promisedDate ?? '');
  const [discount, setDiscount] = useState(String(num(r.discount)));
  const [warranty, setWarranty] = useState(r.underWarranty);
  const [note, setNote] = useState(r.warrantyNote ?? '');
  const [lines, setLines] = useState<EditLine[]>(() => (r.laborLines?.length ? r.laborLines : num(r.laborAmount) > 0 ? [{ name: t('el.labor'), price: r.laborAmount }] : []).map(toEdit));
  const [checks, setChecks] = useState<Checks>(r.checks ?? {});
  const [parts, setParts] = useState<Part[]>(() => r.parts.map((p) => ({ key: p.id, productId: p.productId, name: p.description, quantity: String(num(p.quantity)), unitPrice: String(num(p.unitPrice)) })));
  const [pick, setPick] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Math.max(0, linesTotal(lines) - num(discount)) + parts.reduce((s, p) => s + num(p.quantity) * num(p.unitPrice), 0);
  async function save() {
    setBusy(true); setError(null);
    try {
      onSaved(await shop.call<Repair>(`${API}/repairs/${r.id}`, { method: 'PUT', body: {
        diagnosis, technicianName: technician.trim() || undefined, promisedDate: promised.trim() || undefined, laborLines: linesPayload(lines), checks, discount: num(discount),
        underWarranty: warranty, warrantyNote: note.trim() || undefined, parts: parts.map((p) => ({ productId: p.productId, quantity: num(p.quantity), unitPrice: num(p.unitPrice) })),
      } }));
    } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('el.editEstimate')} onClose={onClose} footer={<Btn title={t('common.save')} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <TextBox label={t('el.diagnosis')} value={diagnosis} onChangeText={setDiagnosis} multiline />
      <TextBox label={t('el.technician')} value={technician} onChangeText={setTechnician} />
      <TextBox label={t('el.promised')} value={promised} onChangeText={setPromised} placeholder="AAAA-MM-JJ" autoCapitalize="none" />
      {r.warrantyCode || r.underWarranty ? <Switch value={warranty} onChange={setWarranty} label={t('el.coveredByWarranty')} /> : null}
      {warranty ? <TextBox label={t('el.warrantyNote')} value={note} onChangeText={setNote} /> : null}
      <ProductPicker label={t('el.addPart')} value={pick} onChange={(p) => { if (p) { setParts((x) => [...x, { key: uuid(), productId: p.id, name: p.name, quantity: '1', unitPrice: String(num(p.salePrice)) }]); } setPick(null); }} />
      {parts.map((p) => (
        <Card key={p.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{p.name}</ThemedText><Btn small variant="ghost" icon="xmark" title="" onPress={() => setParts((x) => x.filter((y) => y.key !== p.key))} /></View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><NumberBox label={shop.v('quantity')} value={p.quantity} onChange={(v) => setParts((x) => x.map((y) => (y.key === p.key ? { ...y, quantity: v } : y)))} /></View>
            <View style={{ flex: 1 }}><NumberBox label={t('el.unitPrice')} value={p.unitPrice} onChange={(v) => setParts((x) => x.map((y) => (y.key === p.key ? { ...y, unitPrice: v } : y)))} /></View>
          </View>
        </Card>
      ))}
      <LaborEditor lines={lines} onChange={setLines} />
      <NumberBox label={t('el.discount')} value={discount} onChange={setDiscount} />
      <IntakeChecks value={checks} onChange={setChecks} />
      <ThemedText type="smallBold">{warranty ? t('el.free') : shop.money(total)}</ThemedText>
    </Sheet>
  );
}

function RepairSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [r, setR] = useState<Repair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<null | 'status' | 'deposit' | 'note' | 'cancel' | 'decline' | 'deliver' | 'edit'>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [saleId] = useState(uuid);
  const canUpdate = shop.can('REPAIRS', 'update');

  const load = () => shop.call<Repair>(`${API}/repairs/${id}`).then(setR).catch((e) => setError(errText(e, t('common.error'))));
  useState(() => { void load(); return null; });

  async function act(path: string, body: unknown, ok?: string, method = 'POST') {
    setBusy(true); setError(null);
    try { setR(await shop.call<Repair>(`${API}/repairs/${id}${path}`, { method, body })); if (ok) toast(ok); setMode(null); onChanged(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  if (!r) return <Sheet visible title="…" onClose={onClose}>{error ? <ErrorNote message={error} /> : <Skeleton rows={3} height={60} />}</Sheet>;

  const closed = ['DELIVERED', 'CANCELLED'].includes(r.status);
  const quoteStage = ['RECEIVED', 'DIAGNOSING', 'QUOTE_PENDING'].includes(r.status);
  const next = NEXT[r.status] ?? [];
  const balance = Math.max(0, num(r.balance));
  const device = [r.deviceBrand, r.deviceModel].filter(Boolean).join(' ');
  const msgKey = ['READY', 'QUOTE_PENDING', 'UNREPAIRABLE'].includes(r.status) ? r.status : 'OTHER';
  const digits = (r.customerPhone ?? '').replace(/[^\d]/g, '');
  const message = t(`el.msg.${msgKey}`, { name: r.customerName, device, number: r.number, balance: shop.money(r.balance), total: shop.money(r.total), status: t(`el.rs.${r.status}`) });

  return (
    <Sheet visible tall title={`${r.number} · ${device}`} onClose={onClose}>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone={REPAIR_TONE[r.status] ?? 'info'}>{t(`el.rs.${r.status}`)}</Badge>
        {r.priority === 'URGENT' ? <Badge tone="danger">{t('el.prio.URGENT')}</Badge> : null}
        {r.late ? <Badge tone="danger">{t('el.late')}</Badge> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">{t(`el.rhint.${r.status}`)}</ThemedText>
      <ThemedText type="smallBold">{r.customerName}{r.customerPhone ? ` · ${r.customerPhone}` : ''}</ThemedText>
      {r.serial ? <ThemedText type="small">{t('el.imei')} : {prettyImei(r.serial)}</ThemedText> : null}
      <ThemedText type="small">{t('el.technician')} : {r.technicianName ?? '—'} · {t('el.promised')} : {r.promisedDate ? formatDate(r.promisedDate, lang) : '—'}</ThemedText>
      {r.underWarranty ? <ThemedText type="smallBold" themeColor="success">{t('el.underWarranty')}{r.warrantyCode ? ` · ${r.warrantyCode}` : ''}</ThemedText> : null}
      <ThemedText type="small"><ThemedText type="smallBold">{t('el.problem')} : </ThemedText>{r.problem}</ThemedText>
      {r.checks?.defects?.length || r.checks?.powersOn != null || r.checks?.dataRisk ? (
        <View style={{ gap: 4 }}>
          <ThemedText type="smallBold">{t('el.intakeTitle')}</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(r.checks.defects ?? []).map((c) => <Badge key={c} tone="warning">{t(`el.chk.${c}`)}</Badge>)}
            {r.checks.powersOn != null ? <Badge tone="info">{r.checks.powersOn ? t('el.poweredOn') : t('el.poweredOff')}</Badge> : null}
            {r.checks.dataRisk ? <Badge tone="info">{t('el.dataRisk')}</Badge> : null}
          </View>
        </View>
      ) : null}
      {r.conditionNotes ? <ThemedText type="small"><ThemedText type="smallBold">{t('el.conditionNotes')} : </ThemedText>{r.conditionNotes}</ThemedText> : null}
      {r.diagnosis ? <ThemedText type="small"><ThemedText type="smallBold">{t('el.diagnosis')} : </ThemedText>{r.diagnosis}</ThemedText> : null}
      {r.cancelReason ? <ThemedText type="small" themeColor="danger">{t('el.cancelReason')} : {r.cancelReason}</ThemedText> : null}

      <Card>
        <ThemedText type="smallBold">{t('el.estimate')} {r.estimateStatus !== 'NONE' ? `· ${t(`el.est.${r.estimateStatus}`)}` : ''}</ThemedText>
        {r.parts.length === 0 && num(r.laborAmount) === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('el.noEstimate')}</ThemedText> : null}
        {r.parts.map((p) => <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" style={{ flex: 1 }}>{p.description} × {num(p.quantity)}</ThemedText><ThemedText type="small">{shop.money(num(p.quantity) * num(p.unitPrice))}</ThemedText></View>)}
        {(r.laborLines?.length ? r.laborLines : num(r.laborAmount) > 0 ? [{ name: t('el.labor'), price: r.laborAmount }] : []).map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" style={{ flex: 1 }}>{l.name}</ThemedText><ThemedText type="small">{shop.money(l.price)}</ThemedText></View>))}
        {num(r.discount) > 0 ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small">{t('el.discount')}</ThemedText><ThemedText type="small">− {shop.money(r.discount)}</ThemedText></View> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="smallBold">{t('ws.total')}</ThemedText><ThemedText type="smallBold">{r.underWarranty ? t('el.free') : shop.money(r.total)}</ThemedText></View>
        <ThemedText type="small" themeColor="textSecondary">{t('el.depositsPaid')} : {shop.money(r.depositTotal)}{!r.underWarranty ? ` · ${t('el.balance')} : ${shop.money(r.balance)}` : ''}</ThemedText>
      </Card>

      {canUpdate && !closed && mode == null ? (
        <View style={{ gap: 8 }}>
          {r.status !== 'READY' && r.status !== 'UNREPAIRABLE' ? <Btn small variant="secondary" title={t('el.editEstimate')} onPress={() => setMode('edit')} /> : null}
          {quoteStage && r.status !== 'QUOTE_PENDING' && !r.underWarranty ? <Btn small title={t('el.presentQuote')} loading={busy} onPress={() => void act('/quote', undefined, t('el.quotePresented'))} /> : null}
          {r.status === 'QUOTE_PENDING' ? <>
            <Btn small title={t('el.customerApproves')} loading={busy} onPress={() => void act('/approve', undefined, t('el.quoteApproved'))} />
            <Btn small variant="secondary" title={t('el.customerDeclines')} onPress={() => { setF({ note: '' }); setMode('decline'); }} /></> : null}
          {['APPROVED', 'WAITING_PARTS', 'IN_REPAIR'].includes(r.status) && r.estimateStatus !== 'APPROVED' && !r.underWarranty
            ? <Btn small title={t('el.customerApprovesNew')} loading={busy} onPress={() => void act('/approve', undefined, t('el.quoteApproved'))} /> : null}
          {quoteStage && r.underWarranty ? <Btn small title={t('el.startWarrantyWork')} loading={busy} onPress={() => void act('/approve', undefined, t('el.quoteApproved'))} /> : null}
          {next.length > 0 ? <Btn small variant="secondary" title={t('el.changeStatus')} onPress={() => { setF({ status: next[0], note: '' }); setMode('status'); }} /> : null}
          {shop.can('SALES', 'create') ? <Btn small variant="secondary" title={t('el.addDeposit')} onPress={() => { setF({ amount: '', method: methods[0] }); setMode('deposit'); }} /> : null}
          <Btn small variant="secondary" title={t('el.addNote')} onPress={() => { setF({ note: '' }); setMode('note'); }} />
          <Btn small variant="ghost" title={t('el.cancelRepair')} onPress={() => { setF({ reason: '', refundMethod: methods[0] }); setMode('cancel'); }} />
        </View>
      ) : null}
      {canUpdate && ['READY', 'UNREPAIRABLE'].includes(r.status) && mode == null ? <Btn title={t('el.deliver')} icon="check" onPress={() => { setF({ to: r.customerName, amount: balance > 0 && !r.underWarranty ? String(balance) : '', method: methods[0] }); setMode('deliver'); }} /> : null}
      {digits && !closed && mode == null ? <Btn small variant="secondary" icon="whatsapp" title={t('el.warnCustomer')} onPress={() => void Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`)} /> : null}

      {mode === 'status' ? <Card>
        <Chips scroll={false} value={f.status} onChange={(v) => setF({ ...f, status: v })} options={next.map((s) => ({ value: s, label: t(`el.rs.${s}`) }))} />
        <TextBox label={f.status === 'UNREPAIRABLE' ? `${t('el.whyUnrepairable')} *` : t('el.note')} value={f.note} onChangeText={(v) => setF({ ...f, note: v })} />
        <Btn title={t('common.save')} loading={busy} disabled={f.status === 'UNREPAIRABLE' && !f.note.trim()} onPress={() => void act('/status', { status: f.status, note: f.note || undefined }, t('el.saved'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      {mode === 'decline' ? <Card>
        <TextBox label={t('el.note')} value={f.note} onChangeText={(v) => setF({ ...f, note: v })} placeholder={t('el.declineHint')} />
        <Btn title={t('el.customerDeclines')} loading={busy} onPress={() => void act('/decline', { note: f.note || undefined }, t('el.quoteDeclined'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      {mode === 'deposit' ? <Card>
        <NumberBox label={t('el.deposit')} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        <Chips scroll={false} value={f.method} onChange={(v) => setF({ ...f, method: v })} options={methods.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
        <Btn title={t('el.addDeposit')} loading={busy} disabled={num(f.amount) <= 0} onPress={() => void act('/deposits', { id: uuid(), method: f.method, amount: num(f.amount) }, t('el.depositSaved'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      {mode === 'note' ? <Card>
        <TextBox label={t('el.note')} value={f.note} onChangeText={(v) => setF({ ...f, note: v })} multiline />
        <Btn title={t('common.save')} loading={busy} disabled={!f.note.trim()} onPress={() => void act('/note', { note: f.note.trim() }, t('el.saved'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      {mode === 'cancel' ? <Card>
        <TextBox label={`${t('el.cancelReason')} *`} value={f.reason} onChangeText={(v) => setF({ ...f, reason: v })} />
        {num(r.depositTotal) > 0 ? <Chips value={f.refundMethod} onChange={(v) => setF({ ...f, refundMethod: v })} options={REFUNDS.map((m) => ({ value: m, label: m === 'CREDIT' ? t('el.refundCredit') : t(`ws.m.${m}`) }))} /> : null}
        <Btn title={t('el.cancelRepair')} loading={busy} disabled={!f.reason.trim()} onPress={() => void act('/cancel', { reason: f.reason.trim(), refundMethod: num(r.depositTotal) > 0 ? f.refundMethod : undefined }, t('el.saved'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      {mode === 'deliver' ? <Card>
        <ThemedText type="small">{r.underWarranty ? t('el.deliverFree') : t('el.deliverHelp', { total: shop.money(r.total), deposit: shop.money(r.depositTotal), balance: shop.money(balance) })}</ThemedText>
        <TextBox label={`${t('el.deliveredTo')} *`} hint={t('el.deliveredToHint')} value={f.to} onChangeText={(v) => setF({ ...f, to: v })} />
        {!r.underWarranty && balance > 0 ? <>
          <NumberBox label={t('el.payNow')} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
          <Chips scroll={false} value={f.method} onChange={(v) => setF({ ...f, method: v })} options={methods.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} /></> : null}
        <Btn title={t('el.deliverConfirm')} loading={busy} disabled={!f.to.trim()}
          onPress={() => void act('/deliver', { saleId, deliveredTo: f.to.trim(), payments: num(f.amount) > 0 && !r.underWarranty ? [{ id: uuid(), method: f.method, amount: num(f.amount) }] : undefined }, t('el.delivered'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <PdfButton path={`/api/shop/pdf/electronics/repair/${r.id}`} name={`depot-${r.number}.pdf`} label={t('el.ticketPdf')} small />
        {r.status === 'DELIVERED' ? <PdfButton path={`/api/shop/pdf/electronics/repair-delivery/${r.id}`} name={`restitution-${r.number}.pdf`} label={t('el.deliveryPdf')} small /> : null}
      </View>
      <ThemedText type="smallBold">{t('el.history')}</ThemedText>
      {r.events.map((ev, i) => (
        <ThemedText key={i} type="small" themeColor="textSecondary">
          {ev.toStatus ? t(`el.rs.${ev.toStatus}`) : t(`el.rev.${ev.kind}`) === `el.rev.${ev.kind}` ? ev.kind : t(`el.rev.${ev.kind}`)} · {formatDate(ev.at, lang)}{ev.note ? ` · ${ev.note}` : ''}
        </ThemedText>
      ))}
      {mode === 'edit' ? <EstimateForm r={r} onClose={() => setMode(null)} onSaved={(x) => { setR(x); setMode(null); toast(t('el.saved')); onChanged(); }} /> : null}
    </Sheet>
  );
}

/** Atelier : depot avec fiche d'etat, devis, pieces, acompte, restitution, garantie de reparation. */
export default function Repairs({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [status, setStatus] = useState('OPEN');
  const [q, setQ] = useState('');
  const [late, setLate] = useState(false);
  const [form, setForm] = useState(false);
  const params = useLocalSearchParams<{ open?: string }>();
  const [open, setOpen] = useState<string | null>(params.open ?? null);
  const list = useInfinite<Repair>(`${API}/repairs`, { q: q.trim(), status: status || undefined, late: late || undefined });
  const canCreate = shop.can('REPAIRS', 'create');

  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('el.repairsSubtitle')}>
      <View style={{ alignItems: 'flex-start', marginBottom: 6 }}><PdfButton path="/api/shop/pdf/electronics/report/workshop" name="atelier-en-cours.pdf" label={t('el.reportWork')} small /></View>
      <Chips value={status} onChange={setStatus} options={FILTERS.map((s) => ({ value: s, label: s === 'OPEN' ? t('el.rs.OPEN') : s ? t(`el.rs.${s}`) : t('ws.all') }))} />
      <View style={{ marginVertical: 8, gap: 8 }}>
        <Input value={q} onChangeText={setQ} placeholder={t('el.searchRepairs')} autoCapitalize="none" />
        <Switch value={late} onChange={setLate} label={t('el.onlyLate')} />
      </View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={78} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(x) => x.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={() => void list.reload()} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="screwdriver-wrench" title={t('el.repairsEmpty')} text={t('el.repairsEmptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: x }) => (
            <Card onPress={() => setOpen(x.id)}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>{x.number} · {[x.deviceBrand, x.deviceModel].filter(Boolean).join(' ')}</ThemedText>
                {x.late ? <Badge tone="danger">{t('el.late')}</Badge> : null}
                <Badge tone={REPAIR_TONE[x.status] ?? 'info'}>{t(`el.rs.${x.status}`)}</Badge>
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{[x.customerName, x.problem, x.promisedDate ? `${t('el.promised')} ${formatDate(x.promisedDate, lang)}` : null].filter(Boolean).join(' · ')}</ThemedText>
              <ThemedText type="smallBold">{x.underWarranty ? t('el.free') : num(x.balance) > 0 ? shop.money(x.balance) : ''}</ThemedText>
            </Card>
          )} />
      )}
      {canCreate ? <Fab label={t('el.repairNew')} onPress={() => setForm(true)} /> : null}
      {form ? <RepairForm onClose={() => setForm(false)} onSaved={(r) => { setForm(false); if (!r) { toast(t('el.repairQueued')); return; } toast(t('el.repairCreated', { number: r.number })); setOpen(r.id); void list.reload(); }} /> : null}
      {open ? <RepairSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
