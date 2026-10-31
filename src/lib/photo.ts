import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Prend ou choisit une photo et la reduit AVANT l'envoi (1280 px, WebP) : 4 Mo deviennent quelques dizaines de Ko,
 * ce qui change tout sur une connexion mobile. Le serveur recompresse de toute facon (WebP + AVIF).
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<{ uri: string; name: string; type: string } | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && Platform.OS !== 'web') return null;
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  try {
    const out = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: asset.width >= asset.height ? { width: Math.min(1280, asset.width) } : { height: Math.min(1280, asset.height) } }], { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP });
    return { uri: out.uri, name: 'image.webp', type: 'image/webp' };
  } catch {
    return { uri: asset.uri, name: asset.fileName ?? 'image.jpg', type: asset.mimeType ?? 'image/jpeg' };
  }
}

/** Ajoute la photo a un FormData (mobile : objet {uri,name,type} ; web : on recupere le blob). */
export async function appendPhoto(form: FormData, field: string, photo: { uri: string; name: string; type: string }) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(photo.uri)).blob();
    form.append(field, blob, photo.name);
  } else {
    form.append(field, photo as unknown as Blob);
  }
}
