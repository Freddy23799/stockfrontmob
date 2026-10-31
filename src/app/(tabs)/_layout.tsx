import { Tabs } from 'expo-router';

import { Icon } from '@/components/icon';
import { fontFor } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export default function TabsLayout() {
  const { t } = useT();
  const colors = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.progressTrack },
        tabBarLabelStyle: { fontFamily: fontFor(600), fontSize: 12 },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.shops'), tabBarIcon: ({ color, size }) => <Icon name="store" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: t('tabs.account'), tabBarIcon: ({ color, size }) => <Icon name="user" size={size - 2} color={color} /> }} />
    </Tabs>
  );
}
