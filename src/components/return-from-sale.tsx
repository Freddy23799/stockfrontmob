import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, ErrorNote, Hint, NumberBox, Sheet, Skeleton, Switch } from '@/components/ui';
import { SelectField } from '@/components/dynamic-fields';
import type { Doc } from '@/components/receipt';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, uuid } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';

const REASONS = ['DEFECTIVE', 'EXPIRED', 'WRONG_ITEM', 'CHANGED_MIND', 'OTHER'];
const fmt = (n: number | string) => String(Number(Number(n).toFixed(3)));

type Unit = { id: string; label: string; factor: number | string };
type RLine = { lineId: string; description: string; unitLabel?: string | null; unitFactor: number | string; soldBase: number | string; returnedBase: number | string; remainingBase: number | string;
  remainingDisplay: number | string; lineTotal: number | string; lotNumber?: string; stocked: boolean; units: Unit[] };
type Returnable = { number: string; partyId?: string; partyName?: string; balance: number | string; insured: boolean; cancelled: boolean; lines: RLine[]; returns: { id: string; number: string; total: number | string; issuedAt: string }[] };
type Pick = { qty: string; unit: string; restock: boolean };

/** Retour partiel depuis une vente passee : lignes et quantites (dans l'unite vendue ou une autre), remise en stock par ligne, remboursement. */
export function ReturnFromSale({ saleId, onClose, onDone }: { saleId: string; onClose: () => void; onDone: (doc: Doc | null) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const offline = useOffline();
  const id = useRef(uuid());   // identifiant choisi ici : un renvoi apres coupure ne cree pas de doublon
  const [data, setData] = useState<Returnable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pick, setPick] = useState<Record<string, Pick>>({});
  const [reason, setReason] = useState('DEFECTIVE');
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    shop.call<Returnable>(`/api/shop/sales/${saleId}/returnable`).then(setData).catch((e) => {
      if (e instanceof ApiError && e.code === 'SALE_NOT_FOUND') setPending(true);
      else setError(e instanceof ApiError ? e.message : t('common.network'));
    });
  }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const factorOf = (l: RLine, p: Pick) => (p.unit === 'base' ? 1 : p.unit === 'sold' ? Number(l.unitFactor) : Number(l.units.find((u) => u.id === p.unit)?.factor ?? 1));
  const rows = useMemo(() => (data?.lines ?? []).map((l) => {
    const p = pick[l.lineId] ?? { qty: '', unit: 'sold', restock: true };
    const qtyBase = Number(p.qty || 0) * factorOf(l, p);
    const over = qtyBase > Number(l.remainingBase) + 1e-9;
    const refund = qtyBase > 0 && Number(l.soldBase) > 0 ? (Number(l.lineTotal) * qtyBase) / Number(l.soldBase) : 0;
    return { l, p, qtyBase, over, refund };
  }), [data, pick]);
  const chosen = rows.filter((r) => r.qtyBase > 0);
  const total = chosen.reduce((a, r) => a + r.refund, 0);
  const valid = chosen.length > 0 && chosen.every((r) => !r.over) && !data?.insured && !data?.cancelled;
  const offset = data ? Math.min(total, Math.max(0, Number(data.balance))) : 0;
  const patch = (lineId: string, c: Partial<Pick>) => setPick((s) => ({ ...s, [lineId]: Object.assign({ qty: '', unit: 'sold', restock: true }, s[lineId], c) }));
  const methods = [...(shop.ws.manifest.paymentMethods ?? ['CASH']), ...(data?.partyId ? ['CREDIT_NOTE'] : [])];

  async function submit() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        id: id.current, saleId, reason: t(`ret.c.reason.${reason}`),
        lines: chosen.map((r) => ({ saleLineId: r.l.lineId, quantity: Number(r.p.qty), restock: r.l.stocked ? r.p.restock : undefined,
          unitId: r.p.unit !== 'sold' && r.p.unit !== 'base' ? r.p.unit : undefined, useBase: r.p.unit === 'base' ? true : undefined })),
        refunds: total - offset > 0.004 ? [{ method }] : [],
      };
      const res = await offline.submit<Doc>({ id: id.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/customer-returns', body, label: `${t('ret.c.start')} · ${data.number}` });
      onDone(res.queued ? null : res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.network'));
      setBusy(false);
    }
  }

  return (
    <Sheet visible tall title={t('ret.c.start')} onClose={onClose}
      footer={<Btn icon="check" title={busy ? t('ws.saving') : t('ret.c.confirm')} disabled={!valid || busy} loading={busy} onPress={submit} />}>
      {pending ? <Hint icon="cloud-arrow-up" tone="warning">{t('ret.c.pendingSale')}</Hint>
        : !data ? (error ? <ErrorNote message={error} /> : <Skeleton rows={3} height={80} />) : (
          <>
            {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
            <ThemedText type="small" themeColor="textSecondary">{t('ret.c.saleRef', { number: data.number })}{data.partyName ? ` · ${data.partyName}` : ''}</ThemedText>
            {data.insured ? <Hint icon="triangle-exclamation" tone="warning">{t('ret.c.insured')}</Hint> : null}
            {data.cancelled ? <Hint icon="triangle-exclamation" tone="warning">{t('ret.c.cancelled')}</Hint> : null}
            {!data.insured && !data.cancelled && data.lines.every((l) => Number(l.remainingBase) <= 0) ? <Hint icon="circle-info">{t('ret.c.nothing')}</Hint> : null}
            <ThemedText type="smallBold">{t('ret.c.pickLines')}</ThemedText>
            {rows.map(({ l, p, over, refund }) => {
              const done = Number(l.remainingBase) <= 0;
              const soldDisp = l.unitLabel ? Number(l.soldBase) / Number(l.unitFactor) : Number(l.soldBase);
              return (
                <Card key={l.lineId} style={{ gap: 8, opacity: done ? 0.55 : 1 }}>
                  <ThemedText type="smallBold">{l.description}{l.lotNumber ? ` · ${shop.v('lot')} ${l.lotNumber}` : ''}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                    {t('ret.c.sold', { qty: `${fmt(soldDisp)}${l.unitLabel ? ` ${l.unitLabel}` : ''}` })}
                    {Number(l.returnedBase) > 0 ? ` · ${t('ret.c.alreadyReturned', { qty: fmt(l.unitLabel ? Number(l.returnedBase) / Number(l.unitFactor) : l.returnedBase) })}` : ''}
                    {!done ? ` · ${t('ret.c.canReturn', { qty: fmt(l.remainingDisplay) })}` : ''} · {shop.money(l.lineTotal)}
                  </ThemedText>
                  {!done ? (
                    <>
                      <NumberBox label={t('ret.c.qty')} value={p.qty} onChange={(v) => patch(l.lineId, { qty: v })} error={over ? t('ret.c.canReturn', { qty: fmt(l.remainingDisplay) }) : null} />
                      {l.unitLabel || l.units.length > 0 ? (
                        <SelectField label={t('ret.c.unit')} value={p.unit} onChange={(v) => patch(l.lineId, { unit: v })}
                          options={[{ value: 'sold', label: l.unitLabel ?? '—' }, ...(l.unitLabel ? [{ value: 'base', label: '1' }] : []), ...l.units.filter((u) => u.label !== l.unitLabel).map((u) => ({ value: u.id, label: u.label }))]} />
                      ) : null}
                      {refund > 0 ? <ThemedText type="smallBold">≈ {shop.money(refund)}</ThemedText> : null}
                      {l.stocked ? <Switch value={p.restock} onChange={(v) => patch(l.lineId, { restock: v })} label={p.restock ? t('ret.c.restock') : t('ret.c.noRestock')} hint={p.restock && l.lotNumber ? t('ret.c.lotKept', { lot: l.lotNumber }) : undefined} /> : null}
                    </>
                  ) : null}
                </Card>
              );
            })}
            <SelectField label={t('ret.c.reason')} value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: t(`ret.c.reason.${r}`) }))} />
            {total > 0 ? (
              <Card style={{ gap: 8 }}>
                <ThemedText type="smallBold">{t('ret.c.refundBlock')} · {t('ret.c.total')} ≈ {shop.money(total)}</ThemedText>
                {offset > 0 ? <Hint icon="coins">{t('ret.c.debtReduced', { amount: shop.money(offset) })}</Hint> : null}
                {total - offset > 0.004 ? (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">{t('ret.c.refundHow', { amount: shop.money(total - offset) })}</ThemedText>
                    <Chips scroll={false} value={method} onChange={setMethod} options={methods.map((m) => ({ value: m, label: m === 'CREDIT_NOTE' ? t('ret.c.method.CREDIT_NOTE') : t(`ws.m.${m}`) }))} />
                  </>
                ) : null}
              </Card>
            ) : null}
            {data.returns.length > 0 ? (
              <View style={{ gap: 4 }}>
                <ThemedText type="smallBold">{t('ret.c.history')}</ThemedText>
                {data.returns.map((r) => <View key={r.id} style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="small" style={{ flex: 1 }}>{r.number} · {formatDate(r.issuedAt, lang)}</ThemedText><Badge>{shop.money(r.total)}</Badge></View>)}
              </View>
            ) : null}
          </>
        )}
    </Sheet>
  );
}
