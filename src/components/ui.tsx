import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { fontFor, ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useOffline } from '@/lib/offline';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function useTone(tone: Tone) {
  const th = useTheme();
  return {
    neutral: { bg: th.backgroundSelected, fg: th.text },
    primary: { bg: th.backgroundSelected, fg: th.primary },
    success: { bg: th.successBg, fg: th.success },
    warning: { bg: th.warningBg, fg: th.warning },
    danger: { bg: th.dangerBg, fg: th.danger },
    info: { bg: th.infoBg, fg: th.primary },
  }[tone];
}

/* ---------- Bandeau hors ligne / synchronisation ---------- */

/**
 * Annonces breves : « de retour en ligne » au retour du reseau, puis « synchronise avec le cloud » quand tout ce qui attendait est
 * parti. Elles descendent du haut de l'ecran et s'effacent seules.
 */
function useFlash(online: boolean, pending: number, syncing: boolean): 'online' | 'synced' | null {
  const [flash, setFlash] = useState<'online' | 'synced' | null>(null);
  const prev = useRef({ online, pending });
  const owes = useRef(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = { online, pending };
    if (!online || pending > 0) owes.current = true;
    let next: 'online' | 'synced' | null = null;
    if (online && !before.online) next = pending > 0 ? 'online' : 'synced';
    else if (online && pending === 0 && !syncing && owes.current) next = 'synced';
    if (!next) return undefined;
    if (next === 'synced') owes.current = false;
    const shown = next;
    const start = setTimeout(() => setFlash(shown), 0);
    const stop = setTimeout(() => setFlash((f) => (f === shown ? null : f)), 3500);
    return () => { clearTimeout(start); clearTimeout(stop); };
  }, [online, pending, syncing]);
  return flash;
}

function FlashBanner({ kind }: { kind: 'online' | 'synced' }) {
  const { t } = useT();
  const th = useTheme();
  const [slide] = useState(() => new Animated.Value(-60));
  useEffect(() => {
    Animated.sequence([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.delay(2700),
      Animated.timing(slide, { toValue: -60, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide, kind]);
  const { bg, fg } = toneColors(kind === 'synced' ? 'success' : 'info', th);
  return (
    <Animated.View accessibilityLiveRegion="polite" style={[s.banner, { backgroundColor: bg, transform: [{ translateY: slide }] }]}>
      <Icon name={kind === 'synced' ? 'circle-check' : 'wifi'} size={14} color={fg} />
      <ThemedText type="small" style={{ color: fg, flex: 1 }}>{t(kind === 'synced' ? 'sync.synced' : 'sync.nowOnline')}</ThemedText>
    </Animated.View>
  );
}

export function SyncBanner() {
  const { t } = useT();
  const off = useOffline();
  const th = useTheme();
  const flash = useFlash(off.online, off.pending, off.syncing);
  if (off.online && off.pending === 0 && off.failed === 0) return flash ? <FlashBanner kind={flash} /> : null;
  const failed = off.failed > 0;
  const tone = failed ? 'danger' : off.online ? 'info' : 'warning';
  const { bg, fg } = toneColors(tone, th);
  const text = failed ? t('sync.failed', { count: off.failed }) : !off.online ? (off.pending > 0 ? t('sync.offlinePending', { count: off.pending }) : t('sync.offline')) : t('sync.sending', { count: off.pending });
  return (
    <>
    {flash && off.online && !failed ? <FlashBanner kind={flash} /> : null}
    <Pressable onPress={() => router.push('/sync')} accessibilityRole="button" style={[s.banner, { backgroundColor: bg }]}>
      <Icon name={failed ? 'triangle-exclamation' : off.online ? 'arrows-rotate' : 'cloud-arrow-up'} size={14} color={fg} />
      <ThemedText type="small" style={{ color: fg, flex: 1 }} numberOfLines={2}>{text}</ThemedText>
      <Icon name="chevron-right" size={12} color={fg} />
    </Pressable>
    </>
  );
}

function toneColors(tone: Tone, th: ReturnType<typeof useTheme>) {
  return {
    neutral: { bg: th.backgroundSelected, fg: th.text }, primary: { bg: th.backgroundSelected, fg: th.primary }, success: { bg: th.successBg, fg: th.success },
    warning: { bg: th.warningBg, fg: th.warning }, danger: { bg: th.dangerBg, fg: th.danger }, info: { bg: th.infoBg, fg: th.primary },
  }[tone];
}

/* ---------- Ecran ---------- */

type ScreenProps = {
  title?: string;
  subtitle?: string;
  /** Fleche de retour (par defaut : si on peut revenir en arriere). */
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  /** Ecran sans defilement (ex. caisse) : le contenu gere lui-meme son defilement. */
  fixed?: boolean;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
  /** Barre collee en bas (bouton principal). */
  footer?: ReactNode;
  /** L'ecran est sous une barre d'onglets : pas de marge basse supplementaire. */
  tabs?: boolean;
  maxWidth?: number;
  keyboard?: boolean;
  /** Liste qui se charge par morceaux : appele quand on approche du bas (ou si le contenu est trop court pour defiler). */
  onEndReached?: () => void;
};

export function Screen({ title, subtitle, back, right, children, fixed, onRefresh, refreshing, footer, tabs, maxWidth = 1100, keyboard, onEndReached }: ScreenProps) {
  const th = useTheme();
  const { gutter } = useLayout();
  const showBack = back ?? router.canGoBack();
  const [spin, setSpin] = useState(false);
  // un seul declenchement par arrivee de contenu : on se re-arme quand la liste a grandi (evite les demandes en rafale)
  const endRef = useRef(onEndReached);
  useEffect(() => { endRef.current = onEndReached; });
  const armed = useRef(true);
  const viewport = useRef(0);
  const body = (
    <View style={[s.screenBody, { maxWidth, paddingHorizontal: gutter }]}>
      {children}
    </View>
  );
  const inner = (
    <>
      <SyncBanner />
      {title ? (
        <View style={[s.header, { paddingHorizontal: gutter, maxWidth: maxWidth + gutter * 2 }]}>
          {showBack ? (
            <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour" hitSlop={10} style={[s.backBtn, { backgroundColor: th.backgroundElement }]}>
              <Icon name="arrow-left" size={16} />
            </Pressable>
          ) : null}
          <View style={s.headerText}>
            <ThemedText type="subtitle" style={s.h1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</ThemedText>
            {subtitle ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{subtitle}</ThemedText> : null}
          </View>
          {right}
        </View>
      ) : null}
      {fixed ? <View style={[s.fixed, { paddingHorizontal: gutter }]}>{children}</View> : (
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={onEndReached ? 100 : undefined}
          onLayout={onEndReached ? (e) => { viewport.current = e.nativeEvent.layout.height; } : undefined}
          onScroll={onEndReached ? (e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            if (armed.current && contentOffset.y + layoutMeasurement.height >= contentSize.height - 600) { armed.current = false; endRef.current?.(); }
          } : undefined}
          onContentSizeChange={onEndReached ? (_w, h) => {
            armed.current = true;
            if (h - viewport.current < 600) { armed.current = false; endRef.current?.(); }   // contenu trop court pour defiler : on charge la suite tout de suite
          } : undefined}
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={refreshing ?? spin} tintColor={th.primary} onRefresh={async () => { setSpin(true); try { await onRefresh(); } finally { setSpin(false); } }} />
          ) : undefined}>
          {body}
        </ScrollView>
      )}
      {footer ? <View style={[s.footer, { backgroundColor: th.background, borderTopColor: th.progressTrack, paddingHorizontal: gutter }]}><View style={[s.footerInner, { maxWidth }]}>{footer}</View></View> : null}
    </>
  );
  return (
    <ThemedView style={s.root}>
      <SafeAreaView style={s.flex} edges={tabs ? ['top'] : ['top', 'bottom']}>
        {keyboard ? <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{inner}</KeyboardAvoidingView> : inner}
      </SafeAreaView>
    </ThemedView>
  );
}

/* ---------- Cartes, grilles, lignes ---------- */

/** Les champs poses sur une carte prennent le fond de l'ecran pour rester visibles (sinon carte et champ ont la meme couleur). */
const OnCard = createContext(false);
export const useOnCard = () => useContext(OnCard);

export function Card({ children, style, onPress, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: Tone }) {
  const th = useTheme();
  const c = useTone(tone ?? 'neutral');
  const base: ViewStyle = { backgroundColor: tone ? c.bg : th.backgroundElement };
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.card, base, pressed && { opacity: 0.75, transform: [{ scale: 0.99 }] }, style]}>
        <OnCard.Provider value>{children}</OnCard.Provider>
      </Pressable>
    );
  }
  return <View style={[s.card, base, style]}><OnCard.Provider value>{children}</OnCard.Provider></View>;
}

/** Grille responsive : le nombre de colonnes depend de la largeur REELLE disponible (pas de l'ecran : un menu lateral en retire). */
export function Grid({ children, min = 280, gap = 12, style }: { children: ReactNode; min?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  const [w, setW] = useState(0);
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  const cols = w === 0 ? 1 : Math.max(1, Math.floor((w + gap) / (min + gap)));
  const itemW = w === 0 ? '100%' : (w - gap * (cols - 1)) / cols;
  return (
    <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap }, style]}>
      {items.map((child, i) => <View key={i} style={{ width: itemW as number, minWidth: 0 }}>{child}</View>)}
    </View>
  );
}

export function Stack({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <View style={s.sectionTitle}>
      <View style={s.flex}>
        <ThemedText type="smallBold" style={s.upper}>{title}</ThemedText>
        {hint ? <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText> : null}
      </View>
      {right}
    </View>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const { bg, fg } = useTone(tone);
  return <View style={[s.badge, { backgroundColor: bg }]}><ThemedText type="smallBold" style={{ color: fg, fontSize: 12, lineHeight: 16 }}>{children}</ThemedText></View>;
}

export function IconBadge({ name, tone = 'primary', size = 40 }: { name: string; tone?: Tone; size?: number }) {
  const { bg, fg } = useTone(tone);
  return <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={name} size={size * 0.42} color={fg} /></View>;
}

/** Ligne de liste : icone ou vignette, titre, detail, valeur a droite. Toute la ligne est cliquable si `onPress`. */
export function Row({ icon, thumb, title, subtitle, meta, right, onPress, tone, chevron }: {
  icon?: string; thumb?: ReactNode; title: string; subtitle?: string; meta?: ReactNode; right?: ReactNode; onPress?: () => void; tone?: Tone; chevron?: boolean;
}) {
  const th = useTheme();
  const content = (
    <>
      {thumb ?? (icon ? <IconBadge name={icon} tone={tone ?? 'primary'} /> : null)}
      <View style={s.rowText}>
        <ThemedText type="smallBold" numberOfLines={2} style={s.rowTitle}>{title}</ThemedText>
        {subtitle ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{subtitle}</ThemedText> : null}
        {meta}
      </View>
      {right}
      {onPress && chevron !== false ? <Icon name="chevron-right" size={12} color={th.textSecondary} /> : null}
    </>
  );
  if (!onPress) return <View style={[s.row, { backgroundColor: th.backgroundElement }]}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement }, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

/* ---------- Boutons, puces, segments ---------- */

export function Btn({ title, onPress, icon, variant = 'primary', loading, disabled, small, style }: {
  title: string; onPress: () => void; icon?: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const th = useTheme();
  const bg = variant === 'primary' ? th.primary : variant === 'danger' ? th.dangerBg : variant === 'secondary' ? th.backgroundElement : 'transparent';
  const fg = variant === 'primary' ? th.primaryText : variant === 'danger' ? th.danger : th.text;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg }, (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={small ? 13 : 15} color={fg} /> : null}
          <ThemedText type="smallBold" style={{ color: fg, fontSize: small ? 13 : 15 }} numberOfLines={1}>{title}</ThemedText>
        </>
      )}
    </Pressable>
  );
}

export function IconBtn({ name, onPress, label, tone, size = 40 }: { name: string; onPress: () => void; label: string; tone?: Tone; size?: number }) {
  const th = useTheme();
  const c = useTone(tone ?? 'neutral');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2.5, backgroundColor: tone ? c.bg : th.backgroundElement, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}>
      <Icon name={name} size={size * 0.4} color={tone ? c.fg : th.text} />
    </Pressable>
  );
}

export function Chips<T extends string>({ options, value, onChange, scroll = true }: { options: { value: T; label: string; icon?: string }[]; value: T; onChange: (v: T) => void; scroll?: boolean }) {
  const th = useTheme();
  const items = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
        style={[s.chip, { backgroundColor: on ? th.primary : th.backgroundElement }]}>
        {o.icon ? <Icon name={o.icon} size={13} color={on ? th.primaryText : th.textSecondary} /> : null}
        <ThemedText type="smallBold" style={{ color: on ? th.primaryText : th.text }} numberOfLines={1}>{o.label}</ThemedText>
      </Pressable>
    );
  });
  return scroll
    ? <View style={{ flexGrow: 0, flexShrink: 0 }}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>{items}</ScrollView></View>
    : <View style={[s.chipsRow, { flexWrap: 'wrap' }]}>{items}</View>;
}

/* ---------- Etats : vide, chargement, aide ---------- */

export function Empty({ icon = 'inbox', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={s.empty}>
      <IconBadge name={icon} size={64} />
      <ThemedText type="smallBold" style={[s.center, { fontSize: 17 }]}>{title}</ThemedText>
      {text ? <ThemedText type="small" themeColor="textSecondary" style={s.center}>{text}</ThemedText> : null}
      {action}
    </View>
  );
}

/** Encadre qui explique quoi faire : le guide integre de l'application. */
export function Hint({ icon = 'lightbulb', title, children, tone = 'info' }: { icon?: string; title?: string; children: ReactNode; tone?: Tone }) {
  const { bg, fg } = useTone(tone);
  return (
    <View style={[s.hint, { backgroundColor: bg }]}>
      <Icon name={icon} size={16} color={fg} style={{ marginTop: 3 }} />
      <View style={s.flex}>
        {title ? <ThemedText type="smallBold" style={{ color: fg }}>{title}</ThemedText> : null}
        <ThemedText type="small" style={{ color: fg }}>{children}</ThemedText>
      </View>
    </View>
  );
}

export function Skeleton({ height = 64, rows = 1 }: { height?: number; rows?: number }) {
  const th = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => <Animated.View key={i} style={{ height, borderRadius: 16, backgroundColor: th.backgroundElement, opacity: pulse }} />)}
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  const text = message === 'network' ? t('common.network') : message === 'error' ? t('common.error') : message;
  return (
    <Card tone="danger">
      <ThemedText type="small" themeColor="danger">{text}</ThemedText>
      {onRetry ? <Btn title={t('common.retry')} onPress={onRetry} variant="secondary" small /> : null}
    </Card>
  );
}

/* ---------- Champs ---------- */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
      {error ? <ThemedText type="small" themeColor="danger">{error}</ThemedText> : hint ? <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText> : null}
    </View>
  );
}

export function Input({ style, ...rest }: TextInputProps) {
  const th = useTheme();
  const onCard = useContext(OnCard);
  return (
    <TextInput
      placeholderTextColor={th.textSecondary}
      style={[s.input, { backgroundColor: onCard ? th.background : th.backgroundElement, color: th.text, fontFamily: fontFor(500) }, style]}
      {...rest}
    />
  );
}

/** Champ texte avec libelle, aide et erreur. */
export function TextBox({ label, hint, error, ...rest }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return <Field label={label} hint={hint} error={error}><Input accessibilityLabel={label} {...rest} /></Field>;
}

export function NumberBox({ label, value, onChange, hint, suffix, error, ...rest }: Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & { label: string; value: string | number; onChange: (v: string) => void; hint?: string; suffix?: string; error?: string | null }) {
  const th = useTheme();
  return (
    <Field label={label} hint={hint} error={error}>
      <View>
        <Input accessibilityLabel={label} keyboardType="decimal-pad" inputMode="decimal" value={String(value ?? '')} onChangeText={(v) => onChange(v.replace(',', '.').replace(/[^0-9.]/g, ''))} style={suffix ? { paddingRight: 56 } : undefined} {...rest} />
        {suffix ? <ThemedText type="small" style={{ position: 'absolute', right: 14, top: 15, color: th.textSecondary }}>{suffix}</ThemedText> : null}
      </View>
    </Field>
  );
}

export function Switch({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const th = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={s.switchRow}>
      <View style={s.flex}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {hint ? <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText> : null}
      </View>
      <View style={[s.track, { backgroundColor: value ? th.primary : th.progressTrack }]}>
        <View style={[s.thumb, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const th = useTheme();
  const [text, setText] = useState<string | null>(null);
  return (
    <View style={[s.stepper, { backgroundColor: th.background }]}>
      <Pressable accessibilityLabel="-" hitSlop={6} onPress={() => onChange(Math.max(min, value - 1))} style={s.stepBtn}><Icon name="minus" size={13} /></Pressable>
      <TextInput
        value={text ?? String(value)}
        onFocus={() => setText(String(value))}
        onChangeText={(v) => { const c = v.replace(',', '.').replace(/[^0-9.]/g, ''); setText(c); const n = Number(c); if (!Number.isNaN(n)) onChange(n); }}
        onBlur={() => setText(null)}
        keyboardType="decimal-pad" inputMode="decimal" selectTextOnFocus
        style={[s.stepInput, { color: th.text, fontFamily: fontFor(700) }]}
      />
      <Pressable accessibilityLabel="+" hitSlop={6} onPress={() => onChange(value + 1)} style={s.stepBtn}><Icon name="plus" size={13} /></Pressable>
    </View>
  );
}

/* ---------- Feuille (fenetre qui monte du bas, centree sur grand ecran) ---------- */

export function Sheet({ visible, title, onClose, children, footer, tall }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; tall?: boolean }) {
  const th = useTheme();
  const { wide, height } = useLayout();
  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={[s.backdrop, wide && { justifyContent: 'center', alignItems: 'center' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[s.sheet, { backgroundColor: th.background, maxHeight: height * (tall ? 0.94 : 0.88) }, wide ? s.sheetWide : s.sheetBottom]}>
          {!wide ? <View style={[s.grab, { backgroundColor: th.progressTrack }]} /> : null}
          <View style={s.sheetHead}>
            <ThemedText type="subtitle" style={s.sheetTitle} numberOfLines={2}>{title}</ThemedText>
            <IconBtn name="xmark" label="Fermer" onPress={onClose} size={36} />
          </View>
          <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
          {footer ? <SafeAreaView edges={['bottom']} style={[s.sheetFoot, { borderTopColor: th.progressTrack }]}>{footer}</SafeAreaView> : <SafeAreaView edges={['bottom']} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- Messages ephemeres ---------- */

type ToastFn = (message: string, tone?: Tone) => void;
const ToastContext = createContext<ToastFn>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const th = useTheme();
  const show = useCallback<ToastFn>((message, tone = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const c = toneColors(toast?.tone ?? 'success', th);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={s.toastWrap}>
          <View style={[s.toast, { backgroundColor: c.bg, borderColor: c.fg }]}>
            <Icon name={toast.tone === 'danger' ? 'circle-xmark' : toast.tone === 'warning' ? 'triangle-exclamation' : 'circle-check'} size={16} color={c.fg} />
            <ThemedText type="smallBold" style={{ color: c.fg, flexShrink: 1 }}>{toast.message}</ThemedText>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function Fab({ icon = 'plus', onPress, label }: { icon?: string; onPress: () => void; label: string }) {
  const th = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.fab, { backgroundColor: th.primary }, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={20} color={th.primaryText} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  root: { flex: 1 },
  screenBody: { width: '100%', alignSelf: 'center', gap: 14, paddingTop: 4, paddingBottom: 28 },
  scrollContent: { flexGrow: 1 },
  fixed: { flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center', paddingBottom: 8 },
  header: { width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 10 },
  headerText: { flex: 1, minWidth: 0 },
  h1: { fontSize: 24, lineHeight: 30 },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingBottom: 10 },
  footerInner: { width: '100%', alignSelf: 'center', gap: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  card: { borderRadius: 20, padding: 16, gap: 8 },
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  upper: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, minHeight: 64 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15 },
  btn: { minHeight: 50, borderRadius: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 38, borderRadius: 12, paddingHorizontal: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 38, borderRadius: 999 },
  chipsRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 12 },
  center: { textAlign: 'center' },
  hint: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16 },
  input: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, minHeight: 50 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  track: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12 },
  stepBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepInput: { width: 46, textAlign: 'center', fontSize: 16, paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(3,10,22,0.55)', justifyContent: 'flex-end' },
  sheet: { width: '100%', overflow: 'hidden' },
  sheetBottom: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetWide: { maxWidth: 560, borderRadius: 28 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  sheetTitle: { flex: 1, fontSize: 20, lineHeight: 26 },
  sheetBody: { padding: 20, gap: 14 },
  sheetFoot: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  toastWrap: { position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, maxWidth: 520, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
});
