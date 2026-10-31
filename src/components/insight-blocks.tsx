import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AreaChart, BarChart, Donut, GroupedBars, Legend, RankBars } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';

/**
 * Un bloc de /api/shop/insights -> une ou plusieurs cartes (memes textes et memes chiffres que le site).
 * Les graphiques complexes du site (sankey, treemap, radar...) restent sur le site ; le mobile affiche les blocs METIER et les
 * blocs de base sous forme de chiffres cles, anneaux, classements et barres.
 */
export type Block = { key: string; section: string; kind?: string; finance?: boolean; [k: string]: any };
export type Fact = { label: string; value: string | number | null | undefined; tone?: 'danger' | 'warn' | 'ok' };
export type Visual =
  | { type: 'donut'; items: { name: string; value: number }[]; money?: boolean; center?: string }
  | { type: 'rank'; items: { name: string; value: number; sub?: string }[]; money?: boolean }
  | { type: 'bars'; cats: string[]; series: { name: string; values: number[] }[]; money?: boolean }
  | { type: 'area'; cats: string[]; series: { name: string; values: number[] }[]; money?: boolean }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'gauge'; value: number; label: string };
export type InsightCard = { id: string; title: string; empty?: boolean; emptyText?: string; hint?: string; facts?: Fact[]; visuals?: Visual[] };
export type Env = { t: (k: string, p?: Record<string, string | number>) => string; money: (n: number) => string; lang: string; v?: (k: string) => string };

const num = (v: unknown) => Number(v ?? 0);
const arr = <T,>(v: T[] | undefined | null): T[] => v ?? [];
const nonZero = <T extends { value: number }>(xs: T[]) => xs.filter((x) => x.value > 0);

export function renderBlock(b: Block, env: Env): InsightCard[] {
  const R = RENDER[b.key];
  return R ? R(b, helpers(env)) : [];
}

function helpers(env: Env) {
  const { t, money, lang } = env;
  const mf = new Intl.DateTimeFormat(lang, { month: 'short', year: '2-digit' });
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const df = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' });
  return {
    t, money,
    n: (v: unknown) => nf.format(num(v)),
    pct: (v: unknown) => `${nf.format(num(v))} %`,
    date: (d: string) => df.format(new Date(`${String(d).slice(0, 10)}T12:00:00`)),
    none: (name?: string | null) => (!name || name === '-' ? t('ws.none') : name),
    month: (m: string) => mf.format(new Date(`${String(m).slice(0, 7)}-15T12:00:00`)),
    v: (k: string) => (env.v ? env.v(k) : k).toLowerCase(),
  };
}
type H = ReturnType<typeof helpers>;
const donut = (items: { name: string; value: number }[], money = false, center?: string): Visual => ({ type: 'donut', items: nonZero(items), money, center });
const rank = (items: { name: string; value: number; sub?: string }[], money = false): Visual => ({ type: 'rank', items, money });
const table = (head: string[], rows: string[][]): Visual => ({ type: 'table', head, rows });
const tone = (cond: unknown, kind: 'danger' | 'warn'): 'danger' | 'warn' | undefined => (cond ? kind : undefined);

const RENDER: Record<string, (b: Block, h: H) => InsightCard[]> = {
  // ---- socle : ventes, stock, creances, resultat
  'sales.trend': (b, { t, money, n, pct, date }) => [{ id: 'trend', title: t('ins.b.sales.trend'), empty: arr(b.series).length === 0 && num(b.current?.count) === 0,
    facts: [{ label: t('dash.revenue'), value: money(num(b.current?.total)) }, { label: t('dash.margin'), value: money(num(b.current?.margin)) }, { label: t('ins.marginRate'), value: b.current?.marginRate != null ? pct(b.current.marginRate) : null },
      { label: t('ws.count'), value: n(b.current?.count) }, { label: t('ins.rsAvgTicket'), value: money(num(b.current?.average)) }],
    visuals: [{ type: 'area', cats: arr<{ date: string }>(b.series).map((d) => date(d.date)), series: [{ name: t('dash.revenue'), values: arr<{ total: number }>(b.series).map((d) => num(d.total)) }, { name: t('dash.margin'), values: arr<{ margin: number }>(b.series).map((d) => num(d.margin)) }], money: true }] }],
  'sales.top': (b, { t, money }) => [{ id: 'top', title: t('dash.topProducts'), empty: arr(b.items).length === 0,
    visuals: [rank(arr<{ name: string; margin: number; qty: number }>(b.items).map((i) => ({ name: i.name, value: num(i.margin), sub: t('dash.sold', { qty: num(i.qty), margin: money(num(i.margin)) }) })), true)] }],
  'sales.methods': (b, { t }) => [{ id: 'methods', title: t('dash.byMethod'), empty: arr(b.items).length === 0,
    visuals: [donut(arr<{ key: string; total: number }>(b.items).map((i) => ({ name: t(`ins.m.${i.key}`), value: num(i.total) })), true)], facts: [{ label: t('ws.balanceDue'), value: num(b.unpaid) > 0 ? b.unpaid : null, tone: tone(b.unpaid, 'warn') }] }],
  'sales.familyMargin': (b, { t, money, pct, none }) => [{ id: 'family', title: t('ins.b.sales.familyMargin'), empty: arr(b.items).length === 0,
    visuals: [rank(arr<{ name: string; margin: number; marginRate?: number; total: number }>(b.items).map((i) => ({ name: none(i.name), value: num(i.margin), sub: `${t('ins.marginRate')} ${i.marginRate != null ? pct(i.marginRate) : '—'} · ${money(num(i.total))}` })), true)] }],
  'finance.result': (b, { t, money, pct }) => [{ id: 'result', title: t('ins.b.finance.result'),
    facts: [{ label: t('ins.step.result'), value: money(num(b.result)), tone: num(b.result) < 0 ? 'danger' : 'ok' }, { label: t('ins.resultPct'), value: b.resultPct != null ? pct(b.resultPct) : null }],
    visuals: [rank(arr<{ key: string; value: number }>(b.steps).filter((s) => s.key !== 'result').map((s) => ({ name: t(`ins.step.${s.key}`), value: Math.abs(num(s.value)), sub: num(s.value) < 0 ? '−' : undefined })), true)] }],
  'stock.health': (b, { t, money, n }) => [{ id: 'health', title: t('ins.b.stock.health'), empty: num(b.tracked) === 0,
    facts: [{ label: t('ws.outOfStock'), value: b.outCount || null, tone: tone(b.outCount, 'danger') }, { label: t('ws.lowStock'), value: b.lowCount || null, tone: tone(b.lowCount, 'warn') }, { label: t('ws.stockValue'), value: b.stockValue != null ? money(num(b.stockValue)) : null }],
    visuals: [rank(arr<{ key: string; count: number }>(b.buckets).map((x) => ({ name: t(`ins.cov.${x.key}`), value: num(x.count) })))] }],

  // ---- restaurant
  'restaurant.service': (b, { t, money }) => [{ id: 'rsService', title: t('ins.b.restaurant.service'), empty: b.closed === 0 && b.cancelled === 0, emptyText: t('ins.noOrders'),
    visuals: [donut(arr<{ name: string; value: number }>(b.channels).map((c) => ({ name: t(`rs.channel.${c.name}`), value: num(c.value) })), false, t('ws.count'))],
    facts: [{ label: t('ins.rsClosed'), value: b.closed }, { label: t('ins.rsCovers'), value: b.covers || null }, { label: t('ins.rsAvgTicket'), value: b.avgTicket != null ? money(num(b.avgTicket)) : null }, { label: t('ins.rsPerCover'), value: b.perCover != null ? money(num(b.perCover)) : null },
      { label: t('ins.rsPrep'), value: num(b.prepSamples) > 0 ? t('rs.min', { n: Math.round(num(b.avgPrepMinutes)) }) : null }, { label: t('ins.rsPrepP90'), value: num(b.prepSamples) > 0 ? t('rs.min', { n: Math.round(num(b.p90PrepMinutes)) }) : null },
      { label: t('ins.rsCancelled'), value: b.cancelled || null, tone: tone(b.cancelled, 'warn') }, { label: t('ins.rsVoided'), value: b.voidedLines ? (b.voidedValue != null ? `${b.voidedLines} · ${money(num(b.voidedValue))}` : b.voidedLines) : null, tone: tone(b.voidedLines, 'warn') }] }],
  'restaurant.dishes': (b, { t, money, pct }) => [{ id: 'rsDishes', title: t('ins.b.restaurant.dishes'), empty: arr(b.items).length === 0, emptyText: t('ins.noOrders'), hint: t('ins.rsDishesHint'),
    visuals: [rank(arr<{ name: string; qty: number; total: number; marginRate?: number }>(b.items).map((i) => ({ name: i.name, value: num(i.qty), sub: `${money(num(i.total))}${i.marginRate != null ? ` · ${t('ins.marginRate')} ${pct(i.marginRate)}` : ''}` })))] }],

  // ---- pressing
  'laundry.pipeline': (b, { t, n, pct, date }) => {
    const steps = ['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED'];
    const series = arr<{ day: string; tickets: number; items: number }>(b.series);
    return [{ id: 'ldPipeline', title: t('ld.ins.pipeline'), empty: steps.every((k) => num(b.byStatus?.[k]) === 0) && series.length === 0, emptyText: t('ld.ins.noOrders'),
      facts: [{ label: t('ld.ins.overdue'), value: b.overdue || null, tone: tone(b.overdue, 'danger') }, { label: t('ld.ins.dueToday'), value: b.dueToday || null, tone: tone(b.dueToday, 'warn') }, { label: t('ld.ins.expressShare'), value: b.expressShare != null ? pct(b.expressShare) : null }, { label: t('ld.ins.avgItems'), value: b.avgItemsPerTicket != null ? n(b.avgItemsPerTicket) : null }],
      visuals: [rank(steps.map((k) => ({ name: t(`ld.s.${k}`), value: num(b.byStatus?.[k]) }))), ...(series.length > 0 ? [{ type: 'bars', cats: series.map((d) => date(d.day)), series: [{ name: t('ld.ins.tickets'), values: series.map((d) => num(d.tickets)) }, { name: t('ld.ins.items'), values: series.map((d) => num(d.items)) }] } as Visual] : [])] }];
  },
  'laundry.services': (b, { t, money, n, pct }) => [{ id: 'ldServices', title: t('ld.ins.services'), empty: arr(b.items).length === 0,
    visuals: [rank(arr<{ name: string; revenue: number; items: number; sharePct: number }>(b.items).map((i) => ({ name: i.name, value: num(i.revenue), sub: `${n(i.items)} ${t('ld.ins.items').toLowerCase()} · ${pct(i.sharePct)}` })), true),
      table([t('ld.garment'), t('ld.ins.items'), t('dash.revenue')], arr<{ name: string; items: number; revenue: number }>(b.garments).slice(0, 6).map((g) => [g.name, n(g.items), money(num(g.revenue))]))],
    facts: [{ label: t('ld.ins.covered'), value: num(b.covered) > 0 ? money(num(b.covered)) : null }] }],
  'laundry.turnaround': (b, { t, n, none }) => [{ id: 'ldTurn', title: t('ld.ins.turnaround'), empty: b.onTimePct == null && b.avgDaysToReady == null, emptyText: t('ld.ins.noOrders'),
    visuals: [...(b.onTimePct != null ? [{ type: 'gauge', value: num(b.onTimePct), label: t('ld.ins.onTime') } as Visual] : []), table([t('ld.ins.lateList'), ''], arr<{ number: string; name?: string; daysLate: number }>(b.lateList).map((o) => [`${o.number} · ${none(o.name)}`, t('ld.late', { count: o.daysLate })]))],
    facts: [{ label: t('ld.ins.daysToReady'), value: b.avgDaysToReady != null ? n(b.avgDaysToReady) : null }, { label: t('ld.ins.daysToPickup'), value: b.avgDaysToPickup != null ? n(b.avgDaysToPickup) : null }, { label: t('ld.ins.late'), value: b.late || null, tone: tone(b.late, 'danger') }] }],
  'laundry.unclaimed': (b, { t, money, none }) => [{ id: 'ldUnclaimed', title: t('ld.ins.unclaimed'), empty: num(b.count) === 0, emptyText: t('ld.ins.noUnclaimed'),
    facts: [{ label: t('ld.ins.count'), value: b.count, tone: tone(b.count, 'warn') }, { label: t('ld.ins.value'), value: money(num(b.value)) }, { label: t('ld.ins.oldest'), value: b.oldestDays != null ? t('ld.ins.days', { count: b.oldestDays }) : null }, { label: t('ld.ins.remindersSent'), value: b.remindersSent || null }],
    visuals: [rank(arr<{ key: string; count: number }>(b.buckets).map((x) => ({ name: t('ld.ins.bucket', { range: x.key }), value: num(x.count) }))), table([t('ld.ticket'), t('ld.balance')], arr<{ number: string; partyName?: string; waitingDays?: number; balance: number }>(b.top).map((o) => [`${o.number} · ${none(o.partyName)} (${t('ld.waiting', { count: o.waitingDays ?? 0 })})`, money(num(o.balance))]))] }],
  'laundry.claims': (b, { t, money, n }) => [{ id: 'ldClaims', title: t('ld.ins.claims'), empty: num(b.open) + num(b.resolved) === 0, emptyText: t('ld.ins.noClaims'),
    visuals: [donut(arr<{ key: string; count: number }>(b.byKind).map((k) => ({ name: t(`ld.ck.${k.key}`), value: num(k.count) })), false, t('ws.count'))],
    facts: [{ label: t('ld.ins.openClaims'), value: b.open || null, tone: tone(b.open, 'danger') }, { label: t('ld.ins.resolvedClaims'), value: b.resolved }, { label: t('ld.ins.claimRate'), value: b.rate != null ? n(b.rate) : null }, { label: t('ld.ins.avgResolution'), value: b.avgResolutionDays != null ? t('ld.ins.days', { count: n(b.avgResolutionDays) }) : null }, { label: t('ld.ins.compensation'), value: b.compensation != null ? money(num(b.compensation)) : null }] }],
  'laundry.plans': (b, { t, money, n }) => [{ id: 'ldPlans', title: t('ld.ins.plans'), empty: num(b.active) + num(b.exhausted) === 0 && arr(b.topPlans).length === 0, emptyText: t('ld.ins.noPlans'),
    facts: [{ label: t('ld.ins.activePlans'), value: b.active }, { label: t('ld.ins.expiringSoon'), value: b.expiringSoon || null, tone: tone(b.expiringSoon, 'warn') }, { label: t('ld.ins.exhausted'), value: b.exhausted || null }, { label: t('ld.ins.soldValue'), value: b.soldValue != null ? money(num(b.soldValue)) : null }, { label: t('ld.ins.usedUnits'), value: b.usedUnits != null ? n(b.usedUnits) : null }],
    visuals: [rank(arr<{ name: string; count: number }>(b.topPlans).map((p) => ({ name: p.name, value: num(p.count) })))] }],
  'laundry.routes': (b, { t, money, pct }) => [{ id: 'ldRoutes', title: t('ld.ins.routes'), empty: num(b.today?.stops) === 0 && num(b.pendingRequests) === 0 && arr(b.byKind).length === 0, emptyText: t('ld.ins.noRoutes'),
    facts: [{ label: t('ld.ins.routesToday'), value: b.today?.routes }, { label: t('ld.ins.stopsToday'), value: `${num(b.today?.done)}/${num(b.today?.stops)}` }, { label: t('ld.ins.failedToday'), value: b.today?.failed || null, tone: tone(b.today?.failed, 'danger') }, { label: t('ld.ins.pendingRequests'), value: b.pendingRequests || null, tone: tone(b.pendingRequests, 'warn') },
      { label: t('ld.ins.successPct'), value: b.successPct != null ? pct(b.successPct) : null }, { label: t('ld.ins.cashToCollect'), value: num(b.cashToCollect) > 0 ? money(num(b.cashToCollect)) : null }],
    visuals: [donut(arr<{ key: string; count: number }>(b.byKind).map((k) => ({ name: t(`ld.stop.${k.key}`), value: num(k.count) })), false, t('ws.count'))] }],

  // ---- salon
  'salon.agenda': (b, { t, n, pct, date }) => {
    const statuses = ['BOOKED', 'CONFIRMED', 'ARRIVED', 'IN_SERVICE', 'DONE', 'NO_SHOW', 'CANCELLED'];
    const series = arr<{ day: string; appointments: number; noShows: number }>(b.series);
    return [{ id: 'slAgenda', title: t('ins.b.salon.agenda'), empty: num(b.total) === 0, emptyText: t('sl.ins.noData'),
      visuals: [donut(statuses.map((k) => ({ name: t(`sl.st.${k}`), value: num(b.byStatus?.[k]) })), false, t('sl.appts')), ...(series.length > 0 ? [{ type: 'bars', cats: series.map((d) => date(d.day)), series: [{ name: t('sl.appts'), values: series.map((d) => num(d.appointments)) }, { name: t('sl.noShows'), values: series.map((d) => num(d.noShows)) }] } as Visual] : [])],
      facts: [{ label: t('sl.ins.noShowRate'), value: b.noShowRate != null ? pct(b.noShowRate) : null, tone: tone(num(b.noShowRate) >= 10, 'warn') }, { label: t('sl.ins.cancelRate'), value: b.cancelRate != null ? pct(b.cancelRate) : null }, { label: t('sl.ins.leadDays'), value: num(b.avgLeadDays) > 0 ? n(b.avgLeadDays) : null }] }];
  },
  'salon.stylists': (b, { t, money, n, pct }) => [{ id: 'slStylists', title: t('ins.b.salon.stylists'), empty: arr<{ appointments: number }>(b.items).every((i) => num(i.appointments) === 0), emptyText: t('sl.ins.noData'), hint: t('sl.ins.stylistsHint'),
    visuals: [rank(arr<{ name: string; revenue?: number; appointments: number; occupancy?: number; hours?: number }>(b.items).map((i) => ({ name: i.name, value: b.finance ? num(i.revenue) : num(i.appointments), sub: `${n(i.appointments)} ${t('sl.appts').toLowerCase()} · ${i.occupancy != null ? `${t('sl.ins.occupancy')} ${pct(i.occupancy)}` : `${n(i.hours)} h`}` })), Boolean(b.finance)),
      table([t('sl.stylist'), t('sl.ins.commissionDue')], arr<{ name: string; commissionDue?: number }>(b.items).filter((i) => num(i.commissionDue) > 0).map((i) => [i.name, money(num(i.commissionDue))]))] }],
  'salon.services': (b, { t, money, n, pct }) => [{ id: 'slServices', title: t('ins.b.salon.services'), empty: arr(b.items).length === 0, emptyText: t('sl.ins.noData'),
    visuals: [rank(arr<{ name: string; count: number; revenue?: number; sharePct?: number; avgMinutes: number }>(b.items).map((i) => ({ name: i.name, value: num(i.count), sub: `${b.finance ? `${money(num(i.revenue))} · ${pct(i.sharePct)} · ` : ''}${i.avgMinutes} min` })))],
    facts: [{ label: t('sl.ins.packShare'), value: b.packShare != null ? pct(b.packShare) : null }] }],
  'salon.clients': (b, { t, money, n, pct }) => [{ id: 'slClients', title: t('ins.b.salon.clients'), empty: num(b.active) === 0, emptyText: t('sl.ins.noData'),
    visuals: [donut([{ name: t('sl.ins.newClients'), value: num(b.newClients) }, { name: t('sl.ins.returning'), value: num(b.returning) }], false, t('sl.ins.clients')), table([t('sl.ins.topClients'), t('sl.ins.visits'), t('dash.revenue')], arr<{ name: string; visits: number; spent: number }>(b.top).map((c) => [c.name, n(c.visits), money(num(c.spent))]))],
    facts: [{ label: t('sl.ins.returnRate'), value: b.returnRate != null ? pct(b.returnRate) : null }, { label: t('sl.ins.regulars'), value: b.regulars || null }, { label: t('sl.ins.daysBetween'), value: num(b.avgDaysBetween) > 0 ? n(b.avgDaysBetween) : null }] }],
  'salon.queue': (b, { t, n, pct, date }) => {
    const series = arr<{ day: string; tickets: number; leftN: number }>(b.series);
    return [{ id: 'slQueue', title: t('ins.b.salon.queue'), empty: num(b.tickets) === 0, emptyText: t('sl.ins.noData'),
      facts: [{ label: t('sl.ins.tickets'), value: b.tickets }, { label: t('sl.ins.avgWait'), value: num(b.avgWaitMinutes) > 0 ? `${n(b.avgWaitMinutes)} min` : null }, { label: t('sl.ins.p90Wait'), value: num(b.p90WaitMinutes) > 0 ? `${n(b.p90WaitMinutes)} min` : null }, { label: t('sl.avgService'), value: num(b.avgServiceMinutes) > 0 ? `${n(b.avgServiceMinutes)} min` : null },
        { label: t('sl.ins.abandon'), value: b.abandonRate != null ? pct(b.abandonRate) : null, tone: tone(num(b.abandonRate) >= 15, 'warn') }],
      visuals: series.length > 0 ? [{ type: 'bars', cats: series.map((d) => date(d.day)), series: [{ name: t('sl.ins.tickets'), values: series.map((d) => num(d.tickets)) }, { name: t('sl.left'), values: series.map((d) => num(d.leftN)) }] }] : [] }];
  },

  // ---- couture et mode
  'tailor.orders': (b, { t, n, pct, date }) => {
    const statuses = ['RECEIVED', 'CUTTING', 'SEWING', 'FITTING', 'READY', 'DELIVERED', 'CANCELLED'];
    const series = arr<{ day: string; orders: number }>(b.series);
    return [{ id: 'tlOrders', title: t('ins.b.tailor.orders'), empty: num(b.created) === 0 && num(b.inWork) === 0, emptyText: t('tl.ins.noData'),
      visuals: [donut(statuses.map((k) => ({ name: t(`tl.st.${k}`), value: num(b.byStatus?.[k]) })), false, t('tl.ins.orders')), ...(b.onTimeRate != null ? [{ type: 'gauge', value: num(b.onTimeRate), label: t('tl.ins.onTime') } as Visual] : []),
        ...(series.length > 0 ? [{ type: 'bars', cats: series.map((d) => date(d.day)), series: [{ name: t('tl.ins.orders'), values: series.map((d) => num(d.orders)) }] } as Visual] : [])],
      facts: [{ label: t('tl.ins.inWork'), value: b.inWork }, { label: t('tl.ins.late'), value: num(b.late) || null, tone: tone(num(b.late) > 0, 'warn') }, { label: t('tl.ins.waiting'), value: num(b.waitingPickup) || null }, { label: t('tl.ins.oldestReady'), value: num(b.oldestReadyDays) > 0 ? t('tl.ins.days', { n: b.oldestReadyDays }) : null },
        { label: t('tl.ins.leadDays'), value: num(b.avgLeadDays) > 0 ? n(b.avgLeadDays) : null }, { label: t('tl.ins.cancelRate'), value: b.cancelRate != null ? pct(b.cancelRate) : null }] }];
  },
  'tailor.workers': (b, { t, n }) => [{ id: 'tlWorkers', title: t('ins.b.tailor.workers'), empty: arr(b.items).length === 0, emptyText: t('tl.ins.noData'),
    visuals: [rank(arr<{ name: string; delivered: number; open: number; late?: number; avgLeadDays?: number }>(b.items).map((i) => ({ name: i.name, value: num(i.delivered) + num(i.open), sub: `${t('tl.ins.delivered')} ${i.delivered} · ${t('tl.openN', { n: i.open })}${num(i.late) > 0 ? ` · ${t('tl.lateN', { n: i.late ?? 0 })}` : ''}${num(i.avgLeadDays) > 0 ? ` · ${n(i.avgLeadDays)} ${t('tl.ins.daysShort')}` : ''}` })))] }],
  'tailor.garments': (b, { t, money, pct }) => [{ id: 'tlGarments', title: t('ins.b.tailor.garments'), empty: arr(b.items).length === 0, emptyText: t('tl.ins.noData'),
    visuals: [rank(arr<{ name: string; count: number; kind: string; revenue?: number; sharePct?: number }>(b.items).map((i) => ({ name: i.name, value: num(i.count), sub: `${t(`tl.kind.${i.kind}`)}${b.finance ? ` · ${money(num(i.revenue))} · ${pct(i.sharePct)}` : ''}` })))] }],
  'tailor.fashion': (b, { t, money, pct }) => {
    const sizes = arr<{ label: string; units: number }>(b.sizes), colors = arr<{ label: string; units: number }>(b.colors), cols = arr<{ label: string; units: number; revenue?: number; stockLeft: number; sellThroughPct?: number }>(b.collections);
    return [
      { id: 'tlSizes', title: t('tl.ins.sizesColors'), empty: sizes.length === 0 && colors.length === 0, emptyText: t('tl.ins.noSales'), visuals: [rank(sizes.map((i) => ({ name: `${t('tl.sizes')} ${i.label}`, value: num(i.units) }))), rank(colors.map((i) => ({ name: i.label, value: num(i.units) })))] },
      { id: 'tlCollections', title: t('tl.ins.collections'), empty: cols.length === 0, emptyText: t('tl.ins.noSales'), hint: t('tl.ins.collectionsHint'),
        visuals: [rank(cols.map((i) => ({ name: i.label, value: num(i.units), sub: `${b.finance && i.revenue != null ? `${money(num(i.revenue))} · ` : ''}${t('tl.ins.left', { n: i.stockLeft })}${i.sellThroughPct != null ? ` · ${t('tl.ins.sellThrough')} ${pct(i.sellThroughPct)}` : ''}` })))] }];
  },

  // ---- telephonie et electronique
  'electronics.inventory': (b, { t, money, n }) => [{ id: 'elInv', title: t('ins.b.electronics.inventory'), empty: arr<{ count: number }>(b.byStatus).reduce((x, i) => x + num(i.count), 0) === 0, emptyText: t('el.ins.noUnits'), hint: t('el.ins.inventoryHint'),
    visuals: [donut(arr<{ key: string; count: number }>(b.byStatus).map((i) => ({ name: t(`el.us.${i.key}`), value: num(i.count) })), false, t('ws.count')), rank(arr<{ bucket: string; count: number }>(b.aging).map((a) => ({ name: a.bucket, value: num(a.count) }))),
      table([t('el.ins.mismatch'), t('el.ins.ledger'), t('el.ins.units')], arr<{ name: string; ledger: number; units: number }>(b.mismatch).map((m) => [m.name, n(m.ledger), n(m.units)]))],
    facts: [{ label: t('el.ins.stockValue'), value: b.stockValue != null ? money(num(b.stockValue)) : null }, { label: t('el.ins.blocked'), value: b.blocked || null, tone: tone(b.blocked, 'danger') }, ...arr<{ key: string; count: number }>(b.byCondition).map((c) => ({ label: t(`el.cond.${c.key}`), value: num(c.count) }))] }],
  'electronics.margin': (b, { t, money, n, pct }) => [{ id: 'elMargin', title: t('ins.b.electronics.margin'), empty: arr(b.byCondition).length === 0 && arr(b.top).length === 0, emptyText: t('el.ins.noSales'), hint: t('el.ins.marginHint'),
    visuals: [rank(arr<{ name: string; margin: number; units: number; revenue: number }>(b.top).map((i) => ({ name: i.name, value: num(i.margin), sub: `${num(i.units)} · ${money(num(i.revenue))}` })), true)],
    facts: [{ label: t('el.ins.avgDays'), value: b.avgDaysToSell != null ? t('el.days', { count: b.avgDaysToSell }) : null }, { label: t('el.ins.belowCost'), value: b.belowCost || null, tone: tone(b.belowCost, 'danger') },
      ...arr<{ key: string; marginPct?: number; margin: number }>(b.byCondition).map((c) => ({ label: `${t(`el.cond.${c.key}`)} · ${t('ins.marginRate')}`, value: c.marginPct != null ? pct(c.marginPct) : n(c.margin) }))] }],
  'electronics.warranties': (b, { t }) => [{ id: 'elWar', title: t('ins.b.electronics.warranties'), empty: num(b.issued) === 0 && num(b.active) === 0, emptyText: t('el.ins.noWarranties'), hint: t('el.ins.warrantiesHint'),
    visuals: [donut([{ name: t('el.ws.ACTIVE'), value: num(b.active) }, { name: t('el.ws.EXPIRED'), value: num(b.expired) }, { name: t('el.ws.PENDING'), value: num(b.pending) }], false, t('ws.count')), table([t('el.ins.soon'), ''], arr<{ name: string; customer?: string; days: number }>(b.soon).map((w) => [`${w.name} · ${w.customer ?? ''}`, t('el.daysLeft', { count: w.days })]))],
    facts: [{ label: t('el.ins.expiring'), value: b.expiring || null, tone: tone(b.expiring, 'warn') }, { label: t('el.ins.issued'), value: b.issued }, { label: t('el.ins.claims'), value: b.claims?.count || null }] }],
  'repairs.pipeline': (b, { t, money, n }) => [{ id: 'elRep', title: t('ins.b.repairs.pipeline'), empty: arr<{ count: number }>(b.steps).every((s) => num(s.count) === 0) && num(b.open) === 0, emptyText: t('el.ins.noRepairs'), hint: t('el.ins.repairsHint'),
    visuals: [donut(arr<{ key: string; count: number }>(b.steps).map((s) => ({ name: t(`el.rs.${s.key}`), value: num(s.count) })), false, t('ws.count')), rank(arr<{ name: string; count: number; revenue: number }>(b.topServices).map((x) => ({ name: x.name, value: num(x.count), sub: money(num(x.revenue)) }))),
      table([t('el.technician'), t('el.ins.open'), t('el.ins.delivered')], arr<{ name: string; open: number; delivered: number; turnaround?: number }>(b.byTechnician).filter((x) => x.name !== '-').map((x) => [x.name, n(x.open), `${n(x.delivered)}${x.turnaround != null ? ` · ${t('el.days', { count: Math.round(num(x.turnaround) * 10) / 10 })}` : ''}`])),
      table([t('el.ins.lateList'), ''], arr<{ number: string; device?: string; customer?: string; daysLate?: number; days_late?: number }>(b.lateList).map((r) => [`${r.number} · ${r.device ?? ''} · ${r.customer ?? ''}`, t('el.daysLate', { count: r.daysLate ?? r.days_late ?? 0 })]))],
    facts: [{ label: t('el.ins.open'), value: b.open }, { label: t('el.ins.late'), value: b.late || null, tone: tone(b.late, 'danger') }, { label: t('el.ins.delivered'), value: b.delivered }, { label: t('el.ins.underWarranty'), value: b.underWarranty || null }, { label: t('el.ins.unrepairable'), value: b.unrepairable || null }, { label: t('el.ins.declined'), value: b.declined || null },
      { label: t('el.ins.turnaround'), value: b.turnaroundDays != null ? t('el.days', { count: b.turnaroundDays }) : null }, { label: t('el.ins.depositsHeld'), value: b.depositsHeld != null ? money(num(b.depositsHeld)) : null }, { label: t('dash.revenue'), value: b.revenue != null ? money(num(b.revenue)) : null }, { label: t('dash.margin'), value: b.margin != null ? money(num(b.margin)) : null }] }],
  'tradeins.flow': (b, { t, money, pct }) => [{ id: 'elTrade', title: t('ins.b.tradeins.flow'), empty: num(b.completed) + num(b.rejected) + num(b.pending) === 0, emptyText: t('el.ins.noTrades'), hint: t('el.ins.tradeHint'),
    visuals: [donut([{ name: t('el.ts.COMPLETED'), value: num(b.completed) }, { name: t('el.ts.REJECTED'), value: num(b.rejected) }, { name: t('el.ts.QUOTED'), value: num(b.pending) }], false, t('ws.count'))],
    facts: [{ label: t('el.ins.resold'), value: b.resold }, { label: t('el.ins.stuck'), value: b.stuck || null, tone: tone(b.stuck, 'warn') }, { label: t('el.ins.creditShare'), value: b.creditShare != null ? pct(b.creditShare) : null }, { label: t('el.ins.valuePaid'), value: b.valuePaid != null ? money(num(b.valuePaid)) : null }, { label: t('el.ins.resaleMargin'), value: b.resaleMargin != null ? money(num(b.resaleMargin)) : null }] }],
  'installments.book': (b, { t, money }) => [{ id: 'elBook', title: t('ins.b.installments.book'), empty: num(b.active) === 0 && num(b.collected) === 0, emptyText: t('el.ins.noPlans'), hint: t('el.ins.bookHint'),
    facts: [{ label: t('el.ins.activePlans'), value: b.active }, { label: t('el.ins.outstanding'), value: money(num(b.outstanding)) }, { label: t('el.ins.overdue'), value: num(b.overdueCount) ? `${b.overdueCount} · ${money(num(b.overdueAmount))}` : null, tone: tone(b.overdueCount, 'danger') },
      { label: t('el.ins.dueNext7'), value: num(b.dueNext7) ? `${money(num(b.dueNext7))} (${b.dueNext7Plans})` : null }, { label: t('el.ins.collected'), value: money(num(b.collected)) }],
    visuals: [table([t('el.ins.worst'), t('el.balance')], arr<{ customer: string; sale: string; balance: number }>(b.worst).map((w) => [`${w.customer} · ${w.sale}`, money(num(w.balance))]))] }],

  // ---- grossiste en boissons
  'deposits.balance': (b, { t, money, n }) => [{ id: 'depBal', title: t('ins.b.deposits.balance'), empty: num(b.atCustomersQty) === 0 && num(b.owedToSuppliersQty) === 0 && arr(b.empties).length === 0, emptyText: t('bv.ins.noDeposits'),
    facts: [{ label: t('bv.ins.atCustomers'), value: `${n(b.atCustomersQty)} · ${money(num(b.atCustomersValue))}` }, { label: t('bv.ins.owedSuppliers'), value: num(b.owedToSuppliersQty) ? n(b.owedToSuppliersQty) : null }, { label: t('bv.ins.heldCash'), value: b.heldCash != null ? money(num(b.heldCash)) : null }, { label: t('bv.ins.overLimit'), value: num(b.overLimit) || null, tone: tone(b.overLimit, 'danger') }],
    visuals: [rank(arr<{ name: string; qty: number }>(b.empties).map((e) => ({ name: e.name, value: num(e.qty) }))), table([t('bv.ins.topHolders'), t('ws.count')], arr<{ name: string; qty: number; value: number }>(b.items).map((i) => [i.name, `${n(i.qty)} · ${money(num(i.value))}`]))] }],
  'rounds.performance': (b, { t, money, n, pct, date, none }) => {
    const series = arr<{ week: string; delivered: number; failed: number }>(b.series);
    return [{ id: 'rounds', title: t('ins.b.rounds.performance'), empty: series.length === 0 && num(b.rounds) === 0, emptyText: t('bv.ins.noRounds'),
      facts: [{ label: t('bv.ins.rounds'), value: b.rounds }, { label: t('bv.ins.deliveredPct'), value: b.deliveredPct != null ? pct(b.deliveredPct) : null }, { label: t('bv.ins.cashVariance'), value: num(b.cashVariance) !== 0 ? money(num(b.cashVariance)) : null, tone: tone(num(b.cashVariance) !== 0, 'warn') },
        { label: t('bv.ins.emptiesVariance'), value: num(b.emptiesVariance) !== 0 ? n(b.emptiesVariance) : null, tone: tone(num(b.emptiesVariance) !== 0, 'warn') }, { label: t('bv.ins.openRounds'), value: b.openRounds || null }],
      visuals: [...(series.length > 0 ? [{ type: 'bars', cats: series.map((s) => date(s.week)), series: [{ name: t('bv.ins.delivered'), values: series.map((s) => num(s.delivered)) }, { name: t('bv.ins.failed'), values: series.map((s) => num(s.failed)) }] } as Visual] : []),
        table([t('bv.ins.topDrivers'), t('bv.ins.rounds')], arr<{ name: string; rounds: number; delivered: number }>(b.topDrivers).map((d) => [none(d.name), `${d.rounds} · ${d.delivered}`]))] }];
  },
  'orders.pipeline': (b, { t, money, none }) => [{ id: 'ordPipe', title: t('ins.b.orders.pipeline'), empty: arr<{ value: number }>(b.steps).every((s) => num(s.value) === 0), emptyText: t('bv.ins.noOrders'),
    visuals: [rank(arr<{ key: string; value: number }>(b.steps).map((s) => ({ name: t(`bv.ins.${s.key}`), value: num(s.value) }))), table([t('bv.ins.byRep'), t('dash.revenue')], arr<{ name: string; total: number; orders: number }>(b.byRep).map((r) => [none(r.name), `${money(num(r.total))} · ${r.orders}`]))],
    facts: [{ label: t('bv.ins.openValue'), value: `${money(num(b.openValue))} · ${b.openCount}` }, { label: t('bv.ins.late'), value: b.late || null, tone: tone(b.late, 'danger') }, { label: t('bv.ins.cancelled'), value: b.cancelled || null }] }],
  'credit.risk': (b, { t, money }) => [{ id: 'credit', title: t('ins.b.credit.risk'), empty: num(b.total) === 0, emptyText: t('bv.ins.noCredit'),
    facts: [{ label: t('bv.ins.creditTotal'), value: money(num(b.total)) }, { label: t('bv.ins.debtors'), value: b.debtors }, { label: t('bv.ins.overduePromises'), value: b.overduePromises || null, tone: tone(b.overduePromises, 'danger') }, { label: t('bv.ins.brokenPromises'), value: b.brokenPromises || null, tone: tone(b.brokenPromises, 'warn') }],
    visuals: [rank(arr<{ key: string; value: number }>(b.buckets).map((x) => ({ name: t(`bv.ins.bucket.${x.key}`), value: num(x.value) })), true), table([t('bv.ins.topRisk'), t('bv.ins.creditTotal')], arr<{ name: string; days?: number; owed: number }>(b.top).map((c) => [`${c.name}${num(c.days) > 0 ? ` · ${t('bv.ins.daysLate', { count: c.days ?? 0 })}` : ''}`, money(num(c.owed))]))] }],
  'rebates.progress': (b, { t, money, pct }) => [{ id: 'rebates', title: t('ins.b.rebates.progress'), empty: arr(b.items).length === 0, emptyText: t('bv.ins.noRebates'),
    visuals: [table([t('ins.b.rebates.progress'), '%', t('bv.ins.earned'), t('bv.ins.remaining')], arr<{ name: string; supplier?: string; daysLeft?: number; progressPct: number; earned: number; remaining: number }>(b.items).map((i) => [`${i.name} · ${i.supplier ?? ''}${i.daysLeft != null ? ` · ${t('bv.ins.daysLeft', { count: i.daysLeft })}` : ''}`, pct(i.progressPct), money(num(i.earned)), money(num(i.remaining))]))] }],
  'losses.breakdown': (b, { t, money }) => [{ id: 'losses', title: t('ins.b.losses.breakdown'), empty: arr(b.items).length === 0, emptyText: t('bv.ins.noLosses'),
    visuals: [donut(arr<{ reason: string; value?: number; qty: number }>(b.items).map((i) => ({ name: t(`bv.ls.r.${i.reason}`), value: num(i.value) || num(i.qty) })), false, t('bv.ins.lossValue'))],
    facts: [{ label: t('bv.ins.lossValue'), value: b.total != null ? money(num(b.total)) : null }, { label: t('bv.ins.openClaims'), value: b.openClaims || null, tone: tone(b.openClaims, 'warn') }] }],

  // ---- ventes : heures de pointe, ABC, familles
  'overview.health': (b, { t }) => [{ id: 'health', title: t('ins.b.overview.health'), hint: t('ins.hint.health'), visuals: [rank(arr<{ key: string; score: number }>(b.axes).map((a) => ({ name: t(`ins.axis.${a.key}`), value: num(a.score), sub: '/ 100' })))] }],
  'sales.hours': (b, { t }) => {
    const hours = Array.from({ length: 16 }, (_, i) => i + 6);
    const per = hours.map((h) => arr<{ hour: number; cnt: number }>(b.cells).filter((c) => Math.min(21, Math.max(6, c.hour)) === h).reduce((x, c) => x + num(c.cnt), 0));
    return [{ id: 'hours', title: t('dash.busiest'), hint: t('dash.busiestHint'), empty: arr(b.cells).length === 0, visuals: [{ type: 'bars', cats: hours.map((h) => `${h}h`), series: [{ name: t('ws.count'), values: per }] }] }];
  },
  'sales.pareto': (b, { t, money }) => [{ id: 'pareto', title: t('ins.b.sales.pareto'), hint: t('ins.hint.pareto'), empty: arr(b.items).length === 0,
    facts: ['A', 'B', 'C'].map((k) => ({ label: `${t(`ins.abc.${k}`, { count: num(b.classes?.[k]?.count) })}`, value: money(num(b.classes?.[k]?.total)) })),
    visuals: [rank(arr<{ name: string; total: number; cumulativePct: number; class: string }>(b.items).slice(0, 10).map((i) => ({ name: i.name, value: num(i.total), sub: `${i.class} · ${num(i.cumulativePct)} %` })), true)] }],
  'sales.categories': (b, { t, none }) => [{ id: 'categories', title: t('dash.byCategory'), empty: arr(b.tree).length === 0,
    visuals: [rank(arr<{ name: string; value: number; none?: boolean; other?: boolean; children?: { name: string }[] }>(b.tree).map((n) => ({ name: n.other ? t('dash.others') : n.none ? t('ws.none') : none(n.name), value: num(n.value), sub: arr(n.children).slice(0, 3).map((c) => c.name).join(', ') })), true)] }],
  'quotes.pipeline': (b, { t, money, pct, none }) => {
    const names = ['created', 'sent', 'accepted', 'converted'];
    return [{ id: 'quotes', title: t('ins.b.quotes.pipeline'), hint: t('ins.hint.quotes'), empty: num(b.steps?.[0]?.value) === 0 && num(b.openCount) === 0,
      visuals: [rank(names.map((k, i) => ({ name: t(`ins.qt.${k}`), value: num(b.steps?.[i]?.value) }))), table([t('ws.label'), t('ws.total')], arr<{ number: string; name?: string; total: number }>(b.top).map((q) => [`${q.number} · ${none(q.name)}`, money(num(q.total))]))],
      facts: [{ label: t('ins.qtConversion'), value: b.conversionPct != null ? pct(b.conversionPct) : null }, { label: t('ins.qtConvertedValue'), value: num(b.convertedValue) > 0 ? money(num(b.convertedValue)) : null }, { label: t('ins.qtOpen'), value: b.openCount }, { label: t('ins.qtOpenValue'), value: money(num(b.openValue)) },
        { label: t('ins.qtRejected'), value: b.rejected || null }, { label: t('ins.qtExpiring'), value: b.expiring || null, tone: tone(b.expiring, 'warn') }, { label: t('ins.qtExpired'), value: b.expired || null, tone: tone(b.expired, 'danger') }] }];
  },
  'deliveries.status': (b, { t, pct, none }) => {
    const order = ['PREPARED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'];
    return [{ id: 'deliveries', title: t('ins.b.deliveries.status'), empty: arr(b.items).length === 0, emptyText: t('ins.noDeliveries'),
      visuals: [donut(order.map((k) => ({ name: t(`ins.dl.${k}`), value: num(arr<{ status: string; n: number }>(b.items).find((x) => x.status === k)?.n) })), false, t('ws.count')), table([t('ins.dlLateList'), ''], arr<{ number: string; name?: string; daysLate: number }>(b.lateList).map((d) => [`${d.number} · ${none(d.name)}`, t('ins.dlDaysLate', { count: d.daysLate })]))],
      facts: [{ label: t('ins.dlOpen'), value: b.open }, { label: t('ins.dlLate'), value: b.late || null, tone: tone(b.late, 'danger') }, { label: t('ins.dlDelivered'), value: b.delivered }, { label: t('ins.dlOnTime'), value: b.onTimePct != null ? pct(b.onTimePct) : null }, { label: t('ins.dlFailed'), value: b.failed || null, tone: tone(b.failed, 'warn') }] }];
  },
  'pricing.rules': (b, { t, money }) => [{ id: 'pricing', title: t('ins.b.pricing.rules'), empty: arr(b.items).length === 0,
    visuals: [donut(arr<{ source: string; total: number }>(b.items).map((s) => ({ name: t(`ins.src.${s.source}`), value: num(s.total) })), true, t('dash.total')), table([t('ins.rule'), t('ws.count'), t('ins.rulesDiscount')], arr<{ label: string; lines: number; discount: number }>(b.labels).slice(0, 5).map((l) => [l.label, String(num(l.lines)), money(num(l.discount))]))],
    facts: [{ label: t('ins.rulesDiscount'), value: money(arr<{ discount: number }>(b.items).reduce((x, i) => x + num(i.discount), 0)) }] }],

  // ---- stock et peremption
  'stock.value': (b, { t, money }) => {
    const isMoney = b.metric === 'value';
    return [{ id: 'stockValue', title: isMoney ? t('ins.b.stock.value') : t('ins.c.stockQty'), hint: t('ins.hint.treemap'), empty: arr(b.tree).length === 0,
      facts: isMoney ? [{ label: t('ws.stockValue'), value: money(num(b.total)) }, { label: t('ws.stockRetail'), value: money(num(b.retailTotal)) }] : [],
      visuals: [rank(arr<{ name: string; value: number; none?: boolean; other?: boolean; products?: number }>(b.tree).map((x) => ({ name: x.other ? t('dash.others') : x.none ? t('ws.none') : x.name, value: num(x.value), sub: x.products != null ? t('ws.itemsCount', { count: num(x.products) }) : undefined })), isMoney)]}];
  },
  'stock.dormant': (b, { t, money, n }) => [{ id: 'dormant', title: t('ins.b.stock.dormant'), hint: t('ins.dormantHint', { count: num(b.sinceDays) }), empty: num(b.count) === 0, emptyText: t('ws.dormantNone'),
    facts: [{ label: t('ins.dormantCount'), value: n(b.count) }, { label: t('ws.dormantTotal'), value: b.totalValue != null ? money(num(b.totalValue)) : null }],
    visuals: [rank(arr<{ name: string; value?: number; qty: number }>(b.items).map((i) => ({ name: i.name, value: num(i.value ?? i.qty) })), arr<{ value?: number }>(b.items)[0]?.value != null)] }],
  'stock.inventory': (b, { t, money, n, pct, date }) => {
    const series = arr<{ date: string; counted: number; gaps: number }>(b.series);
    return [{ id: 'inventory', title: t('ins.b.stock.inventory'), empty: num(b.counted) === 0, emptyText: t('ins.noInventory'),
      facts: [{ label: t('ins.accuracy'), value: b.accuracy != null ? pct(b.accuracy) : null }, { label: t('ins.gaps'), value: `${b.gaps} / ${b.counted}` }, { label: t('ins.surplus'), value: b.surplusValue != null ? money(num(b.surplusValue)) : null }, { label: t('ins.shortage'), value: b.shortageValue != null ? money(num(b.shortageValue)) : null, tone: tone(num(b.shortageValue) < 0, 'danger') }],
      visuals: [...(series.length > 0 ? [{ type: 'bars', cats: series.map((s) => date(s.date)), series: [{ name: t('ins.gaps'), values: series.map((s) => num(s.gaps)) }, { name: t('ins.counted'), values: series.map((s) => num(s.counted) - num(s.gaps)) }] } as Visual] : []),
        table([t('ins.product'), t('ins.gap'), t('ws.stockValue')], arr<{ name: string; delta: number; value?: number }>(b.worst).slice(0, 5).map((w) => [w.name, n(w.delta), w.value != null ? money(num(w.value)) : '']))] }];
  },
  'expiry.schedule': (b, { t, money, n, date }) => {
    const keys = ['expired', 'd30', 'd60', 'd90', 'd180'];
    const bk = (k: string) => arr<{ key: string; lots: number; qty: number; value?: number }>(b.buckets).find((x) => x.key === k);
    const hasValue = bk('expired')?.value != null;
    return [{ id: 'expiry', title: t('ins.b.expiry.schedule'), hint: t('ins.hint.expiry'), empty: arr(b.buckets).length === 0,
      facts: keys.map((k) => ({ label: t(`ins.exp.${k}`), value: `${num(bk(k)?.lots)} ${t('ins.lots')}`, tone: k === 'expired' && num(bk(k)?.lots) > 0 ? 'danger' : undefined })),
      visuals: [{ type: 'bars', cats: keys.map((k) => t(`ins.exp.${k}`)), series: [{ name: t('ws.count'), values: keys.map((k) => num(bk(k)?.qty)) }] },
        ...(hasValue ? [donut(keys.map((k) => ({ name: t(`ins.exp.${k}`), value: num(bk(k)?.value) })), true, t('dash.total'))] : []),
        table([t('ins.c.risk'), ''], arr<{ name: string; lot: string; expiry: string; daysLeft: number; qty: number; value?: number }>(b.risk).map((r) => [`${r.name} · ${r.lot} · ${date(r.expiry)}`, `${r.daysLeft < 0 ? t('ins.expiredAgo', { count: -r.daysLeft }) : t('ins.daysUnit', { count: r.daysLeft })} · ${n(r.qty)}${hasValue && r.value != null ? ` · ${money(num(r.value))}` : ''}`]))] }];
  },
  'expiry.flow': (b, { t, money, n, date }) => {
    const hasValue = b.lostValue != null;
    const series = arr<{ week: string; lostValue?: number; savedValue?: number; lostQty?: number; savedQty?: number }>(b.series);
    return [{ id: 'expFlow', title: t('ins.b.expiry.flow'), hint: t('ins.hint.flow'), empty: series.length === 0 || (num(b.lostQty) === 0 && num(b.savedQty) === 0),
      facts: [{ label: t('ins.lost'), value: hasValue ? money(num(b.lostValue)) : n(b.lostQty), tone: tone(b.lostQty, 'danger') }, { label: t('ins.saved'), value: hasValue ? money(num(b.savedValue)) : n(b.savedQty), tone: 'ok' }],
      visuals: [{ type: 'bars', cats: series.map((s) => date(s.week)), series: [{ name: t('ins.saved'), values: series.map((s) => num(hasValue ? s.savedValue : s.savedQty)) }, { name: t('ins.lost'), values: series.map((s) => num(hasValue ? s.lostValue : s.lostQty)) }], money: hasValue }] }];
  },
  'stock.transfers': (b, { t, date }) => {
    const series = arr<{ week: string; sent: number; received: number }>(b.series);
    return [{ id: 'transfers', title: t('ins.b.stock.transfers'), empty: series.length === 0 && num(b.incoming) === 0 && num(b.outgoing) === 0, emptyText: t('ins.noTransfers'),
      facts: [{ label: t('ins.trIncoming'), value: b.incoming || null, tone: tone(b.incoming, 'warn') }, { label: t('ins.trOutgoing'), value: b.outgoing || null }, { label: t('ins.trSent'), value: b.sent }, { label: t('ins.trReceived'), value: b.received }, { label: t('ins.trRejected'), value: b.rejected || null, tone: tone(b.rejected, 'warn') }, { label: t('ins.trStale'), value: b.stale || null, tone: tone(b.stale, 'danger') }],
      visuals: series.length > 0 ? [{ type: 'bars', cats: series.map((s) => date(s.week)), series: [{ name: t('ins.trSent'), values: series.map((s) => num(s.sent)) }, { name: t('ins.trReceived'), values: series.map((s) => num(s.received)) }] }] : [] }];
  },

  // ---- achats
  'purchases.suppliers': (b, { t, money, none, v }) => [{ id: 'suppliers', title: t('ins.b.purchases.suppliers', { who: v('suppliers') }), empty: arr(b.items).length === 0,
    facts: [{ label: t('ins.purchased'), value: money(num(b.total)) }, { label: t('ins.previousPeriod'), value: num(b.previousTotal) > 0 ? money(num(b.previousTotal)) : null }],
    visuals: [rank(arr<{ name: string; total: number; paid: number; balance: number }>(b.items).map((i) => ({ name: none(i.name), value: num(i.total), sub: `${t('ws.paid')} ${money(num(i.paid))} · ${t('ws.balanceDue')} ${money(num(i.balance))}` })), true)] }],
  'purchases.orders': (b, { t, money, n, pct }) => {
    const names = ['created', 'sent', 'received', 'complete'];
    return [{ id: 'poOrders', title: t('ins.b.purchases.orders'), hint: t('ins.hint.orders'), empty: num(b.steps?.[0]?.value) === 0,
      visuals: [rank(names.map((k, i) => ({ name: t(`ins.po.${k}`), value: num(b.steps?.[i]?.value) })))],
      facts: [{ label: t('ins.leadDays'), value: b.leadDays != null ? t('ins.daysUnit', { count: n(b.leadDays) }) : null }, { label: t('ins.onTime'), value: b.onTimeRate != null && num(b.onTimeRate) > 0 ? pct(b.onTimeRate) : null }, { label: t('ins.pendingValue'), value: b.pendingValue != null ? money(num(b.pendingValue)) : null }] }];
  },
  'purchases.payables': (b, { t, money, none, v }) => [{ id: 'payables', title: t('ins.b.purchases.payables', { who: v('suppliers') }), empty: num(b.total) === 0, emptyText: t('ins.nothingOwed'),
    facts: [{ label: t('ins.totalOwed'), value: money(num(b.total)), tone: 'danger' }],
    visuals: [rank(arr<{ key: string; value: number }>(b.buckets).map((x) => ({ name: t(`ins.age.${x.key}`), value: num(x.value) })), true), rank(arr<{ name: string; value: number }>(b.top).map((x) => ({ name: none(x.name), value: num(x.value) })), true)] }],
  'purchases.returns': (b, { t, money, pct, none }) => [{ id: 'sreturns', title: t('ins.b.purchases.returns'), empty: arr(b.suppliers).length === 0,
    facts: [{ label: t('ins.returnedValue'), value: money(num(b.total)) }, { label: t('ins.returnRate'), value: b.ratePct != null ? pct(b.ratePct) : null }],
    visuals: [rank(arr<{ name: string; total: number; n: number }>(b.suppliers).map((s) => ({ name: none(s.name), value: num(s.total), sub: `${s.n}` })), true)] }],

  // ---- clients, fidelite, retours
  'customers.activity': (b, { t, pct, v }) => {
    const names = ['active', 'repeat2', 'repeat3', 'repeat5'];
    return [{ id: 'activity', title: t('ins.b.customers.activity', { who: v('customers') }), hint: t('ins.hint.loyaltyFunnel'), empty: num(b.totalCustomers) === 0 && num(b.activeCustomers) === 0,
      visuals: [rank(names.map((k, i) => ({ name: t(`ins.freq.${k}`), value: num(b.steps?.[i]?.value) })))],
      facts: [{ label: t('dash.newCustomers'), value: b.newCustomers }, { label: t('ins.totalCustomers'), value: b.totalCustomers }, { label: t('ins.retention'), value: b.retentionPct != null ? pct(b.retentionPct) : null }, { label: t('ins.identified'), value: b.identifiedPct != null ? pct(b.identifiedPct) : null }] }];
  },
  'loyalty.points': (b, { t, n, pct, date }) => {
    const series = arr<{ week: string; earned: number; redeemed: number }>(b.series);
    return [{ id: 'loyalty', title: t('ins.b.loyalty.points'), empty: series.length === 0 && num(b.outstanding) === 0,
      facts: [{ label: t('ins.earned'), value: n(b.earned) }, { label: t('ins.redeemed'), value: n(b.redeemed) }, { label: t('ins.redemptionRate'), value: b.redemptionPct != null ? pct(b.redemptionPct) : null }, { label: t('ins.outstandingPoints'), value: n(b.outstanding) }],
      visuals: series.length > 0 ? [{ type: 'bars', cats: series.map((s) => date(s.week)), series: [{ name: t('ins.earned'), values: series.map((s) => num(s.earned)) }, { name: t('ins.redeemed'), values: series.map((s) => num(s.redeemed)) }] }] : [] }];
  },
  'returns.customers': (b, { t, money, pct, date }) => {
    const series = arr<{ week: string; total: number }>(b.series);
    return [{ id: 'creturns', title: t('ins.b.returns.customers'), empty: num(b.count) === 0, emptyText: t('ins.noReturns'),
      facts: [{ label: t('ins.returnsCount'), value: b.count }, { label: t('ins.returnedValue'), value: money(num(b.total)) }, { label: t('ins.returnRate'), value: b.ratePct != null ? pct(b.ratePct) : null }],
      visuals: [...(series.length > 0 ? [{ type: 'bars', cats: series.map((s) => date(s.week)), series: [{ name: t('ins.returnedValue'), values: series.map((s) => num(s.total)) }], money: true } as Visual] : []), rank(arr<{ name: string; total: number }>(b.products).slice(0, 5).map((p) => ({ name: p.name, value: num(p.total) })), true)] }];
  },
  'debts.aging': (b, { t, money, none, v }) => [{ id: 'debts', title: t('ins.b.debts.aging', { who: v('customers') }), hint: t('ins.hint.aging'), empty: num(b.total) === 0, emptyText: t('ins.nothingOwedToYou'),
    facts: [{ label: t('ws.receivables', { who: v('customers') }), value: money(num(b.total)), tone: 'danger' }, { label: t('ins.debtors'), value: b.debtors }],
    visuals: [rank(['d30', 'd60', 'd90', 'd90p'].map((k, i) => ({ name: t(`ins.age.${k}`), value: num(arr<{ value: number }>(b.buckets)[i]?.value) })), true),
      rank(arr<{ name: string; value: number; creditLimit?: number }>(b.top).map((x) => ({ name: none(x.name), value: num(x.value), sub: x.creditLimit ? t('ins.limit', { amount: money(num(x.creditLimit)) }) : undefined })), true)] }],

  // ---- assurance, ordonnances, produits controles (pharmacie)
  'insurance.share': (b, { t, money, pct, date }) => {
    const series = arr<{ week: string; insurer: number; patient: number }>(b.series);
    return [{ id: 'insShare', title: t('ins.b.insurance.share'), empty: num(b.insuredTickets) === 0, emptyText: t('ins.noInsured'),
      facts: [{ label: t('ins.insShare'), value: pct(b.sharePct) }, { label: t('ins.coverageRate'), value: pct(b.coveragePct) }, { label: t('ins.insuredTickets'), value: b.insuredTickets }, { label: t('ins.insurerPart'), value: money(num(b.insurerShare)) }, { label: t('ins.avgCoverage'), value: pct(b.avgCoverage) }],
      visuals: series.length > 0 ? [{ type: 'bars', cats: series.map((s) => date(s.week)), series: [{ name: t('ins.insurerPart'), values: series.map((s) => num(s.insurer)) }, { name: t('ins.patientPart'), values: series.map((s) => num(s.patient)) }], money: true }] : [] }];
  },
  'insurance.receivables': (b, { t, money, n }) => [{ id: 'insRec', title: t('ins.b.insurance.receivables'), hint: t('ins.hint.insAging'), empty: arr(b.insurers).length === 0, emptyText: t('ins.nothingOwedToYou'),
    facts: [{ label: t('ins.openClaims'), value: money(num(b.open)), tone: 'danger' }, { label: t('ins.settledSum'), value: money(num(b.settledInPeriod)) }, { label: t('ins.settleDelay'), value: num(b.settledCount) ? t('ins.daysUnit', { count: n(b.avgSettlementDays) }) : null }],
    visuals: [rank(arr<{ name: string; open: number; n: number }>(b.insurers).map((i) => ({ name: i.name, value: num(i.open), sub: `${i.n}` })), true)] }],
  'prescriptions.mix': (b, { t, money, n, pct, date }) => {
    const series = arr<{ week: string; rx: number; otc: number }>(b.series);
    return [{ id: 'rx', title: t('ins.b.prescriptions.mix'), empty: num(b.rx) + num(b.otc) === 0,
      facts: [{ label: t('ins.rxShare'), value: b.rxPct != null ? pct(b.rxPct) : null }, { label: t('ins.rxCount'), value: n(b.rx) }, { label: t('ins.otcCount'), value: n(b.otc) }, { label: t('ins.rxRevenue'), value: b.rxTotal != null ? money(num(b.rxTotal)) : null }],
      visuals: [...(series.length > 0 ? [{ type: 'bars', cats: series.map((s) => date(s.week)), series: [{ name: t('ins.rx'), values: series.map((s) => num(s.rx)) }, { name: t('ins.otc'), values: series.map((s) => num(s.otc)) }] } as Visual] : []),
        rank(arr<{ name: string; n: number; total?: number }>(b.prescribers).map((p) => ({ name: p.name, value: num(p.n), sub: p.total != null ? money(num(p.total)) : undefined })))] }];
  },
  'controlled.movements': (b, { t, n, date }) => {
    const series = arr<{ day: string; outQty: number; inQty: number }>(b.series);
    return [{ id: 'controlled', title: t('ins.b.controlled.movements'), empty: series.length === 0, emptyText: t('ins.noControlled'),
      facts: [{ label: t('ins.controlledSales'), value: b.controlledSales }, { label: t('ins.noRx'), value: b.withoutPrescription, tone: num(b.withoutPrescription) ? 'danger' : 'ok' }, { label: t('ins.gaps'), value: b.gaps, tone: tone(b.gaps, 'warn') }],
      visuals: [{ type: 'bars', cats: series.map((s) => date(s.day)), series: [{ name: t('ins.out'), values: series.map((s) => num(s.outQty)) }, { name: t('ins.in'), values: series.map((s) => num(s.inQty)) }] },
        rank(arr<{ name: string; outQty: number; balance: number }>(b.products).map((p) => ({ name: p.name, value: num(p.outQty), sub: t('ins.balance', { count: n(p.balance) }) })))] }];
  },

  // ---- caisse, finances, RH
  'cash.differences': (b, { t, money }) => {
    const sess = arr<{ closedAt: string; difference: number }>(b.sessions);
    return [{ id: 'cash', title: t('ins.b.cash.differences'), hint: t('ins.hint.cash'), empty: sess.length === 0, emptyText: t('ins.noSessions'),
      facts: [{ label: t('ins.sessionsClosed'), value: b.closed }, { label: t('ins.withGap'), value: b.withGap, tone: tone(b.withGap, 'warn') }, { label: t('ins.shortage'), value: money(num(b.shortage)), tone: tone(num(b.shortage) < 0, 'danger') }],
      visuals: [{ type: 'bars', cats: sess.map((s) => String(s.closedAt).slice(5, 10).replace('-', '/')), series: [{ name: t('ins.cashGap'), values: sess.map((s) => num(s.difference)) }], money: true }] }];
  },
  'cash.cashiers': (b, { t, money }) => [{ id: 'cashiers', title: t('ins.b.cash.cashiers'), empty: arr(b.items).length === 0,
    visuals: [rank(arr<{ name: string; total: number; tickets: number; average: number }>(b.items).map((i) => ({ name: i.name === '-' ? t('ws.none') : i.name, value: num(i.total), sub: `${i.tickets} · ${money(num(i.average))}` })), true)] }],
  'finance.expenses': (b, { t, money, date }) => {
    const delta = num(b.previousTotal) > 0 ? Math.round(((num(b.total) - num(b.previousTotal)) / num(b.previousTotal)) * 100) : null;
    const weeks = arr<{ week: string; byCategory: Record<string, number> }>(b.weeks);
    const tops: string[] = arr(b.top);
    return [{ id: 'expenses', title: t('ins.b.finance.expenses'), empty: arr(b.categories).length === 0,
      facts: [{ label: t('ins.expensesTotal'), value: money(num(b.total)) }, { label: t('ins.previousPeriod'), value: num(b.previousTotal) > 0 ? money(num(b.previousTotal)) : null }, { label: t('ins.change'), value: delta != null ? `${delta > 0 ? '+' : ''}${delta} %` : null }],
      visuals: [donut(arr<{ name: string; total: number }>(b.categories).map((c) => ({ name: c.name === '-' ? t('ws.none') : c.name, value: num(c.total) })), true, t('dash.total')),
        ...(weeks.length > 0 ? [{ type: 'bars', cats: weeks.map((w) => date(w.week)), series: [...tops, '__other'].map((name) => ({ name: name === '__other' ? t('dash.others') : name, values: weeks.map((w) => num(w.byCategory?.[name])) })).filter((s) => s.values.some((x) => x > 0)), money: true } as Visual] : [])] }];
  },
  'hr.headcount': (b, { t, n, none }) => [{ id: 'headcount', title: t('ins.b.hr.headcount'), empty: num(b.total) === 0,
    visuals: [donut(arr<{ name: string; n: number }>(b.positions).map((p) => ({ name: none(p.name), value: num(p.n) })), false, t('ins.team'))],
    facts: [{ label: t('ins.hired'), value: b.hired }, { label: t('ins.departed'), value: b.left }, { label: t('ins.tenure'), value: t('ins.yearsUnit', { count: n(b.avgTenureYears) }) }, ...arr<{ key: string; n: number }>(b.contracts).map((c) => ({ label: t(`ins.contract.${c.key}`), value: num(c.n) }))] }],
  'hr.payroll': (b, { t, money, pct, month }) => {
    const months = arr<{ month: string; payroll: number; revenue?: number }>(b.months);
    return [{ id: 'payroll', title: t('ins.b.hr.payroll'), empty: num(b.paid6m) === 0 && num(b.remaining) === 0,
      facts: [{ label: t('ins.payroll6m'), value: money(num(b.paid6m)) }, { label: t('ins.payrollRatio'), value: b.ratioPct != null ? pct(b.ratioPct) : null }, { label: t('ins.payrollRemaining'), value: num(b.remaining) > 0 ? money(num(b.remaining)) : null, tone: 'warn' }],
      visuals: [{ type: 'bars', cats: months.map((m) => month(m.month)), series: [{ name: t('ins.step.payroll'), values: months.map((m) => num(m.payroll)) }, ...(b.withSales ? [{ name: t('dash.revenue'), values: months.map((m) => num(m.revenue)) }] : [])], money: true }] }];
  },
  'hr.leave': (b, { t, month }) => {
    const rows = arr<{ month: string; key: string; days: number }>(b.months);
    const types = [...new Set(rows.map((m) => m.key))];
    const months = [...new Set(rows.map((m) => m.month))];
    return [{ id: 'leave', title: t('ins.b.hr.leave'), empty: arr(b.types).length === 0 && rows.length === 0, emptyText: t('ins.noLeave'),
      facts: [{ label: t('ins.onLeaveToday'), value: b.onLeaveToday }, { label: t('ins.pendingLeaves'), value: b.pending, tone: tone(b.pending, 'warn') }],
      visuals: months.length > 0 ? [{ type: 'bars', cats: months.map((m) => month(m)), series: types.map((k) => ({ name: t(`ins.leave.${k}`), values: months.map((m) => num(rows.find((x) => x.month === m && x.key === k)?.days)) })) }] : [] }];
  },
};

// ===================================================================================================================
// affichage
// ===================================================================================================================

const TONE_COLOR = { danger: '#DC2626', warn: '#D97706', ok: '#16A34A' } as const;

export function FactsRow({ facts }: { facts: Fact[] }) {
  const shown = facts.filter((f) => f.value != null && f.value !== '');
  if (shown.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {shown.map((f) => (
        <View key={f.label} style={{ minWidth: 110 }}>
          <ThemedText type="small" themeColor="textSecondary">{f.label}</ThemedText>
          <ThemedText type="smallBold" style={f.tone ? { color: TONE_COLOR[f.tone] } : undefined}>{String(f.value)}</ThemedText>
        </View>
      ))}
    </View>
  );
}

export function VisualView({ v, palette, money, num, gaugeText }: { v: Visual; palette: readonly string[]; money: (n: number) => string; num: (n: number) => string; gaugeText: (n: number) => string }): ReactNode {
  const fmt = (m?: boolean) => (m ? money : num);
  if (v.type === 'donut') return v.items.length === 0 ? null : <Donut slices={v.items.map((i) => ({ key: i.name, label: i.name, value: i.value }))} format={fmt(v.money)} centerLabel={v.center} />;
  if (v.type === 'rank') return v.items.length === 0 ? null : <RankBars items={v.items.map((i) => ({ key: i.name, label: i.name, value: i.value, sub: i.sub }))} format={fmt(v.money)} />;
  if (v.type === 'bars') {
    const series = v.series.map((s, i) => ({ key: s.name, label: s.name, color: palette[i % palette.length], values: s.values }));
    return v.cats.length === 0 ? null : (
      <View style={{ gap: 6 }}>
        {series.length === 1 ? <BarChart values={series[0].values} labels={v.cats} color={series[0].color} format={fmt(v.money)} /> : <GroupedBars series={series} labels={v.cats} format={fmt(v.money)} />}
        {series.length > 1 ? <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} /> : null}
      </View>
    );
  }
  if (v.type === 'area') {
    const series = v.series.map((s, i) => ({ key: s.name, label: s.name, color: palette[i % palette.length], values: s.values }));
    return v.cats.length === 0 ? null : (
      <View style={{ gap: 6 }}>
        <AreaChart series={series} labels={v.cats} format={fmt(v.money)} />
        <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      </View>
    );
  }
  if (v.type === 'table') {
    if (v.rows.length === 0) return null;
    return (
      <View style={{ gap: 4 }}>
        <ThemedText type="smallBold">{v.head[0]}</ThemedText>
        {v.rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
            <ThemedText type="small" style={{ flex: 1 }}>{r[0]}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ flexShrink: 0, textAlign: 'right' }}>{r.slice(1).filter(Boolean).join(' · ')}</ThemedText>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: 2 }}>
      <ThemedText type="small" themeColor="textSecondary">{v.label}</ThemedText>
      <ThemedText type="smallBold" style={{ fontSize: 22 }}>{gaugeText(v.value)}</ThemedText>
    </View>
  );
}
