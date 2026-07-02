# OrganiTool CAP

Éditeur d'organigrammes mono-page **100 % client, sans backend**, pour une équipe marketing non technique. Toute la documentation produit est en français ; le code (identifiants, commits) reste en anglais technique standard.

## Commandes

```bash
npm run dev      # serveur de développement Vite
npm run build    # tsc -b + vite build → dist/ (hébergement statique)
npm test         # vitest run (tests unitaires, happy-dom)
npm run lint     # eslint
```

Toujours lancer `npm test` et `npm run lint` avant de considérer une modification terminée. `npm run build` inclut le typecheck (`tsc -b`).

## Invariants produit (ne jamais casser)

1. **Aucun appel réseau, aucune télémétrie.** La souveraineté des données (noms, e-mails, photos RH) est l'argument n° 1 du produit. N'introduire ni fetch externe, ni CDN, ni analytics. Les polices sont bundlées via @fontsource (sous-ensembles latin + latin-ext uniquement).
2. **Le fichier est la source de vérité.** Le format `.orgchart.json` est versionné et validé par zod (`src/types/orgchart.ts`). Évolution acceptée sur v1 : champs **optionnels additifs** dont l'absence a une sémantique claire (précédents : `layout.mode`, `theme.display`). Tout changement incompatible exige une montée de version avec migration à l'ouverture.
   Le repli de branches (`collapsedNodeIds`) est un état de vue **non persisté** — mais l'export est WYSIWYG : il exclut les branches repliées.
3. **IndexedDB n'est qu'un brouillon de confort** (restauration après fermeture accidentelle), pas un stockage principal.
4. **Round-trip PowerPoint** : l'export .pptx embarque le `.orgchart.json` complet et doit toujours se réimporter à l'identique (`pptxEditable.ts` / `pptxImport.ts`).
5. **Accessibilité** : `prefers-reduced-motion` respecté (voir `motionDuration()` dans Toolbar), focus visible, `aria-label` sur les boutons icône. Les raccourcis Tab/Entrée du canvas ne s'activent que si le focus est sur le canvas (jamais sur la toolbar ou un champ). PDF exporté : métadonnées + langue fr-FR (`applyPdfMetadata`).
6. **Piège de layout NodeCard** : la poignée source React Flow est au bas-centre des cartes — tout élément ajouté à cet endroit doit être décalé et porter la classe `nodrag`, sinon il intercepte l'edge-drop et déclenche un déplacement de carte (bug corrigé sur la pastille de repli).

## Architecture

```
src/
  components/   Canvas (React Flow : edge-drop, menus contextuels), NodeCard,
                Toolbar, Inspector, TemplatePicker, ExportDialog,
                ContextMenu, GroupBackground, ErrorBoundary
  store/        useOrgChartStore (Zustand) — undo/redo 50 niveaux,
                sérialise vers/depuis OrgChartFile sans perte
  lib/          fileIO (ouvrir/enregistrer + zod), csvImport, pdfExport,
                pdfVector (PDF natif via buildEditableSpec), pptxExport/
                pptxEditable/pptxImport, elkLayout, compactLayout,
                readability, exportLayout (optimiseur + grille page-aware),
                nodeStyle, groups, hierarchy (repli de branches),
                stats (effectifs), db (Dexie)
  templates/    thèmes bundlés (themes.ts), page vierge, démo ATHANOR
  types/        schéma zod OrgChartFile (format versionné)
```

- Les gros modules (elkjs, jsPDF, pptxgenjs, html-to-image, import pptx) sont **chargés à la demande** via `import()` dynamique — conserver ce pattern pour toute nouvelle dépendance lourde.
- `vite.config.ts` isole react/react-dom et @xyflow dans des chunks vendors dédiés.

## Système de couleur de l'UI de l'éditeur

- **Primaire : violet CAP** — échelle `--color-primary-50…950` dans `src/index.css`, dérivée de l'identité des templates (`#472F74` profond, `#6D4AAE` médian). Usage : CTA (Enregistrer, export PDF, restaurer), états actifs des toggles, focus ring, survols de sélection.
- **Neutres : zinc** sur fonds chauds (`#faf9f6` clair / `#09090b` sombre).
- **Sémantiques** : amber = avertissement/non enregistré, emerald = succès/enregistré, red = erreur. Le bouton export PPTX garde l'orange PowerPoint (`#C43E1C`) comme repère de marque.
- Ne pas confondre l'UI de l'éditeur avec les **thèmes des organigrammes** (`src/templates/themes.ts`), choisis par l'utilisateur et embarqués dans le fichier.

## Conventions

- Thème sombre : classe `.dark` sur `<html>`, posée avant le premier rendu par le script inline de `index.html`, puis gérée par React (`localStorage["editor-theme"]`). Une partie des composants reçoit `themeMode` en prop (ternaires), une autre utilise les variantes `dark:` de Tailwind — suivre le style du fichier modifié.
- Tailwind CSS v4 (`@theme` dans `index.css`, pas de tailwind.config).
- Tests unitaires colocalisés (`*.test.ts`) sur la logique de `lib/` et du store — pas de tests de composants. Toute nouvelle logique métier dans `lib/` doit être testée.
- Textes UI en français, avec la typographie française (espaces insécables avant « : », « ! », « ? » non requises dans le code, mais guillemets « » dans les libellés longs).

## Contexte produit

Positionnement et comparatif : `docs/ANALYSE_CONCURRENTIELLE.md`. Cahier des charges : `docs/PROMPT_orgchart_builder.md`. Différenciation structurelle : données 100 % locales, coût zéro, fichier-first, qualité d'export institutionnelle. Limites assumées : pas de collaboration temps réel, pas de sync SIRH.
