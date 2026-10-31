#!/usr/bin/env bash
# Les textes de l'espace de travail (ventes, equipe, RH, tableaux de bord) sont ecrits une seule fois, cote site, puis copies ici :
# les trois langues restent identiques sur le web et le mobile. A relancer apres toute modification de ../stockfrontweb/src/i18n.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in workspace team hr dash pricing payments customer ops downloads list notif acct activity recovery support beverage beverageOps beverageIns laundry restaurant electronics reminders salon tailor quotes transfers ins; do
  { echo "// GENERE par scripts/sync-i18n.sh depuis stockfrontweb/src/i18n/$f.js : ne pas modifier ici."; cat "../stockfrontweb/src/i18n/$f.js"; } > "src/i18n/shared/$f.ts"
done
# textes generaux du site (reglages, adresse, e-mail...) : fr.js / en.js / es.js regroupes en un seul fichier
{
  echo "// GENERE par scripts/sync-i18n.sh depuis stockfrontweb/src/i18n/{fr,en,es}.js : ne pas modifier ici."
  echo "const fr = $(sed '1s/export default//' ../stockfrontweb/src/i18n/fr.js | sed '$ s/;$//')"
  echo ";"
  echo "const en = $(sed '1s/export default//' ../stockfrontweb/src/i18n/en.js | sed '$ s/;$//')"
  echo ";"
  echo "const es = $(sed '1s/export default//' ../stockfrontweb/src/i18n/es.js | sed '$ s/;$//')"
  echo ";"
  echo "export default { fr, en, es };"
} > src/i18n/shared/base.ts
