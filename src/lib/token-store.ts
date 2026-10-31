import * as Crypto from 'expo-crypto';
import { storage } from './storage';

const REFRESH_KEY = 'vylaxo.refreshToken';
const PROFILE_KEY = 'vylaxo.profile';
const DEVICE_KEY = 'vylaxo.deviceId';

export type Profile = {
  id: string;
  accountType: 'ADMIN' | 'MERCHANT' | 'EMPLOYEE';
  full_name?: string;
  email?: string;
  [key: string]: unknown;
};

export const tokenStore = {
  getRefreshToken: () => storage.getItem(REFRESH_KEY),
  setRefreshToken: (token: string) => storage.setItem(REFRESH_KEY, token),

  /** Profil garde en local : permet d'ouvrir l'application sans connexion. */
  async getProfile(): Promise<Profile | null> {
    const raw = await storage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  },
  setProfile: (profile: Profile) => storage.setItem(PROFILE_KEY, JSON.stringify(profile)),

  /** Identifiant stable de cet appareil, utilise plus tard par la synchronisation hors ligne. */
  async getDeviceId(): Promise<string> {
    let id = await storage.getItem(DEVICE_KEY);
    if (!id) {
      id = Crypto.randomUUID();
      await storage.setItem(DEVICE_KEY, id);
    }
    return id;
  },

  async clearSession() {
    await storage.removeItem(REFRESH_KEY);
    await storage.removeItem(PROFILE_KEY);
  },
};
