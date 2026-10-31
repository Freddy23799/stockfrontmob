import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Card, Chips, Empty, ErrorNote, Hint, Input, IconBadge, Screen, Sheet, Skeleton, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api, ApiError, NetworkError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { qs } from '@/lib/query';
import { LIST_PROPS } from '@/lib/list';

const GROUPS = ['SALES', 'PURCHASES', 'STOCK', 'MONEY', 'TEAM', 'SYSTEM'] as const;
const GROUP_ICON: Record<string, string> = { SALES: 'cart', PURCHASES: 'truck', STOCK: 'box', MONEY: 'coins', TEAM: 'users', SYSTEM: 'gear' };
const GROUP_TONE: Record<string, Tone> = { SALES: 'success', PURCHASES: 'info', STOCK: 'warning', MONEY: 'primary', TEAM: 'neutral', SYSTEM: 'neutral' };
const TYPE_ICON: Record<string, string> = {
  SALE: 'cart', SALE_CANCELLED: 'ban', CUSTOMER_RETURN: 'undo', DEBT_COLLECTED: 'coins', REFUND: 'undo', CUSTOMER_CREATED: 'user-plus', LOYALTY_ADJUSTED: 'gift',
  PURCHASE_ORDER: 'clipboard-list', GOODS_RECEIPT: 'truck', SUPPLIER_RETURN: 'undo', SUPPLIER_PAYMENT: 'money', SUPPLIER_CREATED: 'handshake',
  STOCK_ADJUSTMENT: 'sliders', STOCK_LOSS: 'triangle', INVENTORY_COUNT: 'check-double', PRODUCT_CREATED: 'plus', PRODUCT_PRICE_CHANGED: 'tag', PRODUCT_DELETED: 'trash', PRODUCTS_IMPORTED: 'cloud-arrow-up',
  EXPENSE: 'receipt', EXPENSE_DELETED: 'trash', CASH_OPENED: 'cash-register', CASH_CLOSED: 'cash-register', INSURANCE_SETTLED: 'shield', ACCOUNTING_CLOSED: 'lock', ACCOUNTING_REOPENED: 'key',
  PAYROLL_PAYMENT: 'money', PAYROLL_CYCLE_CREATED: 'clipboard-list', PAYROLL_CYCLE_CLOSED: 'lock', PAYROLL_ADJUSTMENT: 'sliders', LEAVE_REQUEST: 'clock', LEAVE_APPROVED: 'check', LEAVE_REJECTED: 'xmark',
  STAFF_CREATED: 'user-plus', STAFF_ARCHIVED: 'ban', STAFF_REACTIVATED: 'play', STAFF_CAREER_ADDED: 'arrow-up', STAFF_CAREER_CORRECTED: 'edit',
  EMPLOYEE_CREATED: 'user-shield', EMPLOYEE_UPDATED: 'edit', EMPLOYEE_SUSPENDED: 'pause', EMPLOYEE_ACTIVE: 'play', EMPLOYEE_DELETED: 'trash', EMPLOYEE_PASSWORD_RESET: 'key',
  SHOP_CREATED: 'store', SHOP_SETTINGS_UPDATED: 'gear', SHOP_CONFIG_UPDATED: 'sliders', SHOP_LOGO_CHANGED: 'image', SHOP_LOGO_REMOVED: 'image', FEATURES_CHANGED: 'sliders', FEATURE_REQUESTED: 'sparkles',
};
const POSITIVE = new Set(['SALE', 'DEBT_COLLECTED', 'CASH_CLOSED', 'CASH_OPENED']);
const PERIODS = ['today', '7d', '30d', 'month', 'lastMonth'] as const;

type Op = {
  type: string; group: string; at: string; title?: string; subject?: string; detail?: string; status?: string; amount?: number | null; currency?: string; qty?: number | null;
  actorName?: string; actorType?: string; shopId: string; shopName: string; refKind?: string; refId?: string;
};
type TypeCount = { type: string; group: string; count: number; amount: number | null; currency: string };
type Summary = { total: number; shops: { id: string; name: string; currency: string }[]; types: TypeCount[] };
type Page = { items: Op[]; total: number };
type Doc = { id: string; number: string; partyName?: string; total: number; paymentStatus: string; cancelledAt?: string; cancelReason?: string;
  lines: { id: string; description: string; quantity: number; displayQuantity?: number; lineTotal: number; lotNumber?: string }[]; payments: { id: string; method: string; amount: number }[] };

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
function preset(key: string) {
  const now = new Date();
  const back = (n: number) => { const x = new Date(now); x.setDate(x.getDate() - n); return x; };
  switch (key) {
    case 'today': return { from: iso(now), to: iso(now) };
    case '7d': return { from: iso(back(6)), to: iso(now) };
    case 'month': return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case 'lastMonth': return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    default: return { from: iso(back(29)), to: iso(now) };
  }
}
const tone = (status?: string): Tone => (['PAID', 'OK', 'COMPLETED', 'RECEIVED', 'APPROVED'].includes(status ?? '') ? 'success' : ['CANCELLED', 'GAP', 'REJECTED', 'UNPAID'].includes(status ?? '') ? 'danger' : ['PARTIAL', 'PENDING', 'SENT', 'DRAFT'].includes(status ?? '') ? 'warning' : 'info');
const errText = (e: unknown, t: (k: string) => string) => (e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.network') : t('common.error'));

/**
 * Journal des operations du proprietaire : `shopId` = une boutique, sinon toutes ses boutiques. Operations classees par groupe puis par type,
 * avec leur nombre et leur total. Lecture seule, reseau requis (le serveur calcule les totaux sur toute la periode).
 */
export default function Operations({ shopId }: { shopId?: string }) {
  const { t, lang, formatMoney } = useT();
  const th = useTheme();
  const all = !shopId;
  const base = all ? '/api/merchant/operations' : `/api/merchant/shops/${shopId}/operations`;
  const [range, setRange] = useState<string>('30d');
  const [group, setGroup] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [shops, setShops] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [options, setOptions] = useState<Summary['shops']>([]);
  const [items, setItems] = useState<Op[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Op | null>(null);
  const ticket = useRef(0);
  const dates = useMemo(() => preset(range), [range]);

  useEffect(() => { const id = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(id); }, [q]);

  // totaux par type : suivent la periode, la boutique et la recherche, pas le groupe ou le type deja choisi
  useEffect(() => {
    let alive = true;
    api<Summary>(`${base}/summary${qs({ ...dates, q: search, shops })}`, { shop: '' })
      .then((s) => { if (!alive) return; setSummary(s); if (all && !shops) setOptions(s.shops); })
      .catch((e) => alive && setError(errText(e, t)));
    return () => { alive = false; };
  }, [base, dates, search, shops, all, t]);

  const fetchPage = useCallback(async (n: number) => {
    const mine = ++ticket.current;
    if (n === 0) setLoading(true); else setMore(true);
    try {
      const res = await api<Page>(`${base}${qs({ ...dates, group, type, q: search, shops, size: 30, page: n })}`, { shop: '' });
      if (mine !== ticket.current) return;
      setItems((cur) => (n === 0 ? res.items : [...cur, ...res.items]));
      setTotal(res.total);
      setPage(n);
      setError(null);
    } catch (e) {
      if (mine === ticket.current) setError(errText(e, t));
    } finally {
      if (mine === ticket.current) { setLoading(false); setMore(false); }
    }
  }, [base, dates, group, type, search, shops, t]);
  useEffect(() => { const id = setTimeout(() => void fetchPage(0), 0); return () => clearTimeout(id); }, [fetchPage]);

  const currency = summary?.shops?.[0]?.currency ?? 'XAF';
  const mixed = new Set((summary?.shops ?? []).map((s) => s.currency)).size > 1;
  const byType = useMemo(() => {
    const m = new Map<string, { type: string; group: string; count: number; amount: number | null }>();
    for (const r of summary?.types ?? []) {
      const cur = m.get(r.type) ?? { type: r.type, group: r.group, count: 0, amount: null };
      cur.count += r.count;
      if (r.amount != null && r.currency === currency) cur.amount = Number(cur.amount ?? 0) + Number(r.amount);
      m.set(r.type, cur);
    }
    return [...m.values()];
  }, [summary, currency]);
  const countOf = (g: string) => byType.filter((x) => x.group === g).reduce((a, x) => a + x.count, 0);
  const sum = (name: string) => Number(byType.find((x) => x.type === name)?.amount ?? 0);
  const money = (n?: number | null, cur?: string) => formatMoney(n ?? 0, cur ?? currency);
  const label = (ty: string) => { const k = `ops.type.${ty}`; const v = t(k); return v === k ? ty : v; };
  const pdfParams = { ...dates, group, type, q: search, shops: all ? shops : undefined, lang };

  const describe = (op: Op) => [op.title && op.title !== '-' ? op.title : '', op.subject ?? '', ['DEBT_COLLECTED', 'SUPPLIER_PAYMENT', 'REFUND'].includes(op.type) && op.detail ? t(`ops.pm.${op.detail}`) : op.detail ?? ''].filter(Boolean).join(' · ');
  const dayLabel = (iso8: string) => {
    const day = iso(new Date(iso8));
    if (day === iso(new Date())) return t('ops.today');
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (day === iso(y)) return t('ops.yesterday');
    return new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso8));
  };

  const header = (
    <View style={s.head}>
      <Chips value={range} onChange={(v) => setRange(v)} options={PERIODS.map((k) => ({ value: k, label: t(`ops.${k}`) }))} />
      <View style={{ justifyContent: 'center' }}>
        <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
        <Input value={q} onChangeText={setQ} placeholder={t('ops.search')} style={{ paddingLeft: 40 }} autoCapitalize="none" />
      </View>
      {all && options.length > 1 ? <Chips value={shops} onChange={setShops} options={[{ value: '', label: t('ops.allShops') }, ...options.map((o) => ({ value: o.id, label: o.name }))]} /> : null}
      {mixed ? <Hint icon="coins" tone="warning">{t('ops.mixedCurrency', { currency })}</Hint> : null}
      <View style={s.kpis}>
        {[
          { l: t('ops.kpiOps'), v: String(summary?.total ?? '…') },
          { l: t('ops.kpiSales'), v: money(sum('SALE')) },
          { l: t('ops.kpiPurchases'), v: money(sum('GOODS_RECEIPT')) },
          { l: t('ops.kpiExpenses'), v: money(sum('EXPENSE')) },
          { l: t('ops.kpiPayroll'), v: money(sum('PAYROLL_PAYMENT')) },
        ].map((k) => (
          <Card key={k.l} style={s.kpi}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{k.l}</ThemedText>
            <ThemedText type="smallBold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{k.v}</ThemedText>
          </Card>
        ))}
      </View>
      <Chips value={group} onChange={(v) => { setGroup(v); setType(''); }}
        options={[{ value: '', label: `${t('ops.all')} · ${summary?.total ?? 0}`, icon: 'list' }, ...GROUPS.filter((g) => countOf(g) > 0).map((g) => ({ value: g, label: `${t(`ops.group.${g}`)} · ${countOf(g)}`, icon: GROUP_ICON[g] }))]} />
      {group ? (
        <Chips value={type} onChange={setType}
          options={[{ value: '', label: t('ops.all') }, ...byType.filter((x) => x.group === group).map((x) => ({ value: x.type, label: `${label(x.type)} · ${x.count}${x.amount != null && Number(x.amount) > 0 ? ` · ${money(x.amount)}` : ''}` }))]} />
      ) : null}
      {error ? <ErrorNote message={error} onRetry={() => void fetchPage(0)} /> : null}
    </View>
  );

  const renderItem = ({ item: op, index }: { item: Op; index: number }) => {
    const newDay = index === 0 || iso(new Date(items[index - 1].at)) !== iso(new Date(op.at));
    const showStatus = op.status && !['IN', 'OUT', 'CASH', 'MOBILE_MONEY', 'CARD'].includes(op.status) && t(`ops.st.${op.status}`) !== `ops.st.${op.status}`;
    return (
      <View>
        {newDay ? <ThemedText type="smallBold" themeColor="textSecondary" style={s.day}>{dayLabel(op.at)}</ThemedText> : null}
        <Pressable onPress={() => setOpen(op)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement }, pressed && { opacity: 0.7 }]}>
          <IconBadge name={TYPE_ICON[op.type] ?? 'clipboard-list'} tone={GROUP_TONE[op.group] ?? 'neutral'} size={36} />
          <View style={s.rowText}>
            <ThemedText type="smallBold" numberOfLines={1}>{label(op.type)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{describe(op) || '—'}</ThemedText>
            <View style={s.meta}>
              {all ? <ThemedText type="small" themeColor="textSecondary" style={s.metaText}>{op.shopName}</ThemedText> : null}
              {op.actorName ? <ThemedText type="small" themeColor="textSecondary" style={s.metaText}>{op.actorName}</ThemedText> : null}
              {showStatus ? <Badge tone={tone(op.status)}>{t(`ops.st.${op.status}`)}</Badge> : null}
            </View>
          </View>
          <View style={s.end}>
            {op.amount != null ? <ThemedText type="smallBold" style={[op.status === 'CANCELLED' && { textDecorationLine: 'line-through' }, POSITIVE.has(op.type) && { color: th.success }]}>{money(op.amount, op.currency)}</ThemedText> : null}
            {op.qty != null && op.group === 'STOCK' ? <ThemedText type="smallBold" style={{ color: Number(op.qty) < 0 ? th.danger : th.success }}>{Number(op.qty) > 0 ? '+' : ''}{Number(op.qty)}</ThemedText> : null}
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>{new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(op.at))}</ThemedText>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen fixed title={all ? t('ops.titleAll') : t('ops.title')} subtitle={summary ? t('ops.count', { count: summary.total }) : undefined}
      right={<PdfButton small variant="primary" shopId="" path={all ? '/api/merchant/operations/pdf' : `${base}/pdf`} params={pdfParams} name="journal-operations.pdf" />}>
      <FlatList {...LIST_PROPS} data={items} keyExtractor={(op, i) => `${op.type}-${op.refId}-${op.at}-${i}`} renderItem={renderItem}
        ListHeaderComponent={header} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4} onEndReached={() => { if (!loading && !more && items.length < total) void fetchPage(page + 1); }}
        ListEmptyComponent={loading ? <Skeleton rows={6} height={64} /> : <Empty icon="clipboard-list" title={t('ops.empty')} />}
        ListFooterComponent={more ? <Skeleton rows={1} height={64} /> : undefined} />
      {open ? <Detail op={open} onClose={() => setOpen(null)} money={money} label={label(open.type)} lang={lang} /> : null}
    </Screen>
  );
}

function Detail({ op, onClose, money, label, lang }: { op: Op; onClose: () => void; money: (n?: number | null, c?: string) => string; label: string; lang: string }) {
  const { t } = useT();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDoc = op.refKind === 'document' && !!op.refId;
  useEffect(() => {
    if (!isDoc) return undefined;
    let alive = true;
    api<Doc>(`/api/shop/documents/${op.refId}`, { shop: op.shopId }).then((d) => alive && setDoc(d)).catch((e) => alive && setError(errText(e, t)));
    return () => { alive = false; };
  }, [isDoc, op.refId, op.shopId, t]);
  const kv = (k: string, v?: string | number | null) => (v == null || v === '' ? null : (
    <View key={k} style={s.kv}><ThemedText type="small" themeColor="textSecondary">{k}</ThemedText><ThemedText type="smallBold" style={s.kvValue}>{String(v)}</ThemedText></View>
  ));
  return (
    <Sheet visible title={label} onClose={onClose} footer={isDoc && doc ? <PdfButton variant="primary" shopId={op.shopId} path={`/api/shop/pdf/documents/${op.refId}`} name={`document-${doc.number}.pdf`} label={t('pdf.document')} /> : undefined}>
      <View style={{ gap: 8 }}>
        {kv(t('ops.date'), formatDateTime(op.at, lang as 'fr'))}
        {kv(t('ops.shop'), op.shopName)}
        {kv(t('ops.actor'), op.actorName ?? t('ops.system'))}
        {!isDoc ? (
          <>
            {kv(t('ops.number'), op.title && op.title !== '-' ? op.title : null)}
            {kv(t('ops.subject'), op.subject)}
            {kv(t('ops.note'), op.detail)}
            {kv(t('ops.amount'), op.amount != null ? money(op.amount, op.currency) : null)}
            {kv(t('ops.qty'), op.qty != null ? Number(op.qty) : null)}
          </>
        ) : null}
        {isDoc && error ? <ErrorNote message={error} /> : null}
        {isDoc && !doc && !error ? <Skeleton rows={3} height={40} /> : null}
        {doc ? (
          <>
            {kv(t('ops.number'), doc.number)}
            {kv(t('ops.subject'), doc.partyName ?? '—')}
            {kv(t('ops.amount'), money(doc.total, op.currency))}
            {kv(t('ops.status'), doc.cancelledAt ? t('ops.st.CANCELLED') : t(`ops.st.${doc.paymentStatus}`))}
            {doc.cancelledAt && doc.cancelReason ? <Hint icon="ban" tone="warning">{doc.cancelReason}</Hint> : null}
            <ThemedText type="smallBold" style={{ marginTop: 6 }}>{t('ops.lines')}</ThemedText>
            {doc.lines.map((l) => (
              <View key={l.id} style={s.kv}>
                <ThemedText type="small" style={s.kvValue} numberOfLines={2}>{Number(l.displayQuantity ?? l.quantity)} × {l.description}{l.lotNumber ? ` (${l.lotNumber})` : ''}</ThemedText>
                <ThemedText type="smallBold">{money(l.lineTotal, op.currency)}</ThemedText>
              </View>
            ))}
            {doc.payments.length > 0 ? <ThemedText type="smallBold" style={{ marginTop: 6 }}>{t('ops.payments')}</ThemedText> : null}
            {doc.payments.map((p) => (
              <View key={p.id} style={s.kv}><ThemedText type="small">{t(`ops.pm.${p.method}`)}</ThemedText><ThemedText type="smallBold">{money(p.amount, op.currency)}</ThemedText></View>
            ))}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  head: { gap: 10, paddingBottom: 6 },
  list: { paddingBottom: 40, gap: 6 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexGrow: 1, flexBasis: 140, gap: 2, paddingVertical: 10 },
  day: { marginTop: 10, marginBottom: 6, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16 },
  rowText: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 12 },
  end: { alignItems: 'flex-end', gap: 2, maxWidth: '40%' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  kvValue: { flexShrink: 1, textAlign: 'right' },
});
