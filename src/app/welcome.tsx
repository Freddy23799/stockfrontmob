import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES } from '@/i18n/dictionaries';
import { useT } from '@/i18n';
import { useIntro } from '@/lib/intro-context';
import { Spacing } from '@/constants/theme';

const SLIDES = [
  { key: 1, image: require('@/assets/images/welcome/1.jpg'), icon: 'store' },
  { key: 2, image: require('@/assets/images/welcome/2.jpg'), icon: 'wand-magic-sparkles' },
  { key: 3, image: require('@/assets/images/welcome/3.jpg'), icon: 'arrows-rotate' },
  { key: 4, image: require('@/assets/images/welcome/4.jpg'), icon: 'tags' },
] as const;

/**
 * Presentation affichee UNE fois, a la premiere ouverture : quatre ecrans a faire glisser,
 * avec "Passer" toujours accessible. Elle explique ce que fait l'application avant de demander un compte.
 */
export default function WelcomeScreen() {
  const { t, lang, setLang } = useT();
  const theme = useTheme();
  const { finish } = useIntro();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [scrollX] = useState(() => new Animated.Value(0));
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  // la photo cede de la place au texte et aux boutons sur les petits ecrans
  const imageHeight = Math.max(220, Math.min(Math.round(height * 0.5), height - 440));

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function next() {
    if (!last) listRef.current?.scrollToOffset({ offset: (index + 1) * width, animated: true });
    else finish('register');
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item.key)}
        // pages de largeur fixe : permet au bouton "Suivant" de viser une page precise
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
          // la page courante suit le defilement (fiable aussi apres un "Suivant" programme)
          listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width)),
        })}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        renderItem={({ item, index: i }) => {
          // la photo glisse un peu moins vite que la page : effet de profondeur
          const translateX = scrollX.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [-width * 0.25, 0, width * 0.25] });
          const textOpacity = scrollX.interpolate({ inputRange: [(i - 0.6) * width, i * width, (i + 0.6) * width], outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <View style={{ width, height }}>
              <View style={{ height: imageHeight, overflow: 'hidden' }}>
                <Animated.View style={{ width: width * 1.5, height: imageHeight, marginLeft: -width * 0.25, transform: [{ translateX }] }}>
                  <Image source={item.image} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                </Animated.View>
                <LinearGradient colors={['rgba(255,255,255,0)', theme.background]} style={styles.fade} />
              </View>
              <Animated.View style={[styles.copy, { opacity: textOpacity }]}>
                <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                  <Icon name={item.icon} size={26} color={theme.primary} />
                </View>
                <ThemedText type="subtitle" style={styles.center}>{t(`welcome.${item.key}.title` as 'welcome.1.title')}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.center}>{t(`welcome.${item.key}.text` as 'welcome.1.text')}</ThemedText>
              </Animated.View>
            </View>
          );
        }}
      />

      {/* langue et "Passer" restent visibles sur la photo */}
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <View style={styles.langs}>
          {LANGUAGES.map((l) => (
            <Pressable key={l.code} onPress={() => setLang(l.code)} accessibilityRole="button" accessibilityState={{ selected: lang === l.code }} accessibilityLabel={l.label}
              style={[styles.chip, lang === l.code && { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" style={{ color: lang === l.code ? theme.primaryText : theme.text }}>{l.code.toUpperCase()}</ThemedText>
            </Pressable>
          ))}
        </View>
        {!last && (
          <Pressable onPress={() => finish('login')} accessibilityRole="button" hitSlop={12} style={styles.skip}>
            <ThemedText type="smallBold">{t('welcome.skip')}</ThemedText>
          </Pressable>
        )}
      </SafeAreaView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]}>
        <View style={styles.dots} accessibilityElementsHidden>
          {SLIDES.map((s, i) => {
            const scale = scrollX.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [1, 2.6, 1], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
            return <Animated.View key={s.key} style={[styles.dot, { backgroundColor: theme.primary, opacity, transform: [{ scaleX: scale }] }]} />;
          })}
        </View>
        <Pressable onPress={next} accessibilityRole="button" style={({ pressed }) => [styles.primary, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}>
          <ThemedText style={{ color: theme.primaryText, fontWeight: '700' }}>{last ? t('welcome.start') : t('welcome.next')}</ThemedText>
          <Icon name="arrow-right" size={16} color={theme.primaryText} />
        </Pressable>
        {last ? (
          <Pressable onPress={() => finish('login')} accessibilityRole="button" hitSlop={8} style={styles.secondary}>
            <ThemedText type="link" themeColor="textSecondary">{t('welcome.haveAccount')}</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.secondary} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140 },
  copy: { paddingHorizontal: Spacing.four, alignItems: 'center', gap: Spacing.two, marginTop: -44 },
  badge: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  center: { textAlign: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  langs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.78)' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  skip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.78)' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.four, gap: Spacing.three, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 8, height: 12, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  primary: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: 16 },
  secondary: { minHeight: 28, justifyContent: 'center' },
});
