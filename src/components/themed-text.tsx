import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

/** Plus Jakarta Sans : sur mobile chaque graisse est un fichier de police distinct (fontWeight seul ne suffit pas). */
export function fontFor(weight: string | number | undefined): string {
  const w = Number(weight ?? 400);
  if (w >= 800) return 'PlusJakartaSans_800ExtraBold';
  if (w >= 700) return 'PlusJakartaSans_700Bold';
  if (w >= 600) return 'PlusJakartaSans_600SemiBold';
  if (w >= 500) return 'PlusJakartaSans_500Medium';
  return 'PlusJakartaSans_400Regular';
}

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const flat = StyleSheet.flatten([styles[type], style]);
  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text')];
  const fontFamily = type === 'code' ? Fonts.mono : fontFor(flat?.fontWeight);

  // fontWeight est retire : la graisse est portee par la famille de police choisie
  return <Text style={[{ color }, flat, { fontFamily, fontWeight: undefined }]} {...rest} />;
}

const styles = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: 700 },
  default: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  title: { fontSize: 40, fontWeight: 800, lineHeight: 46 },
  subtitle: { fontSize: 28, lineHeight: 36, fontWeight: 800 },
  link: { lineHeight: 30, fontSize: 14, fontWeight: 600 },
  linkPrimary: { lineHeight: 30, fontSize: 14, fontWeight: 700 },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
