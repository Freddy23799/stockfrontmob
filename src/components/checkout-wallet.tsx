import { useEffect, useState } from 'react';
import { useQuery } from '@/lib/query';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Hint, Input, NumberBox, Switch } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { uuid } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';
import type { Account } from './customer-account';
import type { Party } from './party-picker';

export type Wallet = { amount: number; payments: { id: string; method: string; amount: number }[] };
export const NO_WALLET: Wallet = { amount: 0, payments: [] };

/**
 * Fidelite et avoir a la caisse : retrouver le client par sa carte (scan / saisie), utiliser des points (plafonnes) et son avoir.
 * Renvoie { amount, payments } : ce qui est deja regle. Hors ligne, les soldes sont inconnus : rien n'est propose.
 */
export function CheckoutWallet({ partyId, due, onPickParty, onChange }: { partyId: string | null; due: number; onPickParty: (id: string | null, p?: Party) => void; onChange: (w: Wallet) => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const loyaltyOn = shop.has('LOYALTY') && shop.can('LOYALTY', 'view');
  const creditOn = shop.has('CUSTOMER_RETURNS') && shop.can('CUSTOMER_RETURNS', 'view');
  const [points, setPoints] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accQ = useQuery<Account>(partyId && (loyaltyOn || creditOn) && offline.online ? `/api/shop/customers/${partyId}/account` : null);
  const acc = partyId ? accQ.data : null;

  const pv = Number(acc?.pointValue ?? 1);
  const maxByCap = acc ? Math.floor((due * Number(acc.maxRedeemPercent)) / 100 / pv + 1e-9) : 0;
  const maxPoints = acc && loyaltyOn ? Math.max(0, Math.min(acc.points, maxByCap)) : 0;
  const pts = Math.min(maxPoints, Math.max(0, Math.floor(Number(points) || 0)));
  const loyAmount = Math.round(pts * pv * 100) / 100;
  const creditAmount = acc && creditOn && useCredit ? Math.min(Number(acc.credit), Math.max(0, due - loyAmount)) : 0;
  const earn = acc && loyaltyOn ? Math.floor(Math.max(0, due - loyAmount) / Number(acc.earnEvery)) : 0;

  useEffect(() => {
    const payments: Wallet['payments'] = [];
    if (loyAmount > 0) payments.push({ id: uuid(), method: 'LOYALTY', amount: loyAmount });
    if (creditAmount > 0) payments.push({ id: uuid(), method: 'STORE_CREDIT', amount: creditAmount });
    onChange({ amount: loyAmount + creditAmount, payments });
  }, [loyAmount, creditAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  async function find() {
    setError(null);
    try {
      const a = await shop.call<Account>(`/api/shop/loyalty/lookup?code=${encodeURIComponent(code.trim())}`);
      onPickParty(a.partyId, { id: a.partyId, name: a.name, phone: a.phone, attributes: {} });
      setCode('');
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }

  if (!loyaltyOn && !creditOn) return null;
  return (
    <Card style={{ gap: 10 }}>
      <ThemedText type="smallBold">{t('loy.panel')}</ThemedText>
      {loyaltyOn ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Input value={code} onChangeText={setCode} keyboardType="number-pad" placeholder={t('loy.scan')} maxLength={12} /></View>
          <Btn small icon="barcode" title={t('loy.find')} disabled={!code.trim()} onPress={find} />
        </View>
      ) : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {partyId && !offline.online ? <Hint icon="cloud" tone="warning">{t('loy.offline')}</Hint> : null}
      {acc ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold">{acc.name}</ThemedText>{loyaltyOn ? <Badge tone="primary">{t('loy.points', { n: acc.points })}</Badge> : null}</View>
          {loyaltyOn && maxPoints > 0 ? (
            <View style={{ gap: 6 }}>
              <NumberBox label={t('loy.use')} hint={t('loy.max', { points: maxPoints, amount: shop.money(maxPoints * pv) })} value={points} onChange={setPoints} />
              <Btn small variant="secondary" title={t('loy.useAll')} onPress={() => setPoints(String(maxPoints))} />
            </View>
          ) : null}
          {creditOn && Number(acc.credit) > 0 ? <Switch value={useCredit} onChange={setUseCredit} label={t('loy.useCredit')} hint={t('loy.credit', { amount: shop.money(acc.credit) })} /> : null}
          {earn > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('loy.earnPreview', { n: earn })}</ThemedText> : null}
        </>
      ) : null}
    </Card>
  );
}
