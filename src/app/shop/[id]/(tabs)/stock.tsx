import { PageByKey } from '@/workspace/registry';
import { useShop } from '@/lib/shop';

export default function StockTab() {
  const shop = useShop();
  const item = shop.ws.manifest.menu.find((m) => m.page === 'products');
  return <PageByKey itemKey={item?.key ?? 'products'} tab />;
}
