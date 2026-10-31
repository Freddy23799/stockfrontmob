import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Chips, Empty, ErrorNote, IconBadge, IconBtn, Input, Screen, Sheet, Skeleton, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api, ApiError, NetworkError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { CAT_ICON, CATEGORIES, type SupportThread } from '@/lib/support';
import { useShop } from '@/lib/shop';

const TONE: Record<string, Tone> = { OPEN: 'warning', ANSWERED: 'info', RESOLVED: 'success', CLOSED: 'neutral' };
type Page = { items: SupportThread[]; total: number };
const PAGE = 20;

/** Service client : mes demandes (en cours / terminees) et nouvelle demande. Reseau requis : la conversation est en direct. */
export default function Support() {
  const { t, lang } = useT();
  const th = useTheme();
  const shop = useShop();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [items, setItems] = useState<SupportThread[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const ticket = useRef(0);

  const load = useCallback(async (page = 0) => {
    const mine = ++ticket.current;
    setLoading(true);
    try {
      const res = await api<Page>(`/api/support/threads?state=${tab}&page=${page}&size=${PAGE}`, { shop: shop.shopId });
      if (mine !== ticket.current) return;
      setItems((cur) => (page > 0 && cur ? [...cur, ...res.items] : res.items));
      setTotal(res.total);
      setError(null);
    } catch (e) {
      if (mine === ticket.current) setError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.network') : t('common.error'));
    } finally {
      if (mine === ticket.current) setLoading(false);
    }
  }, [tab, shop.shopId, t]);
  useEffect(() => { const id = setTimeout(() => void load(0), 0); return () => clearTimeout(id); }, [load]);

  const more = items ? items.length < total : false;
  return (
    <Screen title={t('support.title')} subtitle={t('support.subtitle')} onRefresh={() => load(0)} onEndReached={more && !loading ? () => void load(Math.ceil((items?.length ?? 0) / PAGE)) : undefined}
      right={<IconBtn name="plus" tone="primary" label={t('support.new')} onPress={() => setCreating(true)} />}>
      <Chips value={tab} onChange={(v) => { setItems(null); setTab(v as 'open' | 'closed'); }} options={[{ value: 'open', label: t('support.tab.open') }, { value: 'closed', label: t('support.tab.closed') }]} />
      {error ? <ErrorNote message={error} onRetry={() => void load(0)} /> : null}
      {items === null && !error ? <Skeleton rows={3} height={76} /> : null}
      {items?.length === 0 ? (tab === 'open'
        ? <Empty icon="headset" title={t('support.empty.title')} text={t('support.empty.text')} action={<Btn icon="plus" title={t('support.new')} onPress={() => setCreating(true)} />} />
        : <Empty icon="inbox" title={t('support.emptyClosed')} />) : null}
      <View style={{ gap: 8 }}>
        {items?.map((th2) => (
          <Pressable key={th2.id} onPress={() => router.push(`/shop/${shop.shopId}/support/${th2.id}` as never)} accessibilityRole="button"
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: th.backgroundElement, borderWidth: th2.unread ? 1.5 : 0, borderColor: th.primary }, pressed && { opacity: 0.7 }]}>
            <IconBadge name={CAT_ICON[th2.category] ?? 'comments'} tone="info" />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="smallBold" numberOfLines={1} style={th2.unread ? { color: th.primary } : undefined}>{th2.subject}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{th2.lastSender === 'ADMIN' ? `${t('support.agent')} : ` : ''}{th2.preview ?? t('support.noPreview')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>#{th2.number} · {t(`support.cat.${th2.category}`)} · {formatDateTime(th2.lastMessageAt, lang)}</ThemedText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Badge tone={TONE[th2.status]}>{t(`support.status.${th2.status}`)}</Badge>
              {th2.unread ? <Icon name="circle" size={10} color={th.primary} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
      {creating ? <NewRequest shopId={shop.shopId} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/shop/${shop.shopId}/support/${id}` as never); }} /> : null}
    </Screen>
  );
}

function NewRequest({ shopId, onClose, onCreated }: { shopId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const th = useTheme();
  const [category, setCategory] = useState<string>('PROBLEM');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const created = await api<SupportThread>('/api/support/threads', { method: 'POST', body: { category, subject, body }, shop: shopId });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.network') : t('common.error'));
      setBusy(false);
    }
  }
  return (
    <Sheet visible tall title={t('support.form.title')} onClose={onClose}
      footer={<Btn icon="paper-plane" title={busy ? t('support.sending') : t('support.form.send')} loading={busy} disabled={!body.trim()} onPress={() => void submit()} />}>
      <ThemedText type="smallBold">{t('support.form.category')}</ThemedText>
      <Chips scroll={false} value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: t(`support.cat.${c}`), icon: CAT_ICON[c] }))} />
      <ThemedText type="small" themeColor="textSecondary">{t(`support.cat.hint.${category}`)}</ThemedText>
      <ThemedText type="smallBold">{t('support.form.subject')}</ThemedText>
      <Input value={subject} onChangeText={setSubject} maxLength={120} placeholder={t('support.form.subjectHint')} />
      <ThemedText type="smallBold">{t('support.form.message')}</ThemedText>
      <Input value={body} onChangeText={setBody} multiline maxLength={4000} placeholder={t('support.form.placeholder')} style={{ minHeight: 150, textAlignVertical: 'top' }} />
      {error ? <ThemedText type="small" style={{ color: th.danger }}>{error}</ThemedText> : null}
    </Sheet>
  );
}
