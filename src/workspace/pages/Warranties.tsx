import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { ListFooter } from '@/components/list-footer';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Input, NumberBox, Screen, Sheet, Skeleton, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, errText, num, prettyImei } from '@/lib/electronics';
import { formatDate } from '@/lib/format';
import { LIST_PROPS } from '@/lib/list';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type W = {
  id: string; code: string; kind: string; productName: string; serialNo?: string | null; customerName?: string | null; customerPhone?: string | null; saleNumber?: string | null; months: number;
  durationDays?: number | null; startsOn?: string | null; endsOn?: string | null; status: string; active: boolean; expired: boolean; daysLeft?: number | null; coverage?: string | null; voidReason?: string | null; claims: number;
};
const FILTERS = ['', 'ACTIVE', 'PENDING', 'EXPIRED', 'VOIDED'];
const TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = { ACTIVE: 'success', PENDING: 'warning', EXPIRED: 'danger', VOIDED: 'danger' };
const state = (w: W) => (w.status === 'ACTIVE' && w.expired ? 'EXPIRED' : w.status);

function WarrantySheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [w, setW] = useState<W | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<null | 'void' | 'extend'>(null);
  const [reason, setReason] = useState('');
  const [months, setMonths] = useState('3');
  const canUpdate = shop.can('SERIAL_WARRANTY', 'update');
  useState(() => { shop.call<W>(`${API}/warranties/${id}`).then(setW).catch((e) => setError(errText(e, t('common.error')))); return null; });
  async function act(path: string, body: unknown, ok: string) {
    setBusy(true); setError(null);
    try { setW(await shop.call<W>(`${API}/warranties/${id}/${path}`, { method: 'POST', body })); toast(ok); setMode(null); setReason(''); onChanged(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  if (!w) return <Sheet visible title="…" onClose={onClose}>{error ? <ErrorNote message={error} /> : <Skeleton rows={3} height={60} />}</Sheet>;
  return (
    <Sheet visible title={`${w.code} · ${w.productName}`} onClose={onClose}>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 6 }}><Badge tone={TONE[state(w)] ?? 'info'}>{t(`el.ws.${state(w)}`)}</Badge></View>
      {w.serialNo ? <ThemedText type="small">{t('el.imei')} : {prettyImei(w.serialNo)}</ThemedText> : null}
      {w.customerName ? <ThemedText type="small">{t('el.customer')} : {w.customerName}{w.customerPhone ? ` · ${w.customerPhone}` : ''}</ThemedText> : null}
      {w.saleNumber ? <ThemedText type="small">{t('el.sale')} : {w.saleNumber}</ThemedText> : null}
      <ThemedText type="small">{t('el.startsOn')} : {w.startsOn ? formatDate(w.startsOn, lang) : '—'} · {t('el.endsOn')} : {w.endsOn ? formatDate(w.endsOn, lang) : '—'}</ThemedText>
      {w.daysLeft != null && w.active ? <ThemedText type="smallBold">{t('el.daysLeft', { count: w.daysLeft })}</ThemedText> : null}
      {w.coverage ? <ThemedText type="small" themeColor="textSecondary">{w.coverage}</ThemedText> : null}
      {w.voidReason ? <ThemedText type="small" themeColor="danger">{w.voidReason}</ThemedText> : null}
      {canUpdate && mode == null ? (
        <View style={{ gap: 8 }}>
          {w.status === 'PENDING' ? <Btn title={t('el.activate')} loading={busy} onPress={() => void act('activate', undefined, t('el.warrantyActivated'))} /> : null}
          {['ACTIVE', 'EXPIRED'].includes(w.status) ? <Btn small variant="secondary" title={t('el.extend')} onPress={() => setMode('extend')} /> : null}
          {w.status !== 'VOIDED' ? <Btn small variant="ghost" title={t('el.void')} onPress={() => setMode('void')} /> : null}
        </View>
      ) : null}
      {mode === 'extend' ? <Card>
        <NumberBox label={t('el.addMonths')} value={months} onChange={setMonths} />
        <TextBox label={t('el.extendReasonHint')} value={reason} onChangeText={setReason} />
        <Btn title={t('el.extend')} loading={busy} disabled={num(months) <= 0 || !reason.trim()} onPress={() => void act('extend', { months: num(months), reason: reason.trim() }, t('el.extended'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      {mode === 'void' ? <Card>
        <ThemedText type="small">{t('el.voidText')}</ThemedText>
        <TextBox label={`${t('el.voidReason')} *`} value={reason} onChangeText={setReason} placeholder={t('el.voidHint')} />
        <Btn title={t('el.void')} loading={busy} disabled={!reason.trim()} onPress={() => void act('void', { reason: reason.trim() }, t('el.voided'))} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setMode(null)} /></Card> : null}
      <PdfButton path={`/api/shop/pdf/electronics/warranty/${w.id}`} name={`garantie-${w.code}.pdf`} label={t('el.warrantyPdf')} small />
    </Sheet>
  );
}

/** Garanties : verification par IMEI (le comptoir demande « est-ce couvert ? »), liste, activation, prolongation, annulation. */
export default function Warranties({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const [status, setStatus] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [vq, setVq] = useState('');
  const [verdict, setVerdict] = useState<{ covered: boolean; found: boolean; warranty?: W } | null>(null);
  const [vErr, setVErr] = useState<string | null>(null);
  const list = useInfinite<W>(`${API}/warranties`, { q: q.trim(), status: status || undefined });

  async function verify() {
    setVErr(null); setVerdict(null);
    try {
      const r = await shop.call<Record<string, any>>(`${API}/warranties/verify?q=${encodeURIComponent(vq.trim())}`);
      const best = (r.warranties as W[] | undefined)?.find((x) => x.active) ?? (r.warranties as W[] | undefined)?.[0];
      setVerdict({ covered: Boolean(r.covered), found: Boolean(r.found), warranty: best });
    } catch (e) { setVErr(errText(e, t('common.error'))); }
  }
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('el.warrantiesSubtitle')}>
      <Card>
        <ThemedText type="smallBold">{t('el.verifyTitle')}</ThemedText>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Input value={vq} onChangeText={setVq} placeholder={t('el.verifyPlaceholder')} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={() => void verify()} returnKeyType="search" /></View>
          <Btn small title={t('el.verify')} disabled={vq.trim().length < 4} onPress={() => void verify()} />
        </View>
        {vErr ? <ThemedText type="small" themeColor="danger">{vErr}</ThemedText> : null}
        {verdict ? (
          <ThemedText type="smallBold" themeColor={verdict.covered ? 'success' : 'danger'}>
            {!verdict.found ? t('el.verifyNone') : verdict.covered ? `${t('el.verifyCovered')}${verdict.warranty?.endsOn ? ` · ${t('el.until')} ${formatDate(verdict.warranty.endsOn, lang)}` : ''}` : t('el.verifyNotCovered')}
          </ThemedText>
        ) : null}
      </Card>
      <View style={{ marginVertical: 8, gap: 8 }}>
        <View style={{ alignItems: 'flex-start' }}><PdfButton path="/api/shop/pdf/electronics/report/warranties-expiring" params={{ days: 30 }} name="garanties-echeance.pdf" label={t('el.reportWarr')} small /></View>
        <Chips value={status} onChange={setStatus} options={FILTERS.map((s) => ({ value: s, label: s ? t(`el.ws.${s}`) : t('ws.all') }))} />
        <Input value={q} onChangeText={setQ} placeholder={t('el.searchWarranties')} autoCapitalize="characters" autoCorrect={false} />
      </View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={72} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(w) => w.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={() => void list.reload()} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="shield-halved" title={t('el.warrantiesEmpty')} text={t('el.warrantiesEmptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: w }) => (
            <Card onPress={() => setOpen(w.id)}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>{w.productName}</ThemedText>
                <Badge tone={TONE[state(w)] ?? 'info'}>{t(`el.ws.${state(w)}`)}</Badge>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{[w.code, w.serialNo ? prettyImei(w.serialNo) : null, w.customerName, w.endsOn ? `${t('el.until')} ${formatDate(w.endsOn, lang)}` : null].filter(Boolean).join(' · ')}</ThemedText>
            </Card>
          )} />
      )}
      {open ? <WarrantySheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
