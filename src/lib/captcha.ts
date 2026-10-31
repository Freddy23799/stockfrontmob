import { useEffect, useState } from 'react';

import { api } from './api';

export type CaptchaConfig = { enabled: boolean; siteKey: string };

/**
 * Domaine presente a Cloudflare par la vue web du captcha. En production, ce domaine doit figurer dans la liste des domaines autorises du
 * widget Turnstile (les cles de test fonctionnent partout).
 */
export const CAPTCHA_ORIGIN = process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost';

let pending: Promise<CaptchaConfig> | null = null;

/** Le serveur dit s'il faut un captcha et donne la cle publique. */
export function loadCaptchaConfig(): Promise<CaptchaConfig> {
  pending ??= api<CaptchaConfig>('/api/public/captcha', { auth: false }).catch(() => {
    pending = null;
    return { enabled: false, siteKey: '' };
  });
  return pending;
}

export function useCaptchaConfig(): CaptchaConfig | null {
  const [config, setConfig] = useState<CaptchaConfig | null>(null);
  useEffect(() => {
    let live = true;
    void loadCaptchaConfig().then((c) => { if (live) setConfig(c); });
    return () => { live = false; };
  }, []);
  return config;
}
