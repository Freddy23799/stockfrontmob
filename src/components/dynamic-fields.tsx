import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Field, Input, NumberBox, Sheet, Switch, TextBox, useOnCard } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { FieldDef } from '@/lib/shop';
import { useShop } from '@/lib/shop';

/** Liste de choix dans une feuille : plus confortable au doigt qu'un menu deroulant. */
export function SelectField({ label, value, options, onChange, required, placeholder = '—' }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; required?: boolean; placeholder?: string }) {
  const th = useTheme();
  const onCard = useOnCard();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Field label={required ? `${label} *` : label}>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={{ backgroundColor: onCard ? th.background : th.backgroundElement, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText style={{ flex: 1 }} themeColor={current ? undefined : 'textSecondary'} numberOfLines={1}>{current?.label ?? placeholder}</ThemedText>
          <Icon name="chevron-down" size={12} color={th.textSecondary} />
        </Pressable>
      </Field>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={{ gap: 8 }}>
          {!required ? <Option label={placeholder} on={value === ''} onPress={() => { onChange(''); setOpen(false); }} /> : null}
          {options.map((o) => <Option key={o.value} label={o.label} on={o.value === value} onPress={() => { onChange(o.value); setOpen(false); }} />)}
        </View>
      </Sheet>
    </>
  );
}

function Option({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 14, backgroundColor: on ? th.backgroundSelected : th.backgroundElement }}>
      <ThemedText style={{ flex: 1 }} type={on ? 'smallBold' : 'small'}>{label}</ThemedText>
      {on ? <Icon name="check" size={14} color={th.primary} /> : null}
    </Pressable>
  );
}

type Values = Record<string, any>;

/** Champs decrits par le pack metier (produits, contacts, ventes...) : texte, nombre, date, choix, case a cocher. */
export function DynamicFields({ defs, values, onChange, groups }: { defs: FieldDef[]; values: Values; onChange: (v: Values) => void; groups?: Record<string, any> }) {
  const shop = useShop();
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });
  const order: string[] = [];
  const by = new Map<string, FieldDef[]>();
  defs.forEach((d) => { const g = (d as any).group ?? '_'; if (!by.has(g)) { by.set(g, []); order.push(g); } by.get(g)!.push(d); });
  return (
    <View style={{ gap: 14 }}>
      {order.map((g) => (
        <View key={g} style={{ gap: 14 }}>
          {g !== '_' && groups?.[g] ? <ThemedText type="smallBold" themeColor="textSecondary" style={{ textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.6, marginTop: 4 }}>{shop.tr(groups[g])}</ThemedText> : null}
          {by.get(g)!.map((d) => <One key={d.key} def={d} value={values[d.key]} onChange={(v) => set(d.key, v)} />)}
        </View>
      ))}
    </View>
  );
}

function One({ def, value, onChange }: { def: FieldDef; value: any; onChange: (v: any) => void }) {
  const shop = useShop();
  const label = shop.tr(def.label);
  const placeholder = (def as any).placeholder ? shop.tr((def as any).placeholder) : undefined;
  if (def.type === 'boolean') return <Switch label={label} value={value === true || value === 'true'} onChange={onChange} />;
  if (def.type === 'select') return <SelectField label={label} required={def.required} value={value ?? ''} onChange={onChange} options={(def.options ?? []).map((o) => ({ value: o.value, label: shop.tr(o.label) }))} />;
  if (def.type === 'number') return <NumberBox label={def.required ? `${label} *` : label} value={value ?? ''} onChange={onChange} placeholder={placeholder} />;
  if (def.type === 'date') return <TextBox label={def.required ? `${label} *` : label} value={value ?? ''} onChangeText={onChange} placeholder="AAAA-MM-JJ" keyboardType="numbers-and-punctuation" maxLength={10} />;
  return <TextBox label={def.required ? `${label} *` : label} value={value ?? ''} onChangeText={onChange} placeholder={placeholder} autoCapitalize="sentences" />;
}

/** Retire les champs vides avant l'envoi (le serveur ne garde que ce qui est renseigne). */
export const cleanAttributes = (values: Values): Values => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false));

export { Input };
