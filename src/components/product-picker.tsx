import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Thumb } from '@/components/thumb';
import { Empty, Field, Input, Sheet, useOnCard } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useCatalog } from '@/lib/catalog';
import { sellable, type Product } from '@/lib/format';
import { useShop } from '@/lib/shop';

/** Choix d'un produit dans la copie locale du catalogue : instantane, fonctionne hors ligne, accepte un code-barres. */
export function ProductPicker({ label, value, onChange, stockedOnly }: { label: string; value: Product | null; onChange: (p: Product | null) => void; stockedOnly?: boolean }) {
  const { t } = useT();
  const th = useTheme();
  const onCard = useOnCard();
  const shop = useShop();
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const found = q.trim() ? catalog.search(q, 30) : catalog.items.filter((p) => p.isActive).slice(0, 30);
    return stockedOnly ? found.filter((p) => p.trackStock) : found;
  }, [q, catalog.items, stockedOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Field label={label}>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={{ backgroundColor: onCard ? th.background : th.backgroundElement, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {value ? <Thumb image={value.image} size={32} /> : <Icon name="magnifying-glass" size={14} color={th.textSecondary} />}
          <ThemedText style={{ flex: 1 }} themeColor={value ? undefined : 'textSecondary'} numberOfLines={1}>{value?.name ?? shop.v('searchProduct')}</ThemedText>
          <Icon name="chevron-down" size={12} color={th.textSecondary} />
        </Pressable>
      </Field>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} tall>
        <Input value={q} onChangeText={setQ} placeholder={shop.v('searchProduct')} autoFocus autoCapitalize="none" />
        <View style={{ gap: 8 }}>
          {results.map((p) => (
            <Pressable key={p.id} onPress={() => { onChange(p); setOpen(false); setQ(''); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: th.backgroundElement }}>
              <Thumb image={p.image} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText type="smallBold" numberOfLines={2}>{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{[p.attributes?.dosage, p.trackStock ? `${sellable(p)} ${p.unit}` : null].filter(Boolean).join(' · ')}</ThemedText>
              </View>
              <ThemedText type="smallBold">{shop.money(p.salePrice)}</ThemedText>
            </Pressable>
          ))}
          {results.length === 0 ? <Empty icon="magnifying-glass" title={t('mob.noResult')} text={t('mob.noProductHint')} /> : null}
        </View>
      </Sheet>
    </>
  );
}
