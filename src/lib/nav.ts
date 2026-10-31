import { router } from 'expo-router';

import { useShop, type MenuItem } from './shop';

/** Navigation dans une boutique : par page du pack ("pos", "products"...) plutot que par adresse en dur. */
export function useGo() {
  const shop = useShop();
  const first = (page: string): MenuItem | undefined => shop.ws.manifest.menu.find((m) => m.page === page && shop.has(m.feature) && shop.can(m.feature, 'view'));
  return {
    first,
    page: (page: string, params?: Record<string, string>) => {
      const m = first(page);
      if (m) router.push({ pathname: '/shop/[id]/w/[key]', params: { id: shop.shopId, key: m.key, ...params } });
    },
    item: (key: string, params?: Record<string, string>) => router.push({ pathname: '/shop/[id]/w/[key]', params: { id: shop.shopId, key, ...params } }),
    to: (path: string) => router.push(`/shop/${shop.shopId}/${path}` as never),
    tab: (name: 'sell' | 'stock' | 'more' | '') => router.navigate(`/shop/${shop.shopId}/${name}` as never),
  };
}
