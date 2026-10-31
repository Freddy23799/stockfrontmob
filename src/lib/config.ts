import { Platform } from 'react-native';

/**
 * Adresse du backend. Un telephone ou un emulateur ne peut pas utiliser "localhost" :
 *  - emulateur Android : 10.0.2.2 (alias de la machine hote)
 *  - telephone reel    : IP du PC sur le Wi-Fi, ex. EXPO_PUBLIC_API_URL=http://192.168.1.20:8080
 */
const defaultHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${defaultHost}:8080`;

/** ID client OAuth de type "Web" : c'est lui qui est l'audience du jeton Google verifie par le backend. */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '285703998525-2haloerfo1smdua33sh3oc6449m5ggia.apps.googleusercontent.com';
