import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { PdfButton } from '@/components/pdf-button';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Field, Hint, Input, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Stack, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { num } from '@/lib/format';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Summary = { dishId: string; name: string; salePrice: number | string; cost?: number | string | null; marginPercent?: number | string | null; components: number };
type Comp = { ingredientId: string; name: string; unit: string; quantity: number | string; wastePercent: number | string; cost?: number | string | null; available?: number | string | null; tracked?: boolean };
type View_ = { dishId: string; name: string; salePrice: number | string; cost?: number | string | null; margin?: number | string | null; marginPercent?: number | string | null; portionsPossible?: number | null; components: Comp[] };
type Row_ = { key: string; ingredientId: string; name: string; unit: string; quantity: string; waste: string };

const marginTone = (p: number) => (p >= 60 ? 'success' : p >= 40 ? 'warning' : 'danger') as 'success' | 'warning' | 'danger';

function Editor({ dish, onClose, onSaved }: { dish: { id: string; name: string }; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState<View_ | null>(null);
  const [rows, setRows] = useState<Row_[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    shop.call<View_>(`/api/shop/recipes/${dish.id}`).then((v) => { setView(v); setRows(v.components.map((c) => ({ key: c.ingredientId, ingredientId: c.ingredientId, name: c.name, unit: c.unit, quantity: String(num(c.quantity)), waste: String(num(c.wastePercent)) }))); })
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.network')));
  }, [dish.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (key: string, c: Partial<Row_>) => setRows((rs) => (rs ?? []).map((r) => (r.key === key ? { ...r, ...c } : r)));
  const valid = rows != null && rows.every((r) => num(r.quantity) > 0 && num(r.waste) >= 0 && num(r.waste) < 100);
  async function save() {
    setBusy(true); setError(null);
    try {
      const v = await shop.call<View_>(`/api/shop/recipes/${dish.id}`, { method: 'PUT', body: { components: (rows ?? []).map((r) => ({ ingredientId: r.ingredientId, quantity: num(r.quantity), wastePercent: num(r.waste) })) } });
      setView(v); toast(t('rs.recipeSaved')); onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={`${t('rs.recipeOf')} ${dish.name}`} onClose={onClose} footer={<View style={{ gap: 8 }}><PdfButton path={`/api/shop/pdf/recipes/${dish.id}`} name={`fiche-${dish.name}.pdf`} /><Btn icon="check" title={t('rs.save')} loading={busy} disabled={!valid} onPress={save} /></View>}>
      {!rows ? (error ? <ErrorNote message={error} /> : <Skeleton rows={3} />) : (
        <Stack gap={12}>
          <Hint>{t('rs.recipeHelp')}</Hint>
          <ProductPicker label={t('rs.addIngredient')} value={null} onChange={(p) => { if (!p || p.id === dish.id || rows.some((r) => r.ingredientId === p.id)) return; setRows((rs) => [...(rs ?? []), { key: p.id, ingredientId: p.id, name: p.name, unit: p.unit, quantity: '1', waste: '0' }]); }} />
          {rows.length === 0 ? <Empty icon="book-open" title={t('rs.noIngredients')} /> : null}
          {rows.map((r) => {
            const c = view?.components.find((x) => x.ingredientId === r.ingredientId);
            return (
              <Card key={r.key}>
                <ThemedText type="smallBold">{r.name}</ThemedText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><NumberBox label={`${t('rs.qtyPerPortion')} (${r.unit})`} value={r.quantity} onChange={(v) => patch(r.key, { quantity: v })} /></View>
                  <View style={{ flex: 1 }}><NumberBox label={`${t('rs.waste')} %`} value={r.waste} onChange={(v) => patch(r.key, { waste: v })} /></View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ThemedText type="small" themeColor="textSecondary">{c?.cost != null ? shop.money(c.cost) : ''}{c?.tracked && c.available != null ? ` · ${t('rs.inStock', { n: num(c.available).toLocaleString() })}` : ''}</ThemedText>
                  <Btn small variant="danger" icon="trash" title={t('rs.remove')} onPress={() => setRows((rs) => (rs ?? []).filter((x) => x.key !== r.key))} />
                </View>
              </Card>
            );
          })}
          {view && view.cost != null ? (
            <Card>
              <View style={{ gap: 6 }}>
                <ThemedText type="small">{t('rs.foodCost')}: <ThemedText type="smallBold">{shop.money(view.cost)}</ThemedText></ThemedText>
                <ThemedText type="small">{t('rs.salePrice')}: <ThemedText type="smallBold">{shop.money(view.salePrice)}</ThemedText></ThemedText>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <ThemedText type="small">{t('rs.margin')}: <ThemedText type="smallBold">{shop.money(view.margin ?? 0)}</ThemedText></ThemedText>
                  {view.marginPercent != null ? <Badge tone={marginTone(num(view.marginPercent))}>{num(view.marginPercent)} %</Badge> : null}
                </View>
                {view.portionsPossible != null ? <ThemedText type="small">{t('rs.portionsPossible')}: <ThemedText type="smallBold">{view.portionsPossible}</ThemedText></ThemedText> : null}
              </View>
            </Card>
          ) : null}
          {error ? <ErrorNote message={error} /> : null}
        </Stack>
      )}
    </Sheet>
  );
}

export default function Recipes({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const list = useInfinite<Summary>('/api/shop/recipes', { q: q.trim() });
  const canEdit = shop.can('RECIPES', 'update');
  async function refresh() {
    try { const r = await shop.call<{ updated: number }>('/api/shop/recipes/refresh-costs', { method: 'POST' }); toast(t('rs.costsRefreshed', { n: r.updated })); void list.reload(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('rs.recipesIntro')} onRefresh={list.reload}>
      {canEdit ? <ProductPicker label={t('rs.newRecipe')} value={null} onChange={(p) => { if (p) setEditing({ id: p.id, name: p.name }); }} /> : null}
      {canEdit ? <Btn small variant="secondary" icon="rotate" title={t('rs.refreshCosts')} onPress={refresh} /> : null}
      <Field label={t('rs.searchRecipes')}><Input value={q} onChangeText={setQ} placeholder={t('rs.searchRecipes')} /></Field>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={60} /> : list.items.length === 0 ? <Empty icon="book-open" title={t('rs.noRecipes')} text={t('rs.noRecipesText')} /> : (
        <Stack gap={8}>
          <SectionTitle title={t('rs.recipesTitle')} />
          {list.items.map((r) => (
            <Row key={r.dishId} icon="book-open" title={r.name} subtitle={`${t('rs.ingredientsN', { n: r.components })}${r.cost != null ? ` · ${t('rs.foodCost')} ${shop.money(r.cost)}` : ''}`}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(r.salePrice)}</ThemedText>{r.marginPercent != null ? <Badge tone={marginTone(num(r.marginPercent))}>{num(r.marginPercent)} %</Badge> : null}</View>}
              onPress={() => setEditing({ id: r.dishId, name: r.name })} />
          ))}
        </Stack>
      )}
      {editing ? <Editor dish={editing} onClose={() => setEditing(null)} onSaved={() => void list.reload()} /> : null}
    </Screen>
  );
}
