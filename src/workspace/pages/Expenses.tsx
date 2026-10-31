import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Donut } from '@/components/charts';
import { DateField, today } from '@/components/date-field';
import { SelectField } from '@/components/dynamic-fields';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, num, uuid } from '@/lib/format';
import { OfflineAdvice } from '@/components/offline-advice';
import { useOffline } from '@/lib/offline';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

type Category = { id: string; name: string; active: boolean; count: number };
type Exp = { id: string; categoryId?: string; categoryName?: string; amount: number; date: string; method?: string; payee?: string; reference?: string; note?: string; locked?: boolean };

/** Depenses de la boutique. Une depense d'un mois cloture par la comptabilite est verrouillee. */
export default function Expenses({ tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const now = new Date();
  const [period, setPeriod] = useState('month');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Exp | 'new' | null>(null);
  const [manage, setManage] = useState(false);
  const range = useMemo(() => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const from = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : period === 'prev' ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : new Date(now.getTime() - 29 * 86400000);
    const to = period === 'prev' ? new Date(now.getFullYear(), now.getMonth(), 0) : now;
    return { from: iso(from), to: iso(to) };
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = useQuery<Category[]>('/api/shop/expenses/categories?all=true');
  const stats = useQuery<{ total: number; byCategory: { label: string; total: number }[] }>(`/api/shop/expenses/stats${qs(range)}`);
  const list = useInfinite<Exp>('/api/shop/expenses', { ...range, categoryId, q: q.trim() });
  const refresh = () => { void list.reload(); void stats.reload(); void categories.reload(); };

  return (
    <Screen tabs={tab} fixed title={t('exp.title')} subtitle={t('mob.countOf', { count: list.total })}
      right={<View style={{ flexDirection: 'row', gap: 8 }}>
        <IconBtn name="tags" label={t('exp.categories')} onPress={() => setManage(true)} />
        {shop.can('EXPENSES', 'create') ? <IconBtn name="plus" tone="primary" label={t('exp.new')} onPress={() => setEditing('new')} /> : null}
      </View>}>
      <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(e) => e.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} onEndReachedThreshold={0.6} refreshing={list.refreshing} onRefresh={refresh} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={(
          <View style={{ gap: 10, marginBottom: 6 }}>
            <View style={{ justifyContent: 'center' }}>
              <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
              <Input value={q} onChangeText={setQ} placeholder={t('exp.search')} style={{ paddingLeft: 40 }} autoCapitalize="none" />
            </View>
            <Chips value={period} onChange={setPeriod} options={[{ value: 'month', label: t('mob.thisMonth') }, { value: 'prev', label: t('mob.lastMonth') }, { value: '30', label: t('dash.days', { count: 30 }) }]} />
            {(categories.data?.length ?? 0) > 0 ? <Chips value={categoryId} onChange={setCategoryId} options={[{ value: '', label: t('exp.allCategories') }, ...categories.data!.map((c) => ({ value: c.id, label: c.name }))]} /> : null}
            {stats.data ? (
              <Card style={{ gap: 10 }}>
                <ThemedText type="small" themeColor="textSecondary">{t('exp.total')}</ThemedText>
                <ThemedText type="subtitle" style={{ fontSize: 26 }}>{shop.money(stats.data.total)}</ThemedText>
                {stats.data.byCategory.length > 0 ? <Donut format={shop.money} centerLabel={t('exp.total')} size={130} slices={stats.data.byCategory.slice(0, 6).map((c) => ({ key: c.label, label: c.label === '-' ? t('ws.none') : c.label, value: Number(c.total) }))} /> : null}
              </Card>
            ) : null}
            {list.stale ? <Hint icon="cloud" tone="warning">{t('mob.showingSaved')}</Hint> : null}
            {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
          </View>
        )}
        ListEmptyComponent={list.loading ? <Skeleton rows={4} height={64} /> : <Empty icon="coins" title={t('exp.empty')} text={t('exp.emptyText')} action={shop.can('EXPENSES', 'create') ? <Btn icon="plus" title={t('exp.new')} onPress={() => setEditing('new')} /> : undefined} />}
        renderItem={({ item: e }) => (
          <Pressable onPress={() => setEditing(e)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : 1 }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <ThemedText type="smallBold" numberOfLines={1}>{e.categoryName ?? t('ws.none')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={{ fontSize: 12 }}>{[formatDate(e.date, lang), e.payee, e.method && t(`ws.m.${e.method}`)].filter(Boolean).join(' · ')}{e.note ? ` — ${e.note}` : ''}</ThemedText>
            </View>
            {e.locked ? <Icon name="lock" size={13} color={th.textSecondary} /> : null}
            <ThemedText type="smallBold">{shop.money(e.amount)}</ThemedText>
          </Pressable>
        )} />
      {editing ? <ExpenseSheet expense={editing === 'new' ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
      {manage ? <CategoriesSheet onClose={() => { setManage(false); refresh(); }} /> : null}
    </Screen>
  );
}

function ExpenseSheet({ expense, categories, onClose, onSaved }: { expense: Exp | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const id = useRef(expense?.id ?? uuid());
  const [f, setF] = useState({ categoryId: expense?.categoryId ?? '', amount: expense ? String(expense.amount) : '', date: expense?.date ?? today(), method: expense?.method ?? (shop.ws.manifest.paymentMethods?.[0] ?? 'CASH'), payee: expense?.payee ?? '', reference: expense?.reference ?? '', note: expense?.note ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const locked = Boolean(expense?.locked);

  async function submit() {
    setBusy(true);
    setError(null);
    const body = { ...f, id: id.current, categoryId: f.categoryId || null, amount: Number(f.amount) };
    try {
      if (expense) {
        // modification possible sans reseau : la depense d'origine part avec elle, le serveur fusionne champ par champ si besoin
        const base = Object.fromEntries(['categoryId', 'amount', 'date', 'method', 'payee', 'reference', 'note'].map((k) => [k, (expense as Record<string, unknown>)[k] ?? null]));
        const res = await offline.submit({ id: uuid(), shopId: shop.shopId, method: 'PUT', path: `/api/shop/expenses/${expense.id}`, body: { ...body, base, editedAt: new Date().toISOString() }, kind: 'edit', label: `${t('mob.labelEdit')} · ${shop.money(num(f.amount))}` });
        toast(res.queued ? t('mob.queuedGeneric') : t('ws.saved'), res.queued ? 'warning' : 'success');
        return onSaved();
      } else {
        // une depense peut etre notee sans reseau ; elle part au retour de la connexion (une seule fois)
        const res = await offline.submit({ id: id.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/expenses', body, label: `${t('exp.new')} · ${shop.money(num(f.amount))}` });
        toast(res.queued ? t('mob.expenseQueued') : t('ws.saved'), res.queued ? 'warning' : 'success');
        return onSaved();
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  async function remove() {
    if (!(await confirmAction(t('exp.deleteTitle'), t('exp.deleteText'), t('ws.delete'), t('common.cancel')))) return;
    try { await shop.call(`/api/shop/expenses/${expense!.id}`, { method: 'DELETE' }); toast(t('ws.deleted')); onSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <Sheet visible tall title={expense ? t('exp.edit') : t('exp.new')} onClose={onClose}
      footer={(
        <View style={{ gap: 8 }}>
          {!locked ? <Btn icon="check" title={t('common.save')} loading={busy} disabled={busy || !(num(f.amount) > 0)} onPress={submit} /> : null}
          {expense && !locked && shop.can('EXPENSES', 'delete') ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} disabled={!offline.online} /> : null}
        </View>
      )}>
      {locked ? <Hint icon="lock" tone="warning">{t('exp.locked')}</Hint> : null}
      {expense && !locked ? <OfflineAdvice kind={num(f.amount) !== Number(expense.amount) ? 'price' : 'edit'} /> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {!expense && !offline.online ? <Hint icon="cloud-arrow-up">{t('mob.createOfflineOk')}</Hint> : null}
      <NumberBox label={`${t('exp.amount')} (${shop.currency}) *`} value={f.amount} onChange={set('amount')} suffix={shop.currency} autoFocus={!expense} editable={!locked} />
      <SelectField label={t('exp.category')} value={f.categoryId} onChange={set('categoryId')} options={categories.filter((c) => c.active || c.id === f.categoryId).map((c) => ({ value: c.id, label: c.name }))} />
      <DateField label={t('exp.date')} value={f.date} onChange={set('date')} max={today()} />
      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold">{t('ws.paymentMethod')}</ThemedText>
        <Chips scroll={false} value={f.method} onChange={set('method')} options={(shop.ws.manifest.paymentMethods ?? ['CASH']).map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
      </View>
      <TextBox label={t('exp.payee')} value={f.payee} onChangeText={set('payee')} maxLength={150} editable={!locked} autoCapitalize="words" />
      <TextBox label={t('exp.reference')} value={f.reference} onChangeText={set('reference')} maxLength={80} editable={!locked} />
      <TextBox label={t('ws.note')} value={f.note} onChangeText={set('note')} multiline editable={!locked} autoCapitalize="sentences" />
    </Sheet>
  );
}

function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const rows = useQuery<Category[]>('/api/shop/expenses/categories?all=true');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await rows.reload(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } };
  return (
    <Sheet visible title={t('exp.categories')} onClose={onClose}>
      <Hint icon="lightbulb">{t('mob.expCatHint')}</Hint>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {shop.can('EXPENSES', 'create') ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Input style={{ flex: 1 }} value={name} onChangeText={setName} placeholder={t('exp.newCategory')} maxLength={120} autoCapitalize="sentences" />
          <IconBtn name="plus" tone="primary" size={50} label={t('hr.add')} onPress={() => name.trim() && run(async () => { await shop.call('/api/shop/expenses/categories', { method: 'POST', body: { id: uuid(), name: name.trim() } }); setName(''); toast(t('ws.saved')); })} />
        </View>
      ) : null}
      {(rows.data ?? []).map((c) => (
        <View key={c.id} style={{ gap: 6 }}>
          <Switch value={c.active} label={c.name} hint={t('exp.count', { count: c.count })} onChange={(v) => shop.can('EXPENSES', 'update') && run(() => shop.call(`/api/shop/expenses/categories/${c.id}`, { method: 'PUT', body: { name: c.name, active: v } }))} />
          {c.count === 0 && shop.can('EXPENSES', 'delete') ? <Btn small variant="danger" icon="trash" title={t('ws.delete')} onPress={() => run(() => shop.call(`/api/shop/expenses/categories/${c.id}`, { method: 'DELETE' }))} /> : null}
        </View>
      ))}
    </Sheet>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 } });
