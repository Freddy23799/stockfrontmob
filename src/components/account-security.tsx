import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Hint, Row, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import EmailVerify from '@/components/email-verify';

type Profile = {
  type: 'MERCHANT' | 'EMPLOYEE' | 'ADMIN'; username: string | null; fullName: string; email: string | null; phone: string | null;
  hasPassword: boolean; emailVerified: boolean; canEditUsername: boolean; canEditEmail: boolean; passwordChangedAt: string | null; shopName: string | null;
};
type Session = { id: string; userAgent: string | null; ip: string | null; createdAt: string; current: boolean };

const when = (iso: string, lang: string) => new Date(iso).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' });

function deviceName(ua: string | null, t: (k: string) => string): string {
  if (!ua) return t('acct.device.unknown');
  if (/okhttp|Expo|Dart|ReactNative/i.test(ua)) return t('acct.device.app');
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return [browser, os].filter(Boolean).join(' · ') || t('acct.device.unknown');
}

/**
 * « Mon compte » commun (proprietaire, employe) : identite, mot de passe, appareils connectes. Meme API que le site (/api/account).
 * Le mot de passe actuel est exige ; apres le changement, les autres appareils sont deconnectes.
 */
export default function AccountSecurity() {
  const { t, lang } = useT();
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [f, setF] = useState({ fullName: '', phone: '', email: '', username: '', currentPassword: '' });
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<'profile' | 'password' | 'session' | null>(null);
  const [error, setError] = useState<{ where: 'profile' | 'password' | 'load'; message: string } | null>(null);
  const fail = (where: 'profile' | 'password' | 'load') => (e: unknown) => setError({ where, message: e instanceof ApiError ? e.message : t('common.network') });

  const applyProfile = useCallback((p: Profile) => {
    setProfile(p);
    setF({ fullName: p.fullName ?? '', phone: p.phone ?? '', email: p.email ?? '', username: p.username ?? '', currentPassword: '' });
  }, []);
  const loadSessions = useCallback(() => api<Session[]>('/api/account/sessions').then(setSessions).catch(() => setSessions([])), []);
  useEffect(() => {
    api<Profile>('/api/account').then(applyProfile).catch(fail('load'));
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyProfile, loadSessions]);

  async function saveProfile() {
    setBusy('profile'); setError(null);
    try {
      applyProfile(await api<Profile>('/api/account/profile', { method: 'PATCH', body: f }));
      await refreshProfile();
      toast(t('acct.saved'));
    } catch (e) { fail('profile')(e); } finally { setBusy(null); }
  }

  const needCurrent = profile?.hasPassword ?? true;
  // changer l'e-mail, le telephone ou l'identifiant exige le mot de passe actuel (une session volee ne doit pas suffire a detourner le compte)
  const identityChanged = profile?.type === 'MERCHANT' && needCurrent && (f.email.trim() !== (profile.email ?? '') || f.phone.trim() !== (profile.phone ?? '') || f.username.trim() !== (profile.username ?? ''));
  const mismatch = pw.again.length > 0 && pw.next !== pw.again;
  const validPw = (!needCurrent || pw.current !== '') && pw.next.length >= 8 && pw.next === pw.again;
  async function savePassword() {
    setBusy('password'); setError(null);
    try {
      await api('/api/account/password', { method: 'POST', body: { current: needCurrent ? pw.current : null, next: pw.next } });
      setPw({ current: '', next: '', again: '' });
      await refreshProfile();
      await loadSessions();
      setProfile((p) => (p ? { ...p, hasPassword: true, passwordChangedAt: new Date().toISOString() } : p));
      toast(t(needCurrent ? 'acct.pw.changed' : 'acct.pw.set'));
    } catch (e) { fail('password')(e); } finally { setBusy(null); }
  }

  async function closeSession(id: string) {
    setBusy('session');
    try { await api(`/api/account/sessions/${id}`, { method: 'DELETE' }); await loadSessions(); } finally { setBusy(null); }
  }
  function closeOthers() {
    Alert.alert(t('acct.sessions.confirmOthers'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('acct.sessions.closeOthers', { count: others }), style: 'destructive', onPress: () => { setBusy('session'); api('/api/account/sessions/revoke-others', { method: 'POST' }).then(loadSessions).finally(() => setBusy(null)); } },
    ]);
  }
  const others = sessions?.filter((s) => !s.current).length ?? 0;

  if (!profile) return error?.where === 'load' ? <Hint icon="circle-xmark" tone="danger">{error.message}</Hint> : <ThemedText type="small" themeColor="textSecondary">{t('common.loading')}</ThemedText>;
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('acct.identity')}</ThemedText>
        <TextBox label={t('acct.fullName')} value={f.fullName} onChangeText={(v) => setF((s) => ({ ...s, fullName: v }))} autoComplete="name" />
        <TextBox label={t('acct.username')} value={f.username} editable={profile.canEditUsername} autoCapitalize="none" autoComplete="username"
          onChangeText={(v) => setF((s) => ({ ...s, username: v }))} hint={!profile.canEditUsername ? t(profile.type === 'EMPLOYEE' ? 'acct.usernameEmployee' : 'acct.usernameFixed') : undefined} />
        {profile.canEditEmail || profile.email ? <TextBox label={t('acct.email')} value={f.email} editable={profile.canEditEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" onChangeText={(v) => setF((s) => ({ ...s, email: v }))} /> : null}
        <TextBox label={t('acct.phone')} value={f.phone} keyboardType="phone-pad" autoComplete="tel" onChangeText={(v) => setF((s) => ({ ...s, phone: v }))} />
        {identityChanged ? <TextBox label={t('acct.confirmPassword')} hint={t('acct.confirmPasswordHint')} value={f.currentPassword} onChangeText={(v) => setF((s) => ({ ...s, currentPassword: v }))} secureTextEntry autoComplete="current-password" /> : null}
        {profile.type === 'EMPLOYEE' ? <Hint icon="circle-info">{t('acct.employeeInfo', { shop: profile.shopName ?? '' })}</Hint> : null}
        {error?.where === 'profile' ? <Hint icon="circle-xmark" tone="danger">{error.message}</Hint> : null}
        <Btn icon="check" title={busy === 'profile' ? t('common.loading') : t('acct.save')} loading={busy === 'profile'} disabled={busy !== null || f.fullName.trim().length < 2 || (identityChanged && !f.currentPassword)} onPress={saveProfile} />
      </Card>

      {profile.type === 'MERCHANT' && profile.email && !profile.emailVerified ? (
        <EmailVerify email={profile.email} onVerified={() => setProfile((p) => (p ? { ...p, emailVerified: true } : p))} />
      ) : null}

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t(needCurrent ? 'acct.pw.title' : 'acct.pw.titleSet')}</ThemedText>
        {!needCurrent ? <Hint icon="circle-info">{t('acct.pw.googleOnly')}</Hint> : null}
        {profile.passwordChangedAt ? <ThemedText type="small" themeColor="textSecondary">{t('acct.pw.lastChange', { date: when(profile.passwordChangedAt, lang) })}</ThemedText> : null}
        {error?.where === 'password' ? <Hint icon="circle-xmark" tone="danger">{error.message}</Hint> : null}
        {needCurrent ? <TextBox label={t('account.current')} value={pw.current} onChangeText={(v) => setPw((s) => ({ ...s, current: v }))} secureTextEntry autoComplete="current-password" /> : null}
        <TextBox label={t('account.new')} value={pw.next} onChangeText={(v) => setPw((s) => ({ ...s, next: v }))} secureTextEntry autoComplete="new-password" maxLength={72} hint={t('start.passwordHint')} />
        <TextBox label={t('account.again')} value={pw.again} onChangeText={(v) => setPw((s) => ({ ...s, again: v }))} secureTextEntry autoComplete="new-password" maxLength={72} error={mismatch ? t('account.mismatch') : null} />
        <ThemedText type="small" themeColor="textSecondary">{t('acct.pw.effect')}</ThemedText>
        <Btn icon="key" title={busy === 'password' ? t('common.loading') : t(needCurrent ? 'account.change' : 'acct.pw.setButton')} loading={busy === 'password'} disabled={!validPw || busy !== null} onPress={savePassword} />
      </Card>

      <Card style={{ gap: 10 }}>
        <ThemedText type="smallBold">{t('acct.sessions.title')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('acct.sessions.hint')}</ThemedText>
        {sessions?.map((s) => (
          <Row key={s.id} icon={/Android|iPhone|okhttp|Expo/.test(s.userAgent ?? '') ? 'mobile-screen' : 'desktop'} tone={s.current ? 'success' : 'neutral'}
            title={`${deviceName(s.userAgent, t)}${s.current ? ` · ${t('acct.sessions.current')}` : ''}`} subtitle={`${t('acct.sessions.since', { date: when(s.createdAt, lang) })}${s.ip ? ` · ${s.ip}` : ''}`}
            right={!s.current ? <Btn small variant="secondary" title={t('acct.sessions.close')} disabled={busy !== null} onPress={() => void closeSession(s.id)} /> : undefined} />
        ))}
        {others > 0 ? <Btn variant="secondary" icon="right-from-bracket" title={t('acct.sessions.closeOthers', { count: others })} disabled={busy !== null} onPress={closeOthers} /> : null}
      </Card>
    </View>
  );
}
