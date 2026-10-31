import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Chips, Hint, IconBtn, NumberBox, Switch, TextBox } from '@/components/ui';
import { useT } from '@/i18n';
import { num } from '@/lib/format';
import { useShop } from '@/lib/shop';
import { baseUnitName } from '@/lib/units';

export type UnitDraft = { id?: string; label: string; factor: string; price: string; barcode: string; isDefault: boolean };

/** Brouillon d'un conditionnement -> corps de l'API (prix vide = prix de base x quantite contenue). */
export const unitsPayload = (drafts: UnitDraft[]) =>
  drafts.filter((d) => d.label.trim() && num(d.factor) > 0).map((d) => ({ id: d.id, label: d.label.trim(), factor: num(d.factor), price: d.price === '' ? null : num(d.price), barcode: d.barcode.trim() || null, isDefault: d.isDefault, active: true }));

/**
 * Façons de vendre un produit : kilo, paquet, carton, cuillère… Le vendeur choisit une suggestion du métier ou crée la sienne.
 * Le stock reste compté dans l'unité de base du produit ; chaque conditionnement dit combien d'unités de base il contient.
 */
export function UnitsEditor({ baseUnit, salePrice, value, onChange }: { baseUnit: string; salePrice: string; value: UnitDraft[]; onChange: (v: UnitDraft[]) => void }) {
  const { t } = useT();
  const shop = useShop();
  const base = baseUnitName(shop, baseUnit);
  const presets = (shop.ws.manifest.unitPresets?.[baseUnit] ?? []).filter((p) => !value.some((u) => u.label.trim().toLowerCase() === shop.tr(p.label).toLowerCase()));
  const patch = (i: number, c: Partial<UnitDraft>) => onChange(value.map((u, k) => (k === i ? { ...u, ...c } : c.isDefault ? { ...u, isDefault: false } : u)));
  return (
    <Card style={{ gap: 12 }}>
      <ThemedText type="smallBold">{t('mob.units')}</ThemedText>
      <Hint icon="lightbulb">{t('mob.unitsHint')}</Hint>
      {value.map((u, i) => (
        <Card key={u.id ?? i} style={{ gap: 10, backgroundColor: 'transparent', padding: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}><TextBox label={t('mob.unitLabel')} value={u.label} onChangeText={(v) => patch(i, { label: v })} maxLength={60} autoCapitalize="sentences" /></View>
            <IconBtn name="trash" tone="danger" label={t('ws.remove')} size={50} onPress={() => onChange(value.filter((_, k) => k !== i))} />
          </View>
          <NumberBox label={t('mob.unitFactor', { unit: base })} value={u.factor} onChange={(v) => patch(i, { factor: v })} />
          <NumberBox label={t('mob.unitPrice')} value={u.price} onChange={(v) => patch(i, { price: v })} placeholder={num(salePrice) > 0 && num(u.factor) > 0 ? String(Math.round(num(salePrice) * num(u.factor) * 100) / 100) : ''} hint={t('mob.unitPriceAuto')} />
          <TextBox label={t('mob.unitBarcode')} value={u.barcode} onChangeText={(v) => patch(i, { barcode: v })} keyboardType="number-pad" maxLength={60} />
          <Switch value={u.isDefault} onChange={(v) => patch(i, { isDefault: v })} label={t('mob.unitDefault')} />
        </Card>
      ))}
      {presets.length > 0 ? (
        <View style={{ gap: 6 }}>
          <ThemedText type="small" themeColor="textSecondary">{t('mob.unitSuggestions')}</ThemedText>
          <Chips scroll={false} value="" onChange={(label) => { const p = presets.find((x) => shop.tr(x.label) === label); if (p) onChange([...value, { label: shop.tr(p.label), factor: String(p.factor), price: '', barcode: '', isDefault: false }]); }}
            options={presets.map((p) => ({ value: shop.tr(p.label), label: shop.tr(p.label), icon: 'plus' }))} />
        </View>
      ) : null}
      <Btn variant="secondary" icon="plus" title={t('mob.addUnit')} onPress={() => onChange([...value, { label: '', factor: '', price: '', barcode: '', isDefault: false }])} />
    </Card>
  );
}
