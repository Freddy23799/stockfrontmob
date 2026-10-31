import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import type { ComponentProps } from 'react';
// liste des icones "solid" disponibles : un nom inconnu ne doit jamais casser l'ecran
import meta from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome6Free_meta.json';

import { useTheme } from '@/hooks/use-theme';

type Glyph = ComponentProps<typeof FontAwesome6>['name'];
type Props = Omit<ComponentProps<typeof FontAwesome6>, 'name'> & { name: string };

const SOLID = new Set<string>((meta as { solid: string[] }).solid);

/** Les packs metier nomment leurs icones comme le site ("cart", "box"...) : voici leur equivalent Font Awesome. */
const ALIAS: Record<string, string> = {
  box: 'box-open', cart: 'cart-shopping', card: 'credit-card', sync: 'arrows-rotate', chart: 'chart-column', pin: 'location-dot', mail: 'envelope',
  menu: 'bars', close: 'xmark', info: 'circle-info', hourglass: 'hourglass-half', warning: 'triangle-exclamation', alarm: 'bell',
  search: 'magnifying-glass', truck: 'truck-ramp-box', sliders: 'sliders', edit: 'pen', scale: 'scale-balanced', money: 'money-bill-wave',
  mobile: 'mobile-screen', undo: 'rotate-left', grid: 'table-cells-large', triangle: 'triangle-exclamation', basket: 'basket-shopping',
  alert: 'triangle-exclamation', gear: 'gear', whatsapp: 'message', sparkles: 'wand-magic-sparkles', back: 'arrow-left', shield: 'shield-heart', 'arrow-up': 'arrow-trend-up',
  'arrow-down': 'arrow-trend-down', book: 'book-medical', arrow: 'arrow-right', lock2: 'lock', 'chart-line': 'chart-line',
  smartphone: 'mobile-screen-button', 'shield-check': 'shield-halved', 'calendar-clock': 'calendar-days', 'file-text': 'file-lines', package: 'box',
};

/** Icones Font Awesome (famille "solid"), couleur du theme par defaut. Un nom inconnu affiche un rond plutot que de casser l'ecran. */
export function Icon({ name, size = 20, color, ...rest }: Props) {
  const theme = useTheme();
  const glyph = ALIAS[name] ?? name;
  const known = SOLID.has(glyph);
  return <FontAwesome6 name={(known ? glyph : 'circle') as Glyph} size={size} color={color ?? theme.text} solid {...rest} />;
}
