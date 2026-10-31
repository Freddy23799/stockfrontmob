import { useState } from 'react';
import { View } from 'react-native';

import { SelectField } from '@/components/dynamic-fields';
import { ThemedText } from '@/components/themed-text';
import { Badge, Empty, ErrorNote, Row, Screen, Skeleton, Stack, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { ListFooter } from '@/components/list-footer';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';

const ACTIONS = ['SALE_CANCELLED', 'CASH_OPENED', 'CASH_CLOSED', 'SUPPLIER_RETURN', 'INSURANCE_SETTLED', 'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'EMPLOYEE_PASSWORD_RESET', 'EMPLOYEE_SUSPENDED', 'EMPLOYEE_ACTIVE', 'EMPLOYEE_DELETED', 'FEATURES_CHANGED', 'SHOP_SETTINGS_UPDATED', 'SHOP_CONFIG_UPDATED', 'ACCOUNT_PASSWORD_CHANGE', 'ACCOUNT_PROFILE_UPDATE', 'CUSTOMER_RETURN', 'DELIVERY_CREATED', 'DELIVERY_DISPATCHED', 'DELIVERY_DELIVERED', 'DELIVERY_FAILED', 'DELIVERY_CANCELLED', 'FEATURE_REQUESTED', 'FEATURE_REQUEST_APPROVED', 'FEATURE_REQUEST_REJECTED', 'LOYALTY_ADJUSTED', 'PAYROLL_CYCLE_CREATED', 'PAYROLL_PAYMENT', 'PRODUCTS_IMPORTED', 'PRODUCT_CREATED', 'PRODUCT_PRICE_CHANGED', 'PRODUCT_DELETED', 'QUOTE_CREATED', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'QUOTE_REOPENED', 'QUOTE_CONVERTED', 'SESSIONS_REVOKED', 'STAFF_CREATED', 'STOCK_TRANSFER_CREATED', 'STOCK_TRANSFER_SENT', 'STOCK_TRANSFER_RECEIVED', 'STOCK_TRANSFER_REJECTED', 'STOCK_TRANSFER_RETURNED', 'STOCK_TRANSFER_CANCELLED'];
const TONE: Record<string, Tone> = { SALE_CANCELLED: 'warning', EMPLOYEE_DELETED: 'danger', EMPLOYEE_SUSPENDED: 'warning', EMPLOYEE_PASSWORD_RESET: 'warning', FEATURES_CHANGED: 'info' };
type Entry = { id: string; action: string; actorType: string; actorName?: string; info?: string; at: string };

/** Journal d'activite : qui a fait quoi et quand. Reserve au proprietaire. */
export default function Activity() {
  const { t, lang } = useT();
  const shop = useShop();
  const [action, setAction] = useState('');
  // une action sans texte (ajoutee plus tard) reste lisible : « STOCK_TRANSFER_SENT » -> « stock transfer sent »
  const label = (x: string) => { const key = `activity.${x}`; const text = t(key); return text === key ? x.replaceAll('_', ' ').toLowerCase() : text; };
  const list = useInfinite<Entry>(`/api/merchant/shops/${shop.shopId}/activity`, { action }, { enabled: shop.owner && shop.has('ACTIVITY_LOG') });
  if (!shop.has('ACTIVITY_LOG')) return <Screen title={t('activity.title')}><Empty icon="lock" title={t('ws.featureOff')} text={t('ws.featureOffText')} /></Screen>;
  if (!shop.owner) return <Screen title={t('activity.title')}><Empty icon="lock" title={t('ws.noAccess')} text={t('ws.noAccessText')} /></Screen>;
  return (
    <Screen title={t('activity.title')} subtitle={t('activity.subtitle')} onRefresh={list.reload} onEndReached={list.loadMore}>
      <SelectField label={t('activity.filter')} value={action} onChange={setAction} placeholder={t('activity.all')} options={ACTIONS.map((a) => ({ value: a, label: t(`activity.${a}`) }))} />
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : list.items.length === 0 ? <Empty icon="clipboard-list" title={t('activity.empty')} /> : (
        <Stack gap={8}>
          {list.items.map((a) => (
            <Row key={a.id} icon={a.actorType === 'EMPLOYEE' ? 'user' : 'user-shield'} tone="neutral" title={label(a.action)} subtitle={[a.actorName ?? t('activity.system'), a.info].filter(Boolean).join(' · ')}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Badge tone={TONE[a.action] ?? 'success'}>{a.actorType === 'EMPLOYEE' ? t('activity.employee') : t('activity.owner')}</Badge><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>{formatDateTime(a.at, lang)}</ThemedText></View>} />
          ))}
          <ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} />
        </Stack>
      )}
    </Screen>
  );
}
