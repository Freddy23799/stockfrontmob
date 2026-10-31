import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Card, Empty, ErrorNote, Hint, Btn, Screen, SectionTitle, Skeleton, Stack, Switch, Badge, useToast } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { OfflineAdvice } from '@/components/offline-advice';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

const CATEGORY_ORDER = ['CORE', 'SALES', 'CATALOG', 'PURCHASE', 'FINANCE', 'HR', 'TEAM', 'SERVICES', 'PLATFORM'];
type Feature = { code: string; name: string; description: string; category: string; core: boolean; enabled: boolean; price: number; dependsOn: string[]; usable?: boolean; paidUntil?: string | null; pending?: boolean; paidButOff?: boolean };
type Addon = { features: string[]; daysLeft: number; amount: number; currency: string; periodEnd: string };
type Checkout = { paymentId: string; amount: number; currency: string; devConfirmAvailable: boolean };
type Quote = { currency: string; total: number; lines: { kind: string; code?: string; label: string; amount: number; quantity?: number }[] };
type Saved = { features: Feature[]; quote: Quote; addon?: Addon | null };
type Preview = Saved & { autoEnabled?: { code: string; because: string }[]; autoDisabled?: { code: string; because: string }[] };

/** Fonctionnalites : chaque bascule recalcule le prix cote serveur (apercu, rien n'est enregistre) et explique les dependances. */
export default function Features() {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const suggested = new Set((shop.ws.manifest as any).suggestedFeatures ?? []);
  const base = `/api/merchant/shops/${shop.shopId}/features`;
  const q = useQuery<Saved>(base);
  const [edited, setSelected] = useState<Set<string> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const [payment, setPayment] = useState<Checkout | null>(null);
  const saved = q.data;

  const savedCodes = useMemo(() => new Set(saved?.features.filter((x) => x.enabled).map((x) => x.code)), [saved]);
  const selected = saved ? edited ?? savedCodes : null;   // tant que rien n'est touche, on affiche l'etat enregistre
  const dirty = selected != null && (selected.size !== savedCodes.size || [...selected].some((c) => !savedCodes.has(c)));

  useEffect(() => {
    if (!selected || !dirty) return undefined;
    const n = ++seq.current;
    const timer = setTimeout(() => {
      shop.call<Preview>(`${base}/preview`, { method: 'POST', body: { features: [...selected] } }).then((p) => n === seq.current && setPreview(p)).catch((e) => n === seq.current && setError(e instanceof ApiError ? e.message : t('common.network')));
    }, 250);
    return () => clearTimeout(timer);
  }, [selected, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shop.owner) return <Screen title={t('features.title')}><Empty icon="lock" title={t('ws.noAccess')} text={t('ws.noAccessText')} /></Screen>;
  if (q.error && !saved) return <Screen title={t('features.title')}><ErrorNote message={q.error} onRetry={q.reload} /></Screen>;
  if (!saved || !selected) return <Screen title={t('features.title')} subtitle={t('features.subtitle')}><Skeleton rows={5} height={70} /></Screen>;

  const byCode = Object.fromEntries(saved.features.map((f) => [f.code, f]));
  const active = dirty ? preview : null;
  const shown = active ?? saved;
  const delta = shown.quote.total - saved.quote.total;
  const effective = active ? new Set(active.features.filter((x) => x.enabled).map((x) => x.code)) : selected;
  const groups = CATEGORY_ORDER.map((cat) => ({ cat, items: saved.features.filter((f) => f.category === cat) })).filter((g) => g.items.length);
  const notes = [
    ...(active?.autoEnabled ?? []).map((c) => t('features.autoEnabled', { name: byCode[c.code].name, parent: byCode[c.because].name })),
    ...(active?.autoDisabled ?? []).map((c) => t('features.autoDisabled', { name: byCode[c.code].name, parent: byCode[c.because].name })),
  ];
  const fmt = (n: number) => shop.money(n);

  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  // fonctionnalites cochees en cours de periode : payees au prorata des jours restants, utilisables des le reglement
  async function startAddon() {
    setBusy(true); setError(null);
    try { setPayment(await shop.call<Checkout>(`/api/merchant/shops/${shop.shopId}/billing/addon/checkout`, { method: 'POST' })); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  async function confirmAddon() {
    setBusy(true); setError(null);
    try {
      await shop.call(`/api/merchant/shops/${shop.shopId}/billing/payments/${payment!.paymentId}/dev-confirm`, { method: 'POST' });
      setPayment(null);
      await q.reload();
      await shop.refresh();   // les fonctionnalites reglees deviennent utilisables tout de suite
      toast(t('mob.feat.addonDone'));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }

  function toggle(f: Feature) {
    if (f.core) return;
    setSelected((prev) => { const next = new Set(prev ?? savedCodes); if (next.has(f.code)) next.delete(f.code); else next.add(f.code); return next; });
  }
  async function save() {
    setBusy(true); setError(null);
    try {
      await shop.call<Saved>(base, { method: 'PUT', body: { features: [...selected!] } });
      setSelected(null);
      setPreview(null);
      await q.reload();
      await shop.refresh();   // menus et droits de l'espace de travail suivent tout de suite
      toast(t('features.saved'));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }

  return (
    <Screen title={t('features.title')} subtitle={t('features.subtitle')} onRefresh={q.reload}
      footer={(
        <View style={{ gap: 8 }}>
      <OfflineAdvice kind="needsNetwork" />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <ThemedText type="small" style={{ flex: 1 }}>{t('features.monthly')}</ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 20 }}>{fmt(shown.quote.total)} <ThemedText type="small" themeColor="textSecondary">{t('common.perMonth')}</ThemedText></ThemedText>
          </View>
          {dirty && delta !== 0 ? <ThemedText type="smallBold" style={{ color: delta > 0 ? th.warning : th.success }}>{delta > 0 ? '+' : '−'}{fmt(Math.abs(delta))} {t('common.perMonth')} <ThemedText type="small" themeColor="textSecondary">({t('features.current')} {fmt(saved.quote.total)})</ThemedText></ThemedText> : null}
          <Btn icon="check" title={busy ? t('features.saving') : dirty ? t('features.save') : t('features.noChange')} disabled={!dirty || busy} loading={busy} onPress={save} />
        </View>
      )}>
      <Hint icon="lightbulb">{t('mob.featuresHint')}</Hint>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {notes.length > 0 ? <Hint icon="circle-info" tone="warning">{notes.join('\n')}</Hint> : null}
      {saved.addon && !dirty ? (
        <Card tone="warning" style={{ gap: 10 }}>
          <ThemedText type="smallBold">{t('mob.feat.addonTitle')}</ThemedText>
          <ThemedText type="small">{t('mob.feat.addonText', { count: saved.addon.features.length, days: saved.addon.daysLeft, date: day(saved.addon.periodEnd) })}</ThemedText>
          {!payment ? <Btn icon="credit-card" title={t('mob.feat.addonPay', { amount: fmt(saved.addon.amount) })} disabled={busy} loading={busy} onPress={startAddon} /> : (
            <View style={{ gap: 8 }}>
              <ThemedText type="small">{t('mob.feat.addonConfirm', { amount: fmt(payment.amount) })}</ThemedText>
              {payment.devConfirmAvailable ? <Btn icon="check" title={t('mob.feat.devConfirm')} disabled={busy} loading={busy} onPress={confirmAddon} /> : <Hint icon="clock">{t('mob.feat.providerPending')}</Hint>}
              <Btn variant="secondary" title={t('common.cancel')} onPress={() => setPayment(null)} />
            </View>
          )}
        </Card>
      ) : null}
      {groups.map(({ cat, items }) => (
        <Stack key={cat} gap={8}>
          <SectionTitle title={t(`cat.${cat}`)} />
          {items.map((f) => {
            const on = effective.has(f.code);
            const needs = f.dependsOn.filter((d) => !byCode[d].core).map((d) => byCode[d].name);
            return (
              <Card key={f.code} style={{ gap: 6, opacity: f.core ? 0.7 : 1 }}>
                <Switch value={on} onChange={() => toggle(f)} label={f.name} hint={f.description} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge tone={f.core || f.price === 0 || f.paidButOff ? 'success' : 'info'}>{f.core || f.price === 0 ? t('common.included') : f.paidButOff ? t('mob.feat.alreadyPaid') : `+${fmt(f.price)}`}</Badge>
                  {f.pending ? <Badge tone="warning">{t('mob.feat.pending')}</Badge> : null}
                  {f.paidButOff && f.paidUntil ? <Badge tone="success">{t('mob.feat.paidUntil', { date: day(f.paidUntil) })}</Badge> : null}
                  {!on && suggested.has(f.code) ? <Badge tone="primary">{t('features.suggested')}</Badge> : null}
                </View>
                {needs.length > 0 ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('features.needs', { names: needs.join(', ') })}</ThemedText> : null}
                {f.pending ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('mob.feat.pendingNote')}</ThemedText> : null}
                {f.paidButOff && !on && f.paidUntil ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('mob.feat.paidButOff', { date: day(f.paidUntil) })}</ThemedText> : null}
              </Card>
            );
          })}
        </Stack>
      ))}
    </Screen>
  );
}
