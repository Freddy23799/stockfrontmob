import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Hint, Screen, Sheet, Skeleton, Stack, Switch, TextBox, useToast, Row } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { OfflineAdvice } from '@/components/offline-advice';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { ListFooter } from '@/components/list-footer';
import { useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { ACTIONS, Credentials, DELEGATIONS, NOT_DELEGABLE, applyRole, blank, clampPerms, togglePerm, type FeatureRow, type Perms, type Role } from './team-lib';

type Employee = { id: string; fullName: string; username: string; jobTitle?: string; phone?: string; roleKey?: string; status: string; permissions?: Perms; lastLoginAt?: string; mustChangePassword?: boolean;
  isSiteAdmin?: boolean; delegation?: string[]; managedByMe?: boolean };

/** Equipe : comptes de connexion des employes, role de depart et droits fonction par fonction. */
export default function Team() {
  const { t, lang } = useT();
  const shop = useShop();
  const admin = shop.siteAdmin;
  // le proprietaire gere l'equipe depuis l'espace marchand ; un sous-admin, depuis son propre site
  const base = admin ? '/api/shop/team' : `/api/merchant/shops/${shop.shopId}/employees`;
  const list = useQuery<Employee[]>(admin || shop.owner ? base : null);
  const employees = useMemo(() => list.data ?? [], [list.data]);
  const progressive = useProgressive(employees, 20);   // jamais plus de 20 lignes construites d'un coup
  const feats = useQuery<{ features: FeatureRow[] }>(shop.owner ? `/api/merchant/shops/${shop.shopId}/features` : null);
  // le sous-admin n'a pas acces a la liste des fonctionnalites du proprietaire : on en tire les noms du catalogue public
  const names = useQuery<{ features: { code: string; name: string }[] }>(admin ? `/api/public/onboarding?lang=${lang}` : null);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const roles = useMemo(() => (shop.ws.manifest.roles as Role[] | undefined) ?? [], [shop.ws.manifest.roles]);
  const roleName = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, shop.tr(r.label)])), [roles, shop]);
  const ceiling: Perms | null = admin ? Object.fromEntries(Object.entries(shop.ws.permissions ?? {}).map(([k, v]) => [k, { ...blank(), ...(v as Record<string, boolean>) }])) : null;
  const catalog: FeatureRow[] = admin
    ? shop.ws.features.filter((c) => !NOT_DELEGABLE.has(c) && ceiling?.[c]?.view).map((c) => ({ code: c, name: names.data?.features.find((f) => f.code === c)?.name ?? c, enabled: true }))
    : (feats.data?.features ?? []).filter((x) => x.enabled && !NOT_DELEGABLE.has(x.code));
  const code = (shop.ws.shop as any).shopCode as string;
  const toast = useToast();

  if (!shop.has('EMPLOYEES')) return <Screen title={t('team.title')}><Empty icon="lock" title={t('ws.featureOff')} text={t('ws.featureOffText')} /></Screen>;
  if (admin && !shop.delegated('CREATE_EMPLOYEES')) return <Screen title={t('team.title')}><Empty icon="lock" title={t('ws.noAccess')} text={t('sa.teamRight')} /></Screen>;
  if (!shop.owner && !admin) return <Screen title={t('team.title')}><Empty icon="lock" title={t('ws.noAccess')} text={t('ws.noAccessText')} /></Screen>;

  return (
    <Screen title={t('team.title')} subtitle={t('team.subtitle')} onRefresh={async () => { await list.reload(); if (shop.owner) await feats.reload(); }} onEndReached={progressive.loadMore}>
      <OfflineAdvice kind="needsNetwork" />
      <Card tone="info" style={{ gap: 6 }}>
        <ThemedText type="smallBold" themeColor="primary"><Icon name="key" size={13} />  {t('team.shopCode')}</ThemedText>
        <ThemedText selectable style={{ fontSize: 30, letterSpacing: 4, fontWeight: '800' }} themeColor="primary">{code}</ThemedText>
        <ThemedText type="small" themeColor="primary">{t('team.shopCodeHint')}</ThemedText>
      </Card>
      <Btn icon="user-plus" title={t('team.new')} onPress={() => setEditing('new')} />
      {(list.data ?? []).length > 0 ? <PdfButton path="/api/shop/pdf/team" name="employes.pdf" label={t('pdf.list')} /> : null}
      {list.error && !list.data ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {!list.data && !list.error ? <Skeleton rows={3} height={72} /> : null}
      {list.data && list.data.length === 0 ? <Empty icon="users" title={t('team.empty')} text={t('team.emptyText')} /> : null}
      <Stack gap={8}>
        {progressive.visible.map((e) => (
          <Row key={e.id} icon="user" tone="neutral" title={e.fullName} subtitle={[e.jobTitle, e.roleKey && roleName[e.roleKey], `@${e.username}`].filter(Boolean).join(' · ')}
            meta={<ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{e.lastLoginAt ? t('team.lastLoginAt', { when: formatDateTime(e.lastLoginAt, lang) }) : t('team.neverLogged')}</ThemedText>}
            right={e.status !== 'ACTIVE' ? <Badge tone="warning">{t(`team.status.${e.status}`)}</Badge> : e.isSiteAdmin ? <Badge tone="primary">{t('sa.badge')}</Badge> : e.mustChangePassword ? <Badge tone="info">{t('team.pending')}</Badge> : undefined}
            onPress={() => (e.managedByMe === false ? toast(t('sa.notMine'), 'warning') : setEditing(e))} />
        ))}
      </Stack>
      <ListFooter shown={progressive.visible.length} total={progressive.total} hasMore={progressive.hasMore} onMore={progressive.loadMore} />
      {editing ? <EmployeeSheet base={base} ceiling={ceiling} employee={editing === 'new' ? null : editing} features={catalog} roles={roles} shopCode={code} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} /> : null}
    </Screen>
  );
}

function EmployeeSheet({ base, ceiling, employee, features, roles, shopCode, onClose, onSaved }: { base: string; ceiling: Perms | null; employee: Employee | null; features: FeatureRow[]; roles: Role[]; shopCode: string; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const defaultRole = roles.find((r) => r.default);
  const [f, setF] = useState({ fullName: employee?.fullName ?? '', username: employee?.username ?? '', jobTitle: employee?.jobTitle ?? '', phone: employee?.phone ?? '', password: '', roleKey: employee?.roleKey ?? (employee ? '' : defaultRole?.key ?? '') });
  const [edited, setPerms] = useState<Perms | null>(() => employee?.permissions ?? null);
  const clamp = (p: Perms) => (ceiling ? clampPerms(p, ceiling) : p);   // un sous-admin ne donne jamais plus que ce qu'il a
  const perms: Perms = edited ?? clamp(defaultRole ? applyRole(defaultRole, features) : {});   // role par defaut tant que rien n'est modifie
  const owner = shop.owner;
  const [isSiteAdmin, setIsSiteAdmin] = useState(employee?.isSiteAdmin ?? false);
  const [delegation, setDelegation] = useState<string[]>(employee?.delegation ?? []);
  const allowed = (code: string, action: (typeof ACTIONS)[number]) => !ceiling || ceiling[code]?.[action] === true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ username: string; password: string; name: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : t('common.network'));

  function pickRole(key: string) {
    setF((s) => ({ ...s, roleKey: key }));
    const role = roles.find((r) => r.key === key);
    if (role) setPerms(clamp(applyRole(role, features)));
  }
  const toggle = (code: string, action: (typeof ACTIONS)[number]) => { if (!allowed(code, action)) return; setPerms(togglePerm(perms, code, action)); setF((s) => ({ ...s, roleKey: '' })); };
  const toggleAll = (code: string, on: boolean) => { setPerms(clamp({ ...perms, [code]: on ? { view: true, create: true, update: true, delete: true } : blank() })); setF((s) => ({ ...s, roleKey: '' })); };
  const granted = Object.values(perms).filter((p) => p.view).length;

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = { fullName: f.fullName.trim(), jobTitle: f.jobTitle, phone: f.phone, roleKey: f.roleKey || null, permissions: perms };
      if (!employee) Object.assign(body, { username: f.username.trim(), password: f.password || null });
      if (owner) Object.assign(body, { isSiteAdmin, delegation: isSiteAdmin ? delegation : [] });   // seul le proprietaire nomme un sous-admin
      const res = await shop.call<{ employee: { username: string; fullName: string }; temporaryPassword?: string }>(employee ? `${base}/${employee.id}` : base, { method: employee ? 'PUT' : 'POST', body });
      if (employee) { toast(t('ws.saved')); return onSaved(); }
      setCreds({ username: res.employee.username, password: res.temporaryPassword ?? f.password, name: res.employee.fullName });
    } catch (e) { setError(msg(e)); setBusy(false); }
  }
  async function reset() {
    if (!(await confirmAction(t('team.resetTitle', { name: employee!.fullName }), t('team.resetText'), t('team.reset'), t('common.cancel'), false))) return;
    try { const res = await shop.call<{ employee: { username: string; fullName: string }; temporaryPassword: string }>(`${base}/${employee!.id}/reset-password`, { method: 'POST' }); setCreds({ username: res.employee.username, password: res.temporaryPassword, name: res.employee.fullName }); } catch (e) { setError(msg(e)); }
  }
  async function toggleStatus() {
    const next = employee!.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (next === 'SUSPENDED' && !(await confirmAction(t('team.suspendTitle', { name: employee!.fullName }), t('team.suspendText'), t('team.suspend'), t('common.cancel')))) return;
    try { await shop.call(`${base}/${employee!.id}/status`, { method: 'POST', body: { status: next } }); toast(t(next === 'ACTIVE' ? 'team.reactivated' : 'team.suspended')); onSaved(); } catch (e) { setError(msg(e)); }
  }
  async function remove() {
    if (!(await confirmAction(t('ws.deleteTitle', { name: employee!.fullName }), t('team.deleteText'), t('ws.delete'), t('common.cancel')))) return;
    try { await shop.call(`${base}/${employee!.id}`, { method: 'DELETE' }); toast(t('ws.deleted')); onSaved(); } catch (e) { setError(msg(e)); }
  }

  if (creds) return <Credentials shopCode={shopCode} {...creds} onClose={() => (employee ? setCreds(null) : onSaved())} />;
  const roleHint = roles.find((r) => r.key === f.roleKey);
  return (
    <Sheet visible tall title={employee ? employee.fullName : t('team.new')} onClose={onClose}
      footer={(
        <View style={{ gap: 8 }}>
          <Btn icon="check" title={employee ? t('common.save') : t('team.create')} loading={busy} disabled={busy || !f.fullName.trim() || (!employee && f.username.trim().length < 3)} onPress={submit} />
          {employee ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} /> : null}
        </View>
      )}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {!employee ? <Hint icon="lightbulb">{t('mob.employeeHint')}</Hint> : null}
      <TextBox label={`${t('team.fullName')} *`} value={f.fullName} onChangeText={set('fullName')} maxLength={150} autoCapitalize="words" />
      <TextBox label={t('team.jobTitle')} value={f.jobTitle} onChangeText={set('jobTitle')} maxLength={100} autoCapitalize="sentences" />
      <TextBox label={`${t('team.username')} *`} value={f.username} onChangeText={set('username')} editable={!employee} maxLength={30} hint={!employee ? t('team.usernameHint') : undefined} />
      <TextBox label={t('ws.phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {!employee ? <TextBox label={t('team.password')} value={f.password} onChangeText={set('password')} placeholder={t('team.passwordAuto')} hint={t('team.passwordHint')} /> : null}

      {owner ? (
        <Card style={{ gap: 10 }}>
          <Switch label={t('sa.toggle')} hint={t('sa.toggleHint')} value={isSiteAdmin} onChange={(v) => { setIsSiteAdmin(v); if (!v) setDelegation([]); }} />
          {isSiteAdmin ? (
            <View style={{ gap: 6 }}>
              <ThemedText type="smallBold">{t('sa.delegation')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{t('sa.delegationHint')}</ThemedText>
              {DELEGATIONS.map((code) => <Switch key={code} label={t(`sa.${code}`)} value={delegation.includes(code)} onChange={(on) => setDelegation((d) => (on ? [...d, code] : d.filter((x) => x !== code)))} />)}
            </View>
          ) : null}
        </Card>
      ) : null}

      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold">{t('team.role')}</ThemedText>
        {roles.map((r) => {
          const on = f.roleKey === r.key;
          return (
            <Pressable key={r.key} onPress={() => pickRole(r.key)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ padding: 12, borderRadius: 16, borderWidth: 2, borderColor: on ? th.primary : 'transparent', backgroundColor: on ? th.backgroundSelected : th.backgroundElement, gap: 2 }}>
              <ThemedText type="smallBold">{shop.tr(r.label)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{shop.tr(r.description)}</ThemedText>
            </Pressable>
          );
        })}
        <ThemedText type="small" themeColor="textSecondary">{roleHint ? t('team.roleApplied') : t('team.roleCustom')}</ThemedText>
      </View>

      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold">{t('team.permissions')} <ThemedText type="small" themeColor="textSecondary">({t('team.granted', { count: granted })})</ThemedText></ThemedText>
        {features.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('team.noFeatures')}</ThemedText> : features.map((feat) => {
          const p = { ...blank(), ...perms[feat.code] };
          const all = ACTIONS.every((a) => p[a] || !allowed(feat.code, a)) && ACTIONS.some((a) => p[a]);
          return (
            <Card key={feat.code} style={{ gap: 8, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>{feat.name}</ThemedText>
                <Pressable onPress={() => toggleAll(feat.code, !all)} hitSlop={8}><ThemedText type="smallBold" themeColor="primary">{all ? t('team.none') : t('team.all')}</ThemedText></Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {ACTIONS.map((a) => (
                  <Pressable key={a} onPress={() => toggle(feat.code, a)} disabled={!allowed(feat.code, a)} accessibilityRole="checkbox" accessibilityState={{ checked: p[a], disabled: !allowed(feat.code, a) }} accessibilityLabel={`${feat.name} — ${t(`team.act.${a}`)}`}
                    style={{ flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: p[a] ? th.primary : th.background, opacity: allowed(feat.code, a) ? 1 : 0.35 }}>
                    {p[a] ? <Icon name="check" size={10} color={th.primaryText} /> : null}
                    <ThemedText type="smallBold" style={{ fontSize: 12, color: p[a] ? th.primaryText : th.textSecondary }} numberOfLines={1}>{t(`team.act.${a}`)}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </Card>
          );
        })}
        <ThemedText type="small" themeColor="textSecondary">{ceiling ? t('sa.ceiling') : t('team.permissionsHint')}</ThemedText>
      </View>

      {employee ? (
        <Card style={{ gap: 10 }}>
          <ThemedText type="smallBold">{t('team.account')}</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="small" style={{ flex: 1 }}>{t('team.status')}</ThemedText><Badge tone={employee.status === 'ACTIVE' ? 'success' : 'warning'}>{t(`team.status.${employee.status}`)}</Badge></View>
          <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="small" style={{ flex: 1 }}>{t('team.lastLogin')}</ThemedText><ThemedText type="small" themeColor="textSecondary">{employee.lastLoginAt ? formatDateTime(employee.lastLoginAt, lang) : t('team.never')}</ThemedText></View>
          <Btn variant="secondary" icon="key" title={t('team.reset')} onPress={reset} />
          <Btn variant="secondary" icon={employee.status === 'ACTIVE' ? 'pause' : 'play'} title={t(employee.status === 'ACTIVE' ? 'team.suspend' : 'team.reactivate')} onPress={toggleStatus} />
        </Card>
      ) : null}
    </Sheet>
  );
}
