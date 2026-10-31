import { ActivityIndicator, Pressable, StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { fontFor, ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export function TextField({ label, style, ...rest }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, fontFamily: fontFor(500) }, style]}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
      />
    </ThemedView>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.primary : theme.backgroundElement },
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? theme.primaryText : theme.text} />
      ) : (
        <ThemedText style={{ color: primary ? theme.primaryText : theme.text, fontWeight: '700' }}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: 14, fontSize: 16 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
});
