import { storage } from './storage';

const KEY = 'vylaxo.introSeen';

/** Les ecrans de presentation ne s'affichent qu'a la toute premiere ouverture. */
export async function hasSeenIntro(): Promise<boolean> {
  try {
    return (await storage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markIntroSeen(): Promise<void> {
  try {
    await storage.setItem(KEY, '1');
  } catch {
    // sans importance : la presentation se reaffichera
  }
}
