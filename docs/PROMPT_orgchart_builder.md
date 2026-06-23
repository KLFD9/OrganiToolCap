# Prompt Claude Code — OrgChart Builder (SPA, no-backend)

## Contexte & objectif

Construire une **application web mono-page (SPA) 100 % client, sans aucun backend**, permettant à une équipe marketing non-technique de créer, éditer et exporter des **organigrammes modernes**.

Contraintes produit non négociables :
- **Aucun serveur, aucune base de données, aucune dépendance réseau à l'exécution.** L'app doit fonctionner ouverte depuis n'importe quel poste (URL d'un hébergement statique, ou même fichier local).
- **Le fichier est la source de vérité.** L'utilisateur enregistre son travail dans un fichier `.orgchart.json` sur sa machine et peut le rouvrir plus tard, sur un autre poste, **à l'identique** (mêmes nœuds, mêmes positions, mêmes styles, même template).
- **Auto-sauvegarde locale de confort** (IndexedDB via Dexie) pour ne pas perdre le travail en cas de fermeture accidentelle — mais ce n'est PAS le mécanisme de partage : le partage passe par le fichier `.json`.
- **Export PDF vectoriel** propre, prêt pour impression institutionnelle (A4 et A3, portrait/paysage).
- **Templates + personnalisation libre** : l'utilisateur démarre depuis un modèle pré-stylé OU d'une page vierge, puis personnalise tout.

Public cible : marketing, non-développeurs, pas de licence logicielle. L'ergonomie prime.

## Stack imposée

- **Vite + React 18 + TypeScript** (pas de Next.js, pas de SSR)
- **@xyflow/react** (React Flow) — canvas, nœuds custom, edges
- **elkjs** — layout hiérarchique automatique (gérer arbres asymétriques et denses)
- **Zustand** — state global
- **Dexie** (IndexedDB) — autosave de confort uniquement
- **html-to-image** (`toSvg`) **+ jsPDF** — export PDF vectoriel client-side
- **Tailwind CSS** — styling
- **zod** — validation/parsing du fichier `.json` à l'ouverture (rejeter proprement un fichier corrompu ou d'une version incompatible)

Pas d'autres dépendances sans justification.

## Stratégie de données : fichier-first

Définir un format de fichier versionné, sérialisable, stable :

```ts
// Le contenu exact d'un fichier .orgchart.json
interface OrgChartFile {
  format: "orgchart";
  version: 1;              // versionné pour migrations futures
  meta: {
    title: string;
    createdAt: string;     // ISO
    updatedAt: string;     // ISO
  };
  templateId: string;      // template d'origine (ou "blank")
  theme: OrgTheme;         // palette, polices, styles de nœud — personnalisables
  nodes: OrgNode[];        // positions incluses
  edges: OrgEdge[];
  layout: {
    direction: "TB" | "LR";
    auto: boolean;         // layout elkjs auto ou positions manuelles figées
  };
}

interface OrgNode {
  id: string;
  data: {
    name: string;
    role?: string;         // intitulé de poste
    department?: string;   // libellé de pôle (eyebrow)
    email?: string;
    avatarUrl?: string;    // optionnel, data-URI base64 pour rester self-contained
  };
  position: { x: number; y: number };
  styleOverride?: Partial<OrgNodeStyle>; // perso par nœud
}

interface OrgEdge { id: string; source: string; target: string; }

interface OrgTheme {
  accent: string;          // ex #472F74
  palette: string[];       // niveaux hiérarchiques
  fontFamily: string;
  nodeStyle: "glass" | "flat" | "card" | "outline";
  cornerRadius: number;
}
```

**Règle d'or** : tout l'état métier doit être reconstructible à partir d'`OrgChartFile`. Le store Zustand sérialise vers ce type et hydrate depuis lui, sans perte. Les `avatarUrl` doivent être encodées en data-URI base64 dans le fichier pour qu'il reste **autonome** (rouvrir sur un autre poste sans images cassées).

## I/O fichier — le cœur du besoin

Implémenter un module `fileIO` :

1. **Enregistrer** :
   - Si `window.showSaveFilePicker` dispo (Chrome/Edge) → vrai dialogue « Enregistrer sous », garde le handle pour des « Ctrl+S » suivants sans redemander.
   - Sinon → fallback : génère un Blob et déclenche un download `titre.orgchart.json`.
2. **Ouvrir** :
   - Si `window.showOpenFilePicker` dispo → dialogue natif.
   - Sinon → `<input type="file" accept=".json,.orgchart.json">`.
   - **Toujours** valider via zod contre le schéma `OrgChartFile`. Si `version` future ou format invalide → message clair (« Fichier non reconnu » / « Créé avec une version plus récente »), jamais de crash.
3. **Raccourcis** : Ctrl/Cmd+S = enregistrer, Ctrl/Cmd+O = ouvrir.
4. **Indicateur d'état** « modifications non enregistrées » + `beforeunload` warning si dirty.

## Autosave de confort (secondaire)

Dexie stocke le dernier état en cours sous une clé. Au démarrage, si un brouillon existe, proposer « Reprendre le brouillon » sans l'imposer. Bien expliquer à l'utilisateur que **le brouillon est lié à ce navigateur** et que le partage/archivage passe par « Enregistrer le fichier ».

## Templates

Livrer **3 templates** bundlés (objets `OrgChartFile` partiels, dans `/src/templates`) :
- `glass-cap` : glassmorphisme, accent `#472F74`, dégradés violets, reflets — style institutionnel CAP.
- `flat-corporate` : aplats nets, coins légers, hiérarchie par teintes de l'accent.
- `card-outline` : cartes blanches bord fin, sobre, dense.

L'utilisateur choisit un template à la création, OU « Page vierge ». Après application il personnalise librement (accent, police, style de nœud, par nœud).

## Layout

- Bouton « Ranger automatiquement » → elkjs recalcule positions hiérarchiques (TB par défaut, bascule LR).
- Mode manuel : l'utilisateur déplace librement, positions persistées dans le fichier.
- Gérer proprement les branches asymétriques (un responsable avec 1 enfant, un autre avec 5).

## Export PDF

- `html-to-image` `toSvg` du viewport React Flow (vectoriel, net à toute échelle) → injection dans jsPDF.
- Options : format (A4/A3), orientation, marges, titre/pied de page optionnel.
- Le rendu PDF doit être fidèle au canvas (mêmes couleurs, polices web embarquées ou fallback sûr).
- Bonus : export `.png` haute résolution et export `.svg`.

## Architecture & qualité

- `mock-first` : démarrer avec l'organigramme ATHANOR comme données de démo (13 personnes, hiérarchie Direction → pôles → équipes terrain) pour valider le rendu dès le premier run.
- Découpage : `components/` (Canvas, NodeCard, Toolbar, Inspector, TemplatePicker, ExportDialog), `store/` (Zustand), `lib/` (fileIO, pdfExport, elkLayout, schema zod), `templates/`.
- Composant `NodeCard` piloté par `OrgTheme` + `styleOverride` (un seul composant, plusieurs styles via le thème — pas un composant par template).
- Accessibilité : focus clavier visible, navigation au clavier sur le canvas, `prefers-reduced-motion` respecté.
- Responsive : utilisable sur laptop standard ; toolbar et inspector repliables.
- **Aucun appel réseau.** Aucune télémétrie. Tout reste local. (C'est ça, « sécurisé » dans ce contexte : par construction, aucune donnée RH ne quitte le poste.)

## Sortie attendue de ce premier run

1. Projet Vite qui build et tourne (`npm run dev`).
2. Canvas React Flow affichant l'organigramme ATHANOR de démo, style `glass-cap`.
3. Ajout/édition/suppression de nœuds et de liens via inspector.
4. Enregistrer / Ouvrir un fichier `.orgchart.json` fonctionnels (File System Access API + fallback), avec round-trip fidèle.
5. Export PDF basique opérationnel.
6. Sélecteur de template + page vierge.

Ne pas sur-ingénier. Construire incrémentalement, vérifier que le round-trip fichier est fidèle avant d'ajouter du polish visuel. Annoncer les hypothèses prises plutôt que de demander si un détail est ambigu.
