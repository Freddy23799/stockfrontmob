import { Redirect, Stack, useLocalSearchParams, usePathname } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { CatalogProvider } from '@/lib/catalog';
import { NotificationsProvider } from '@/lib/notifications';
import { ShopProvider } from '@/lib/shop';

/** Un employe qui se connecte avec un mot de passe provisoire doit d'abord le changer. */
function ForcedPasswordGuard({ id }: { id: string }) {
  const { profile } = useAuth();
  const path = usePathname();
  if (profile?.accountType === 'EMPLOYEE' && profile.must_change_password === true && !path.endsWith('/account')) return <Redirect href={`/shop/${id}/account`} />;
  return null;
}

/** Tout ce qui est sous /shop/<id> vit dans l'espace de travail de CETTE boutique (pack, droits, catalogue local). */
export default function ShopRoot() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ShopProvider key={id} shopId={id}>
      <CatalogProvider>
        <NotificationsProvider shopId={id}>
          <ForcedPasswordGuard id={id} />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        </NotificationsProvider>
      </CatalogProvider>
    </ShopProvider>
  );
}
