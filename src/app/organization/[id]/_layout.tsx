import { Stack } from 'expo-router';

/** Ecrans d'une enseigne (pilotage de plusieurs sites) : hors d'une boutique, donc sans ShopProvider. */
export default function OrganizationRoot() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
