import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import PushBootstrap from '@/components/push-bootstrap';
import { Splash } from '@/components/splash';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { I18nProvider } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { cachePrune } from '@/lib/cache';
import { IntroProvider, useIntro } from '@/lib/intro-context';
import { OfflineProvider } from '@/lib/offline';
import { ThemePrefProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/ui';

SplashScreen.preventAutoHideAsync();

// Themes de navigation : les couleurs viennent de constants/theme.ts (clair = blanc et bleu clair, sombre = bleu nuit)
const navTheme = (scheme: 'light' | 'dark') => {
  const c = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return { ...base, colors: { ...base.colors, background: c.background, card: c.background, primary: c.primary, text: c.text, border: c.progressTrack } };
};

/**
 * Garde de routes, du premier lancement a l'espace marchand :
 *  1. jamais ouvert         -> presentation (welcome)
 *  2. deconnecte            -> connexion / inscription
 *  3. connecte, profil vide -> "Parlez-nous un peu de vous"
 *  4. connecte et complet   -> espace marchand
 */
function RootNavigator() {
  const { status, profile } = useAuth();
  const intro = useIntro();
  const router = useRouter();
  const [fontsLoaded] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const signedIn = status === 'signedIn';
  const ready = fontsLoaded && status !== 'loading' && intro.loaded;

  useEffect(() => {
    void SplashScreen.hideAsync(); // l'ecran d'attente (meme logo, meme fond) prend le relais sans a-coup
    // entretien du cache de lecture, apres le demarrage (jamais sur le chemin d'ouverture) : l'appareil reste leger au fil des annees
    const timer = setTimeout(() => void cachePrune(), 20000);
    return () => clearTimeout(timer);
  }, []);

  // Apres la presentation : "Commencer" mene a l'inscription, "J'ai deja un compte" a la connexion.
  useEffect(() => {
    if (ready && intro.seen && !signedIn) {
      const target = intro.consumeTarget();
      if (!target) return undefined;
      // on attend que le garde de routes ait ouvert login/register avant de naviguer, sinon la navigation est ignoree
      const timer = setTimeout(() => router.replace(target === 'register' ? '/register' : '/login'), 60);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ready, intro, signedIn, router]);

  if (!ready) return <Splash />;

  const needsProfile = signedIn && profile?.accountType === 'MERCHANT' && profile.profile_completed === false;

  return (
    <>
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Protected guard={signedIn && !needsProfile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="shop/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="organization/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="sync" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="operations" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_right' }} />
      </Stack.Protected>
      <Stack.Protected guard={needsProfile}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn && !intro.seen}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn && intro.seen}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="forgot-password" options={{ animation: 'slide_from_right' }} />
      </Stack.Protected>
    </Stack>
    <PushBootstrap />
    </>
  );
}

function ThemedApp() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={navTheme(scheme)}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <IntroProvider>
        <AuthProvider>
          <ThemePrefProvider>
            <OfflineProvider>
              <ToastProvider>
                <ThemedApp />
              </ToastProvider>
            </OfflineProvider>
          </ThemePrefProvider>
        </AuthProvider>
      </IntroProvider>
    </I18nProvider>
  );
}
