import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ChartColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export const usePalette = () => ChartColors[useColorScheme()];

const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n)));
export { compact };

/** Courbe lissee passant par les points (Catmull-Rom -> Bezier). */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function Sparkline({ values, color, width = 90, height = 34 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 4 - ((v - min) / span) * (height - 8)] as [number, number]);
  const line = smooth(pts);
  return (
    <Svg width={width} height={height}>
      <Defs><LinearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.35} /><Stop offset="1" stopColor={color} stopOpacity={0} /></LinearGradient></Defs>
      <Path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#sp)" />
      <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/** Indicateur : valeur, variation vs periode precedente, mini-courbe. */
export function Kpi({ icon, label, value, delta, hint, spark, color }: { icon: string; label: string; value: string; delta?: number | null; hint?: string; spark?: number[]; color: string }) {
  const th = useTheme();
  const up = (delta ?? 0) >= 0;
  return (
    <View style={[st.kpi, { backgroundColor: th.backgroundElement }]}>
      <View style={st.kpiTop}>
        <View style={[st.kpiIcon, { backgroundColor: color + '26' }]}><Icon name={icon} size={14} color={color} /></View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={{ flex: 1, fontSize: 13, lineHeight: 16 }}>{label}</ThemedText>
      </View>
      <ThemedText style={[st.kpiValue, { fontSize: value.length > 12 ? 17 : value.length > 9 ? 20 : 23 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</ThemedText>
      <View style={st.kpiBottom}>
        {delta != null ? (
          <ThemedText type="smallBold" style={{ color: up ? th.success : th.danger, fontSize: 12, flex: 1 }} numberOfLines={1}>{up ? '▲' : '▼'} {Math.abs(delta)} %</ThemedText>
        ) : <View style={{ flex: 1 }} />}
        {spark ? <Sparkline values={spark} color={color} width={72} height={28} /> : null}
      </View>
      {hint ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 15 }} numberOfLines={1}>{hint}</ThemedText> : null}
    </View>
  );
}

export type Series = { key: string; label: string; color: string; values: number[] };

/** Courbes en aire, toucher pour lire une valeur. */
export function AreaChart({ series, labels, format, height = 190 }: { series: Series[]; labels: string[]; format: (n: number) => string; height?: number }) {
  const th = useTheme();
  const [w, setW] = useState(320);
  const [sel, setSel] = useState<number | null>(null);
  const n = labels.length;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const innerW = w - pad.l - pad.r, innerH = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const paths = useMemo(() => series.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
    const line = smooth(pts);
    return { s, line, area: `${line} L${x(n - 1)},${pad.t + innerH} L${x(0)},${pad.t + innerH} Z` };
  }), [series, w, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = [0, 0.5, 1];
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 54))));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Pressable onPress={(e) => { const i = Math.round(((e.nativeEvent.locationX - pad.l) / innerW) * (n - 1)); setSel(Math.min(n - 1, Math.max(0, i))); }}>
        <Svg width={w} height={height}>
          <Defs>{series.map((s) => <LinearGradient key={s.key} id={`g${s.key}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={s.color} stopOpacity={0.3} /><Stop offset="1" stopColor={s.color} stopOpacity={0} /></LinearGradient>)}</Defs>
          {ticks.map((tk) => (
            <G key={tk}>
              <Line x1={pad.l} x2={w - pad.r} y1={y(max * tk)} y2={y(max * tk)} stroke={th.progressTrack} strokeWidth={1} strokeDasharray="3 4" />
              <SvgText x={pad.l - 6} y={y(max * tk) + 4} fontSize={10} fontFamily="PlusJakartaSans_500Medium" fill={th.textSecondary} textAnchor="end">{compact(max * tk)}</SvgText>
            </G>
          ))}
          {paths.map(({ s, line, area }) => (
            <G key={s.key}><Path d={area} fill={`url(#g${s.key})`} /><Path d={line} stroke={s.color} strokeWidth={2.4} fill="none" strokeLinecap="round" /></G>
          ))}
          {labels.map((l, i) => (i % step === 0 || i === n - 1) && i !== n - 2 ? <SvgText key={i} x={x(i)} y={height - 6} fontSize={10} fontFamily="PlusJakartaSans_500Medium" fill={th.textSecondary} textAnchor="middle">{l}</SvgText> : null)}
          {sel != null ? (
            <G>
              <Line x1={x(sel)} x2={x(sel)} y1={pad.t} y2={pad.t + innerH} stroke={th.textSecondary} strokeWidth={1} />
              {series.map((s) => <Circle key={s.key} cx={x(sel)} cy={y(s.values[sel])} r={4.5} fill={s.color} stroke={th.background} strokeWidth={2} />)}
            </G>
          ) : null}
        </Svg>
      </Pressable>
      {sel != null ? (
        <View style={[st.tip, { backgroundColor: th.background, borderColor: th.progressTrack }]}>
          <ThemedText type="smallBold" style={{ fontSize: 12 }}>{labels[sel]}</ThemedText>
          {series.map((s) => <ThemedText key={s.key} type="small" style={{ fontSize: 12, color: s.color }}>{s.label} · {format(s.values[sel])}</ThemedText>)}
        </View>
      ) : null}
    </View>
  );
}

export type Slice = { key: string; label: string; value: number };

/** Anneau + legende lisible (valeur et pourcentage). */
export function Donut({ slices, format, centerLabel, size = 150 }: { slices: Slice[]; format: (n: number) => string; centerLabel?: string; size?: number }) {
  const th = useTheme();
  const palette = usePalette();
  const total = slices.reduce((a, b) => a + b.value, 0) || 1;
  const r = size / 2 - 12, c = 2 * Math.PI * r;
  const starts = slices.reduce<number[]>((acc, s, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + (slices[i - 1].value / total) * c); return acc; }, []);
  return (
    <View style={st.donutWrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={th.progressTrack} strokeWidth={16} fill="none" />
            {slices.map((s, i) => {
              const len = (s.value / total) * c;
              return <Circle key={s.key} cx={size / 2} cy={size / 2} r={r} stroke={palette[i % palette.length]} strokeWidth={16} fill="none" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={c / 4 - starts[i]} strokeLinecap="butt" />;
            })}
          </G>
        </Svg>
        <View style={st.donutCenter} pointerEvents="none">
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>{centerLabel}</ThemedText>
          <ThemedText type="smallBold" style={{ fontSize: 15 }} numberOfLines={1}>{compact(total)}</ThemedText>
        </View>
      </View>
      <View style={st.legend}>
        {slices.map((s, i) => (
          <View key={s.key} style={st.legendRow}>
            <View style={[st.dot, { backgroundColor: palette[i % palette.length] }]} />
            <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>{s.label}</ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 13 }}>{Math.round((s.value / total) * 100)} %</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

export function BarChart({ values, labels, color, format, height = 150 }: { values: number[]; labels: string[]; color: string; format: (n: number) => string; height?: number }) {
  const th = useTheme();
  const [w, setW] = useState(320);
  const [sel, setSel] = useState<number | null>(null);
  const n = values.length, max = Math.max(1, ...values);
  const gap = 6, bw = Math.max(4, (w - gap * (n - 1)) / n), H = height - 22;
  const step = Math.max(1, Math.ceil(n / Math.floor(w / 36)));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Pressable onPress={(e) => setSel(Math.min(n - 1, Math.max(0, Math.floor(e.nativeEvent.locationX / (bw + gap)))))}>
      <Svg width={w} height={height}>
        {values.map((v, i) => {
          const h = Math.max(3, (v / max) * H);
          return (
            <G key={i}>
              <Rect x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={Math.min(6, bw / 2)} fill={color} opacity={sel == null || sel === i ? 1 : 0.4} />
              {i % step === 0 ? <SvgText x={i * (bw + gap) + bw / 2} y={height - 5} fontSize={10} fontFamily="PlusJakartaSans_500Medium" fill={th.textSecondary} textAnchor="middle">{labels[i]}</SvgText> : null}
            </G>
          );
        })}
      </Svg>
      </Pressable>
      {sel != null ? <ThemedText type="smallBold" style={{ textAlign: 'center', fontSize: 13 }}>{labels[sel]} · {format(values[sel])}</ThemedText> : null}
    </View>
  );
}

export function RankBars({ items, format }: { items: { key: string; label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const th = useTheme();
  const palette = usePalette();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={{ gap: 12 }}>
      {items.map((it, i) => (
        <View key={it.key} style={{ gap: 5 }}>
          <View style={st.rankHead}>
            <ThemedText type="smallBold" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{i + 1}. {it.label}</ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 14 }}>{format(it.value)}</ThemedText>
          </View>
          <View style={[st.track, { backgroundColor: th.progressTrack }]}><View style={[st.fill, { width: `${Math.max(3, (it.value / max) * 100)}%`, backgroundColor: palette[i % palette.length] }]} /></View>
          {it.sub ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{it.sub}</ThemedText> : null}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  kpi: { borderRadius: 20, padding: 14, gap: 6, minHeight: 112 },
  kpiTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kpiIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { lineHeight: 28, fontWeight: '800' },
  kpiBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  donutWrap: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  legend: { flex: 1, minWidth: 140, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rankHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});

/** Barres groupees : plusieurs series cote a cote pour chaque categorie (ex. marge / depenses / paie par mois). */
export function GroupedBars({ series, labels, format, height = 200 }: { series: Series[]; labels: string[]; format: (n: number) => string; height?: number }) {
  const th = useTheme();
  const [w, setW] = useState(320);
  const [sel, setSel] = useState<number | null>(null);
  const n = labels.length, k = series.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const pad = { l: 34, r: 4, t: 8, b: 22 };
  const innerW = w - pad.l - pad.r, H = height - pad.t - pad.b;
  const group = innerW / n, bw = Math.max(2, Math.min(14, (group - 6) / k));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Pressable onPress={(e) => setSel(Math.min(n - 1, Math.max(0, Math.floor((e.nativeEvent.locationX - pad.l) / group))))}>
      <Svg width={w} height={height}>
        {[0, 0.5, 1].map((tk) => (
          <G key={tk}>
            <Line x1={pad.l} x2={w - pad.r} y1={pad.t + H - H * tk} y2={pad.t + H - H * tk} stroke={th.progressTrack} strokeWidth={1} strokeDasharray="3 4" />
            <SvgText x={pad.l - 5} y={pad.t + H - H * tk + 4} fontSize={10} fontFamily="PlusJakartaSans_500Medium" fill={th.textSecondary} textAnchor="end">{compact(max * tk)}</SvgText>
          </G>
        ))}
        {labels.map((l, i) => {
          const x0 = pad.l + i * group + (group - bw * k) / 2;
          return (
            <G key={i}>
              {series.map((s, j) => {
                const h = Math.max(1, (s.values[i] / max) * H);
                return <Rect key={s.key} x={x0 + j * bw} y={pad.t + H - h} width={Math.max(2, bw - 1)} height={h} rx={2} fill={s.color} opacity={sel == null || sel === i ? 1 : 0.4} />;
              })}
              {(n <= 8 || i % 2 === 0) ? <SvgText x={pad.l + i * group + group / 2} y={height - 6} fontSize={10} fontFamily="PlusJakartaSans_500Medium" fill={th.textSecondary} textAnchor="middle">{l}</SvgText> : null}
            </G>
          );
        })}
      </Svg>
      </Pressable>
      {sel != null ? (
        <View style={[st.tip, { backgroundColor: th.background, borderColor: th.progressTrack }]}>
          <ThemedText type="smallBold" style={{ fontSize: 12 }}>{labels[sel]}</ThemedText>
          {series.map((s) => <ThemedText key={s.key} type="small" style={{ fontSize: 12, color: s.color }}>{s.label} · {format(s.values[sel])}</ThemedText>)}
        </View>
      ) : null}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map((i) => <View key={i.label} style={st.legendRow}><View style={[st.dot, { backgroundColor: i.color }]} /><ThemedText type="small" style={{ fontSize: 12 }}>{i.label}</ThemedText></View>)}
    </View>
  );
}
