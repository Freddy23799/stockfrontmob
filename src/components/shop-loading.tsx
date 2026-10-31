import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export function ShopLoading({ error, retry }: { error: string | null; retry: () => void }) {
  const { t } = useT();
  const theme = useTheme();
  return (
    <ThemedView style={styles.box}>
      {error ? (
        <View style={styles.inner}>
          <ThemedText themeColor="danger" style={styles.center}>{error}</ThemedText>
          <Button title={t('common.retry')} onPress={retry} />
        </View>
      ) : (
        <View style={styles.inner}>
          <ActivityIndicator color={theme.primary} size="large" />
          <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  inner: { gap: Spacing.three, alignItems: 'stretch', maxWidth: 360 },
  center: { textAlign: 'center' },
});
