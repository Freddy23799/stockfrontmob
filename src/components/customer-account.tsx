import { useState } from 'react';
import { Share, View } from 'react-native';

import { Barcode } from '@/components/barcode';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Hint, NumberBox, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDateTime, uuid } from '@/lib/format';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

export type Account = { partyId: string; name: string; phone?: string; points: number; pointsValue: number | string; credit: number | string; cardNumber?: string | null; earnEvery: number | string; pointValue: number | string; maxRedeemPercent: number | string };
type Move = { id: string; points: number; kind: string; documentNumber?: string; reason?: string; createdAt: string };
type CMove = { id: string; amount: number | string; kind: string; documentNumber?: string; createdAt: string };

/** Carte, points, avoir et historique d'un client (fiche client). Rien ne s'affiche si ni la fidelite ni les retours ne sont actives. */
export function CustomerAccount({ partyId }: { partyId: string }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [local, setLocal] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const [why, setWhy] = useState('');
  const loyaltyOn = shop.has('LOYALTY') && shop.can('LOYALTY', 'view');
  const creditOn = shop.has('CUSTOMER_RETURNS') && shop.can('CUSTOMER_RETURNS', 'view');
  const on = loyaltyOn || creditOn;
  const accQ = useQuery<Account>(on ? `/api/shop/customers/${partyId}/account` : null);
  const movesQ = useQuery<{ items: Move[] }>(loyaltyOn ? `/api/shop/loyalty/movements${qs({ partyId, size: 10 })}` : null);
  const creditQ = useQuery<CMove[]>(creditOn ? `/api/shop/customers/${partyId}/credit` : null);
  const acc = local ?? accQ.data;
  const moves = movesQ.data?.items ?? [];
  const credit = creditQ.data ?? [];
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : t('common.network'));
  const setAcc = (a: Account) => setLocal(a);
  const load = () => { void accQ.reload(); void movesQ.reload(); void creditQ.reload(); };
  if (!on) return null;
  if (!acc) return accQ.error ? <Hint icon="circle-xmark" tone="danger">{accQ.error}</Hint> : null;

  async function makeCard() { try { setAcc(await shop.call<Account>(`/api/shop/customers/${partyId}/card`, { method: 'POST' })); } catch (e) { fail(e); } }
  async function adjust() {
    try {
      setAcc(await shop.call<Account>('/api/shop/loyalty/adjust', { method: 'POST', body: { id: uuid(), partyId, points: Number(delta), reason: why } }));
      setDelta(''); setWhy(''); toast(t('loy.adjustDone')); void load();
    } catch (e) { fail(e); }
  }

  return (
    <Card style={{ gap: 10 }}>
      <ThemedText type="smallBold">{t('loy.account')}</ThemedText>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {loyaltyOn ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Badge tone="primary">{t('loy.points', { n: acc.points })}</Badge><ThemedText type="small" themeColor="textSecondary">{t('loy.worth', { amount: shop.money(acc.pointsValue) })}</ThemedText></View> : null}
      {creditOn && Number(acc.credit) > 0 ? <ThemedText type="smallBold">{t('loy.credit', { amount: shop.money(acc.credit) })}</ThemedText> : null}
      {loyaltyOn ? (
        <View style={{ gap: 8, alignItems: 'center' }}>
          <ThemedText type="small" themeColor="textSecondary">{t('loy.card')} · {acc.name}</ThemedText>
          {acc.cardNumber ? <Barcode value={acc.cardNumber} /> : <ThemedText type="small" themeColor="textSecondary">{t('loy.noCard')}</ThemedText>}
          {!acc.cardNumber && shop.can('LOYALTY', 'create') ? <Btn variant="secondary" icon="id-card" title={t('loy.createCard')} onPress={makeCard} /> : null}
          {acc.cardNumber ? <Btn variant="secondary" icon="share-nodes" title={t('loy.printCard')} onPress={() => void Share.share({ message: `${acc.name}\n${t('loy.cardNumber')} ${acc.cardNumber}` })} /> : null}
        </View>
      ) : null}
      {loyaltyOn && shop.can('LOYALTY', 'update') ? (
        <View style={{ gap: 8 }}>
          <NumberBox label={t('loy.adjustPoints')} value={delta} onChange={setDelta} />
          <TextBox label={t('loy.adjustReason')} value={why} onChangeText={setWhy} maxLength={120} autoCapitalize="sentences" />
          <Btn title={t('loy.adjust')} disabled={!Number(delta) || !why.trim()} onPress={adjust} />
        </View>
      ) : null}
      {loyaltyOn ? (
        <View style={{ gap: 4 }}>
          <ThemedText type="smallBold">{t('loy.history')}</ThemedText>
          {moves.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('loy.noMovement')}</ThemedText> : moves.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', gap: 8 }}>
              <ThemedText type="small" style={{ flex: 1 }}>{t(`loy.kind.${m.kind}`)}{m.documentNumber ? ` · ${m.documentNumber}` : ''}{m.reason ? ` · ${m.reason}` : ''}{'\n'}<ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{formatDateTime(m.createdAt, lang)}</ThemedText></ThemedText>
              <ThemedText type="smallBold">{m.points > 0 ? '+' : ''}{m.points}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      {creditOn && credit.length > 0 ? (
        <View style={{ gap: 4 }}>
          <ThemedText type="smallBold">{t('loy.creditHistory')}</ThemedText>
          {credit.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', gap: 8 }}>
              <ThemedText type="small" style={{ flex: 1 }}>{t(`loy.ckind.${m.kind}`)}{m.documentNumber ? ` · ${m.documentNumber}` : ''}{'\n'}<ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{formatDateTime(m.createdAt, lang)}</ThemedText></ThemedText>
              <ThemedText type="smallBold">{Number(m.amount) > 0 ? '+' : ''}{shop.money(m.amount)}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
