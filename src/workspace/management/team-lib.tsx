import { Share, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Hint, Sheet } from '@/components/ui';
import { useT } from '@/i18n';

/** Ces fonctionnalites ne se delèguent pas : l'equipe, le journal et les options techniques restent au proprietaire. */
export const NOT_DELEGABLE = new Set(['EMPLOYEES', 'ACTIVITY_LOG', 'OFFLINE', 'MULTI_OUTLET']);
export const ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];
export type Perm = Record<Action, boolean>;
export type Perms = Record<string, Perm>;
export type Role = { key: string; label: any; description?: any; default?: boolean; permissions: Record<string, string> };
export type FeatureRow = { code: string; name: string; enabled: boolean };
const LETTER: Record<string, Action> = { v: 'view', c: 'create', u: 'update', d: 'delete' };

/** "vcu" -> { view, create, update } ; un droit d'action suppose le droit de voir. */
function fromLetters(letters: string): Perm {
  const p: Perm = { view: false, create: false, update: false, delete: false };
  [...letters].forEach((l) => { if (LETTER[l]) p[LETTER[l]] = true; });
  if (p.create || p.update || p.delete) p.view = true;
  return p;
}

/** Applique un role du pack aux seules fonctionnalites actives de la boutique. */
export function applyRole(role: Role, features: FeatureRow[]): Perms {
  const out: Perms = {};
  const wildcard = role.permissions['*'];
  features.forEach((f) => {
    const letters = role.permissions[f.code] ?? wildcard;
    if (letters) out[f.code] = fromLetters(letters);
  });
  return out;
}

export const blank = (): Perm => ({ view: false, create: false, update: false, delete: false });

/** Autorisations deleguables a un sous-admin (le proprietaire les accorde une a une ; tout est refuse par defaut). */
export const DELEGATIONS = ['CREATE_EMPLOYEES', 'MANAGE_OWN_EMPLOYEES', 'CREATE_LOCAL_PRODUCTS', 'EDIT_CENTRAL_PRODUCT_PRICES', 'REQUEST_FEATURES', 'VIEW_MARGINS', 'EXPORT_DATA'] as const;

/** Un sous-admin ne peut transmettre que les droits qu'il possede : on retire de `perms` tout ce que `ceiling` n'accorde pas. */
export function clampPerms(perms: Perms, ceiling: Perms): Perms {
  const out: Perms = {};
  Object.entries(perms).forEach(([code, p]) => {
    const c = ceiling[code];
    if (!c) return;
    const next: Perm = { view: p.view && c.view, create: p.create && c.create, update: p.update && c.update, delete: p.delete && c.delete };
    if (next.view || next.create || next.update || next.delete) out[code] = { ...next, view: true };
  });
  return out;
}

/** Bascule un droit en gardant la logique : sans "voir" plus rien, agir suppose voir. */
export function togglePerm(prev: Perms, code: string, action: Action): Perms {
  const cur = { ...blank(), ...prev[code] };
  const next = { ...cur, [action]: !cur[action] };
  if (action === 'view' && !next.view) Object.assign(next, { create: false, update: false, delete: false });
  if (action !== 'view' && next[action]) next.view = true;
  return { ...prev, [code]: next };
}

/** Identifiants a remettre a l'employe. Le mot de passe provisoire n'est montre qu'une seule fois. */
export function Credentials({ shopCode, username, password, name, onClose }: { shopCode: string; username: string; password: string; name: string; onClose: () => void }) {
  const { t } = useT();
  const message = t('team.shareText', { name, url: 'Vylaxo', code: shopCode, user: username, password });
  return (
    <Sheet visible title={t('team.credentials')} onClose={onClose} footer={<View style={{ gap: 8 }}><Btn icon="share-nodes" title={t('mob.shareAccess')} onPress={() => void Share.share({ message })} /><Btn variant="secondary" title={t('team.done')} onPress={onClose} /></View>}>
      <ThemedText type="small" themeColor="textSecondary">{t('team.credentialsHint', { name })}</ThemedText>
      <Card tone="info" style={{ gap: 12 }}>
        <Item label={t('team.shopCode')} value={shopCode} big />
        <Item label={t('team.username')} value={username} />
        <Item label={t('team.tempPassword')} value={password} big />
      </Card>
      <Hint icon="circle-info" tone="warning">{t('team.credentialsOnce')}</Hint>
    </Sheet>
  );
}

function Item({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{label}</ThemedText>
      <ThemedText selectable type="smallBold" style={{ fontSize: big ? 24 : 17, letterSpacing: big ? 2 : 0 }}>{value}</ThemedText>
    </View>
  );
}
