import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Reglages communs de toutes les FlatList : peu de lignes construites a la fois et peu gardees en memoire. Les valeurs par defaut de
 * React Native (fenetre de 21 ecrans) gardent beaucoup trop de lignes montees sur un telephone modeste.
 */
export const LIST_PROPS = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 60,
  windowSize: 7,
  removeClippedSubviews: Platform.OS === 'android',
} as const;

/**
 * Affichage progressif d'une liste DEJA en memoire : `step` lignes d'abord, puis `step` de plus a chaque demande (defilement).
 * Evite de construire des centaines de lignes d'un coup.
 */
export function useProgressive<T>(items: T[], step = 15) {
  // la liste change (recherche, rechargement) : on repart des `step` premieres lignes (etat recale pendant le rendu, sans effet)
  const [state, setState] = useState({ source: items, count: step });
  let count = state.count;
  if (state.source !== items) {
    setState({ source: items, count: step });
    count = step;
  }
  const visible = useMemo(() => items.slice(0, count), [items, count]);
  return { visible, total: items.length, hasMore: count < items.length, loadMore: () => setState((s) => ({ source: s.source, count: s.count + step })) };
}
