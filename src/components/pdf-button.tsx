import { useState } from 'react';

import { Btn, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { downloadPdf } from '@/lib/pdf';
import { useShopOptional } from '@/lib/shop';

/**
 * Bouton « PDF » : demande le rapport au serveur puis ouvre le partage du telephone (telechargement sur le web).
 * `path` : /api/shop/pdf/... (boutique du contexte) ou /api/merchant/... avec `shopId` explicite ('' = sans boutique).
 */
export function PdfButton({ path, params, name, label, shopId, variant = 'secondary', small, disabled }: {
  path: string; params?: Record<string, string | number | boolean | undefined | null>; name: string; label?: string; shopId?: string;
  variant?: 'primary' | 'secondary' | 'ghost'; small?: boolean; disabled?: boolean;
}) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const shop = useShopOptional();
  // un sous-admin n'exporte que si le proprietaire lui a delegue ce droit (le serveur le verifie aussi) ; recus et factures restent libres
  const noExportRight = shop?.siteAdmin === true && !shop.delegated('EXPORT_DATA') && path.startsWith('/api/shop/pdf/') && !path.startsWith('/api/shop/pdf/documents/');

  async function run() {
    setBusy(true);
    try {
      await downloadPdf(path, { shop: shopId, params, name });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('pdf.failed'), 'danger');
    } finally {
      setBusy(false);
    }
  }

  if (noExportRight) return null;
  return <Btn small={small} variant={variant} icon="file-pdf" title={busy ? t('pdf.working') : label ?? t('pdf.export')} onPress={() => void run()} loading={busy} disabled={disabled} />;
}
