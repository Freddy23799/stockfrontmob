import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useT } from '@/i18n';
import Captcha from '@/components/captcha';
import { useAuth } from '@/lib/auth';
import { useCaptchaConfig } from '@/lib/captcha';
import { GoogleSignInCancelled } from '@/lib/google';

export default function RegisterScreen() {
  const { t } = useT();
  const { register, loginWithGoogle } = useAuth();
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captchaCfg = useCaptchaConfig();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const showCaptcha = Boolean(captchaCfg?.enabled);   // l'inscription est toujours verifiee

  const valid = fullName.trim().length > 1 && identifier.trim().length > 2 && password.length >= 8 && (!showCaptcha || Boolean(captchaToken));

  async function run(kind: 'password' | 'google', action: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      if (!(e instanceof GoogleSignInCancelled)) setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(null);
      setCaptchaToken(null); // un jeton ne sert qu'une fois
      setCaptchaKey((k) => k + 1);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
              <ThemedText type="subtitle">Vylaxo</ThemedText>
            </View>
            <ThemedText type="subtitle">{t('register.title')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('register.subtitle')}</ThemedText>

            {Platform.OS !== 'web' && (
              <Button title={t('login.google')} variant="secondary" loading={busy === 'google'} onPress={() => run('google', loginWithGoogle)} />
            )}
            <ThemedText type="small" themeColor="textSecondary" style={styles.or}>{t('login.or')}</ThemedText>

            <TextField label={t('register.fullName')} value={fullName} onChangeText={setFullName} autoCapitalize="words" textContentType="name" />
            <TextField label={t('register.identifier')} value={identifier} onChangeText={setIdentifier} keyboardType="email-address" textContentType="username" />
            <TextField label={t('register.password')} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" />

            {showCaptcha && captchaCfg ? <Captcha siteKey={captchaCfg.siteKey} onToken={setCaptchaToken} resetKey={captchaKey} /> : null}

            {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}

            <Button title={t('register.submit')} loading={busy === 'password'} disabled={!valid} onPress={() => run('password', () => register({ fullName: fullName.trim(), identifier, password }, captchaToken))} />

            <Link href="/login" style={styles.link}>
              <ThemedText type="linkPrimary">{t('register.haveAccount')}</ThemedText>
            </Link>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.two },
  logo: { width: 40, height: 40 },
  or: { textAlign: 'center' },
  link: { textAlign: 'center', marginTop: Spacing.two },
});
