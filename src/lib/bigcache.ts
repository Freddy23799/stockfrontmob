import { Platform } from 'react-native';

import { cacheGet, cacheRemove, cacheSet } from './cache';

/**
 * Stockage de GROS volumes (catalogue de milliers d'articles). Sur le web, localStorage plafonne a ~5 Mo (un catalogue de
 * 20 000 articles fait ~12 Mo : l'ecriture echouait en silence, donc plus de hors-ligne) : on utilise IndexedDB.
 * Sur mobile, un fichier par cle (cache.ts) : chaque bloc du catalogue est un petit fichier.
 */
const DB = 'vylaxo-mobile-big';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-idb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => { dbp = null; throw e; });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function bigGet<T>(key: string): Promise<T | null> {
  if (Platform.OS !== 'web') return cacheGet<T>(key);
  try { return ((await tx<T>('readonly', (s) => s.get(key))) ?? null) as T | null; } catch { return null; }
}

/** Ecrit plusieurs valeurs d'un coup (une seule transaction sur le web) et supprime `remove`. */
export async function bigSetMany(entries: [string, unknown][], remove: string[] = []): Promise<void> {
  if (Platform.OS !== 'web') {
    await Promise.all([...entries.map(([k, v]) => cacheSet(k, v)), ...remove.map((k) => cacheRemove(k))]);
    return;
  }
  try { await tx('readwrite', (s) => { for (const [k, v] of entries) s.put(v, k); for (const k of remove) s.delete(k); }); } catch { /* stockage plein ou indisponible : le catalogue reste en memoire */ }
}

export async function bigRemove(key: string): Promise<void> {
  if (Platform.OS !== 'web') return cacheRemove(key);
  try { await tx('readwrite', (s) => { s.delete(key); }); } catch { /* ignore */ }
}
