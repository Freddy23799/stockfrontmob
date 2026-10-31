/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1B3A',
    background: '#FFFFFF',
    backgroundElement: '#F0F5FB',
    backgroundSelected: '#DCEBFA',
    textSecondary: '#53657E',
    primary: '#208AEF',
    primaryText: '#FFFFFF',
    border: '#98AFCB',
    progressTrack: '#D5E2F2',
    danger: '#C62828',
    success: '#15803D',
    warning: '#B45309',
    successBg: '#DCFCE7',
    warningBg: '#FEF3C7',
    dangerBg: '#FEE2E2',
    infoBg: '#E0F2FE',
  },
  dark: {
    text: '#EFF6FF',
    background: '#07111F',
    backgroundElement: '#0D1F33',
    backgroundSelected: '#173A5C',
    textSecondary: '#A9BAD1',
    primary: '#69B9FF',
    primaryText: '#07111F',
    border: '#466A91',
    progressTrack: '#1A3450',
    danger: '#FCA5A5',
    success: '#86EFAC',
    warning: '#FCD34D',
    successBg: '#12351F',
    warningBg: '#42330F',
    dangerBg: '#4A1D24',
    infoBg: '#12385B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/** Palette des graphiques (meme ordre que le site : --c1..--c6). */
export const ChartColors = {
  light: ['#208AEF', '#16A34A', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'],
  dark: ['#69B9FF', '#4ADE80', '#FBBF24', '#A78BFA', '#F87171', '#22D3EE'],
} as const;
