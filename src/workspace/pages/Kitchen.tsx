import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Screen, Skeleton, Stack, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { num } from '@/lib/format';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/restaurant';
type Line = { id: string; name: string; quantity: number | string; note?: string; course: number; station: string; status: string };
type Ticket = { orderId: string; number: string; channel: string; tableName?: string; covers: number; serverName?: string; customerName?: string; waitSeconds: number; lines: Line[] };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Ecran cuisine / bar : tickets du poste, le plus ancien d'abord, temps d'attente en direct. */
export default function Kitchen({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [stations, setStations] = useState<string[]>(['KITCHEN']);
  const [station, setStation] = useState('');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [fetched, setFetched] = useState(0);
  const delay = (num(shop.config?.kitchenDelayMinutes) || 15) * 60;
  const canAct = shop.can('KITCHEN_DISPLAY', 'update') || shop.can('TABLE_SERVICE', 'update');

  const load = useCallback(async () => {
    try {
      const list = await shop.call<Ticket[]>(`${API}/kitchen${station ? `?station=${encodeURIComponent(station)}` : ''}`);
      setFetched(Date.now()); setNow(Date.now()); setTickets(list); setError(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }, [shop, station, t]);
  useEffect(() => {
    const first = setTimeout(() => { void load(); }, 0);
    const id = setInterval(() => { void load(); }, 4000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { shop.call<string[]>(`${API}/stations`).then(setStations).catch(() => {}); }, [shop]);

  async function set(tk: Ticket, l: Line, status: string) {
    setBusy(l.id);
    try { await shop.call(`${API}/orders/${tk.orderId}/lines/${l.id}/status`, { method: 'POST', body: { status } }); await load(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); } finally { setBusy(null); }
  }
  async function allReady(tk: Ticket) {
    setBusy(tk.orderId);
    try {
      for (const l of tk.lines) if (l.status !== 'READY') await shop.call(`${API}/orders/${tk.orderId}/lines/${l.id}/status`, { method: 'POST', body: { status: 'READY' } });
      await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); } finally { setBusy(null); }
  }
  const wait = (tk: Ticket) => Math.max(0, num(tk.waitSeconds) + Math.floor((now - fetched) / 1000));
  const stationLabel = (s: string) => { const k = `rs.station.${s}`; const v = t(k); return v === k ? s : v; };

  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={load}>
      <Chips value={station} onChange={setStation} options={[{ value: '', label: t('rs.allStations') }, ...stations.map((s) => ({ value: s, label: stationLabel(s) }))]} />
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {!tickets ? <Skeleton rows={3} height={140} /> : tickets.length === 0 ? <Empty icon="fire-burner" title={t('rs.kitchenEmpty')} text={t('rs.kitchenEmptyText')} /> : (
        <Stack gap={12}>
          {tickets.map((tk) => {
            const w = wait(tk);
            const tone = w > delay ? 'danger' : w > delay / 2 ? 'warning' : 'success';
            return (
              <Card key={tk.orderId} tone={tone}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ThemedText type="smallBold">{tk.tableName ? `${t('rs.table')} ${tk.tableName}` : t(`rs.channel.${tk.channel}`)} · {tk.number}</ThemedText>
                  <Badge tone={tone}>{mmss(w)}</Badge>
                </View>
                <ThemedText type="small" themeColor="textSecondary">{tk.covers > 0 && tk.channel === 'DINE_IN' ? `${t('rs.coversN', { n: tk.covers })} · ` : ''}{tk.serverName ?? tk.customerName ?? ''}</ThemedText>
                {tk.lines.map((l) => (
                  <View key={l.id} style={{ marginTop: 10, gap: 6, opacity: l.status === 'READY' ? 0.7 : 1 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <ThemedText type="subtitle" style={{ fontSize: 20 }}>{num(l.quantity)}× {l.name}</ThemedText>
                      {l.course > 1 ? <Badge tone="info">{t(`rs.course.${l.course}`)}</Badge> : null}
                    </View>
                    {l.note ? <ThemedText type="smallBold" style={{ color: '#d63a3a' }}>{l.note}</ThemedText> : null}
                    {canAct ? (
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {l.status === 'SENT' ? <Btn small variant="secondary" icon="play" title={t('rs.start')} disabled={busy === l.id} onPress={() => void set(tk, l, 'PREPARING')} /> : null}
                        {l.status !== 'READY' ? <Btn small icon="check" title={t('rs.ready')} disabled={busy === l.id} onPress={() => void set(tk, l, 'READY')} /> : <>
                          <Badge tone="success">{t('rs.line.READY')}</Badge>
                          <Btn small variant="secondary" icon="bell-concierge" title={t('rs.served')} disabled={busy === l.id} onPress={() => void set(tk, l, 'SERVED')} />
                        </>}
                      </View>
                    ) : null}
                  </View>
                ))}
                {canAct && tk.lines.some((l) => l.status !== 'READY') ? <View style={{ marginTop: 12 }}><Btn icon="check" title={t('rs.allReady')} loading={busy === tk.orderId} onPress={() => void allReady(tk)} /></View> : null}
              </Card>
            );
          })}
        </Stack>
      )}
    </Screen>
  );
}
