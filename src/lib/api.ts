import { API_URL } from './config';
import { appLanguage } from './locale';
import { tokenStore } from './token-store';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Le serveur est injoignable (hors ligne, timeout) : different d'un refus du serveur. */
export class NetworkError extends Error {
  constructor() {
    super('Impossible de joindre le serveur. Verifiez votre connexion.');
  }
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  accountType: 'ADMIN' | 'MERCHANT' | 'EMPLOYEE';
};

let accessToken: string | null = null;
let currentShopId: string | null = null;
let refreshInFlight: Promise<'ok' | 'denied' | 'network'> | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Boutique active : envoyee dans X-Shop-Id, et verifiee cote serveur a chaque requete. */
export function setCurrentShop(shopId: string | null) {
  currentShopId = shopId;
}

/** Appele quand le serveur refuse definitivement la session (compte suspendu, jeton vole...). */
export function setSessionLostHandler(handler: (() => void) | null) {
  onSessionLost = handler;
}

type Options = { method?: string; body?: unknown; auth?: boolean; shop?: string; headers?: Record<string, string>; meta?: boolean };

async function send(path: string, { method = 'GET', body, auth = true, shop, headers: extra }: Options): Promise<Response> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    'Accept-Language': appLanguage(),
    'X-Device-Id': await tokenStore.getDeviceId(),
  };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (auth && (shop ?? currentShopId)) headers['X-Shop-Id'] = (shop ?? currentShopId) as string;
  if (extra) Object.assign(headers, extra);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), isForm ? 60000 : 15000);
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? `Erreur ${res.status}`);
  }
  return data as T;
}

/**
 * Echange le jeton de renouvellement contre une nouvelle paire. Une seule requete a la fois :
 * si plusieurs appels recoivent 401 en meme temps, ils attendent le meme renouvellement
 * (le jeton est a usage unique, un second essai serait pris pour un vol).
 */
export function refreshSession(): Promise<'ok' | 'denied' | 'network'> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await tokenStore.getRefreshToken();
      if (!refreshToken) return 'denied' as const;
      try {
        const res = await send('/api/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });
        if (!res.ok) {
          // 401/403 : session morte. Autre erreur (5xx...) : on ne deconnecte pas l'utilisateur.
          return res.status === 401 || res.status === 403 ? ('denied' as const) : ('network' as const);
        }
        await storeTokens(await parse<TokenPair>(res));
        return 'ok' as const;
      } catch (e) {
        return e instanceof NetworkError ? ('network' as const) : ('denied' as const);
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function storeTokens(pair: TokenPair) {
  accessToken = pair.accessToken;
  await tokenStore.setRefreshToken(pair.refreshToken);
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  let res = await send(path, options);
  if (res.status === 401 && options.auth !== false) {
    const outcome = await refreshSession();
    if (outcome === 'ok') {
      res = await send(path, options);
    } else if (outcome === 'denied') {
      onSessionLost?.();
    }
  }
  if (options.meta) {
    if (res.status === 304) return { status: 304, etag: res.headers.get('ETag'), data: null } as T;
    const data = await parse<unknown>(res);
    return { status: res.status, etag: res.headers.get('ETag'), data } as T;
  }
  return parse<T>(res);
}

/** Telecharge un fichier binaire (PDF) avec les memes jetons et le meme renouvellement de session que `api`. */
export async function apiBlob(path: string, options: Options = {}): Promise<Blob> {
  let res = await send(path, options);
  if (res.status === 401 && options.auth !== false) {
    const outcome = await refreshSession();
    if (outcome === 'ok') res = await send(path, options);
    else if (outcome === 'denied') onSessionLost?.();
  }
  if (!res.ok) {
    // le serveur explique l'erreur en JSON (droit insuffisant, fonctionnalite desactivee...) : on garde son message
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.code ?? 'ERROR', body?.message ?? `Erreur ${res.status}`);
  }
  return res.blob();
}

export type Meta<T> = { status: number; etag: string | null; data: T | null };
