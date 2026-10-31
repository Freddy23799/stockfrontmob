import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Hint, Row, Sheet, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';

type Conflict = { id: string; label?: string; field: string; server: number | string | null; client: number | string | null };

/**
 * Valeurs modifiees a deux endroits que le gerant doit choisir (prix, plafond de credit) : la valeur actuelle du serveur est gardee
 * en attendant. N'apparait que pour qui peut arbitrer, en ligne, une fois tout ce qui attendait envoye.
 */
export function ConflictsRow() {
  const { t } = useT();
  const shop = useShop();
  const off = useOffline();
  const toast = useToast();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const allowed = shop.owner || shop.can('PRODUCTS', 'update');

  const refresh = useCallback(async () => {
    if (!allowed) return;
    try { setCount((await shop.call<{ open: number }>('/api/shop/conflicts/count')).open); } catch { /* hors ligne : on garde le dernier nombre */ }
  }, [allowed, shop]);
  // interroge le serveur en ligne, une fois tout ce qui attendait envoye (tache asynchrone, pas de mise a jour synchrone dans l'effet)
  useEffect(() => {
    if (!off.online || off.pending > 0 || off.syncing) return undefined;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [off.online, off.pending, off.syncing, refresh]);

  const load = useCallback(async () => {
    try { setItems(await shop.call<Conflict[]>('/api/shop/conflicts')); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }, [shop, t]);

  async function choose(c: Conflict, choice: 'SERVER' | 'CLIENT') {
    try {
      await shop.call(`/api/shop/conflicts/${c.id}/resolve`, { method: 'POST', body: { choice } });
      toast(t('ws.saved'));
      await load();
      void refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }

  if (!allowed || count === 0 || !off.online) return null;
  const show = (v: number | string | null) => (v == null ? '—' : shop.money(v));
  return (
    <>
      <Row icon="triangle-exclamation" tone="danger" title={t('mob.conflictsTitle')} subtitle={String(count)} onPress={() => { setOpen(true); setError(null); void load(); }} />
      <Sheet visible={open} tall title={t('mob.conflictsTitle')} onClose={() => setOpen(false)}>
        <Hint icon="circle-info">{t('mob.conflictsText')}</Hint>
        {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
        {items.map((c) => (
          <Card key={c.id} style={{ gap: 8 }}>
            <ThemedText type="smallBold">{c.label ?? '—'} · {t(`mob.field.${c.field}`)}</ThemedText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" themeColor="textSecondary">{t('mob.conflictCurrent')}</ThemedText><ThemedText type="smallBold">{show(c.server)}</ThemedText></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" themeColor="textSecondary">{t('mob.conflictEntered')}</ThemedText><ThemedText type="smallBold">{show(c.client)}</ThemedText></View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small variant="secondary" title={t('mob.conflictServer')} onPress={() => void choose(c, 'SERVER')} />
              <Btn small title={t('mob.conflictClient')} onPress={() => void choose(c, 'CLIENT')} />
            </View>
          </Card>
        ))}
      </Sheet>
    </>
  );
}
