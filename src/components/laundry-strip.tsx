import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Hint, SectionTitle } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { API, BOARD, num } from '@/lib/laundry';
import { useGo } from '@/lib/nav';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type Summary = { byStatus?: Record<string, number>; overdue?: number; dueToday?: number; readyUnpaid?: number; unclaimed?: number; openClaims?: number; todayIn?: number; todayOut?: number; todayRevenue?: number };
type Alerts = { overdue?: { id: string; number: string; partyName?: string; daysLate?: number }[]; lowConsumables?: number };

/** Bandeau du tableau de bord pressing : du aujourd'hui, retards, prets a regler, non retires, reclamations, et repartition par etape. */
export function LaundryStrip() {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const go = useGo();
  const on = shop.can('LAUNDRY_ORDERS', 'view');
  const summary = useQuery<Summary>(on ? `${API}/orders/summary` : null);
  const alerts = useQuery<Alerts>(on ? `${API}/alerts` : null);
  const s = summary.data;
  if (!on || !s) return null;
  const tiles: { k: string; v?: number; tone: string; page: string }[] = [
    { k: 'dueToday', v: s.dueToday, tone: th.warning, page: 'laundry-orders' }, { k: 'overdue', v: s.overdue, tone: th.danger, page: 'laundry-orders' },
    { k: 'readyUnpaid', v: s.readyUnpaid, tone: th.warning, page: 'laundry-pickup' }, { k: 'unclaimed', v: s.unclaimed, tone: th.danger, page: 'laundry-unclaimed' },
    { k: 'openClaims', v: s.openClaims, tone: th.danger, page: 'laundry-claims' }, { k: 'todayIn', v: s.todayIn, tone: th.text, page: 'laundry-orders' }, { k: 'todayOut', v: s.todayOut, tone: th.success, page: 'laundry-pickup' },
  ];
  const max = Math.max(1, ...BOARD.map((k) => num(s.byStatus?.[k])));
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t('ld.stripTitle')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.filter((x) => x.v != null).map((x) => (
          <View key={x.k} style={{ flexGrow: 1, minWidth: 100, flexBasis: '30%' }}>
            <Card onPress={go.first(x.page) ? () => go.page(x.page) : undefined}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{t(`ld.k.${x.k}`)}</ThemedText>
              <ThemedText type="subtitle" style={{ color: num(x.v) > 0 ? x.tone : th.text }}>{x.v}</ThemedText>
            </Card>
          </View>
        ))}
        {s.todayRevenue != null ? <View style={{ flexGrow: 1, minWidth: 100, flexBasis: '30%' }}><Card><ThemedText type="small" themeColor="textSecondary">{t('ld.todayRevenue')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(s.todayRevenue)}</ThemedText></Card></View> : null}
      </View>
      <Card>
        <ThemedText type="smallBold">{t('ld.ins.pipeline')}</ThemedText>
        {BOARD.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemedText type="small" style={{ width: 84 }} numberOfLines={1}>{t(`ld.s.${k}`)}</ThemedText>
            <View style={{ flex: 1, height: 10, borderRadius: 99, backgroundColor: th.progressTrack }}><View style={{ height: 10, borderRadius: 99, width: `${(num(s.byStatus?.[k]) / max) * 100}%`, backgroundColor: th.primary }} /></View>
            <ThemedText type="smallBold" style={{ width: 34, textAlign: 'right' }}>{num(s.byStatus?.[k])}</ThemedText>
          </View>
        ))}
      </Card>
      {alerts.data?.overdue && alerts.data.overdue.length > 0 ? (
        <Hint tone="danger" icon="clock" title={t('ld.stripLate')}>{alerts.data.overdue.slice(0, 5).map((o) => `${o.number} · ${o.partyName ?? t('ld.walkIn')} (${t('ld.late', { count: o.daysLate ?? 0 })})`).join('\n')}</Hint>
      ) : null}
      {num(alerts.data?.lowConsumables) > 0 ? <Hint tone="warning" icon="bell">{t('ld.lowConsumables', { count: alerts.data?.lowConsumables ?? 0 })}</Hint> : null}
    </View>
  );
}
