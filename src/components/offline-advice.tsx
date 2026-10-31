import { Hint } from '@/components/ui';
import { useT } from '@/i18n';
import { useOffline } from '@/lib/offline';

/**
 * Conseil discret, JAMAIS bloquant, affiche seulement hors ligne devant une operation sensible : le systeme sait la faire sans
 * reseau, mais dit quand il vaut mieux la faire en ligne. kind : price | cancel | cashClose | count | edit | needsNetwork.
 */
export function OfflineAdvice({ kind }: { kind: 'price' | 'cancel' | 'cashClose' | 'count' | 'edit' | 'needsNetwork' }) {
  const { t } = useT();
  const { online } = useOffline();
  if (online) return null;
  return <Hint icon="lightbulb" tone="warning">{t(`mob.advice.${kind}`)}</Hint>;
}
