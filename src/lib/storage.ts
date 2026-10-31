import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Stockage cle/valeur : coffre securise du telephone (Keychain / Keystore). Sur le web (outils de developpement et
 * verification visuelle) SecureStore n'existe pas : on retombe sur localStorage.
 */
export const storage = {
  getItem: async (key: string): Promise<string | null> => (Platform.OS === 'web' ? localStorage.getItem(key) : SecureStore.getItemAsync(key)),
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
