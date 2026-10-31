// Verifie que chaque texte utilise existe en fr/en/es (mobile + partage avec le site).
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../src');
const load = (f) => { const src = fs.readFileSync(f, 'utf8').replace('export default', 'module.exports ='); const m = { exports: {} }; new Function('module', src)(m); return m.exports; };
// tous les fichiers partages du dossier (generes par sync-i18n.sh) : un nouveau fichier est controle sans rien modifier ici
const shared = fs.readdirSync(path.join(root, 'i18n/shared')).filter((f) => f.endsWith('.ts')).map((f) => load(path.join(root, 'i18n/shared', f)));
const _unused = ['workspace', 'team', 'hr', 'dash'].map((n) => load(path.join(root, 'i18n/shared', n + '.ts')));
const mobile = (() => { const src = fs.readFileSync(path.join(root, 'i18n/mobile.ts'), 'utf8').replace(/export const MOBILE[^=]*=/, 'module.exports ='); const m = { exports: {} }; new Function('module', src)(m); return m.exports; })();
// dictionaries.ts exporte plusieurs constantes : on extrait fr/en/es par regex d'objets
const dictSrc = fs.readFileSync(path.join(root, 'i18n/dictionaries.ts'), 'utf8');
const base = {};
for (const lang of ['fr', 'en', 'es']) {
  const m = dictSrc.match(new RegExp(`const ${lang}[^=]*= \\{([\\s\\S]*?)\\n\\};`));
  base[lang] = {};
  for (const [, k] of (m?.[1] ?? '').matchAll(/'([a-zA-Z0-9_.]+)':/g)) base[lang][k] = 1;
}
const langs = ['fr', 'en', 'es'];
const keys = Object.fromEntries(langs.map((l) => [l, new Set([...Object.keys(base[l]), ...Object.keys(mobile[l] ?? {}), ...shared.flatMap((s) => Object.keys(s[l] ?? {}))])]));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'shared' ? [] : walk(path.join(d, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
const used = [...new Set(walk(root).flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)].map((m) => m[1])))];
let bad = 0;
for (const k of used) {
  for (const l of langs) {
    if (!keys[l].has(k) && !keys[l].has(k + '_other')) { console.log(`MANQUE ${l}: ${k}`); bad++; }
  }
}
const own = (l) => new Set(Object.keys(mobile[l] ?? {}));
for (const l of ['en', 'es']) for (const k of own('fr')) if (!own(l).has(k)) { console.log(`PARITE mobile ${l}: ${k}`); bad++; }
console.log(bad ? `${bad} probleme(s)` : 'i18n OK');
process.exit(bad ? 1 : 0);
