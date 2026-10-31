import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';
import { appLanguage } from './locale';
import { storage } from './storage';
import { tokenStore } from './token-store';

const CHOICE_KEY = 'vylaxo.push.choice';
const TOKEN_KEY = 'vylaxo.push.token';
const CHANNEL = 'default';

/** 'enabled' | 'declined' | null (jamais demande). Garde d'une ouverture a l'autre, modifiable dans les reglages. */
export type PushChoice = 'enabled' | 'declined' | null;
export type PushState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Push natif : Android pour l'instant (iOS plus tard). Sur le web, c'est le site qui gere ses propres notifications. */
export const pushSupported = () => Platform.OS === 'android';

export async function getPushChoice(): Promise<PushChoice> {
  const v = await storage.getItem(CHOICE_KEY).catch(() => null);
  return v === 'enabled' || v === 'declined' ? v : null;
}

export const setPushChoice = (v: 'enabled' | 'declined') => storage.setItem(CHOICE_KEY, v).catch(() => undefined);

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.status === 'denied' && p.canAskAgain === false ? 'denied' : 'undetermined';
}

export const hasPushToken = async () => Boolean(await storage.getItem(TOKEN_KEY).catch(() => null));

/**
 * Demande l'autorisation puis inscrit CET appareil aupres du serveur (jeton FCM natif : le serveur envoie directement via Firebase).
 * Android 13+ : le canal de notification doit exister avant la demande de jeton. Appelee aussi a chaque ouverture quand le choix est
 * « activer », pour garder la langue et la date de derniere activite de l'appareil a jour.
 */
export async function enablePush(): Promise<PushState | 'error'> {
  if (!pushSupported()) return 'unsupported';
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Notifications',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
    });
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted) p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return p.status === 'denied' && p.canAskAgain === false ? 'denied' : 'undetermined';
    const token = await Notifications.getDevicePushTokenAsync();
    await registerToken(String(token.data));
    return 'granted';
  } catch {
    return 'error';
  }
}

export async function registerToken(token: string) {
  await api('/api/notifications/devices', {
    method: 'POST',
    body: { token, platform: 'android', deviceId: await tokenStore.getDeviceId(), lang: appLanguage() },
  });
  await storage.setItem(TOKEN_KEY, token);
}

/** Retire cet appareil des alertes du compte (coupure du push ou deconnexion). N'efface pas la cloche. */
export async function disablePush() {
  const token = await storage.getItem(TOKEN_KEY).catch(() => null);
  await storage.removeItem(TOKEN_KEY).catch(() => undefined);
  if (!token) return;
  await api('/api/notifications/devices', { method: 'DELETE', body: { token } }).catch(() => undefined);
}

/** Les adresses des notifications sont celles du site : on les traduit vers les ecrans du mobile. */
export function routeFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const shop = /^\/app\/shops\/([0-9a-fA-F-]{36})(\/[^?#]*)?/.exec(url);
  if (shop) return `/shop/${shop[1]}${shop[2] ?? ''}`;
  return url === '/app' || url.startsWith('/app?') ? '/(tabs)' : null;
}
