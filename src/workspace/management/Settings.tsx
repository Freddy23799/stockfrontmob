import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { TimeField } from '@/components/date-field';
import { DynamicFields, SelectField } from '@/components/dynamic-fields';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Chips, Empty, ErrorNote, Hint, Row, Screen, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { OfflineAdvice } from '@/components/offline-advice';
import { HelpRows } from '@/components/help-rows';
import { NotificationPreferences, NotificationsRow } from '@/components/notif';
import { useT } from '@/i18n';
import { LANGUAGES } from '@/i18n/dictionaries';
import { ApiError } from '@/lib/api';
import { uuid, type Image as Img } from '@/lib/format';
import { useGo } from '@/lib/nav';
import { appendPhoto, pickPhoto } from '@/lib/photo';
import { useShop } from '@/lib/shop';
import { useThemePref, type ThemePref } from '@/lib/theme';

const COUNTRIES = ['CM', 'SN', 'CI', 'GA', 'CG', 'CD', 'BJ', 'TG', 'BF', 'ML', 'NE', 'TD', 'CF', 'GQ', 'NG', 'GH', 'MA', 'DZ', 'TN', 'FR', 'ES', 'US'];
const TIMEZONES = ['Africa/Douala', 'Africa/Dakar', 'Africa/Abidjan', 'Africa/Libreville', 'Africa/Brazzaville', 'Africa/Kinshasa', 'Africa/Lagos', 'Africa/Accra', 'Africa/Casablanca', 'Africa/Algiers', 'Africa/Tunis', 'Europe/Paris', 'Europe/Madrid'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NETWORKS: [string, string][] = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn']];
const DEFAULT_DAY = { open: '08:00', close: '19:00' };
type Day = { open: string; close: string } | null;
type Form = Record<string, any> & { name: string; openingHours: Record<string, Day>; socialLinks: Record<string, string> };

/** Reglages de la boutique : identite, contact, adresse, horaires, documents, reglages du metier et preferences de l'appareil. */
export default function Settings() {
  const { t, lang, setLang } = useT();
  const shop = useShop();
  const go = useGo();
  const toast = useToast();
  const th = useTheme();
  const { pref, setPref } = useThemePref();
  const base = `/api/merchant/shops/${shop.shopId}`;
  const configDefs = (shop.ws.manifest as any).configFields?.filter((d: any) => !d.feature || shop.has(d.feature)) ?? [];
  const [config, setConfig] = useState<Record<string, any>>(() => Object.fromEntries(configDefs.map((d: any) => [d.key, shop.config[d.key] ?? (d.type === 'boolean' ? false : '')])));
  const [form, setForm] = useState<Form | null>(null);
  const [logo, setLogo] = useState<Img | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const regionNames = new Intl.DisplayNames(lang, { type: 'region' });
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : t('common.network'));

  useEffect(() => {
    shop.call<{ settings: Form; logo: Img | null }>(`${base}/settings`).then((v) => { setForm({ ...v.settings, openingHours: v.settings.openingHours ?? {}, socialLinks: v.settings.socialLinks ?? {} }); setLogo(v.logo); }).catch((e) => setError(msg(e)));
  }, [shop.shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shop.owner) return <Screen title={t('settings.title')}><Empty icon="lock" title={t('ws.noAccess')} text={t('ws.noAccessText')} /></Screen>;
  if (!form) return <Screen title={t('settings.title')}>{error ? <ErrorNote message={error} /> : <Skeleton rows={4} height={100} />}</Screen>;

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f!, [k]: v }));
  const setSocial = (k: string) => (v: string) => setForm((f) => ({ ...f!, socialLinks: { ...f!.socialLinks, [k]: v } }));
  const setDay = (d: string, v: Day) => setForm((f) => ({ ...f!, openingHours: { ...f!.openingHours, [d]: v } }));
  const copyMonday = () => setForm((f) => { const monday = f!.openingHours.mon ?? DEFAULT_DAY; return { ...f!, openingHours: Object.fromEntries(DAYS.map((d) => [d, d === 'sun' ? f!.openingHours.sun ?? null : monday])) }; });
  const text = (k: string, label: string, props: object = {}) => <TextBox label={label} value={form[k] ?? ''} onChangeText={set(k)} {...props} />;

  async function save() {
    setBusy(true); setError(null);
    try {
      const payload = { ...form, socialLinks: Object.fromEntries(Object.entries(form!.socialLinks).filter(([, v]) => v && String(v).trim())) };
      const v = await shop.call<{ settings: Form; logo: Img | null }>(`${base}/settings`, { method: 'PUT', body: payload });
      if (configDefs.length > 0) await shop.call(`${base}/config`, { method: 'PUT', body: Object.fromEntries(Object.entries(config).filter(([, val]) => val !== '')) });
      setForm({ ...v.settings, openingHours: v.settings.openingHours ?? {}, socialLinks: v.settings.socialLinks ?? {} });
      setLogo(v.logo);
      await shop.refresh();
      toast(t('settings.saved'));
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  async function changeLogo() {
    setLogoBusy(true); setError(null);
    try {
      const photo = await pickPhoto('library');
      if (!photo) return;
      const body = new FormData();
      await appendPhoto(body, 'file', photo);
      body.append('id', uuid());
      const v = await shop.call<{ logo: Img | null }>(`${base}/settings/logo`, { method: 'POST', body });
      setLogo(v.logo);
      await shop.refresh();
    } catch (e) { setError(msg(e)); } finally { setLogoBusy(false); }
  }
  async function removeLogo() {
    setLogoBusy(true);
    try { const v = await shop.call<{ logo: Img | null }>(`${base}/settings/logo`, { method: 'DELETE' }); setLogo(v.logo); await shop.refresh(); } catch (e) { setError(msg(e)); } finally { setLogoBusy(false); }
  }
  const logoUrl = logo ? (logo.variants.sm ?? Object.values(logo.variants)[0]).webp : null;
  const themes: ThemePref[] = ['system', 'light', 'dark'];

  return (
    <Screen title={t('settings.title')} subtitle={t('settings.subtitle')} keyboard
      footer={<Btn icon="check" title={busy ? t('settings.saving') : t('settings.save')} loading={busy} disabled={busy || form.name.trim().length < 2} onPress={save} />}>
      <NotificationsRow shopId={shop.shopId} />
      <HelpRows shopId={shop.shopId} />
      <OfflineAdvice kind="needsNetwork" />
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('settings.identity')}</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 80, height: 80, borderRadius: 22, backgroundColor: th.backgroundSelected, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logoUrl ? <Image source={{ uri: logoUrl }} style={{ width: 80, height: 80 }} contentFit="cover" /> : <Icon name="store" size={30} color={th.primary} />}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <ThemedText type="smallBold">{t('settings.logo')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{logoBusy ? t('settings.logo.busy') : t('settings.logo.hint')}</ThemedText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small variant="secondary" icon="camera" title={logo ? t('settings.logo.change') : t('settings.logo.add')} disabled={logoBusy} onPress={changeLogo} />
              {logo ? <Btn small variant="ghost" icon="trash" title="" disabled={logoBusy} onPress={removeLogo} /> : null}
            </View>
          </View>
        </View>
        {text('name', t('settings.name'), { maxLength: 100, autoCapitalize: 'words' })}
        {text('legalName', t('settings.legalName'), { maxLength: 150, autoCapitalize: 'words' })}
        {text('slogan', t('settings.slogan'), { maxLength: 160, autoCapitalize: 'sentences' })}
        {text('description', t('settings.description'), { maxLength: 1000, multiline: true, autoCapitalize: 'sentences' })}
      </Card>

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('settings.contact')}</ThemedText>
        {text('phone', t('settings.phone'), { keyboardType: 'phone-pad' })}
        {text('whatsapp', t('settings.whatsapp'), { keyboardType: 'phone-pad' })}
        <ThemedText type="small" themeColor="textSecondary">{t('settings.phoneHint')}</ThemedText>
        {text('email', t('settings.email'), { keyboardType: 'email-address' })}
        {text('website', t('settings.website'), { keyboardType: 'url', placeholder: 'https://' })}
        {NETWORKS.map(([k, label]) => <TextBox key={k} label={label} value={form.socialLinks[k] ?? ''} onChangeText={setSocial(k)} keyboardType="url" placeholder="https://" />)}
      </Card>

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('settings.location')}</ThemedText>
        <SelectField required label={t('settings.country')} value={form.country ?? ''} onChange={set('country')} options={COUNTRIES.map((c) => ({ value: c, label: regionNames.of(c) ?? c }))} />
        {text('city', t('settings.city'), { autoCapitalize: 'words' })}
        {text('neighborhood', t('settings.neighborhood'), { autoCapitalize: 'words' })}
        {text('address', t('settings.address'), { autoCapitalize: 'sentences' })}
      </Card>

      <Card style={{ gap: 10 }}>
        <ThemedText type="smallBold">{t('settings.hours')}</ThemedText>
        {DAYS.map((d) => {
          const v = form.openingHours[d];
          return (
            <View key={d} style={{ gap: 6 }}>
              <Switch value={Boolean(v)} onChange={(on) => setDay(d, on ? DEFAULT_DAY : null)} label={t(`day.${d}`)} hint={v ? undefined : t('settings.hours.closed')} />
              {v ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TimeField label={`${t(`day.${d}`)} — ${t('settings.hours.from')}`} value={v.open} onChange={(o) => setDay(d, { ...v, open: o })} />
                  <ThemedText type="small">–</ThemedText>
                  <TimeField label={`${t(`day.${d}`)} — ${t('settings.hours.to')}`} value={v.close} onChange={(c) => setDay(d, { ...v, close: c })} />
                </View>
              ) : null}
            </View>
          );
        })}
        <Btn small variant="ghost" icon="clock" title={t('settings.hours.apply')} onPress={copyMonday} />
      </Card>

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('settings.documents')}</ThemedText>
        <SelectField required label={t('settings.language')} value={form.language ?? 'fr'} onChange={set('language')} options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} />
        <SelectField required label={t('settings.timezone')} value={form.timezone ?? ''} onChange={set('timezone')} options={(TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map((z) => ({ value: z, label: String(z).replace('_', ' ') }))} />
        {text('taxId', t('settings.taxId'), { maxLength: 50 })}
        {text('registrationNo', t('settings.registrationNo'), { maxLength: 50 })}
        {text('receiptFooter', t('settings.receiptFooter'), { maxLength: 300, placeholder: t('settings.receiptFooterHint'), autoCapitalize: 'sentences' })}
        <TextBox label={t('settings.currency')} value={form.currency ?? ''} editable={false} hint={t('settings.currencyHint')} />
      </Card>

      {configDefs.length > 0 ? (
        <Card style={{ gap: 12 }}>
          <ThemedText type="smallBold">{t('settings.config')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{t('settings.configHint')}</ThemedText>
          <DynamicFields defs={configDefs} groups={shop.ws.manifest.groups} values={config} onChange={setConfig} />
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('notif.prefs.title')}</ThemedText>
        <NotificationPreferences />
      </Card>

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('settings.preferences')}</ThemedText>
        <View style={{ gap: 6 }}><ThemedText type="small">{t('settings.pref.language')}</ThemedText><Chips scroll={false} value={lang} onChange={(l) => setLang(l as 'fr' | 'en' | 'es')} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} /></View>
        <View style={{ gap: 6 }}><ThemedText type="small">{t('settings.pref.theme')}</ThemedText><Chips scroll={false} value={pref} onChange={(v) => setPref(v as ThemePref)} options={themes.map((p) => ({ value: p, label: t(`theme.${p}`) }))} /></View>
        <ThemedText type="small" themeColor="textSecondary">{t('settings.pref.hint')}</ThemedText>
      </Card>
      <Row icon="download" tone="info" title={t('dl.nav')} subtitle={t('dl.menuText')} onPress={() => go.to('downloads')} />
      <Pressable accessibilityElementsHidden style={{ height: 0 }} />
    </Screen>
  );
}
