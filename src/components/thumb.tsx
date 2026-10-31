import { Image } from 'expo-image';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import type { Image as Img } from '@/lib/format';
import { useShopOptional } from '@/lib/shop';

/** Vignette produit (WebP servi par le serveur, mise en cache par expo-image) ; icone si pas de photo. */
export function Thumb({ image, size = 48, icon }: { image?: Img | null; size?: number; icon?: string }) {
  const th = useTheme();
  const shopIcon = useShopOptional()?.ws.manifest.productIcon;
  const glyph = icon ?? shopIcon ?? 'box';
  const v = image ? (image.variants.sm ?? Object.values(image.variants)[0]) : null;
  if (!v) return <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: th.backgroundSelected, alignItems: 'center', justifyContent: 'center' }}><Icon name={glyph} size={size * 0.38} color={th.primary} /></View>;
  return <Image source={{ uri: v.webp }} style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: th.backgroundSelected }} contentFit="cover" transition={150} recyclingKey={image?.id} />;
}
