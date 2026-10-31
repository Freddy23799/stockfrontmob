import { Alert, Platform } from 'react-native';

/** Demande de confirmation avant une action definitive (suppression, annulation...). */
export function confirmAction(title: string, text: string, confirmLabel: string, cancelLabel: string, danger = true): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${text}`));
  return new Promise((resolve) => {
    Alert.alert(title, text, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: danger ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
