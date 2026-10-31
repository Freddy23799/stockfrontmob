import { useCallback, useRef, useState } from 'react';

import { Chips, Empty, Screen } from '@/components/ui';
import { OfflineAdvice } from '@/components/offline-advice';
import { useT } from '@/i18n';
import { useShop } from '@/lib/shop';
import HrStats from './hr/HrStats';
import Leaves from './hr/Leaves';
import Payroll from './hr/Payroll';
import Positions from './hr/Positions';
import Staff from './hr/Staff';

/**
 * Ressources humaines. Volontairement separees des ecrans metier (caisse, stock) : on les ouvre depuis la gestion de la boutique.
 * Chaque onglet n'existe que si sa fonctionnalite est active et si l'utilisateur y a droit.
 */
export default function Hr() {
  const { t } = useT();
  const shop = useShop();
  const tabs = [
    { value: 'staff', icon: 'users', show: true },
    { value: 'positions', icon: 'sliders', show: true },
    { value: 'payroll', icon: 'coins', show: shop.can('HR_PAYROLL', 'view') },
    { value: 'leaves', icon: 'clock', show: shop.can('HR_LEAVE', 'view') },
    { value: 'stats', icon: 'chart-column', show: true },
  ].filter((x) => x.show);
  const [tab, setTab] = useState('staff');
  const moreRef = useRef<(() => void) | null>(null);   // l'onglet affiche y inscrit sa fonction « charger la suite »
  const register = useCallback((fn: (() => void) | null) => { moreRef.current = fn; }, []);
  if (!shop.has('HR')) return <Screen title={t('hr.title')}><Empty icon="lock" title={t('ws.featureOff')} text={t('ws.featureOffText')} /></Screen>;
  if (!shop.can('HR', 'view')) return <Screen title={t('hr.title')}><Empty icon="lock" title={t('ws.noAccess')} text={t('ws.noAccessText')} /></Screen>;
  return (
    <Screen title={t('hr.title')} subtitle={t('hr.subtitle')} keyboard onEndReached={() => moreRef.current?.()}>
      <OfflineAdvice kind="needsNetwork" />
      <Chips value={tab} onChange={setTab} options={tabs.map((x) => ({ value: x.value, label: t(`hr.tab.${x.value}`), icon: x.icon }))} />
      {tab === 'staff' ? <Staff register={register} /> : tab === 'positions' ? <Positions /> : tab === 'payroll' ? <Payroll register={register} /> : tab === 'leaves' ? <Leaves register={register} /> : <HrStats />}
    </Screen>
  );
}
