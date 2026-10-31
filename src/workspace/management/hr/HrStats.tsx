import { Donut, GroupedBars, Kpi, usePalette } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { Card, Empty, ErrorNote, Grid, SectionTitle, Skeleton, Stack } from '@/components/ui';
import { useT } from '@/i18n';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type S = { headcount: number; archived: number; withAccount: number; withoutAccount: number; monthlyPayroll?: number; expiringIds: number; byPosition: { label: string; count: number }[]; byContract: { key: string; count: number }[] };
type Pay = { byMonth: { month: string; amount: number }[]; commitment: { remaining: number } };

export default function HrStats() {
  const { t } = useT();
  const shop = useShop();
  const palette = usePalette();
  const sq = useQuery<S>('/api/shop/hr/stats');
  const pq = useQuery<Pay>(shop.can('HR_PAYROLL', 'view') ? '/api/shop/hr/payroll/stats' : null);
  const s = sq.data, pay = pq.data;
  if (sq.error && !s) return <ErrorNote message={sq.error} onRetry={sq.reload} />;
  if (!s) return <Skeleton rows={3} height={100} />;
  return (
    <Stack gap={14}>
      <Grid min={150} gap={10}>
        <Kpi icon="users" label={t('hr.headcount')} value={String(s.headcount)} hint={t('hr.archivedCount', { count: s.archived })} color={palette[0]} />
        <Kpi icon="user-shield" label={t('hr.withAccount')} value={String(s.withAccount)} hint={t('hr.withoutAccount', { count: s.withoutAccount })} color={palette[3]} />
        {s.monthlyPayroll != null ? <Kpi icon="coins" label={t('hr.monthlyPayroll')} value={shop.money(s.monthlyPayroll)} color={palette[1]} /> : null}
        {s.expiringIds > 0 ? <Kpi icon="triangle-exclamation" label={t('hr.idExpiring')} value={String(s.expiringIds)} hint={t('hr.idExpiringHint')} color={palette[2]} /> : null}
      </Grid>
      {s.byPosition.length === 0 ? <Empty icon="chart-column" title={t('hr.noStats')} /> : (
        <Grid min={340}>
          <Card style={{ gap: 10 }}><SectionTitle title={t('hr.byPosition')} /><Donut format={(v) => String(v)} centerLabel={t('hr.headcount')} slices={s.byPosition.map((r) => ({ key: r.label, label: r.label, value: Number(r.count) }))} /></Card>
          <Card style={{ gap: 10 }}><SectionTitle title={t('hr.byContract')} /><Donut format={(v) => String(v)} centerLabel={t('hr.headcount')} slices={s.byContract.map((r) => ({ key: r.key, label: t(`hr.contract.${r.key}`), value: Number(r.count) }))} /></Card>
        </Grid>
      )}
      {pay && pay.byMonth.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle title={t('hr.payByMonth')} />
          <GroupedBars labels={pay.byMonth.map((r) => r.month.slice(2))} format={shop.money} series={[{ key: 'a', label: t('hr.tab.payroll'), color: palette[1], values: pay.byMonth.map((r) => Number(r.amount)) }]} />
          <ThemedText type="small" themeColor="textSecondary">{t('hr.payCommitment')} <ThemedText type="smallBold">{shop.money(pay.commitment.remaining)}</ThemedText></ThemedText>
        </Card>
      ) : null}
    </Stack>
  );
}
