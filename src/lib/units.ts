import type { Product, Unit } from './format';
import type { ShopValue } from './shop';

/** Unites actives d'un produit (conditionnements), l'unite proposee par defaut en premier. */
export const activeUnits = (p: Product): Unit[] => (p.units ?? []).filter((u) => u.active).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
export const defaultUnit = (p: Product): Unit | null => activeUnits(p).find((u) => u.isDefault) ?? null;
export const factorOf = (p: Product, unitId: string | null | undefined): number => Number((p.units ?? []).find((u) => u.id === unitId)?.factor ?? 1);

/** Nom lisible de l'unite de base (le pack donne le libelle : "Kilogramme" ; sinon le code tel quel). */
export function baseUnitName(shop: Pick<ShopValue, 'ws' | 'tr'>, code: string): string {
  const found = shop.ws.manifest.units?.find((u) => u.value === code);
  return found ? shop.tr(found.label) : code;
}
