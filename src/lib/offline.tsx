import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api, ApiError, NetworkError } from './api';
import { useAuth } from './auth';
import { cacheGet, cacheSet } from './cache';

/**
 * Operation en attente d'envoi. Seules les operations dont le serveur sait ignorer un doublon (identifiant choisi par le
 * telephone : ventes, depenses, paiements...) passent par cette file : un renvoi apres coupure ne cree jamais deux fois la meme vente.
 */
export type QueueItem = {
  id: string;
  shopId: string;
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** Texte montre a l'utilisateur ("Vente V-000123"). */
  label: string;
  createdAt: number;
  state: 'pending' | 'failed';
  error?: string;
  /** Nature de l'operation (sale, cash-open, payment...) : les ecrans en deduisent ce qui est en attente. */
  kind?: string;
  /** Copie de ce qui a ete montre au client (recu provisoire) : reste consultable tant que l'operation n'est pas envoyee. */
  preview?: any;
  /** Compte qui a fait l'operation : un autre compte du meme telephone ne la voit pas et ne l'envoie pas. */
  owner?: string;
  /** Erreurs serveur (500) deja subies : au-dela de MAX_SERVER_ERRORS elle devient « refusee » sans bloquer les suivantes. */
  attempts?: number;
  /** Regroupe les operations d'un meme objet (ex. la commande d'une table) : elles partent dans l'ordre. */
  group?: string;
};

// pannes passageres : toute la file attend
const TRANSIENT = new Set([408, 425, 429, 502, 503, 504]);
const MAX_SERVER_ERRORS = 3;
// abonnement termine : les operations restent gardees et repartent d'elles-memes apres le renouvellement
const PAUSE_CODES = new Set(['SUBSCRIPTION_READONLY']);

type OfflineValue = {
  online: boolean;
  items: QueueItem[];
  pending: number;
  failed: number;
  syncing: boolean;
  /** Raison de la pause de l'envoi (ex. SUBSCRIPTION_READONLY), sinon null. */
  blocked: string | null;
  /** Date de la plus ancienne operation en attente (ms), sinon null. */
  oldestPendingAt: number | null;
  /** Envoie tout de suite si possible, sinon met en file. Renvoie la reponse, ou { queued: true }. */
  submit: <T>(item: Omit<QueueItem, 'createdAt' | 'state' | 'error' | 'owner' | 'attempts'> & { queuedBody?: unknown; forceQueue?: boolean }) => Promise<{ queued: false; data: T } | { queued: true }>;  // `forceQueue` : une operation precedente du meme groupe est encore en file, celle-ci part APRES elle
  flush: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
};

/**
 * Mode hors ligne autorise pour la boutique en cours (le proprietaire peut le couper dans les reglages). Coupe : plus rien n'est
 * enregistre sans reseau, l'ecran affiche l'erreur de connexion comme avant.
 */
let offlineAllowed = true;
export function setOfflineAllowed(value: boolean | undefined) { offlineAllowed = value !== false; }

const QUEUE_KEY = 'outbox';
const OfflineContext = createContext<OfflineValue | null>(null);

type Listener = () => void;
const syncedListeners = new Set<Listener>();
/** Appelle `fn` des qu'une operation en file a ete envoyee : les listes affichees se rechargent. */
export function onSynced(fn: Listener): () => void {
  syncedListeners.add(fn);
  return () => void syncedListeners.delete(fn);
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const { profile } = useAuth();
  const owner = profile?.id ?? null;
  const ownerRef = useRef<string | null>(owner);
  const allRef = useRef<QueueItem[]>([]);     // toute la file de l'appareil (tous comptes) ; `items` n'expose que celle du compte courant
  const itemsRef = useRef<QueueItem[]>([]);
  const loaded = useRef(false);
  const busy = useRef(false);

  const visible = useCallback((all: QueueItem[]) => all.filter((i) => !i.owner || i.owner === ownerRef.current), []);

  /** `next` = la file du compte courant ; les operations des autres comptes sont conservees telles quelles. */
  const persist = useCallback(async (next: QueueItem[]) => {
    const others = allRef.current.filter((i) => i.owner && i.owner !== ownerRef.current);
    allRef.current = [...others, ...next];
    itemsRef.current = next;
    setItems(next);
    await cacheSet(QUEUE_KEY, allRef.current);
  }, []);

  useEffect(() => {
    cacheGet<QueueItem[]>(QUEUE_KEY).then((saved) => {
      allRef.current = saved ?? [];
      loaded.current = true;
      itemsRef.current = visible(allRef.current);
      setItems(itemsRef.current);
    });
  }, [visible]);

  // changement de compte : on n'affiche et n'envoie que les operations du compte connecte
  useEffect(() => {
    ownerRef.current = owner;
    if (!loaded.current) return;
    itemsRef.current = visible(allRef.current);
    setItems(itemsRef.current);
  }, [owner, visible]);

  const flush = useCallback(async () => {
    if (busy.current || !loaded.current) return;
    busy.current = true;
    setSyncing(true);
    let sent = false;
    try {
      for (const item of itemsRef.current.filter((i) => i.state === 'pending')) {
        try {
          await api(item.path, { method: item.method, body: item.body, shop: item.shopId });
          await persist(itemsRef.current.filter((i) => i.id !== item.id));
          sent = true;
          setBlocked(null);
        } catch (e) {
          if (e instanceof NetworkError) break; // toujours hors ligne : on reessaiera
          if (e instanceof ApiError && PAUSE_CODES.has(e.code)) { setBlocked(e.code); break; }
          if (e instanceof ApiError && (TRANSIENT.has(e.status) || e.status === 401)) break; // panne passagere ou session a renouveler
          if (e instanceof ApiError && e.status === 500) {
            const attempts = (item.attempts ?? 0) + 1;
            if (attempts < MAX_SERVER_ERRORS) { await persist(itemsRef.current.map((i) => (i.id === item.id ? { ...i, attempts } : i))); break; }
            await persist(itemsRef.current.map((i) => (i.id === item.id ? { ...i, attempts, state: 'failed', error: e.message } : i)));
            continue; // les suivantes ne dependent pas de celle-ci
          }
          // refus du serveur (stock insuffisant, periode cloturee...) : l'utilisateur doit decider
          const message = e instanceof ApiError ? e.message : 'Erreur';
          await persist(itemsRef.current.map((i) => (i.id === item.id ? { ...i, state: 'failed', error: message } : i)));
        }
      }
    } finally {
      busy.current = false;
      setSyncing(false);
      if (sent) syncedListeners.forEach((fn) => fn());
    }
  }, [persist]);

  // etat du reseau : au retour de la connexion, la file part toute seule
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline) void flush();
    });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void flush(); });
    const timer = setInterval(() => { if (itemsRef.current.some((i) => i.state === 'pending')) void flush(); }, 30000);
    return () => { unsubscribe(); sub.remove(); clearInterval(timer); };
  }, [flush]);

  const submit = useCallback<OfflineValue['submit']>(async (input) => {
    if (input.forceQueue && offlineAllowed) {
      const { queuedBody, forceQueue: _force, ...stored } = input;
      await persist([...itemsRef.current, { ...stored, body: queuedBody ?? stored.body, createdAt: Date.now(), state: 'pending', owner: ownerRef.current ?? undefined }]);
      void flush();
      return { queued: true };
    }
    try {
      const data = await api(input.path, { method: input.method, body: input.body, shop: input.shopId });
      return { queued: false, data: data as never };
    } catch (e) {
      if (!(e instanceof NetworkError) || !offlineAllowed) throw e; // mode hors ligne coupe : on ne garde rien
      // queuedBody : corps a envoyer plus tard (ex. vente "offline" qui garde son heure et ses prix reels)
      const { queuedBody, forceQueue: _force, ...stored } = input;
      await persist([...itemsRef.current, { ...stored, body: queuedBody ?? stored.body, createdAt: Date.now(), state: 'pending', owner: ownerRef.current ?? undefined }]);
      setOnline(false);
      return { queued: true };
    }
  }, [persist, flush]);

  const value = useMemo<OfflineValue>(() => ({
    online,
    items,
    pending: items.filter((i) => i.state === 'pending').length,
    failed: items.filter((i) => i.state === 'failed').length,
    syncing,
    blocked,
    oldestPendingAt: items.filter((i) => i.state === 'pending').reduce<number | null>((m, i) => (m === null ? i.createdAt : Math.min(m, i.createdAt)), null),
    submit,
    flush,
    retry: async (id) => {
      await persist(itemsRef.current.map((i) => (i.id === id ? { ...i, state: 'pending', error: undefined } : i)));
      await flush();
    },
    discard: (id) => persist(itemsRef.current.filter((i) => i.id !== id)),
  }), [online, items, syncing, blocked, submit, flush, persist]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline doit etre utilise dans <OfflineProvider>');
  return ctx;
}
