import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CountryPicker, { type Country, type CountryCode as PickerCountryCode } from 'react-native-country-picker-modal';
import { parsePhoneNumberFromString, type CountryCode as PhoneCountryCode } from 'libphonenumber-js';

import { Button, TextField } from '@/components/form';
import { fontFor, ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const HEARD = ['FRIEND', 'SOCIAL', 'SEARCH', 'AD', 'OTHER'] as const;

const phoneCountry = (country: PickerCountryCode) => country as PhoneCountryCode;
const pickerLanguage = (lang: string) => (lang === 'fr' ? 'fra' : lang === 'es' ? 'spa' : 'common');

/** Etape "Parlez-nous un peu de vous", juste apres la creation du compte (surtout avec Google). */
export default function ProfileSetupScreen() {
  const { t, lang } = useT();
  const theme = useTheme();
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(typeof profile?.phone === 'string' ? profile.phone : '');
  const [country, setCountry] = useState<PickerCountryCode>(() => {
    const saved = typeof profile?.country === 'string' ? profile.country.toUpperCase() : 'CM';
    return saved as PickerCountryCode;
  });
  const [city, setCity] = useState('');
  const [heardFrom, setHeardFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPhone = useMemo(() => parsePhoneNumberFromString(phone, phoneCountry(country)), [country, phone]);
  const validPhone = Boolean(parsedPhone?.isValid());
  const valid = fullName.trim().length >= 2 && validPhone && city.trim().length >= 2;

  function selectCountry(selected: Country) {
    setCountry(selected.cca2);
  }

  function normalizePhone() {
    if (parsedPhone?.isPossible()) setPhone(parsedPhone.formatInternational());
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api('/api/merchant/profile', { method: 'PUT', body: { fullName: fullName.trim(), phone: parsedPhone?.number, country, city: city.trim(), heardFrom: heardFrom ?? undefined } });
      await refreshProfile(); // le garde de routes ouvre alors l'espace marchand
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">{t('profile.title')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('profile.subtitle')}</ThemedText>

            <TextField label={t('profile.fullName')} value={fullName} onChangeText={setFullName} autoCapitalize="words" textContentType="name" />

            <View style={styles.field}>
              <ThemedText type="smallBold">{t('profile.country')}</ThemedText>
              <View style={[styles.select, { backgroundColor: theme.backgroundElement }]}>
                <CountryPicker
                  countryCode={country}
                  translation={pickerLanguage(lang)}
                  withFilter
                  withFlag
                  withEmoji
                  withCallingCode
                  withCallingCodeButton
                  withCountryNameButton
                  preferredCountries={['CM', 'SN', 'CI', 'GA', 'CD', 'CG', 'NG', 'FR']}
                  onSelect={selectCountry}
                  containerButtonStyle={styles.countryButton}
                />
              </View>
            </View>

            <TextField label={t('profile.city')} value={city} onChangeText={setCity} autoCapitalize="words" textContentType="addressCity" />

            <View style={styles.field}>
              <ThemedText type="smallBold">{t('profile.phone')}</ThemedText>
              <View style={styles.phoneRow}>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  onBlur={normalizePhone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  accessibilityLabel={t('profile.phone')}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.phoneInput, { backgroundColor: theme.backgroundElement, color: theme.text, fontFamily: fontFor(500) }]}
                />
              </View>
              {phone.length > 0 && !validPhone ? <ThemedText type="small" themeColor="danger">{t('profile.phoneInvalid')}</ThemedText> : null}
              <ThemedText type="small" themeColor="textSecondary">{t('profile.phoneHint')}</ThemedText>
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">{t('profile.heard')} ({t('common.optional')})</ThemedText>
              <View style={styles.chips}>
                {HEARD.map((h) => {
                  const on = heardFrom === h;
                  return (
                    <Pressable key={h} onPress={() => setHeardFrom(on ? null : h)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                      style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundElement }]}>
                      <ThemedText type="small" style={{ color: on ? theme.primaryText : theme.text }}>{t(`profile.heard.${h}`)}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
            <Button title={t('profile.submit')} loading={busy} disabled={!valid} onPress={submit} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, flexGrow: 1 },
  field: { gap: Spacing.one },
  select: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: 12 },
  countryButton: { width: '100%', justifyContent: 'space-between' },
  phoneRow: { flexDirection: 'row' },
  phoneInput: { flex: 1, borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: 14, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
});
