import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Btn, Hint, Row, Switch } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useNotifications } from '@/lib/notifications';
import { disablePush, enablePush, hasPushToken, pushState, pushSupported, setPushChoice, type PushState } from '@/lib/push';

/** Petit point bleu : « il y a du nouveau », sans chiffre. Invisible quand tout est lu. */
export function UnreadDot() {
  const th = useTheme();
  const { counts } = useNotifications();
  if (counts.total === 0) return null;
  return <View accessibilityLabel={`${counts.total}`} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: th.primary }} />;
}

/** Cloche de l'en-tete de l'accueil : badge rouge avec le nombre de non lues. */
export function BellButton({ shopId }: { shopId: string }) {
  const th = useTheme();
  const { t } = useT();
  const { counts } = useNotifications();
  return (
    <Pressable onPress={() => router.push(`/shop/${shopId}/notifications` as never)} accessibilityRole="button" hitSlop={6}
      accessibilityLabel={counts.total > 0 ? t('notif.bellUnread', { count: counts.total }) : t('notif.bell')}
      style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 16, backgroundColor: th.backgroundElement, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}>
      <Icon name="bell" size={16} color={th.text} />
      {counts.total > 0 ? (
        <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: th.danger, alignItems: 'center', justifyContent: 'center' }}>
          <ThemedText type="smallBold" style={{ color: '#fff', fontSize: 11, lineHeight: 14 }}>{counts.total > 99 ? '99+' : counts.total}</ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Ligne « Notifications » des reglages et du compte : nombre de non lues, ou « Tout est lu ». Ouvre la page complete. */
export function NotificationsRow({ shopId }: { shopId: string }) {
  const th = useTheme();
  const { t } = useT();
  const { counts } = useNotifications();
  return (
    <Row icon="bell" tone="info" title={t('notif.title')} subtitle={counts.total > 0 ? t('notif.rowUnread', { count: counts.total }) : t('notif.rowAllRead')}
      right={counts.total > 0 ? <View style={{ minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: th.primary, alignItems: 'center', justifyContent: 'center' }}><ThemedText type="smallBold" style={{ color: th.primaryText, fontSize: 12, lineHeight: 16 }}>{counts.total > 99 ? '99+' : counts.total}</ThemedText></View> : undefined}
      onPress={() => router.push(`/shop/${shopId}/notifications` as never)} />
  );
}

type Settings = { enabled: boolean; pushEnabled: boolean; mutedCategories: string[] };
const CATEGORIES = [
  { code: 'LOW_STOCK', label: 'notif.cat.lowStock' },
  { code: 'EXPIRY', label: 'notif.cat.expiry' },
  { code: 'REMINDER', label: 'notif.cat.reminder' },
  { code: 'SUBSCRIPTION', label: 'notif.cat.subscription' },
  { code: 'BROADCAST', label: 'notif.cat.broadcast' },
];

/** Reglages des notifications d'une personne : cloche, push de ce telephone, types recus, essai. Valable pour proprietaire et employe. */
export function NotificationPreferences() {
  const { t } = useT();
  const { refresh } = useNotifications();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<PushState>('undetermined');
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = useCallback((e: unknown) => setError(e instanceof ApiError ? e.message : t('common.network')), [t]);

  const load = useCallback(() => api<Settings>('/api/notifications/settings').then(setSettings).catch(fail), [fail]);
  useEffect(() => {
    void load();
    void (async () => {
      const s = await pushState();
      setState(s);
      setDeviceOn(s === 'granted' && (await hasPushToken()));
    })();
  }, [load]);

  async function save(next: Settings) {
    setSettings(next);
    try { setSettings(await api<Settings>('/api/notifications/settings', { method: 'PUT', body: next })); setError(null); } catch (e) { fail(e); void load(); }
  }

  async function toggleDevice() {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (deviceOn) {
        await disablePush();
        await setPushChoice('declined');
        setDeviceOn(false);
      } else {
        const res = await enablePush();
        setState(await pushState());
        if (res === 'granted') { await setPushChoice('enabled'); setDeviceOn(true); }
        else if (res === 'denied') await setPushChoice('declined');
        else if (res === 'error') setError(t('common.network'));
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true); setMessage(null);
    try {
      const res = await api<{ stored: boolean }>('/api/notifications/test', { method: 'POST' });
      setMessage(t(res.stored ? 'notif.testSent' : 'notif.testMuted'));
      await refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!settings) return <ThemedText type="small" themeColor="textSecondary">{error ?? t('common.loading')}</ThemedText>;
  const muted = new Set(settings.mutedCategories);
  const toggleCategory = (code: string) => {
    const next = new Set(muted);
    if (next.has(code)) next.delete(code); else next.add(code);
    void save({ ...settings, mutedCategories: [...next] });
  };
  const supported = pushSupported();
  return (
    <View style={{ gap: 12 }}>
      <Switch value={settings.enabled} onChange={(v) => void save({ ...settings, enabled: v })} label={t('notif.prefs.enabled')} hint={t('notif.prefs.enabledHint')} />
      <Switch value={deviceOn} onChange={() => { if (!busy && supported && state !== 'denied' && settings.enabled) void toggleDevice(); }} label={t('notif.prefs.device')}
        hint={!supported ? t('notif.prefs.unsupportedPhone') : state === 'denied' ? t('notif.prefs.blockedPhone') : t('notif.prefs.deviceHint')} />
      <View style={{ gap: 8, opacity: settings.enabled ? 1 : 0.5 }} pointerEvents={settings.enabled ? 'auto' : 'none'}>
        <ThemedText type="smallBold">{t('notif.prefs.types')}</ThemedText>
        {CATEGORIES.map((c) => <Switch key={c.code} value={!muted.has(c.code)} onChange={() => toggleCategory(c.code)} label={t(c.label)} />)}
      </View>
      <Btn icon="bell" variant="secondary" title={t('notif.prefs.test')} loading={busy} disabled={busy || !settings.enabled} onPress={sendTest} />
      {message ? <Hint icon="circle-check" tone="success">{message}</Hint> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
    </View>
  );
}
