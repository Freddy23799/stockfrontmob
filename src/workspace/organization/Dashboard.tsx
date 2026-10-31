import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Grid, Hint, IconBtn, Row, Screen, SectionTitle, Skeleton, Stack, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { useOrgQuery, type FeatureRequest, type OrgDashboard, type OrgSite } from '@/lib/org';

function Metric({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: 'warning' | 'danger' }) {
  const th = useTheme();
  const color = tone === 'danger' ? th.danger : tone === 'warning' ? th.warning : th.primary;
  return (
    <Card style={{ gap: 6, padding: 14 }}>
      <Icon name={icon} size={16} color={color} />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{label}</ThemedText>
      <ThemedText type="smallBold" style={{ fontSize: 20 }} adjustsFontSizeToFit numberOfLines={1}>{value}</ThemedText>
    </Card>
  );
}

/** Centre de controle d'une enseigne : tous les sites d'un coup d'oeil, les demandes a valider et l'activite recente. */
export default function OrganizationDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, formatMoney } = useT();
  const { profile } = useAuth();
  const toast = useToast();
  const q = useOrgQuery<OrgDashboard>(profile?.accountType === 'MERCHANT' ? `/api/merchant/organizations/${id}/dashboard` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (profile?.accountType !== 'MERCHANT') return <Screen title={t('org.title')}><Empty icon="lock" title={t('org.ownerOnly')} /></Screen>;
  if (q.error && !q.data) return <Screen title={t('org.title')}><ErrorNote message={q.error === 'network' ? t('common.network') : q.error} onRetry={q.reload} /></Screen>;
  if (!q.data) return <Screen title={t('org.title')} subtitle={t('org.subtitle')}><Skeleton rows={5} height={84} /></Screen>;

  const d = q.data;
  const money = (n: number) => formatMoney(n, d.currency);
  const alerts = d.totals.lowStock + d.totals.outOfStock + d.totals.negativeStock;
  // action technique (ex. FEATURE_REQUESTED) -> texte lisible ; une action inconnue reste lisible sans traduction
  const actionLabel = (action: string) => { const key = `org.act.${action}`; const label = t(key); return label === key ? action.replaceAll('_', ' ').toLowerCase() : label; };

  async function decide(request: FeatureRequest, approved: boolean) {
    const ok = await confirmAction(t(approved ? 'org.approveTitle' : 'org.rejectTitle'), t(approved ? 'org.approveText' : 'org.rejectText', { feature: request.featureName, shop: request.shopName }),
      t(approved ? 'org.approve' : 'org.reject'), t('common.cancel'), !approved);
    if (!ok) return;
    setBusy(request.id);
    setError(null);
    try {
      // le site est donne explicitement : l'en-tete X-Shop-Id doit toujours correspondre a l'URL
      await api(`/api/merchant/shops/${request.shopId}/feature-requests/${request.id}/decision`, { method: 'POST', body: { approved }, shop: request.shopId });
      toast(t(approved ? 'org.approved' : 'org.rejected'));
      await q.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.network'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={d.organizationName} subtitle={t('org.subtitle')} onRefresh={q.reload}
      right={<IconBtn name="plus" label={t('org.addSite')} tone="primary" onPress={() => router.push({ pathname: '/onboarding', params: { organization: id } })} />}>
      {q.stale ? <Hint icon="cloud" tone="warning">{t('org.stale')}</Hint> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}

      <Grid min={150} gap={10}>
        <Metric icon="chart-line" label={t('org.salesToday')} value={money(d.totals.salesToday)} />
        <Metric icon="cart-shopping" label={t('org.sales30')} value={money(d.totals.sales30Days)} />
        <Metric icon="receipt" label={t('org.tickets')} value={String(d.totals.salesCount30Days)} />
        <Metric icon="box-open" label={t('org.stockAlerts')} value={String(alerts)} tone={d.totals.negativeStock > 0 ? 'danger' : alerts > 0 ? 'warning' : undefined} />
      </Grid>

      <Row icon="boxes-stacked" tone="info" title={t('org.catalog')} subtitle={t('org.catalogText')} onPress={() => router.push(`/organization/${id}/catalog`)} />

      <Stack gap={8}>
        <SectionTitle title={t('org.queue')} hint={t('org.queueHint')} right={d.pendingRequests.length > 0 ? <Badge tone="warning">{String(d.pendingRequests.length)}</Badge> : undefined} />
        {d.pendingRequests.length === 0 ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="circle-check" size={16} color="#16A34A" /><ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{t('org.queueEmpty')}</ThemedText></Card>
        ) : d.pendingRequests.map((r) => (
          <Card key={r.id} style={{ gap: 8 }}>
            <ThemedText type="smallBold">{r.featureName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{r.shopName} · {t('org.requestedBy', { name: r.requesterName })}</ThemedText>
            {r.note ? <ThemedText type="small">{r.note}</ThemedText> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small icon="check" title={t('org.approve')} loading={busy === r.id} disabled={busy != null} onPress={() => decide(r, true)} style={{ flex: 1 }} />
              <Btn small variant="secondary" icon="xmark" title={t('org.reject')} disabled={busy != null} onPress={() => decide(r, false)} style={{ flex: 1 }} />
            </View>
          </Card>
        ))}
      </Stack>

      <Stack gap={8}>
        <SectionTitle title={t('org.sites')} hint={t('org.sitesHint')} />
        {d.sites.length === 0 ? (
          <Empty icon="store" title={t('org.noSites')} text={t('org.noSitesText')} action={<Btn icon="plus" title={t('org.addSite')} onPress={() => router.push({ pathname: '/onboarding', params: { organization: id } })} />} />
        ) : (
          <Grid min={300} gap={10}>
            {d.sites.map((site) => <SiteCard key={site.id} site={site} money={money} />)}
          </Grid>
        )}
      </Stack>

      <Stack gap={8}>
        <SectionTitle title={t('org.activity')} />
        {d.activity.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('org.activityEmpty')}</ThemedText> : d.activity.map((a, i) => (
          <Row key={`${a.shopId}-${a.at}-${i}`} icon="clock-rotate-left" tone="neutral" title={`${a.shopName} · ${actionLabel(a.action)}`} subtitle={[a.actorName, a.at ? formatDateTime(a.at, lang) : ''].filter(Boolean).join(' · ')} />
        ))}
      </Stack>
    </Screen>
  );
}

function SiteCard({ site, money }: { site: OrgSite; money: (n: number) => string }) {
  const { t } = useT();
  return (
    <Card onPress={() => router.push(`/shop/${site.id}`)} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ThemedText type="smallBold" style={{ flex: 1, fontSize: 16 }} numberOfLines={2}>{site.name}</ThemedText>
        {site.status !== 'ACTIVE' ? <Badge tone="warning">{t('org.inactive')}</Badge> : null}
        <Icon name="chevron-right" size={12} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">{[site.city, site.country].filter(Boolean).join(' · ')}</ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <ThemedText type="smallBold" style={{ fontSize: 18 }}>{money(site.sales30Days)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('org.last30')}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Badge>{t('org.admins', { count: site.activeAdmins })}</Badge>
        {site.negativeStock > 0 ? <Badge tone="danger">{t('org.negStock', { count: site.negativeStock })}</Badge> : null}
        {site.outOfStock > 0 ? <Badge tone="warning">{t('org.outStock', { count: site.outOfStock })}</Badge> : null}
        {site.lowStock > 0 ? <Badge tone="warning">{t('org.lowStock', { count: site.lowStock })}</Badge> : null}
      </View>
    </Card>
  );
}
