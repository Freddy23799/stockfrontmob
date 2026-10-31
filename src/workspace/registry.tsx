import { Redirect, router } from 'expo-router';
import type { ComponentType } from 'react';

import { Btn, Empty, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { useShop, type MenuItem } from '@/lib/shop';

import Dashboard from './pages/Dashboard';
import Alerts from './pages/Alerts';
import Cash from './pages/Cash';
import CustomerReturns from './pages/CustomerReturns';
import Loyalty from './pages/Loyalty';
import Expenses from './pages/Expenses';
import Parties from './pages/Parties';
import Insurance from './pages/Insurance';
import Pos from './pages/Pos';
import Pricing from './pages/Pricing';
import Purchases from './pages/Purchases';
import Register from './pages/Register';
import Reports from './pages/Reports';
import Returns from './pages/Returns';
import SalesHistory from './pages/SalesHistory';
import Stock from './pages/Stock';
import Products from './pages/Products';
import CustomerOrders from './pages/Orders';
import Deliveries from './pages/Deliveries';
import Quotes from './pages/Quotes';
import Transfers from './pages/Transfers';
import Rounds from './pages/Rounds';
import Losses from './pages/Losses';
import Rebates from './pages/Rebates';
import LaundryCounter from './pages/LaundryCounter';
import LaundryOrders from './pages/LaundryOrders';
import LaundryPickup from './pages/LaundryPickup';
import LaundryUnclaimed from './pages/LaundryUnclaimed';
import LaundryRoutes from './pages/LaundryRoutes';
import LaundryPlans from './pages/LaundryPlans';
import LaundryClaims from './pages/LaundryClaims';
import LaundryTariffs from './pages/LaundryTariffs';
import Deposits from './pages/Deposits';
import Credit from './pages/Credit';
import Floor from './pages/Floor';
import SalonAgenda from './pages/SalonAgenda';
import SalonClients from './pages/SalonClients';
import SalonCommissions from './pages/SalonCommissions';
import SalonPackages from './pages/SalonPackages';
import SalonQueue from './pages/SalonQueue';
import SalonTeam from './pages/SalonTeam';
import TailorClients from './pages/TailorClients';
import TailorFabrics from './pages/TailorFabrics';
import TailorMeasures from './pages/TailorMeasures';
import TailorModels from './pages/TailorModels';
import TailorOrders from './pages/TailorOrders';
import TailorSeason from './pages/TailorSeason';
import TailorTeam from './pages/TailorTeam';
import Kitchen from './pages/Kitchen';
import Recipes from './pages/Recipes';
import Repairs from './pages/Repairs';
import RepairTariffs from './pages/RepairTariffs';
import Serials from './pages/Serials';
import Warranties from './pages/Warranties';
import Installments from './pages/Installments';
import TradeIns from './pages/TradeIns';
import Bundles from './pages/Bundles';
import Reminders from './pages/Reminders';

export type PageProps = { item: MenuItem; tab?: boolean };

/**
 * Meme principe que le site : un pack metier ne contient pas de code, il choisit parmi ces ecrans (menu[].page), leur donne
 * son vocabulaire et ses champs. Ajouter un metier = ajouter des donnees.
 */
const PAGES: Record<string, ComponentType<PageProps>> = {
  dashboard: Dashboard as ComponentType<PageProps>,
  pos: Pos as ComponentType<PageProps>,
  products: Products,
  stock: Stock,
  parties: Parties,
  sales: SalesHistory,
  alerts: Alerts,
  cash: Cash,
  insurance: Insurance,
  returns: Returns,
  purchases: Purchases,
  register: Register,
  reports: Reports,
  expenses: Expenses,
  pricing: Pricing,
  customerReturns: CustomerReturns,
  loyalty: Loyalty,
  'laundry-counter': LaundryCounter,
  'laundry-orders': LaundryOrders,
  'laundry-pickup': LaundryPickup,
  'laundry-unclaimed': LaundryUnclaimed,
  'laundry-routes': LaundryRoutes,
  'laundry-plans': LaundryPlans,
  'laundry-claims': LaundryClaims,
  'laundry-tariffs': LaundryTariffs,
  deposits: Deposits,
  credit: Credit,
  orders: CustomerOrders,
  deliveries: Deliveries,
  quotes: Quotes,
  transfers: Transfers,
  rounds: Rounds,
  losses: Losses,
  rebates: Rebates,
  floor: Floor,
  tailorOrders: TailorOrders,
  tailorMeasures: TailorMeasures,
  tailorTeam: TailorTeam,
  tailorSeason: TailorSeason,
  tailorClients: TailorClients,
  tailorModels: TailorModels,
  tailorFabrics: TailorFabrics,
  salonAgenda: SalonAgenda,
  salonQueue: SalonQueue,
  salonTeam: SalonTeam,
  salonClients: SalonClients,
  salonPackages: SalonPackages,
  salonCommissions: SalonCommissions,
  kitchen: Kitchen,
  recipes: Recipes,
  repairs: Repairs,
  repairTariffs: RepairTariffs,
  serials: Serials,
  warranties: Warranties,
  installments: Installments,
  tradeIns: TradeIns,
  bundles: Bundles,
  reminders: Reminders,
};

export function PageByKey({ itemKey, tab }: { itemKey: string; tab?: boolean }) {
  const { t } = useT();
  const shop = useShop();
  const item = shop.ws.manifest.menu.find((m) => m.key === itemKey);
  if (!item) return <Redirect href={`/shop/${shop.shopId}`} />;
  const Page = PAGES[item.page];
  const title = shop.tr(item.label);
  if (!shop.has(item.feature)) return <Screen title={title} tabs={tab}><Empty icon="lock" title={t('ws.featureOff')} text={t('ws.featureOffText')} /></Screen>;
  if (!shop.can(item.feature, 'view')) return <Screen title={title}><Empty icon="lock" title={t('ws.noAccess')} text={t('ws.noAccessText')} /></Screen>;
  if (!Page) {
    return (
      <Screen title={title}>
        <Empty icon="desktop" title={t('mob.webOnly')} text={t('mob.webOnlyText')} action={<Btn title={t('common.back')} variant="secondary" onPress={() => router.back()} />} />
      </Screen>
    );
  }
  return <Page item={item} tab={tab} />;
}
