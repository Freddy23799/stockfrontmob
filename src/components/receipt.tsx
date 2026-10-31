import { Share, View } from 'react-native';

import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Btn, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { useShop } from '@/lib/shop';

export type Doc = {
  id: string; number?: string; docType: string; issuedAt?: string; total: number | string; discountTotal?: number | string; taxTotal?: number | string; balance?: number | string;
  partyName?: string; cancelledAt?: string | null; attributes?: Record<string, any>; pending?: boolean;
  lines: { id: string; description: string; quantity: number | string; unitPrice: number | string; discount?: number | string; lineTotal: number | string; lotNumber?: string; lotExpiry?: string; unitLabel?: string | null; displayQuantity?: number | string; displayUnitPrice?: number | string; priceSource?: string | null; priceLabel?: string | null; displayListPrice?: number | string | null; productId?: string; receivedQuantity?: number | string }[];
  payments: { id: string; method: string; amount: number | string; direction?: string }[];
  [k: string]: any;
};

/** Quantite telle que vendue : "2 Carton de 24" (l'unite figee sur la ligne) ou simplement "3". */
const lineDetail = (l: Doc['lines'][number], money: (n: number | string) => string) =>
  l.unitLabel ? `${Number(l.displayQuantity ?? l.quantity)} × ${l.unitLabel} — ${money(l.displayUnitPrice ?? l.unitPrice)}` : `${Number(l.quantity)} × ${money(l.unitPrice)}`;

/** Mention de prix figee sur la ligne : "Promo : Ramadan (au lieu de 1 000)", "Prix gros dès 10"... Rien pour un prix normal ou saisi a la main. */
const priceNote = (l: Doc['lines'][number], t: (k: string, v?: Record<string, string | number>) => string, money: (n: number | string) => string): string | null => {
  const src = l.priceSource;
  if (!src || src === 'BASE' || src === 'MANUAL') return null;
  const main = src === 'NEGOTIATED' ? t('price.badge.NEGOTIATED') : src === 'TIER_QTY' ? t('price.badge.tierFrom', { qty: l.priceLabel ?? '' }) : src === 'PROMO' ? (l.priceLabel ? t('price.badge.promoNamed', { name: l.priceLabel }) : t('price.badge.PROMO')) : t('price.badge.CUSTOMER_TYPE', { name: l.priceLabel ?? '' });
  return l.displayListPrice != null ? `${main} (${t('price.was', { price: money(l.displayListPrice) })})` : main;
};

/** Texte du recu, pour le partager (WhatsApp, SMS...) : tout vient de la fiche boutique et du document. */
export function receiptText(doc: Doc, shop: ReturnType<typeof useShop>, lang: string, t: ReturnType<typeof useT>['t']): string {
  const st = shop.ws.shop.settings as Record<string, any>;
  const rows = doc.lines.map((l) => `${l.description}\n  ${lineDetail(l, shop.money)} = ${shop.money(l.lineTotal)}${priceNote(l, t, shop.money) ? `\n  ${priceNote(l, t, shop.money)}` : ''}`);
  return [
    st.name, [st.address, st.city].filter(Boolean).join(', '), st.phone,
    '', `${shop.v('receipt')} ${doc.number ?? ''}`, formatDateTime(doc.issuedAt ?? new Date().toISOString(), lang),
    doc.partyName ? `${shop.v('customer')} : ${doc.partyName}` : '', '', ...rows, '',
    `${t('ws.total')} : ${shop.money(doc.total)}`,
    ...doc.payments.map((p) => `${t(`ws.m.${p.method}`)} : ${shop.money(p.amount)}`),
    Number(doc.balance) > 0 ? `${t('ws.balanceDue')} : ${shop.money(doc.balance)}` : '',
    '', st.receiptFooter ?? '',
    doc.verifyUrl ? `${t('ws.verifyTitle')} : ${doc.verifyUrl}` : '', 'Vylaxo · DSI SARL',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

export function Receipt({ doc }: { doc: Doc }) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const st = shop.ws.shop.settings as Record<string, any>;
  const tendered = doc.attributes?.tendered, change = doc.attributes?.change;
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 6 }}>
        <ThemedText type="smallBold" style={{ textAlign: 'center', fontSize: 17 }}>{st.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>{[st.address, st.city, st.phone].filter(Boolean).join(' · ')}</ThemedText>
        <View style={{ height: 1, backgroundColor: th.progressTrack, marginVertical: 6 }} />
        <ThemedText type="smallBold">{doc.docType === 'CUSTOMER_RETURN' ? t('ws.dt.CUSTOMER_RETURN') : shop.v('receipt')} {doc.pending ? t('mob.pendingNumber') : doc.number}</ThemedText>
        {doc.attributes?.saleNumber ? <ThemedText type="small" themeColor="textSecondary">{t('ret.c.saleRef', { number: doc.attributes.saleNumber })}</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">{formatDateTime(doc.issuedAt ?? new Date().toISOString(), lang)}{doc.partyName ? ` · ${doc.partyName}` : ''}</ThemedText>
        <View style={{ height: 1, backgroundColor: th.progressTrack, marginVertical: 6 }} />
        {doc.lines.map((l) => (
          <View key={l.id} style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText type="small" numberOfLines={2}>{l.description}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{lineDetail(l, shop.money)}{Number(l.discount) > 0 ? ` (−${shop.money(l.discount)})` : ''}</ThemedText>
              {priceNote(l, t, shop.money) ? <ThemedText type="small" themeColor="success" style={{ fontSize: 12 }}>{priceNote(l, t, shop.money)}</ThemedText> : null}
            </View>
            <ThemedText type="smallBold">{shop.money(l.lineTotal)}</ThemedText>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: th.progressTrack, marginVertical: 6 }} />
        {Number(doc.discountTotal) > 0 ? <Line label={t('ws.discount')} value={`−${shop.money(doc.discountTotal)}`} /> : null}
        <Line label={t('ws.total')} value={shop.money(doc.total)} big />
        {doc.payments.map((p) => <Line key={p.id} label={t(`ws.m.${p.method}`)} value={shop.money(p.amount)} />)}
        {tendered ? <Line label={t('ws.tendered')} value={shop.money(tendered)} /> : null}
        {Number(change) > 0 ? <Line label={t('ws.changeGiven')} value={shop.money(change)} /> : null}
        {Number(doc.balance) > 0 && !doc.cancelledAt ? <Line label={t('ws.balanceDue')} value={shop.money(doc.balance)} big /> : null}
        {doc.cancelledAt ? <ThemedText type="smallBold" themeColor="danger" style={{ textAlign: 'center' }}>{t('ws.cancelled')}</ThemedText> : null}
        {st.receiptFooter ? <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 6 }}>{st.receiptFooter}</ThemedText> : null}
        {doc.verifyCode ? <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 6 }}>{t('ws.verifyTitle')} : {String(doc.verifyCode).replace(/(.{4})(?=.)/g, '$1-')}</ThemedText> : null}
      </Card>
      <Btn icon="share-nodes" variant="secondary" title={t('mob.share')} onPress={() => void Share.share({ message: receiptText(doc, shop, lang, t) })} />
      {!doc.pending && doc.id ? <PdfButton path={`/api/shop/pdf/documents/${doc.id}`} name={`${doc.number ?? 'document'}.pdf`} label={t('pdf.document')} /> : null}
    </View>
  );
}

function Line({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type={big ? 'smallBold' : 'small'} style={{ flex: 1, fontSize: big ? 17 : 14 }}>{label}</ThemedText><ThemedText type="smallBold" style={{ fontSize: big ? 17 : 14 }}>{value}</ThemedText></View>;
}
