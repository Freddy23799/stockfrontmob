import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, ErrorNote, Hint, Input, Screen, Skeleton, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api, ApiError, NetworkError } from '@/lib/api';
import type { SupportMessage, SupportMessages, SupportThread } from '@/lib/support';

const TONE: Record<string, Tone> = { OPEN: 'warning', ANSWERED: 'info', RESOLVED: 'success', CLOSED: 'neutral' };
const POLL_MS = 4000;
const REOPEN_DAYS = 14;

const merge = (cur: SupportMessage[], incoming: SupportMessage[]) => {
  const m = new Map(cur.map((x) => [x.seq, x]));
  incoming.forEach((x) => m.set(x.seq, x));
  return [...m.values()].sort((a, b) => a.seq - b.seq);
};

/** Conversation avec le service client : messages en texte, suivi en direct (toutes les 4 s au premier plan), envoi, « resolu ». */
export default function SupportThreadScreen() {
  const { t, lang } = useT();
  const th = useTheme();
  const { id, thread: threadId } = useLocalSearchParams<{ id: string; thread: string }>();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [items, setItems] = useState<SupportMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const last = useRef(0);
  const list = useRef<FlatList<SupportMessage>>(null);
  const base = `/api/support/threads/${threadId}`;
  const msg = useCallback((e: unknown) => (e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.network') : t('common.error')), [t]);

  const absorb = useCallback((res: SupportMessages) => {
    setThread((cur) => (cur ? { ...cur, status: res.status, assignedName: res.assignedName } : cur));
    setItems((cur) => { const next = merge(cur, res.items); last.current = next.length ? next[next.length - 1].seq : 0; return next; });
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([api<SupportThread>(base, { shop: id }), api<SupportMessages>(`${base}/messages`, { shop: id })])
      .then(([th0, res]) => {
        if (!alive) return;
        setThread(th0); setItems(res.items); setHasMore(res.hasMore); last.current = res.items.length ? res.items[res.items.length - 1].seq : 0; setReady(true);
        api(`${base}/read`, { method: 'POST', shop: id }).catch(() => undefined);
      })
      .catch((e) => alive && setError(msg(e)));
    return () => { alive = false; };
  }, [base, id, msg]);

  // suivi en direct : seulement ce qui est arrive apres le dernier message, au premier plan
  useEffect(() => {
    if (!ready) return undefined;
    let busy = false;
    const tick = async () => {
      if (AppState.currentState !== 'active' || busy) return;
      busy = true;
      try {
        const res = await api<SupportMessages>(`${base}/messages?after=${last.current}`, { shop: id });
        if (res.items.length > 0) { absorb(res); if (res.items.some((m) => m.senderType === 'ADMIN')) api(`${base}/read`, { method: 'POST', shop: id }).catch(() => undefined); }
        else setThread((cur) => (cur && (cur.status !== res.status || cur.assignedName !== res.assignedName) ? { ...cur, status: res.status, assignedName: res.assignedName } : cur));
      } catch { /* hors ligne : au prochain tour */ } finally { busy = false; }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(timer);
  }, [ready, base, id, absorb]);

  async function older() {
    const first = items[0]?.seq;
    if (!first) return;
    try {
      const res = await api<SupportMessages>(`${base}/messages?before=${first}`, { shop: id });
      setItems((cur) => merge(cur, res.items)); setHasMore(res.hasMore);
    } catch (e) { setSendError(msg(e)); }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setSendError(null);
    try {
      absorb(await api<SupportMessages>(`${base}/messages`, { method: 'POST', body: { body }, shop: id }));
      setText('');
    } catch (e) { setSendError(msg(e)); } finally { setSending(false); }
  }

  async function resolve() {
    await api(`${base}/resolve`, { method: 'POST', shop: id }).catch(() => undefined);
    setThread((cur) => cur && { ...cur, status: 'RESOLVED' });
  }

  if (error) return <Screen title={t('support.title')}><ErrorNote message={error} /></Screen>;
  if (!thread) return <Screen title={t('support.title')}><Skeleton rows={4} height={64} /></Screen>;
  const closed = thread.status === 'RESOLVED' || thread.status === 'CLOSED';
  const tooOld = closed && new Date().getTime() - new Date(thread.lastMessageAt).getTime() > REOPEN_DAYS * 86_400_000;
  const time = (iso: string) => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const dayOf = (iso: string) => new Date(iso).toDateString();

  const renderItem = ({ item: m, index }: { item: SupportMessage; index: number }) => {
    const newDay = index === 0 || dayOf(items[index - 1].createdAt) !== dayOf(m.createdAt);
    const day = newDay ? <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginVertical: 8, textTransform: 'capitalize' }}>{new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(m.createdAt))}</ThemedText> : null;
    if (m.kind !== 'message') {
      return <View>{day}<ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginVertical: 4, fontSize: 12 }}>{t(`support.event.${m.body}`)} · {time(m.createdAt)}</ThemedText></View>;
    }
    const mine = m.senderType === 'USER';
    return (
      <View>
        {day}
        <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginVertical: 3 }}>
          <View style={{ maxWidth: '84%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: mine ? th.primary : th.backgroundElement, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4 }}>
            {!mine ? <ThemedText type="small" style={{ fontSize: 12, fontWeight: '700', opacity: 0.85 }}>{t('support.agent')}</ThemedText> : null}
            <ThemedText selectable style={mine ? { color: th.primaryText } : undefined}>{m.body}</ThemedText>
            <ThemedText type="small" style={{ fontSize: 11, textAlign: 'right', opacity: 0.7, color: mine ? th.primaryText : th.textSecondary }}>{time(m.createdAt)}</ThemedText>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Screen fixed keyboard title={thread.subject} subtitle={`${t('support.ticket', { number: thread.number })}${thread.assignedName ? ` · ${t('support.assigned', { name: thread.assignedName })}` : ''}`}
      right={<Badge tone={TONE[thread.status]}>{t(`support.status.${thread.status}`)}</Badge>}
      footer={tooOld ? <ThemedText type="small" themeColor="textSecondary">{t('support.reply.tooOld')}</ThemedText> : (
        <View style={{ gap: 6 }}>
          {closed ? <ThemedText type="small" themeColor="textSecondary">{t('support.reply.reopen')}</ThemedText> : null}
          {sendError ? <ThemedText type="small" style={{ color: th.danger }}>{sendError}</ThemedText> : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Input value={text} onChangeText={setText} multiline maxLength={4000} placeholder={t('support.reply.placeholder')} style={{ flex: 1, maxHeight: 130 }} />
            <Btn icon="paper-plane" title="" loading={sending} disabled={!text.trim()} onPress={() => void send()} style={{ paddingHorizontal: 16 }} />
          </View>
        </View>
      )}>
      {thread.status === 'OPEN' && thread.messageCount <= 1 ? <Hint icon="clock">{t('support.waiting')}</Hint> : null}
      {!closed ? <View style={{ alignItems: 'flex-end', marginBottom: 4 }}><Btn small variant="ghost" icon="check" title={t('support.resolve')} onPress={() => void resolve()} /></View> : null}
      <FlatList ref={list} data={items} keyExtractor={(m) => String(m.seq)} renderItem={renderItem} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={hasMore ? <Btn small variant="secondary" title={t('support.older')} onPress={() => void older()} style={{ alignSelf: 'center', marginBottom: 8 }} /> : undefined} />
    </Screen>
  );
}
