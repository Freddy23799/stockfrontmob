import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Row, Screen, Sheet, Skeleton, Stack, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, num } from '@/lib/format';
import { useGo } from '@/lib/nav';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const daysSince = (iso?: string) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
type Balance = { insurerId: string; insurerName: string; openAmount: number; openCount: number; oldest?: string };
type Claim = { id: string; documentNumber: string; patientName?: string; memberNumber?: string; coveragePercent: number; issuedAt: string; amount: number; status: string; settledAt?: string; settlementRef?: string };

/** Tiers payant : ce que chaque assureur doit a la boutique, et ses reglements. */
export default function Insurance({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const go = useGo();
  const q = useQuery<Balance[]>('/api/shop/insurance/balances');
  const [open, setOpen] = useState<Balance | null>(null);
  const rows = q.data;
  const totalOpen = (rows ?? []).reduce((a, r) => a + Number(r.openAmount), 0);
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('ins.subtitle')} onRefresh={q.reload} right={rows && rows.length > 0 ? <PdfButton small path="/api/shop/pdf/insurance" name="tiers-payant.pdf" /> : undefined}>
      {q.error && !rows ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!rows && !q.error ? <Skeleton rows={3} height={72} /> : null}
      {rows && rows.length === 0 ? <Empty icon="shield-heart" title={t('ins.empty')} text={t('ins.emptyText')} action={go.first('parties') ? <Btn icon="plus" title={shop.v('newInsurer')} onPress={() => go.item('insurers')} /> : undefined} /> : null}
      {rows && rows.length > 0 ? (
        <Stack gap={10}>
          <Card tone="warning" style={{ gap: 2 }}><ThemedText type="small" themeColor="warning">{t('ins.totalOpen')}</ThemedText><ThemedText type="subtitle" themeColor="warning" style={{ fontSize: 26 }}>{shop.money(totalOpen)}</ThemedText></Card>
          {rows.map((r) => (
            <Row key={r.insurerId} icon="shield-heart" title={r.insurerName} subtitle={r.openCount > 0 ? t('ins.claimsOpen', { count: r.openCount, days: daysSince(r.oldest) }) : t('ins.upToDate')} onPress={() => setOpen(r)}
              right={num(r.openAmount) > 0 ? <Badge tone={daysSince(r.oldest) > 60 ? 'danger' : 'warning'}>{shop.money(r.openAmount)}</Badge> : <Badge tone="success">OK</Badge>} />
          ))}
        </Stack>
      ) : null}
      {open ? <ClaimsSheet insurer={open} onClose={() => setOpen(null)} onChanged={() => void q.reload()} /> : null}
    </Screen>
  );
}

function ClaimsSheet({ insurer, onClose, onChanged }: { insurer: Balance; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const [status, setStatus] = useState('OPEN');
  const claims = useQuery<{ items: Claim[] }>(`/api/shop/insurance/claims${qs({ insurerId: insurer.insurerId, status, size: 100 })}`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = claims.data?.items ?? [];
  const open = list.filter((c) => c.status === 'OPEN');
  const sum = open.filter((c) => picked.has(c.id)).reduce((a, c) => a + Number(c.amount), 0);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function settle() {
    setBusy(true); setError(null);
    try { await shop.call('/api/shop/insurance/settle', { method: 'POST', body: { claimIds: [...picked], reference } }); toast(t('ins.settled')); setReference(''); setPicked(new Set()); onChanged(); await claims.reload(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  const canSettle = status === 'OPEN' && open.length > 0 && shop.can('INSURANCE', 'update');
  return (
    <Sheet visible tall title={insurer.insurerName} onClose={onClose}
      footer={canSettle ? (
        <View style={{ gap: 8 }}>
          <TextBox label={t('ins.reference')} value={reference} onChangeText={setReference} maxLength={80} placeholder={t('ins.referenceHint')} />
          <Btn icon="check-double" title={t('ins.markPaid', { amount: shop.money(sum) })} disabled={picked.size === 0 || busy} loading={busy} onPress={settle} />
        </View>
      ) : undefined}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <Chips scroll={false} value={status} onChange={(v) => { setStatus(v); setPicked(new Set()); }} options={[{ value: 'OPEN', label: t('ins.open') }, { value: 'SETTLED', label: t('ins.paid') }]} />
      {status === 'OPEN' && open.length > 1 ? <Btn small variant="ghost" title={picked.size === open.length ? t('ins.none') : t('ins.selectAll')} onPress={() => setPicked(picked.size === open.length ? new Set() : new Set(open.map((c) => c.id)))} /> : null}
      {!claims.data ? <Skeleton rows={3} height={64} /> : list.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ins.noClaims')}</ThemedText> : list.map((c) => (
        <Pressable key={c.id} disabled={!(status === 'OPEN' && shop.can('INSURANCE', 'update'))} onPress={() => toggle(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: picked.has(c.id) }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: picked.has(c.id) ? th.backgroundSelected : th.backgroundElement }}>
          {status === 'OPEN' && shop.can('INSURANCE', 'update') ? <Icon name={picked.has(c.id) ? 'square-check' : 'square'} size={20} color={picked.has(c.id) ? th.primary : th.textSecondary} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText type="smallBold">{c.documentNumber}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{[c.patientName, c.memberNumber && `N° ${c.memberNumber}`, `${Number(c.coveragePercent)} %`, formatDate(c.issuedAt, lang)].filter(Boolean).join(' · ')}</ThemedText>
            {c.status === 'SETTLED' ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('ins.settledOn', { date: formatDate(c.settledAt, lang), ref: c.settlementRef ?? '—' })}</ThemedText> : null}
          </View>
          <ThemedText type="smallBold">{shop.money(c.amount)}</ThemedText>
        </Pressable>
      ))}
    </Sheet>
  );
}
