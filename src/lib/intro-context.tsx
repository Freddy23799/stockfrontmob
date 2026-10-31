import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { hasSeenIntro, markIntroSeen } from './intro';

type Target = 'login' | 'register';

type IntroValue = {
  /** Faux tant que la lecture du stockage n'est pas terminee. */
  loaded: boolean;
  seen: boolean;
  /** Ou aller juste apres la presentation ; consomme une seule fois par le navigateur racine. */
  consumeTarget: () => Target | null;
  finish: (target: Target) => void;
};

const IntroContext = createContext<IntroValue | null>(null);

export function IntroProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [seen, setSeen] = useState(false);
  const target = useRef<Target | null>(null);

  useEffect(() => {
    hasSeenIntro().then((value) => {
      setSeen(value);
      setLoaded(true);
    });
  }, []);

  const finish = useCallback((next: Target) => {
    target.current = next;
    void markIntroSeen();
    setSeen(true);
  }, []);

  const consumeTarget = useCallback(() => {
    const value = target.current;
    target.current = null;
    return value;
  }, []);

  const value = useMemo(() => ({ loaded, seen, finish, consumeTarget }), [loaded, seen, finish, consumeTarget]);
  return <IntroContext.Provider value={value}>{children}</IntroContext.Provider>;
}

export function useIntro(): IntroValue {
  const ctx = useContext(IntroContext);
  if (!ctx) throw new Error('useIntro doit etre utilise dans <IntroProvider>');
  return ctx;
}
