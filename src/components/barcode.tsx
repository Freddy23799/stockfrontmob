import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { code39 } from '@/lib/barcode';

/** Code-barres (Code 39) sur fond blanc : lisible par une douchette meme en theme sombre. */
export function Barcode({ value, height = 64 }: { value: string; height?: number }) {
  const { bars, width, digits } = code39(value);
  if (!digits) return null;
  const quiet = 10;
  const total = width + quiet * 2;
  return (
    <View style={{ alignItems: 'center', gap: 6 }} accessibilityLabel={digits}>
      <View style={{ backgroundColor: '#fff', borderRadius: 8, width: '100%', maxWidth: 280, aspectRatio: total / height }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${total} ${height}`} preserveAspectRatio="none">
          {bars.map((b, i) => <Rect key={i} x={b.x + quiet} y={0} width={b.w} height={height} fill="#000" />)}
        </Svg>
      </View>
      <ThemedText type="smallBold" style={{ letterSpacing: 4 }}>{digits}</ThemedText>
    </View>
  );
}
