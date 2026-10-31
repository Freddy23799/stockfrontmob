import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Chips, Hint, IconBtn, NumberBox, TextBox } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { addRow, endSplit, evenSplit, fillRow, removeRow, setRow, startSplit, type Pay, type Settlement } from '@/lib/payments';

const METHOD_ICON: Record<string, string> = { CASH: 'money-bill-wave', MOBILE_MONEY: 'mobile-screen', CARD: 'credit-card', TRANSFER: 'arrows-rotate', CHEQUE: 'receipt', OTHER: 'coins' };

/** Un seul moyen de paiement (un geste) ou plusieurs, chacun avec son montant. */
export function PaymentPanel({ pay, setPay, due, methods, res, money, currency }: {
  pay: Pay; setPay: (p: Pay) => void; due: number; methods: string[]; res: Settlement; money: (n: number) => string; currency: string;
}) {
  const { t } = useT();
  const th = useTheme();
  const options = methods.map((m) => ({ value: m, label: t(`ws.m.${m}`), icon: METHOD_ICON[m] ?? 'coins' }));

  if (!pay.split) {
    const row = pay.rows[0];
    const cash = row.method === 'CASH';
    return (
      <View style={{ gap: 10 }}>
        <ThemedText type="smallBold">{t('ws.paymentMethod')}</ThemedText>
        <Chips scroll={false} value={row.method} onChange={(m) => setPay(setRow(pay, row.key, { method: m }))} options={options} />
        <NumberBox label={cash ? t('ws.tendered') : t('ws.amountPaid')} value={row.amount} onChange={(v) => setPay(setRow(pay, row.key, { amount: v }))} placeholder={String(due)} suffix={currency} />
        {!cash ? <TextBox label={t('ws.reference')} value={row.reference} onChangeText={(v) => setPay(setRow(pay, row.key, { reference: v }))} maxLength={80} /> : null}
        {methods.length > 1 && due > 0 ? <Btn small variant="ghost" icon="plus" title={t('pay.split')} onPress={() => setPay(startSplit(pay, due, methods))} /> : null}
      </View>
    );
  }

  const done = res.remaining === 0 && res.nonCashOver === 0;
  return (
    <View style={{ gap: 10 }}>
      <ThemedText type="smallBold">{t('ws.paymentMethod')}</ThemedText>
      {pay.rows.map((r, i) => {
        const cash = r.method === 'CASH';
        return (
          <View key={r.key} style={{ gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: th.border, backgroundColor: th.backgroundElement }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><Chips value={r.method} onChange={(m) => setPay(setRow(pay, r.key, { method: m }))} options={options} /></View>
              {pay.rows.length > 1 ? <IconBtn name="trash" label={t('pay.remove')} tone="danger" onPress={() => setPay(removeRow(pay, r.key))} /> : null}
            </View>
            <NumberBox label={cash ? t('ws.tendered') : t('pay.amount')} value={r.amount} onChange={(v) => setPay(setRow(pay, r.key, { amount: v }))} placeholder="0" suffix={currency} />
            {!cash ? <TextBox label={t('ws.reference')} value={r.reference} onChangeText={(v) => setPay(setRow(pay, r.key, { reference: v }))} maxLength={80} /> : null}
            {res.remaining > 0 ? <Btn small variant="ghost" title={`${t('pay.fill')} (${money(res.remaining + (res.rows[i]?.value ?? 0))})`} onPress={() => setPay(fillRow(pay, r.key, due))} /> : null}
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {pay.rows.length < methods.length ? <Btn small variant="secondary" icon="plus" title={t('pay.addMethod')} onPress={() => setPay(addRow(pay, due, methods))} /> : null}
        {pay.rows.length > 1 ? <Btn small variant="secondary" title={t('pay.even')} onPress={() => setPay(evenSplit(pay, due))} /> : null}
        <Btn small variant="ghost" title={t('pay.single')} onPress={() => setPay(endSplit(pay))} />
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: th.border, overflow: 'hidden' }}>
        <View style={{ height: 8, borderRadius: 999, backgroundColor: done ? th.success : th.primary, width: `${Math.min(100, due > 0 ? (res.paid / due) * 100 : 100)}%` }} />
      </View>
      {res.nonCashOver > 0
        ? <Hint icon="triangle-exclamation" tone="danger">{t('pay.over', { amount: money(res.nonCashOver) })}</Hint>
        : done
          ? <Hint icon="check" tone="success">{t('pay.complete')}</Hint>
          : <ThemedText type="smallBold">{t('pay.remaining')} : {money(res.remaining)}</ThemedText>}
    </View>
  );
}
