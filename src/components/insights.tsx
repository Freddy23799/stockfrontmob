import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { FactsRow, renderBlock, VisualView, type Block } from '@/components/insight-blocks';
import { usePalette } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { Card, Chips, ErrorNote, SectionTitle, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type Resp = { days: number; blocks: Block[] };
const ORDER = ['overview', 'sales', 'laundry', 'salon', 'tailor', 'stock', 'purchases', 'customers', 'finance', 'team'];

/** Analyses du metier : memes chiffres que le site (/api/shop/insights), regroupes par rubrique. Rien ne s'affiche sans droit de lecture. */
export function Insights({ days }: { days: number }) {
  const { t, lang } = useT();
  const shop = useShop();
  const palette = usePalette();
  const q = useQuery<Resp>(shop.can('REPORTS', 'view') ? `/api/shop/insights?days=${days}` : null);
  const [picked, setPicked] = useState<string | null>(null);
  const bySection = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const b of q.data?.blocks ?? []) m.set(b.section, [...(m.get(b.section) ?? []), b]);
    return m;
  }, [q.data]);
  const env = useMemo(() => ({ t, money: shop.money, lang, v: (k: string) => shop.v(k) }), [t, shop, lang]);
  const sections = ORDER.filter((s) => bySection.has(s)).concat([...bySection.keys()].filter((s) => !ORDER.includes(s)));
  const section = picked && sections.includes(picked) ? picked : sections.find((s) => s !== 'overview') ?? sections[0];
  const nf = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }), [lang]);
  if (!shop.can('REPORTS', 'view')) return null;
  if (q.error && !q.data) return <ErrorNote message={q.error} onRetry={() => void q.reload()} />;
  if (!q.data) return <Skeleton rows={3} height={110} />;
  if (sections.length === 0) return null;
  const cards = (bySection.get(section) ?? []).flatMap((b) => renderBlock(b, env));
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t('ins.title')} />
      <Chips value={section} onChange={setPicked} options={sections.map((s) => ({ value: s, label: t(`ins.s.${s}`) }))} />
      {cards.map((c) => (
        <Card key={c.id} style={{ gap: 10 }}>
          <ThemedText type="smallBold">{c.title}</ThemedText>
          {c.hint ? <ThemedText type="small" themeColor="textSecondary">{c.hint}</ThemedText> : null}
          {c.empty ? <ThemedText type="small" themeColor="textSecondary">{c.emptyText ?? t('ins.noData')}</ThemedText> : (
            <>
              {c.facts ? <FactsRow facts={c.facts} /> : null}
              {(c.visuals ?? []).map((v, i) => <VisualView key={i} v={v} palette={palette} money={shop.money} num={(n) => nf.format(n)} gaugeText={(n) => `${nf.format(n)} %`} />)}
            </>
          )}
        </Card>
      ))}
    </View>
  );
}
