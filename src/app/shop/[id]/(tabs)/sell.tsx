import { Redirect } from 'expo-router';

import { useShop } from '@/lib/shop';
import Pos from '@/workspace/pages/Pos';

export default function Sell() {
  const shop = useShop();
  const item = shop.ws.manifest.menu.find((m) => m.page === 'pos');
  if (!item || !shop.can(item.feature, 'view')) return <Redirect href={`/shop/${shop.shopId}`} />;
  return <Pos />;
}
