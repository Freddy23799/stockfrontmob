import { useSyncExternalStore } from 'react';

import { useResolvedScheme } from '@/lib/theme';

const subscribe = () => () => undefined;

/**
 * Le rendu statique du web produit toujours du clair : on ne lit le theme reel (appareil ou choix de l'utilisateur)
 * qu'une fois le navigateur hydrate, sinon React signale une difference entre le HTML et l'ecran.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const scheme = useResolvedScheme();
  return hasHydrated ? scheme : 'light';
}
