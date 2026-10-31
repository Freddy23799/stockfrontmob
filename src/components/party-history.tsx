import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type Entry = { kind: string; id: string; number?: string | null; at: string; status?: string | null; label?: string | null; amount?: number | string | null };
const TONE: Record<string, Tone> = { COMPLETED: 'success', DELIVERED: 'success', PAID: 'success', CANCELLED: 'danger', NO_SHOW: 'danger', OVERDUE: 'danger' };
const pretty = (s?: string | null) => String(s ?? '').toLowerCase().replace(/_/g, ' ');

/** Tout ce qui a ete fait pour ce client (tous metiers), du plus recent au plus ancien. */
export function PartyHistory({ partyId }: { partyId: string }) {
  const { t, lang } = useT();
  const shop = useShop();
  const q = useQuery<{ entries: Entry[]; truncated: boolean }>(`/api/shop/parties/${partyId}/history`);
  if (!q.data) return null;
  const entries = q.data.entries;
  return (
    <View style={{ gap: 6 }}>
      <ThemedText type="smallBold">{t('ph.title')}</ThemedText>
      {entries.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ph.empty')}</ThemedText> : null}
      {entries.map((e) => (
        <View key={`${e.kind}-${e.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <View style={{ flex: 1 }}>
            <ThemedText type="small">{t(`ph.k.${e.kind}`)}{e.number ? ` · ${e.number}` : ''}{e.label && e.kind !== 'SALE' ? ` · ${e.label}` : ''}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{formatDate(e.at, lang)}{e.amount != null ? ` · ${shop.money(e.amount)}` : ''}</ThemedText>
          </View>
          <Badge tone={TONE[e.status ?? ''] ?? 'info'}>{pretty(e.status)}</Badge>
        </View>
      ))}
      {q.data.truncated ? <ThemedText type="small" themeColor="textSecondary">{t('ph.truncated')}</ThemedText> : null}
    </View>
  );
}
