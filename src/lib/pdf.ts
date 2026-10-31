import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { apiBlob } from './api';
import { qs } from './query';

type Params = Record<string, string | number | boolean | undefined | null>;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

/**
 * Genere un PDF cote serveur (memes droits que l'ecran) puis l'ouvre : telechargement sur le web, feuille de partage sur le telephone
 * (enregistrer, imprimer, WhatsApp, e-mail...). Le serveur choisit la langue de la boutique ; le journal multi-boutiques recoit `lang`.
 */
export async function downloadPdf(path: string, { shop, params, name = 'rapport.pdf' }: { shop?: string; params?: Params; name?: string } = {}) {
  await saveBlob(await apiBlob(`${path}${params ? qs(params) : ''}`, { shop }), name);
}

/** Remet un fichier recu du serveur a l'utilisateur : telechargement du navigateur, ou feuille de partage du telephone. */
export async function saveBlob(blob: Blob, name: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${name.replace(/[^\w.-]+/g, '_')}`;
  await FileSystem.writeAsStringAsync(uri, await toBase64(blob), { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
}
