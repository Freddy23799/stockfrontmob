import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Chips, Input, Switch } from '@/components/ui';
import { useT } from '@/i18n';
import { API, DEFECTS, type Checks, type LaborLine, type Service } from '@/lib/electronics';
import { num, uuid } from '@/lib/format';
import { useShop } from '@/lib/shop';

export type EditLine = { key: string; name: string; price: string; warrantyDays?: number | null };
export const toEdit = (l: LaborLine): EditLine => ({ key: uuid(), name: l.name, price: String(num(l.price)), warrantyDays: l.warrantyDays ?? null });
export const linesPayload = (lines: EditLine[]) => lines.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), price: num(l.price), warrantyDays: l.warrantyDays ?? undefined }));
export const linesTotal = (lines: EditLine[]) => lines.reduce((s, l) => s + num(l.price), 0);

/** Fiche d'etat a la reception : constats a cocher, appareil qui s'allume ou non, risque de perte de donnees. */
export function IntakeChecks({ value, onChange }: { value: Checks; onChange: (v: Checks) => void }) {
  const { t } = useT();
  const defects = value.defects ?? [];
  const toggle = (c: string) => onChange({ ...value, defects: defects.includes(c) ? defects.filter((x) => x !== c) : [...defects, c] });
  const power = value.powersOn === true ? 'on' : value.powersOn === false ? 'off' : '';
  const setPower = (v: string) => { const next = { ...value }; if (v === 'on') next.powersOn = true; else if (v === 'off') next.powersOn = false; else delete next.powersOn; onChange(next); };
  return (
    <View style={{ gap: 8 }}>
      <ThemedText type="smallBold">{t('el.intakeTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{t('el.checksHint')}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {DEFECTS.map((c) => <Btn key={c} small variant={defects.includes(c) ? 'primary' : 'secondary'} title={t(`el.chk.${c}`)} onPress={() => toggle(c)} />)}
      </View>
      <Chips scroll={false} value={power} onChange={setPower} options={[{ value: '', label: t('el.poweredUnknown') }, { value: 'on', label: t('el.poweredOn') }, { value: 'off', label: t('el.poweredOff') }]} />
      <Switch value={value.dataRisk === true} onChange={(v) => onChange({ ...value, dataRisk: v })} label={t('el.dataRisk')} />
    </View>
  );
}

/** Lignes de main d'oeuvre : prestations du tarif (copiees avec leur prix) ou lignes libres. */
export function LaborEditor({ lines, onChange }: { lines: EditLine[]; onChange: (l: EditLine[]) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [tariff, setTariff] = useState<Service[]>([]);
  const [pick, setPick] = useState(false);
  useEffect(() => {
    if (!shop.can('REPAIRS', 'view')) return;
    shop.call<Service[]>(`${API}/repair-services?activeOnly=true`).then((r) => setTariff(Array.isArray(r) ? r : [])).catch(() => setTariff([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (key: string, c: Partial<EditLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...c } : l)));
  return (
    <View style={{ gap: 8 }}>
      <ThemedText type="smallBold">{t('el.laborLines')}</ThemedText>
      {lines.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('el.noLabor')}</ThemedText> : null}
      {lines.map((l) => (
        <View key={l.key} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Input value={l.name} maxLength={120} placeholder={t('el.lineName')} onChangeText={(v) => patch(l.key, { name: v })} /></View>
          <View style={{ width: 96 }}><Input keyboardType="decimal-pad" value={l.price} accessibilityLabel={t('el.linePrice')} onChangeText={(v) => patch(l.key, { price: v.replace(',', '.').replace(/[^0-9.]/g, '') })} /></View>
          <Btn small variant="ghost" icon="xmark" title="" onPress={() => onChange(lines.filter((x) => x.key !== l.key))} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {tariff.length > 0 ? <Btn small variant="secondary" icon="tag" title={t('el.addFromTariff')} onPress={() => setPick(!pick)} /> : null}
        <Btn small variant="secondary" icon="plus" title={t('el.addFreeLine')} onPress={() => onChange([...lines, { key: uuid(), name: '', price: '0', warrantyDays: null }])} />
      </View>
      {pick ? (
        <View style={{ gap: 6 }}>
          {tariff.map((s) => (
            <Btn key={s.id} small variant="secondary" title={`${[s.name, s.brand].filter(Boolean).join(' · ')} — ${shop.money(s.laborPrice)}`}
              onPress={() => { onChange([...lines, { key: uuid(), name: s.brand ? `${s.name} (${s.brand})` : s.name, price: String(num(s.laborPrice)), warrantyDays: s.warrantyDays ?? null }]); setPick(false); }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
