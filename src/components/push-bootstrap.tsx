import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Sheet } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { enablePush, getPushChoice, hasPushToken, pushState, pushSupported, registerToken, routeFor, setPushChoice } from '@/lib/push';

// Au premier plan, la notification s'affiche en banniere (sans son) ; en arriere-plan, c'est le systeme qui l'affiche.
if (pushSupported()) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

function open(data: unknown) {
  const url = typeof (data as { url?: unknown } | null)?.url === 'string' ? ((data as { url: string }).url) : null;
  const route = routeFor(url);
  if (route) router.push(route as never);
}

/**
 * Tout ce qui touche au push, une fois connecte : toucher une notification ouvre la bonne page (application fermee ou ouverte),
 * le jeton est garde a jour, et — a l'ouverture — la question « Activer les notifications ? » est posee UNE fois par appareil.
 */
export default function PushBootstrap() {
  const { status } = useAuth();
  const { t } = useT();
  const [prompt, setPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const handled = useRef<string | null>(null);
  const signedIn = status === 'signedIn';

  // toucher une notification
  useEffect(() => {
    if (!signedIn || !pushSupported()) return undefined;
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r && handled.current !== r.notification.request.identifier) {
        handled.current = r.notification.request.identifier;
        open(r.notification.request.content.data);
        void Notifications.clearLastNotificationResponseAsync();
      }
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handled.current = r.notification.request.identifier;
      open(r.notification.request.content.data);
    });
    // le jeton FCM peut changer : on le renvoie au serveur
    const token = Notifications.addPushTokenListener((tk) => { void registerToken(String(tk.data)).catch(() => undefined); });
    return () => { sub.remove(); token.remove(); };
  }, [signedIn]);

  // demande a l'ouverture, ou reinscription silencieuse si le choix « activer » est deja fait
  useEffect(() => {
    if (!signedIn || !pushSupported()) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const [choice, state] = await Promise.all([getPushChoice(), pushState()]);
      if (choice === 'enabled' && state === 'granted') { void enablePush(); return; }
      if (choice === null && state === 'undetermined' && !(await hasPushToken())) timer = setTimeout(() => setPrompt(true), 1500);
    })();
    return () => { if (timer) clearTimeout(timer); };
  }, [signedIn]);

  async function accept() {
    setBusy(true);
    const res = await enablePush();
    await setPushChoice(res === 'granted' ? 'enabled' : 'declined');
    setBusy(false);
    setPrompt(false);
  }
  async function decline() {
    await setPushChoice('declined');
    setPrompt(false);
  }

  return (
    <Sheet visible={prompt} title={t('notif.prompt.title')} onClose={() => void decline()}
      footer={<View style={{ gap: 8 }}><Btn icon="bell" title={t('notif.prompt.accept')} loading={busy} disabled={busy} onPress={() => void accept()} /><Btn variant="secondary" title={t('notif.prompt.decline')} disabled={busy} onPress={() => void decline()} /></View>}>
      <ThemedText>{t('notif.prompt.text')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{t('notif.prompt.hint')}</ThemedText>
    </Sheet>
  );
}
