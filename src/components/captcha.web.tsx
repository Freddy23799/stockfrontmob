import { useEffect, useRef } from 'react';

type Props = { siteKey: string; onToken: (token: string | null) => void; resetKey?: number };
type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };

let script: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  script ??= new Promise((resolve, reject) => {
    const w = window as unknown as { turnstile?: Turnstile };
    if (w.turnstile) { resolve(w.turnstile); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
    s.onerror = () => { script = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return script;
}

/** Version navigateur (outils de developpement, version web de l'application). Meme comportement que sur telephone. */
export default function Captcha({ siteKey, onToken, resetKey = 0 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; });
  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    void loadTurnstile().then((ts) => {
      if (cancelled || !box.current) return;
      id = ts.render(box.current, { sitekey: siteKey, theme: 'auto', callback: (t: string) => cb.current(t), 'expired-callback': () => cb.current(null), 'error-callback': () => cb.current(null) });
    }).catch(() => cb.current(null));
    return () => { cancelled = true; if (id) (window as unknown as { turnstile: Turnstile }).turnstile.remove(id); };
  }, [siteKey, resetKey]);
  return <div ref={box} style={{ minHeight: 70, display: 'flex', justifyContent: 'center' }} />;
}
