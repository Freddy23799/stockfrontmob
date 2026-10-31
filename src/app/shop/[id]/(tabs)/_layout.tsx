import { Tabs } from 'expo-router';

import { Icon } from '@/components/icon';
import { fontFor } from '@/components/themed-text';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useNotifications } from '@/lib/notifications';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';

/** Onglets adaptes aux fonctions actives et aux droits : un onglet inutile n'existe pas. En grand ecran, la barre passe a gauche. */
export default function ShopTabs() {
  const { t } = useT();
  const th = useTheme();
  const shop = useShop();
  const layout = useLayout();
  const off = useOffline();
  const { counts } = useNotifications();
  const side = layout.width >= 900;
  const sell = shop.ws.manifest.menu.some((m) => m.page === 'pos' && shop.can(m.feature, 'view'));
  const stock = shop.ws.manifest.menu.some((m) => m.page === 'products' && shop.can(m.feature, 'view'));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: side ? 'left' : 'bottom',
        tabBarVariant: side ? 'material' : 'uikit',
        tabBarActiveTintColor: th.primary,
        tabBarInactiveTintColor: th.textSecondary,
        tabBarStyle: side ? { backgroundColor: th.background, borderColor: th.progressTrack, width: 232, minWidth: 232, maxWidth: 232 } : { backgroundColor: th.background, borderColor: th.progressTrack, height: 66, paddingTop: 6, paddingBottom: 10 },
        tabBarLabelStyle: { fontFamily: fontFor(600), fontSize: 12 },
      }}>
      <Tabs.Screen name="index" options={{ title: t('mob.tab.home'), tabBarIcon: ({ color, size }) => <Icon name="house" size={size - 3} color={color} /> }} />
      <Tabs.Screen name="sell" options={{ title: t('mob.tab.sell'), href: sell ? undefined : null, tabBarIcon: ({ color, size }) => <Icon name="cart-shopping" size={size - 3} color={color} /> }} />
      <Tabs.Screen name="stock" options={{ title: shop.v('products'), href: stock ? undefined : null, tabBarIcon: ({ color, size }) => <Icon name="box-open" size={size - 3} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: t('mob.tab.more'), tabBarBadge: off.failed > 0 ? off.failed : off.pending > 0 ? off.pending : counts.total > 0 ? counts.total : undefined, tabBarIcon: ({ color, size }) => <Icon name="grip" size={size - 3} color={color} /> }} />
    </Tabs>
  );
}
