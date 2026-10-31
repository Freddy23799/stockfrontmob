import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import Captcha from '@/components/captcha';
import { Button, TextField } from '@/components/form';
import { Chips } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCaptchaConfig } from '@/lib/captcha';
import { GoogleSignInCancelled } from '@/lib/google';

export default function LoginScreen() {
  const { t } = useT();
  const { loginWithPassword, loginWithGoogle, loginAsEmployee } = useAuth();
  const [mode, setMode] = useState<'owner' | 'employee'>('owner');
  const [shopCode, setShopCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captchaCfg = useCaptchaConfig();
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  // la verification n'apparait qu'apres plusieurs echecs : un utilisateur normal ne la voit jamais
  const showCaptcha = Boolean(captchaCfg?.enabled) && needCaptcha;

  async function run(kind: 'password' | 'google', action: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await action();
      // la navigation vers l'application est faite par le garde de routes du _layout
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CAPTCHA_REQUIRED') setNeedCaptcha(true);
      if (!(e instanceof GoogleSignInCancelled)) {
        setError(e instanceof Error ? e.message : t('common.error'));
      }
    } finally {
      setBusy(null);
      setCaptchaToken(null); // un jeton ne sert qu'une fois
      setCaptchaKey((k) => k + 1);
    }
  }

  const submitPassword = () => run('password', () => (mode === 'employee' ? loginAsEmployee(shopCode, identifier, password, captchaToken) : loginWithPassword(identifier.trim(), password, captchaToken)));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
              <ThemedText type="subtitle">Vylaxo</ThemedText>
            </View>
            <ThemedText type="subtitle">{t('login.title')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('login.subtitle')}</ThemedText>

            <Chips scroll={false} value={mode} onChange={(m) => { setMode(m); setError(null); }}
              options={[{ value: 'owner', label: t('login.tabOwner'), icon: 'store' }, { value: 'employee', label: t('login.tabEmployee'), icon: 'user-tag' }]} />

            {mode === 'owner' && Platform.OS !== 'web' && (
              <Button title={t('login.google')} variant="secondary" loading={busy === 'google'} onPress={() => run('google', loginWithGoogle)} />
            )}
            {mode === 'owner' && Platform.OS !== 'web' ? <ThemedText type="small" themeColor="textSecondary" style={styles.or}>{t('login.or')}</ThemedText> : null}

            {mode === 'employee' ? (
              <>
                <ThemedText type="small" themeColor="textSecondary">{t('login.employeeHint')}</ThemedText>
                <TextField label={t('login.shopCode')} value={shopCode} onChangeText={(v) => setShopCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} autoCapitalize="characters" maxLength={6} placeholder="K7M2QX" />
              </>
            ) : null}
            <TextField label={mode === 'employee' ? t('login.employeeId') : t('login.identifier')} value={identifier} onChangeText={setIdentifier} textContentType="username" autoComplete="username" />
            <TextField
              label={t('login.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              onSubmitEditing={submitPassword}
            />

            {showCaptcha && captchaCfg ? <Captcha siteKey={captchaCfg.siteKey} onToken={setCaptchaToken} resetKey={captchaKey} /> : null}

            {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}

            <Button
              title={t('login.submit')}
              loading={busy === 'password'}
              disabled={!identifier.trim() || !password || (mode === 'employee' && shopCode.length !== 6) || (showCaptcha && !captchaToken)}
              onPress={submitPassword}
            />

            {mode === 'owner' ? (
              <Link href={{ pathname: '/forgot-password', params: { identifier: identifier.trim() } }} style={styles.link}>
                <ThemedText type="linkPrimary">{t('rec.forgot')}</ThemedText>
              </Link>
            ) : null}

            {mode === 'owner' ? (
              <Link href="/register" style={styles.link}>
                <ThemedText type="linkPrimary">{t('login.noAccount')}</ThemedText>
              </Link>
            ) : null}
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
