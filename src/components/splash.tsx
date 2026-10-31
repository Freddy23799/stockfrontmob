import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Ecran d'attente : le logo apparait en douceur et respire legerement. */
export function Splash() {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(0.86));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.94, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    ]).start();
  }, [opacity, scale]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Vylaxo" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 120, height: 120 },
});
