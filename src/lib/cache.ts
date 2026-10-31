import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Cache JSON persistant, sans limite de taille (le coffre securise du telephone est limite a ~2 Ko par valeur) :
 * un fichier par cle sur mobile, localStorage sur le web. Sert au mode hors ligne : derniere liste connue, espace de travail,
 * file d'attente des operations a envoyer. Toute erreur d'ecriture est ignoree : le cache est un confort, jamais une obligation.
 */
const DIR = (FileSystem.documentDirectory ?? '') + 'vylaxo-cache/';
let ready: Promise<void> | null = null;

/**
 * Memoire de l'application pour les reponses de lecture (cles `q.` listes/ecrans et `l.` premieres pages) : revenir sur un ecran
 * deja vu l'affiche des le premier rendu, sans attendre la lecture du fichier. Bornee (LRU).
 */
const L1_MAX = 150;
const hot = new Map<string, unknown>();
const isRead = (key: string) => key.startsWith('q.') || key.startsWith('l.');
function remember(key: string, value: unknown) {
  if (!isRead(key)) return;
  hot.delete(key);
  hot.set(key, value);
  if (hot.size > L1_MAX) hot.delete(hot.keys().next().value as string);
}

/** Derniere reponse connue, sans attente : null si elle n'a pas ete vue depuis le lancement de l'application. */
export function cachePeek<T>(key: string): T | null {
  return (hot.get(key) as T | undefined) ?? null;
}

const file = (key: string) => DIR + encodeURIComponent(key) + '.json';

function ensureDir() {
  ready ??= FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
  return ready;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (hot.has(key)) return hot.get(key) as T;
  const value = await readStored<T>(key);
  if (value != null) remember(key, value);
  return value;
}

async function readStored<T>(key: string): Promise<T | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem('c:' + key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    await ensureDir();
    const info = await FileSystem.getInfoAsync(file(key));
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(file(key))) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  remember(key, value);
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === 'web') localStorage.setItem('c:' + key, raw);
    else {
      await ensureDir();
      await FileSystem.writeAsStringAsync(file(key), raw);
    }
  } catch {
    // stockage plein : on continue sans cache
  }
}

export async function cacheRemove(key: string): Promise<void> {
  hot.delete(key);
  try {
    if (Platform.OS === 'web') localStorage.removeItem('c:' + key);
    else await FileSystem.deleteAsync(file(key), { idempotent: true });
  } catch {
    // ignore
  }
}

/**
 * Efface le cache (deconnexion) : les donnees d'une boutique ne doivent pas rester sur l'appareil d'un autre utilisateur.
 * `keep` : cles conservees. La file des operations non envoyees (`outbox`) est toujours gardee par l'appelant : une session perdue
 * ou une deconnexion ne doit JAMAIS faire disparaitre des ventes faites sans reseau.
 */
export async function cacheClear({ keep = [] }: { keep?: string[] } = {}): Promise<void> {
  hot.clear();
  try {
    if (Platform.OS === 'web') {
      Object.keys(localStorage).filter((k) => k.startsWith('c:') && !keep.includes(k.slice(2))).forEach((k) => localStorage.removeItem(k));
    } else {
      await ensureDir();
      const kept = new Set(keep.map((k) => encodeURIComponent(k) + '.json'));
      const names = await FileSystem.readDirectoryAsync(DIR);
      await Promise.all(names.filter((n) => !kept.has(n)).map((n) => FileSystem.deleteAsync(DIR + n, { idempotent: true })));
    }
  } catch {
    // ignore
  }
}

const MAX_AGE_S = 30 * 24 * 3600;     // une reponse de plus de 30 jours n'est plus assez fiable pour etre montree hors ligne
const MAX_READS = 400;                // reponses de lecture gardees sur l'appareil

/**
 * Elague les reponses de lecture (`q.`, `l.`) : les plus vieilles et celles en surnombre sont supprimees, les plus recemment vues
 * restent. Le catalogue, la file d'envoi et l'espace de travail ne sont JAMAIS touches. A lancer rarement (une fois par jour).
 * Sans cela, chaque filtre et chaque plage de dates consultes laissaient un fichier a vie : apres des annees, des milliers.
 */
export async function cachePrune(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    await ensureDir();
    const names = (await FileSystem.readDirectoryAsync(DIR)).filter((n) => {
      const key = decodeURIComponent(n.replace(/\.json$/, ''));
      return isRead(key);
    });
    const stats = await Promise.all(names.map(async (n) => {
      const info = await FileSystem.getInfoAsync(DIR + n);
      return { n, at: info.exists ? (info.modificationTime ?? 0) : 0 };
    }));
    const now = Date.now() / 1000;
    stats.sort((a, b) => b.at - a.at);
    const doomed = stats.filter((s, i) => i >= MAX_READS || now - s.at > MAX_AGE_S);
    await Promise.all(doomed.map((s) => FileSystem.deleteAsync(DIR + s.n, { idempotent: true })));
    doomed.forEach((s) => hot.delete(decodeURIComponent(s.n.replace(/\.json$/, ''))));
    return doomed.length;
  } catch {
    return 0;
  }
}
