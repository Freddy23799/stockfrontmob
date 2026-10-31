import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Hint, TextBox } from '@/components/ui';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';

/** Propriétaire : confirmer son adresse e-mail par un code, pour que « mot de passe oublié » puisse y envoyer un code. */
export default function EmailVerify({ email, onVerified }: { email: string; onVerified: () => void }) {
  const { t } = useT();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = (e: unknown) => (e instanceof ApiError ? e.message : t('common.network'));

  async function send() {
    setBusy(true); setError(null);
    try { await api('/api/account/email/code', { method: 'POST' }); setSent(true); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError(null);
    try { await api('/api/account/email/verify', { method: 'POST', body: { code } }); onVerified(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  return (
    <Card style={{ gap: 12 }}>
      <ThemedText type="smallBold">{t('rec.verifyTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{sent ? t('rec.verifySent', { email }) : t('rec.verifyText', { email })}</ThemedText>
      {sent ? <TextBox label={t('rec.code')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} placeholder="123456" /> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {sent ? <Btn icon="check" title={t('rec.verify')} loading={busy} disabled={busy || code.length !== 6} onPress={verify} /> : null}
      <Btn variant={sent ? 'secondary' : 'primary'} icon="envelope" title={sent ? t('rec.resend') : t('rec.verifySend')} disabled={busy} onPress={send} />
    </Card>
  );
}
