import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Captcha from '@/components/captcha';
import { Button, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useCaptchaConfig } from '@/lib/captcha';

/** « Mot de passe oublié » du propriétaire : 1) un code à 6 chiffres arrive par e-mail, 2) on le saisit avec le nouveau mot de passe. */
export default function ForgotPasswordScreen() {
  const { t } = useT();
  const params = useLocalSearchParams<{ identifier?: string }>();
  const [step, setStep] = useState<'ask' | 'code' | 'done'>('ask');
  const [identifier, setIdentifier] = useState(params.identifier ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaCfg = useCaptchaConfig();
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const showCaptcha = Boolean(captchaCfg?.enabled) && needCaptcha && step === 'ask';
  const message = (e: unknown) => (e instanceof ApiError ? e.message : t('common.network'));

  async function ask() {
    setBusy(true); setError(null);
    try {
      await api('/api/auth/password/forgot', { method: 'POST', auth: false, body: { identifier: identifier.trim(), captchaToken } });
      setStep('code');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CAPTCHA_REQUIRED') setNeedCaptcha(true);
      setError(message(e));
    } finally { setBusy(false); setCaptchaToken(null); setCaptchaKey((k) => k + 1); }
  }

  async function reset() {
    setBusy(true); setError(null);
    try {
      await api('/api/auth/password/reset', { method: 'POST', auth: false, body: { identifier: identifier.trim(), code, newPassword: password } });
      setStep('done');
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  const mismatch = again.length > 0 && again !== password;
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">{t('rec.title')}</ThemedText>
            {step === 'done' ? (
              <>
                <ThemedText>{t('rec.done')}</ThemedText>
                <Link href="/login" replace style={styles.link}><ThemedText type="linkPrimary">{t('rec.back')}</ThemedText></Link>
              </>
            ) : (
              <>
                <ThemedText themeColor="textSecondary">{step === 'ask' ? t('rec.intro') : t('rec.sent')}</ThemedText>
                <TextField label={t('login.identifier')} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoComplete="username" editable={step === 'ask'} />
                {step === 'code' ? (
                  <>
                    <TextField label={t('rec.code')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} placeholder="123456" />
                    <TextField label={t('rec.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
                    <TextField label={t('rec.again')} value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" />
                    {mismatch ? <ThemedText themeColor="danger" type="small">{t('rec.mismatch')}</ThemedText> : null}
                  </>
                ) : null}
                {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
                {step === 'ask' ? (
                  <>
                    {showCaptcha && captchaCfg ? <Captcha siteKey={captchaCfg.siteKey} onToken={setCaptchaToken} resetKey={captchaKey} /> : null}
                    <Button title={t('rec.send')} loading={busy} disabled={identifier.trim().length < 3 || (showCaptcha && !captchaToken)} onPress={ask} />
                  </>
                ) : (
                  <>
                    <Button title={t('rec.change')} loading={busy} disabled={code.length !== 6 || password.length < 8 || password !== again} onPress={reset} />
                    <Button title={t('rec.resend')} variant="secondary" disabled={busy} onPress={ask} />
                  </>
                )}
                <ThemedText type="small" themeColor="textSecondary">{t('rec.noEmail')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{t('rec.employee')}</ThemedText>
                <Link href="/login" replace style={styles.link}><ThemedText type="linkPrimary">{t('rec.back')}</ThemedText></Link>
              </>
            )}
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
  content: { padding: Spacing.four, gap: Spacing.three, justifyContent: 'center', flexGrow: 1 },
  link: { textAlign: 'center', marginTop: Spacing.two },
});
