import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Btn, Field, IconBtn, Sheet, useOnCard } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());

/**
 * Choix d'une date au doigt : un calendrier, sans saisie au clavier (pas d'erreur de format). Format de sortie AAAA-MM-JJ,
 * celui attendu par le serveur. `min` / `max` grisent les jours interdits.
 */
export function DateField({ label, value, onChange, min, max, optional, hint }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; optional?: boolean; hint?: string }) {
  const { t, lang } = useT();
  const th = useTheme();
  const onCard = useOnCard();
  const [open, setOpen] = useState(false);
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const fmt = (v: string) => new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${v}T12:00:00`));
  const first = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7;           // lundi = 0
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const weekday = (i: number) => new Intl.DateTimeFormat(lang, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i));
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  return (
    <>
      <Field label={label} hint={hint}>
        <Pressable onPress={() => { setView(new Date(base.getFullYear(), base.getMonth(), 1)); setOpen(true); }} accessibilityRole="button" accessibilityLabel={label}
          style={{ backgroundColor: onCard ? th.background : th.backgroundElement, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="calendar-days" size={15} color={th.textSecondary} />
          <ThemedText style={{ flex: 1 }} themeColor={value ? undefined : 'textSecondary'} numberOfLines={1}>{value ? fmt(value) : t('mob.chooseDate')}</ThemedText>
          {value && optional ? <Pressable hitSlop={10} onPress={() => onChange('')} accessibilityLabel={t('ws.remove')}><Icon name="xmark" size={14} color={th.textSecondary} /></Pressable> : null}
        </Pressable>
      </Field>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconBtn name="chevron-left" label="<" size={40} onPress={() => shift(-1)} />
          <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'center', fontSize: 16, textTransform: 'capitalize' }}>{new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(view)}</ThemedText>
          <IconBtn name="chevron-right" label=">" size={40} onPress={() => shift(1)} />
        </View>
        <View style={{ flexDirection: 'row' }}>{Array.from({ length: 7 }, (_, i) => <ThemedText key={i} type="small" themeColor="textSecondary" style={{ flex: 1, textAlign: 'center' }}>{weekday(i)}</ThemedText>)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (d == null) return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
            const v = iso(new Date(view.getFullYear(), view.getMonth(), d));
            const blocked = (min != null && v < min) || (max != null && v > max);
            const on = v === value;
            return (
              <Pressable key={i} disabled={blocked} onPress={() => { onChange(v); setOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: on, disabled: blocked }}
                style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? th.primary : 'transparent', borderWidth: v === today() && !on ? 1.5 : 0, borderColor: th.primary }}>
                  <ThemedText type="smallBold" style={{ color: on ? th.primaryText : blocked ? th.progressTrack : th.text }}>{d}</ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Btn variant="secondary" icon="calendar-day" title={t('mob.today')} disabled={(max != null && today() > max) || (min != null && today() < min)} onPress={() => { onChange(today()); setOpen(false); }} />
      </Sheet>
    </>
  );
}

/** Choix d'une heure au doigt : grille des heures puis des minutes (par quarts d'heure). Sortie HH:MM. */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const th = useTheme();
  const onCard = useOnCard();
  const [open, setOpen] = useState(false);
  const [h, m] = (value || '08:00').split(':');
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={{ backgroundColor: onCard ? th.background : th.backgroundElement, borderRadius: 14, minHeight: 46, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', minWidth: 84 }}>
        <ThemedText type="smallBold" style={{ fontSize: 16 }}>{value || '--:--'}</ThemedText>
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 24 }, (_, i) => (
            <Pressable key={i} onPress={() => onChange(`${pad(i)}:${m ?? '00'}`)} style={{ width: '15%', minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Number(h) === i ? th.primary : th.backgroundElement }}>
              <ThemedText type="smallBold" style={{ color: Number(h) === i ? th.primaryText : th.text }}>{pad(i)}</ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['00', '15', '30', '45'].map((mm) => (
            <Pressable key={mm} onPress={() => onChange(`${h ?? '08'}:${mm}`)} style={{ flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: m === mm ? th.primary : th.backgroundElement }}>
              <ThemedText type="smallBold" style={{ color: m === mm ? th.primaryText : th.text }}>:{mm}</ThemedText>
            </Pressable>
          ))}
        </View>
        <Btn icon="check" title="OK" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
