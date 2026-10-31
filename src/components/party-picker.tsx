import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Empty, Field, Input, Row, Sheet, useOnCard } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useParties } from '@/lib/parties';

export type Party = { id: string; name: string; phone?: string; balance?: number | string; attributes?: Record<string, any>; [k: string]: any };

/** Choix d'un client / fournisseur / assureur. La liste est gardee sur l'appareil : le choix reste possible sans reseau. */
export function PartyPicker({ role, label, value, selected, onChange, placeholder }: { role: string; label: string; value: string | null; selected?: Party | null; onChange: (id: string | null, party?: Party) => void; placeholder?: string }) {
  const { t } = useT();
  const th = useTheme();
  const onCard = useOnCard();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { parties } = useParties(role, open);
  // recherche dans la copie locale complete : instantanee, et identique avec ou sans reseau
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = needle ? parties.filter((p) => `${p.name} ${p.phone ?? ''}`.toLowerCase().includes(needle)) : parties;
    return all.slice(0, 200);
  }, [q, parties]);
  return (
    <>
      <Field label={label}>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={{ backgroundColor: onCard ? th.background : th.backgroundElement, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="user" size={14} color={th.textSecondary} />
          <ThemedText style={{ flex: 1 }} themeColor={selected ? undefined : 'textSecondary'} numberOfLines={1}>{selected?.name ?? placeholder ?? t('mob.chooseOptional')}</ThemedText>
          {value ? <Pressable hitSlop={10} onPress={() => onChange(null)} accessibilityLabel={t('ws.remove')}><Icon name="xmark" size={14} color={th.textSecondary} /></Pressable> : <Icon name="chevron-down" size={12} color={th.textSecondary} />}
        </Pressable>
      </Field>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} tall>
        <Input value={q} onChangeText={setQ} placeholder={t('mob.searchNamePhone')} autoFocus autoCapitalize="none" />
        <View style={{ gap: 8 }}>
          {list.map((p) => (
            <Row key={p.id} icon="user" title={p.name} subtitle={p.phone} onPress={() => { onChange(p.id, p); setOpen(false); setQ(''); }}
              right={Number(p.balance) > 0 ? <ThemedText type="smallBold" themeColor="warning" style={{ fontSize: 12 }}>{Number(p.balance)}</ThemedText> : undefined} />
          ))}
          {list.length === 0 ? <Empty icon="user-slash" title={t('mob.noResult')} text={t('mob.noPartyHint')} /> : null}
        </View>
      </Sheet>
    </>
  );
}
