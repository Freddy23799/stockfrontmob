import { useWindowDimensions } from 'react-native';

/**
 * Taille d'ecran : un seul endroit decide comment l'interface s'adapte.
 *  compact  < 600  : telephone (une colonne, barre d'onglets en bas)
 *  medium   < 960  : grand telephone, petite tablette, telephone en paysage
 *  expanded >= 960 : tablette, ordinateur (menu lateral, plusieurs colonnes)
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const size = width >= 960 ? 'expanded' : width >= 600 ? 'medium' : 'compact';
  const gutter = size === 'compact' ? 16 : size === 'medium' ? 24 : 32;
  const contentWidth = Math.min(width, 1280);
  return {
    width, height, size, gutter,
    compact: size === 'compact', wide: size !== 'compact', expanded: size === 'expanded',
    landscape: width > height,
    /** Nombre de colonnes d'une grille de cartes dont chaque carte fait au moins `min` pixels. */
    columns: (min = 280) => Math.max(1, Math.floor((contentWidth - gutter * 2 + 12) / (min + 12))),
  };
}
