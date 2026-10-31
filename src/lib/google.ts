import { Platform } from 'react-native';

import { GOOGLE_WEB_CLIENT_ID } from './config';

export class GoogleSignInCancelled extends Error {}

/**
 * Ouvre la connexion Google native et renvoie un ID token que le backend verifie.
 * La bibliotheque contient du code natif : elle ne fonctionne PAS dans Expo Go, il faut un "development build"
 * (npx expo run:android). Import dynamique pour que le reste de l'application demarre quand meme.
 */
export async function getGoogleIdToken(): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('La connexion Google native n\'est pas disponible sur le web.');
  }
  let mod: typeof import('@react-native-google-signin/google-signin');
  try {
    mod = await import('@react-native-google-signin/google-signin');
  } catch {
    throw new Error('Connexion Google indisponible dans Expo Go. Utilisez un development build.');
  }
  const { GoogleSignin, isErrorWithCode, statusCodes } = mod;

  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type !== 'success' || !result.data.idToken) {
      throw new GoogleSignInCancelled();
    }
    return result.data.idToken;
  } catch (e) {
    if (e instanceof GoogleSignInCancelled) throw e;
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleSignInCancelled();
    throw e;
  }
}

export async function googleSignOut() {
  if (Platform.OS === 'web') return;
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // module natif absent (Expo Go) : rien a deconnecter
  }
}
