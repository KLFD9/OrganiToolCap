import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ViewportPortal,
  useNodesState,
  useEdgesState,
  useReactFlow,
  SelectionMode,
  type Connection,
  type FinalConnectionState,
  type OnSelectionChangeFunc,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { computeLevels } from "../lib/nodeStyle";
import { computeDepartmentGroups, buildGroupTheme } from "../lib/groups";
import { computeStackedIds, CARD_WIDTH, CARD_HEIGHT } from "../lib/compactLayout";
import { buildChildrenMap, computeDescendantCounts, computeHiddenNodeIds, wouldCreateHierarchyCycle } from "../lib/hierarchy";
import { isHierarchyEdge, type ChromeElement, type ChromeKey, type ChromeLayout } from "../types/orgchart";
import {
  computeFrameMembership,
  frameIdFromNodeId,
  frameNodeId,
  frameRectPx,
  frameSizePx,
  resolveFrameChrome,
} from "../lib/frames";
import { mergeTargets, rectTargets, snapPosition, type Rect, type SnapTargets } from "../lib/smartGuides";
import {
  resolveChromeElement,
  isChromeTextKey,
  textHeightMm,
  CHROME_TEXT_LINE_HEIGHT,
  CHROME_TEXT_FONT_FAMILY,
} from "../lib/chromeLayout";
import {
  availableAreaForSetup,
  chromeOffsetsForSetup,
  estimateReadability,
  pageSizeMm,
  COMFORT_MM_PER_PX,
  PT_PER_MM,
  DEFAULT_PAGE,
} from "../lib/readability";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { GroupBackground, type GroupBackgroundData } from "./GroupBackground";
import { OrgEdge } from "./OrgEdge";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { PageGuide, type PageGuideData } from "./PageGuide";
import { ChromeElementNode, type ChromeElementData } from "./ChromeElement";

interface MenuState {
  x: number;
  y: number;
  /** Menu d'un membre (clic droit sur une carte). */
  nodeId?: string;
  /** Menu d'un lien (clic droit sur une arête). */
  edgeId?: string;
  /** Menu d'une page explicite (clic droit sur une feuille). */
  frameId?: string;
  /** Menu du fond de canvas : position d'insertion en coordonnées flow. */
  flowPos?: { x: number; y: number };
}

const nodeTypes = {
  orgNode: NodeCard,
  groupBg: GroupBackground,
  pageGuide: PageGuide,
  chromeElement: ChromeElementNode,
};
const edgeTypes = { org: OrgEdge };

const FORMAT_LABEL = { a4: "A4", a3: "A3" } as const;
const ORIENTATION_LABEL = { landscape: "paysage", portrait: "portrait" } as const;
/** Marge intérieure de la capture autour du contenu (captureFlow). */
const CAPTURE_MARGIN = 1.12;

// Conversions mm ↔ px canvas à l'échelle « confort » du cadre de page —
// mêmes formules que le résolveur, partagées par tous les éléments de chrome.
const mmToPx = (mm: number) => mm / COMFORT_MM_PER_PX;
const pxToMm = (px: number) => px * COMFORT_MM_PER_PX;

/**
 * Identifiants des nœuds React Flow d'édition :
 * - chrome de la page implicite : `chrome:<clé>` ;
 * - chrome d'une page explicite : `chrome:<frameId>:<clé>` (les ids de frame
 *   ne contiennent pas de « : ») ;
 * - feuille d'une page explicite : `frame:<frameId>` (helpers dans lib/frames).
 */
const CHROME_ID_PREFIX = "chrome:";
const chromeNodeId = (key: ChromeKey, frameId?: string) =>
  `${CHROME_ID_PREFIX}${frameId ? `${frameId}:` : ""}${key}`;
const parseChromeNodeId = (id: string): { key: ChromeKey; frameId?: string } | undefined => {
  if (!id.startsWith(CHROME_ID_PREFIX)) return undefined;
  const rest = id.slice(CHROME_ID_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep === -1) return { key: rest as ChromeKey };
  return { key: rest.slice(sep + 1) as ChromeKey, frameId: rest.slice(0, sep) };
};

// Mesure de la largeur d'un libellé (mm) pour centrer les défauts de chrome —
// même pile de polices que le rendu à l'écran (ChromeElement) et que le PDF
// (Helvetica), à 96 CSS px/pouce, pour un centrage cohérent des trois rendus.
let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureChromeTextMm(text: string, pt: number): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return 0;
  measureCtx.font = `${pt}pt ${CHROME_TEXT_FONT_FAMILY}`;
  return (measureCtx.measureText(text).width * 25.4) / 96;
}

/** Ratio largeur/hauteur intrinsèque d'une image de logo, chargée en arrière-plan. */
function useImageAspect(url?: string): number {
  // L'aspect mémorisé est associé à l'URL mesurée : au changement de logo, on
  // repart du carré (1) tant que la nouvelle image n'est pas chargée.
  const [measured, setMeasured] = useState<{ url: string; aspect: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setMeasured({ url, aspect: img.naturalWidth / img.naturalHeight });
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url && measured?.url === url ? measured.aspect : 1;
}

interface CanvasProps {
  themeMode?: "light" | "dark";
  showGroups?: boolean;
}

export const Canvas = forwardRef<HTMLDivElement, CanvasProps>(({ themeMode = "light", showGroups = false }, ref) => {
  const storeNodes = useOrgChartStore((s) => s.nodes);
  const storeEdges = useOrgChartStore((s) => s.edges);
  const theme = useOrgChartStore((s) => s.theme);
  const layout = useOrgChartStore((s) => s.layout);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const collapsedNodeIds = useOrgChartStore((s) => s.collapsedNodeIds);
  const setNodePosition = useOrgChartStore((s) => s.setNodePosition);
  const addEdge = useOrgChartStore((s) => s.addEdge);
  const selectNodes = useOrgChartStore((s) => s.selectNodes);
  const addNode = useOrgChartStore((s) => s.addNode);
  const addNodeAt = useOrgChartStore((s) => s.addNodeAt);
  const duplicateNode = useOrgChartStore((s) => s.duplicateNode);
  const deleteNode = useOrgChartStore((s) => s.deleteNode);
  const deleteEdge = useOrgChartStore((s) => s.deleteEdge);
  const setEdgeKind = useOrgChartStore((s) => s.setEdgeKind);
  const toggleCollapsed = useOrgChartStore((s) => s.toggleCollapsed);
  const expandAll = useOrgChartStore((s) => s.expandAll);
  const applyAutoLayout = useOrgChartStore((s) => s.applyAutoLayout);
  const setChromeElement = useOrgChartStore((s) => s.setChromeElement);
  const setFrameChromeElement = useOrgChartStore((s) => s.setFrameChromeElement);
  const frames = useOrgChartStore((s) => s.frames);
  const addFrame = useOrgChartStore((s) => s.addFrame);
  const deleteFrame = useOrgChartStore((s) => s.deleteFrame);
  const duplicateFrame = useOrgChartStore((s) => s.duplicateFrame);
  const moveFrameWithContent = useOrgChartStore((s) => s.moveFrameWithContent);
  const addFrameForBranch = useOrgChartStore((s) => s.addFrameForBranch);
  const arrangeFrame = useOrgChartStore((s) => s.arrangeFrame);

  const { screenToFlowPosition, fitView, fitBounds, getZoom } = useReactFlow();
  const [menu, setMenu] = useState<MenuState | null>(null);

  const levels = useMemo(() => computeLevels(storeNodes, storeEdges), [storeNodes, storeEdges]);

  // Repli de branches : nœuds masqués et effectifs par responsable
  const hiddenIds = useMemo(
    () => computeHiddenNodeIds(collapsedNodeIds, storeEdges),
    [collapsedNodeIds, storeEdges]
  );
  const childrenMap = useMemo(() => buildChildrenMap(storeEdges), [storeEdges]);
  const descendantCounts = useMemo(() => computeDescendantCounts(storeEdges), [storeEdges]);
  const visibleNodes = useMemo(
    () => (hiddenIds.size === 0 ? storeNodes : storeNodes.filter((n) => !hiddenIds.has(n.id))),
    [storeNodes, hiddenIds]
  );

  // En disposition compacte, les groupes de feuilles sont empilés : poignée
  // cible à gauche et lien parent routé « en épine ».
  const stackedIds = useMemo(
    () => (layout.mode === "compact" ? computeStackedIds(storeNodes, storeEdges) : new Set<string>()),
    [layout.mode, storeNodes, storeEdges]
  );

  // Cadre de page : feuille A4/A3 à l'échelle « confort », centrée sur le
  // contenu comme le fera l'export (fit-contain centré).
  const pageGuideEnabled = useOrgChartStore((s) => s.pageGuide);
  const page = useOrgChartStore((s) => s.layout.page) ?? DEFAULT_PAGE;
  const meta = useOrgChartStore((s) => s.meta);

  // Appartenance géométrique des cartes aux pages explicites (multi-pages)
  const hasFrames = frames.length > 0;
  const membership = useMemo(
    () => computeFrameMembership(frames, visibleNodes),
    [frames, visibleNodes]
  );

  // Page implicite (comportement historique) : uniquement sans pages explicites
  const pageGuideNodes = useMemo<Node<PageGuideData>[]>(() => {
    if (!pageGuideEnabled || hasFrames || visibleNodes.length === 0) return [];

    const chrome = {
      title: meta.title,
      footer: meta.footer,
      logoUrl: theme.logoUrl,
      secondaryLogoUrl: theme.secondaryLogoUrl,
    };
    const paperMm = pageSizeMm(page.format, page.orientation);
    const offsets = chromeOffsetsForSetup(page, chrome);
    const avail = availableAreaForSetup(page, chrome);

    // Encombrement du contenu (marge de capture incluse) et son centre
    const xs = visibleNodes.map((n) => n.position.x);
    const ys = visibleNodes.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const boundsW = (Math.max(...xs) - minX + CARD_WIDTH) * CAPTURE_MARGIN;
    const boundsH = (Math.max(...ys) - minY + CARD_HEIGHT) * CAPTURE_MARGIN;
    const centerX = minX + (Math.max(...xs) - minX + CARD_WIDTH) / 2;
    const centerY = minY + (Math.max(...ys) - minY + CARD_HEIGHT) / 2;

    const px = (mm: number) => mm / COMFORT_MM_PER_PX;
    const width = px(paperMm.width);
    const height = px(paperMm.height);
    const estimate = estimateReadability(boundsW, boundsH, avail.width, avail.height);

    return [
      {
        id: "__page-guide__",
        type: "pageGuide",
        position: { x: centerX - width / 2, y: centerY - height / 2 },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -2,
        data: {
          width,
          height,
          insetLeft: px(page.margin),
          insetRight: px(page.margin),
          insetTop: px(offsets.topOffset),
          insetBottom: px(offsets.bottomOffset),
          hasHeader: offsets.topOffset > page.margin,
          hasFooter: offsets.bottomOffset > page.margin,
          label: `${FORMAT_LABEL[page.format]} ${ORIENTATION_LABEL[page.orientation]} · le contenu doit tenir dans les pointillés`,
          fontPt: estimate.fontPt,
          rating: estimate.rating,
          dark: themeMode === "dark",
        },
      },
    ];
  }, [pageGuideEnabled, hasFrames, visibleNodes, page, meta, theme.logoUrl, theme.secondaryLogoUrl, themeMode]);

  // Pages explicites : une feuille par frame, déplaçable par son étiquette
  // (classe frame-drag-handle) — le déplacement emporte les cartes membres.
  const frameGuideNodes = useMemo<Node<PageGuideData>[]>(() => {
    if (!pageGuideEnabled || !hasFrames) return [];
    const nodesById = new Map(visibleNodes.map((n) => [n.id, n]));

    return frames.map((frame) => {
      const chrome = resolveFrameChrome(frame, meta);
      const pageChrome = {
        title: chrome.title,
        footer: meta.footer,
        logoUrl: theme.logoUrl,
        secondaryLogoUrl: theme.secondaryLogoUrl,
      };
      const size = frameSizePx(frame.page);
      const offsets = chromeOffsetsForSetup(frame.page, pageChrome);
      const avail = availableAreaForSetup(frame.page, pageChrome);

      const members = (membership.byFrame.get(frame.id) ?? [])
        .map((id) => nodesById.get(id))
        .filter((n): n is NonNullable<typeof n> => Boolean(n));
      const xs = members.map((n) => n.position.x);
      const ys = members.map((n) => n.position.y);
      const boundsW = members.length > 0 ? (Math.max(...xs) - Math.min(...xs) + CARD_WIDTH) * CAPTURE_MARGIN : 1;
      const boundsH = members.length > 0 ? (Math.max(...ys) - Math.min(...ys) + CARD_HEIGHT) * CAPTURE_MARGIN : 1;
      const estimate = estimateReadability(boundsW, boundsH, avail.width, avail.height);

      return {
        id: frameNodeId(frame.id),
        type: "pageGuide" as const,
        position: frame.position,
        draggable: true,
        dragHandle: ".frame-drag-handle",
        // Non sélectionnable : la feuille ne doit jamais rejoindre un drag de
        // groupe ni voler la sélection — l'étiquette est la seule prise.
        selectable: false,
        focusable: false,
        zIndex: -2,
        // La feuille est transparente aux événements (pan au clic droit,
        // lasso, clic droit → menu de fond passent au canevas). Seule
        // l'étiquette (pointer-events-auto) déclenche drag et menu contextuel.
        style: { pointerEvents: "none" as const },
        data: {
          width: size.width,
          height: size.height,
          insetLeft: mmToPx(frame.page.margin),
          insetRight: mmToPx(frame.page.margin),
          insetTop: mmToPx(offsets.topOffset),
          insetBottom: mmToPx(offsets.bottomOffset),
          hasHeader: offsets.topOffset > frame.page.margin,
          hasFooter: offsets.bottomOffset > frame.page.margin,
          label: `${FORMAT_LABEL[frame.page.format]} ${ORIENTATION_LABEL[frame.page.orientation]}`,
          fontPt: estimate.fontPt,
          rating: estimate.rating,
          dark: themeMode === "dark",
          frameName: frame.name,
          memberCount: members.length,
        },
      };
    });
  }, [
    pageGuideEnabled,
    hasFrames,
    frames,
    membership,
    visibleNodes,
    meta,
    theme.logoUrl,
    theme.secondaryLogoUrl,
    themeMode,
  ]);

  // Éléments d'en-tête/pied de page manipulables (titre, sous-titre, logos,
  // footer) : posés sur le cadre de page, même résolveur que l'export PDF
  // (lib/chromeLayout) — toute divergence visuelle entre les deux est un bug.
  const primaryLogoAspect = useImageAspect(theme.logoUrl);
  const secondaryLogoAspect = useImageAspect(theme.secondaryLogoUrl);

  const handleChromeResizeEnd = useCallback(
    (frameId: string | undefined, key: ChromeKey, params: { x: number; y: number; width: number; height: number }) => {
      const isText = isChromeTextKey(key);
      // La boîte d'un élément de texte fait `fontPx * CHROME_TEXT_LINE_HEIGHT`
      // (voir le calcul de `boxHeight` ci-dessous) : il faut retirer cet
      // interligne avant de reconvertir la hauteur glissée en taille de police,
      // sinon la police gonfle un peu plus à chaque redimensionnement.
      const sizeMm = pxToMm(isText ? params.height / CHROME_TEXT_LINE_HEIGHT : params.height);
      const element = {
        x: pxToMm(params.x),
        y: pxToMm(params.y),
        size: isText ? sizeMm * PT_PER_MM : sizeMm,
      };
      if (frameId) setFrameChromeElement(frameId, key, element);
      else setChromeElement(key, element);
    },
    [setChromeElement, setFrameChromeElement]
  );

  const { chromeElementNodes, resolvedChrome } = useMemo(() => {
    const nodes: Node<ChromeElementData>[] = [];
    // Position résolue de chaque élément, indexée par id de nœud React Flow
    // (sert au commit de fin de drag, qui ne change que x/y).
    const resolved = new Map<string, ChromeElement>();
    if (!pageGuideEnabled) return { chromeElementNodes: nodes, resolvedChrome: resolved };

    interface ChromeItem {
      key: ChromeKey;
      variant: "text" | "logo";
      value: string;
      logoAspect?: number;
    }
    const buildItems = (chrome: { title?: string; subtitle?: string }): ChromeItem[] => {
      const items: ChromeItem[] = [];
      if (chrome.title) items.push({ key: "title", variant: "text", value: chrome.title });
      if (chrome.subtitle) items.push({ key: "subtitle", variant: "text", value: chrome.subtitle });
      if (theme.logoUrl) items.push({ key: "logo", variant: "logo", value: theme.logoUrl, logoAspect: primaryLogoAspect });
      if (theme.secondaryLogoUrl) {
        items.push({ key: "secondaryLogo", variant: "logo", value: theme.secondaryLogoUrl, logoAspect: secondaryLogoAspect });
      }
      if (meta.footer) items.push({ key: "footer", variant: "text", value: meta.footer });
      return items;
    };

    const pushChromeNodes = (
      items: ChromeItem[],
      layout: ChromeLayout | undefined,
      pageSetup: typeof page,
      parentId: string,
      frameId?: string
    ) => {
      for (const { key, variant, value, logoAspect } of items) {
        const isText = variant === "text";
        const element = resolveChromeElement(layout, key, pageSetup, {
          measureTextMm: measureChromeTextMm,
          text: isText ? value : undefined,
          logoAspect,
        });
        const id = chromeNodeId(key, frameId);
        resolved.set(id, element);

        const fontPx = isText ? mmToPx(textHeightMm(element.size)) : undefined;
        const heightPx = isText ? undefined : mmToPx(element.size);
        // Boîte de sélection collée au rendu : largeur mesurée du libellé (même
        // police que l'affichage), pas une approximation par nombre de caractères.
        const boxWidth = isText
          ? Math.max(24, mmToPx(measureChromeTextMm(value, element.size)))
          : (heightPx ?? 24) * (logoAspect ?? 1);
        const boxHeight = isText ? (fontPx ?? 12) * CHROME_TEXT_LINE_HEIGHT : heightPx ?? 24;

        nodes.push({
          id,
          type: "chromeElement",
          parentId,
          extent: "parent",
          position: { x: mmToPx(element.x), y: mmToPx(element.y) },
          selected: selectedNodeIds.includes(id),
          draggable: true,
          selectable: true,
          zIndex: 5,
          style: { width: boxWidth, height: boxHeight },
          data: {
            chromeKey: key,
            variant,
            value,
            fontPx,
            heightPx,
            dark: themeMode === "dark",
            frameId,
            onResizeEnd: (k: ChromeKey, params: { x: number; y: number; width: number; height: number }) =>
              handleChromeResizeEnd(frameId, k, params),
          },
        });
      }
    };

    if (hasFrames) {
      // Une série d'éléments par page : valeurs héritées du document (titre /
      // sous-titre surchargés par frame.meta), disposition héritée élément par
      // élément (frame.chromeLayout prime sur celle du document).
      for (const frame of frames) {
        pushChromeNodes(
          buildItems(resolveFrameChrome(frame, meta)),
          { ...meta.chromeLayout, ...frame.chromeLayout },
          frame.page,
          frameNodeId(frame.id),
          frame.id
        );
      }
    } else if (pageGuideNodes.length > 0) {
      pushChromeNodes(buildItems(meta), meta.chromeLayout, page, "__page-guide__");
    }

    return { chromeElementNodes: nodes, resolvedChrome: resolved };
  }, [
    pageGuideEnabled,
    pageGuideNodes.length,
    hasFrames,
    frames,
    meta,
    page,
    theme.logoUrl,
    theme.secondaryLogoUrl,
    primaryLogoAspect,
    secondaryLogoAspect,
    themeMode,
    handleChromeResizeEnd,
    selectedNodeIds,
  ]);

  // Zones de regroupement visuel par pôle / département (nœuds visibles uniquement)
  const groupNodes = useMemo<Node<GroupBackgroundData>[]>(() => {
    if (!showGroups) return [];
    return computeDepartmentGroups(visibleNodes).map((group) => ({
      id: group.id,
      type: "groupBg",
      position: { x: group.x, y: group.y },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      data: {
        department: group.department,
        width: group.width,
        height: group.height,
        color: buildGroupTheme(theme, group.colorIndex),
      },
    }));
  }, [visibleNodes, theme, showGroups]);

  // Adapter les nœuds pour le canvas
  const memberRfNodes = useMemo<Node<NodeCardData>[]>(
    () =>
      visibleNodes.map((n) => ({
        id: n.id,
        type: "orgNode",
        position: n.position,
        selected: selectedNodeIds.includes(n.id),
        data: {
          orgNode: n,
          theme,
          level: levels.get(n.id) ?? 0,
          direction: layout.direction,
          targetSide: stackedIds.has(n.id) ? ("left" as const) : undefined,
          childCount: childrenMap.get(n.id)?.length ?? 0,
          hiddenCount: collapsedNodeIds.includes(n.id) ? descendantCounts.get(n.id) ?? 0 : 0,
          collapsed: collapsedNodeIds.includes(n.id),
          // Estompage lié au cadre de page : la vue « propre » (cadre masqué,
          // utilisée aussi par les captures d'export) n'estompe rien.
          outOfPage: pageGuideEnabled && hasFrames && membership.orphanIds.has(n.id),
        },
      })),
    [
      visibleNodes,
      theme,
      levels,
      layout.direction,
      selectedNodeIds,
      stackedIds,
      childrenMap,
      descendantCounts,
      collapsedNodeIds,
      hasFrames,
      membership,
      pageGuideEnabled,
    ]
  );

  const initialRfNodes = useMemo<Node[]>(
    () => [...pageGuideNodes, ...frameGuideNodes, ...chromeElementNodes, ...groupNodes, ...memberRfNodes],
    [pageGuideNodes, frameGuideNodes, chromeElementNodes, groupNodes, memberRfNodes]
  );

  // Adapter les connexions (edges) avec un tracé ultra-propre et une animation subtile
  const initialRfEdges = useMemo<Edge[]>(
    () =>
      storeEdges
        .filter((e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target))
        .map((e) => {
        const isSelected = selectedNodeIds.includes(e.source) || selectedNodeIds.includes(e.target);
        const isDotted = e.kind === "dotted";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "org",
          animated: isSelected, // anime le flux des connexions liées au nœud sélectionné
          data: { spine: !isDotted && stackedIds.has(e.target) },
          style: {
            stroke: isSelected
              ? theme.accent
              : themeMode === "dark"
              ? "rgba(161, 161, 170, 0.25)"
              : "rgba(39, 39, 42, 0.15)",
            strokeWidth: isSelected ? 2 : 1.25,
            // Rattachement fonctionnel : trait pointillé (format v2)
            strokeDasharray: isDotted ? "6 5" : undefined,
          },
        };
      }),
    [storeEdges, theme.accent, selectedNodeIds, themeMode, stackedIds, hiddenIds]
  );

  const [rfNodes, setRfNodes, onNodesChangeBase] = useNodesState(initialRfNodes);
  const [rfEdges, setRfEdges, onEdgesChangeBase] = useEdgesState(initialRfEdges);

  useEffect(() => setRfNodes(initialRfNodes), [initialRfNodes, setRfNodes]);
  useEffect(() => setRfEdges(initialRfEdges), [initialRfEdges, setRfEdges]);

  // Guides magnétiques : cibles construites au début du drag d'une carte,
  // trait(s) violet(s) affichés pendant l'aimantation.
  const snapTargetsRef = useRef<SnapTargets | null>(null);
  const [guides, setGuides] = useState<{ v?: number; h?: number } | null>(null);

  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      // Aimantation pendant le glisser d'une carte seule (les sélections
      // multiples glissent librement) : la position du changement est ajustée
      // avant d'être appliquée — le commit final hérite de la position aimantée.
      const targets = snapTargetsRef.current;
      if (targets) {
        const positionChanges = changes.filter((c) => c.type === "position" && c.position);
        if (positionChanges.length === 1) {
          const change = positionChanges[0] as { position: { x: number; y: number }; dragging?: boolean; id: string };
          if (!parseChromeNodeId(change.id) && !frameIdFromNodeId(change.id)) {
            const threshold = 8 / Math.max(0.05, getZoom());
            const snapped = snapPosition(
              change.position.x,
              change.position.y,
              CARD_WIDTH,
              CARD_HEIGHT,
              targets,
              threshold
            );
            change.position = { x: snapped.x, y: snapped.y };
            if (change.dragging) {
              setGuides(
                snapped.vLine !== undefined || snapped.hLine !== undefined
                  ? { v: snapped.vLine, h: snapped.hLine }
                  : null
              );
            }
          }
        }
      }

      onNodesChangeBase(changes);
      for (const change of changes) {
        if (change.type === "position" && change.position && change.dragging === false) {
          const chromeRef = parseChromeNodeId(change.id);
          if (chromeRef) {
            // Simple déplacement (sans redimensionnement) : la taille stockée
            // est conservée, seule la position change.
            const current = resolvedChrome.get(change.id);
            if (current) {
              const element = {
                ...current,
                x: pxToMm(change.position.x),
                y: pxToMm(change.position.y),
              };
              if (chromeRef.frameId) setFrameChromeElement(chromeRef.frameId, chromeRef.key, element);
              else setChromeElement(chromeRef.key, element);
            }
          } else if (frameIdFromNodeId(change.id)) {
            // Feuille de page : commit géré par onNodeDragStop (déplacement
            // solidaire avec les cartes membres), rien à faire ici.
          } else {
            setNodePosition(change.id, change.position);
          }
        }
      }
    },
    [onNodesChangeBase, setNodePosition, resolvedChrome, setChromeElement, setFrameChromeElement, getZoom]
  );

  // Déplacement solidaire d'une page : pendant le glisser de la feuille, les
  // cartes dont le centre était dans la page au départ suivent visuellement ;
  // au relâchement, feuille + cartes sont déplacées dans le store en une seule
  // entrée d'historique (moveFrameWithContent).
  const frameDragRef = useRef<{
    frameId: string;
    startPos: { x: number; y: number };
    memberStarts: Map<string, { x: number; y: number }>;
  } | null>(null);

  const onNodeDragStart = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const frameId = frameIdFromNodeId(node.id);
      if (frameId) {
        const memberIds = membership.byFrame.get(frameId) ?? [];
        const byId = new Map(storeNodes.map((n) => [n.id, n]));
        const memberStarts = new Map<string, { x: number; y: number }>();
        for (const id of memberIds) {
          const member = byId.get(id);
          if (member) memberStarts.set(id, { ...member.position });
        }
        frameDragRef.current = { frameId, startPos: { ...node.position }, memberStarts };
        return;
      }

      // Carte membre : prépare les cibles d'aimantation (cartes voisines +
      // marges / bords / axes centraux des pages visibles).
      if (node.type === "orgNode" && pageGuideEnabled) {
        const cardRects: Rect[] = visibleNodes
          .filter((n) => n.id !== node.id)
          .map((n) => ({ x: n.position.x, y: n.position.y, width: CARD_WIDTH, height: CARD_HEIGHT }));
        const pageRects: Rect[] = [];
        for (const pg of [...pageGuideNodes, ...frameGuideNodes]) {
          const d = pg.data;
          // Feuille entière (bords + centre) et zone utile (marges)
          pageRects.push({ x: pg.position.x, y: pg.position.y, width: d.width, height: d.height });
          pageRects.push({
            x: pg.position.x + d.insetLeft,
            y: pg.position.y + d.insetTop,
            width: d.width - d.insetLeft - d.insetRight,
            height: d.height - d.insetTop - d.insetBottom,
          });
        }
        snapTargetsRef.current = mergeTargets(rectTargets(cardRects), rectTargets(pageRects));
      }
    },
    [membership, storeNodes, pageGuideEnabled, visibleNodes, pageGuideNodes, frameGuideNodes]
  );

  const onNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const drag = frameDragRef.current;
      if (!drag || frameIdFromNodeId(node.id) !== drag.frameId) return;
      const dx = node.position.x - drag.startPos.x;
      const dy = node.position.y - drag.startPos.y;
      setRfNodes((nodes) =>
        nodes.map((n) => {
          const start = drag.memberStarts.get(n.id);
          return start ? { ...n, position: { x: start.x + dx, y: start.y + dy } } : n;
        })
      );
    },
    [setRfNodes]
  );

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      snapTargetsRef.current = null;
      setGuides(null);
      const drag = frameDragRef.current;
      if (!drag || frameIdFromNodeId(node.id) !== drag.frameId) return;
      frameDragRef.current = null;
      moveFrameWithContent(drag.frameId, node.position, [...drag.memberStarts.keys()]);
    },
    [moveFrameWithContent]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEdge(connection.source, connection.target);
      }
    },
    [addEdge]
  );

  // Tirer un lien depuis la poignée source et le lâcher dans le vide crée
  // directement un subordonné à cet endroit (pattern « add node on edge drop »).
  const onConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return;
      const from = connectionState.fromNode;
      if (!from || from.type !== "orgNode" || connectionState.fromHandle?.type !== "source") return;
      const to = connectionState.to;
      if (!to) return;
      addNodeAt({ x: to.x - CARD_WIDTH / 2, y: to.y - CARD_HEIGHT / 2 }, from.id);
    },
    [addNodeAt]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const frameId = frameIdFromNodeId(node.id);
      if (frameId) {
        // Feuille d'une page explicite : menu de page
        setMenu({ x: event.clientX, y: event.clientY, frameId });
        return;
      }
      if (node.type !== "orgNode") {
        // Éléments d'en-tête/pied, cadre implicite ou fond de groupe : pas un
        // membre — on retombe sur le menu de fond (ajouter un membre ici…),
        // comme si le clic avait atteint le canevas vide.
        const { clientX, clientY } = event;
        setMenu({ x: clientX, y: clientY, flowPos: screenToFlowPosition({ x: clientX, y: clientY }) });
        return;
      }
      selectNodes([node.id]);
      setMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    [selectNodes, screenToFlowPosition]
  );

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const { clientX, clientY } = event;
      setMenu({
        x: clientX,
        y: clientY,
        flowPos: screenToFlowPosition({ x: clientX, y: clientY }),
      });
    },
    [screenToFlowPosition]
  );

  const motionMs = (ms: number) =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : ms;

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menu) return [];

    if (menu.edgeId) {
      const edge = storeEdges.find((e) => e.id === menu.edgeId);
      if (!edge) return [];
      const isDotted = !isHierarchyEdge(edge);
      // La conversion vers hiérarchique remplace l'ancien responsable ;
      // elle est bloquée si elle créerait un cycle.
      const conversionBase = storeEdges.filter(
        (e) => e.id !== edge.id && !(isHierarchyEdge(e) && e.target === edge.target)
      );
      const cycleBlocked = isDotted && wouldCreateHierarchyCycle(conversionBase, edge.source, edge.target);
      return [
        {
          label: isDotted ? "Convertir en lien hiérarchique" : "Convertir en lien fonctionnel",
          hint: isDotted ? (cycleBlocked ? "créerait un cycle" : undefined) : "pointillé",
          disabled: cycleBlocked,
          onClick: () => setEdgeKind(edge.id, isDotted ? "hierarchy" : "dotted"),
        },
        {
          label: "Supprimer le lien",
          danger: true,
          separator: true,
          onClick: () => deleteEdge(edge.id),
        },
      ];
    }

    if (menu.frameId) {
      const frameId = menu.frameId;
      const frame = frames.find((f) => f.id === frameId);
      if (!frame) return [];
      const memberCount = membership.byFrame.get(frameId)?.length ?? 0;
      return [
        {
          label: "Recadrer sur la page",
          onClick: () => fitBounds(frameRectPx(frame), { duration: motionMs(300), padding: 0.1 }),
        },
        {
          label: "Ranger le contenu de la page",
          hint: memberCount > 0 ? `${memberCount} carte${memberCount > 1 ? "s" : ""}` : undefined,
          disabled: memberCount === 0,
          onClick: () => void arrangeFrame(frameId),
        },
        {
          label: "Dupliquer la page",
          hint: memberCount > 0 ? `avec ${memberCount} carte${memberCount > 1 ? "s" : ""}` : "vide",
          onClick: () => duplicateFrame(frameId),
        },
        {
          label: "Supprimer la page",
          hint: "les cartes restent",
          danger: true,
          separator: true,
          onClick: () => deleteFrame(frameId),
        },
      ];
    }

    if (menu.nodeId) {
      const nodeId = menu.nodeId;
      const childCount = childrenMap.get(nodeId)?.length ?? 0;
      const isCollapsed = collapsedNodeIds.includes(nodeId);
      const teamCount = descendantCounts.get(nodeId) ?? 0;
      const parentEdge = storeEdges.find((e) => e.kind !== "dotted" && e.target === nodeId);
      const items: ContextMenuItem[] = [
        { label: "Ajouter un subordonné", hint: "Tab", onClick: () => addNode(nodeId) },
        { label: "Ajouter un collègue", hint: "Entrée", onClick: () => addNode(parentEdge?.source) },
        { label: "Dupliquer le membre", onClick: () => duplicateNode(nodeId) },
      ];
      if (childCount > 0) {
        items.push({
          label: isCollapsed ? "Déplier la branche" : "Replier la branche",
          hint: `${teamCount} membre${teamCount > 1 ? "s" : ""}`,
          separator: true,
          onClick: () => toggleCollapsed(nodeId),
        });
        items.push({
          label: "Créer une page pour cette branche",
          hint: `${teamCount + 1} carte${teamCount + 1 > 1 ? "s" : ""} copiée${teamCount + 1 > 1 ? "s" : ""}`,
          onClick: async () => {
            const frameId = await addFrameForBranch(nodeId);
            const frame = useOrgChartStore.getState().frames.find((f) => f.id === frameId);
            if (frame) {
              // fitBounds : indépendant du rendu du nœud (qui peut suivre d'une frame)
              requestAnimationFrame(() => fitBounds(frameRectPx(frame), { duration: motionMs(300), padding: 0.1 }));
            }
          },
        });
      }
      if (parentEdge) {
        items.push({
          label: "Détacher du responsable",
          separator: childCount === 0,
          onClick: () => deleteEdge(parentEdge.id),
        });
      }
      items.push({
        label: "Supprimer ce membre",
        hint: "Suppr",
        danger: true,
        separator: true,
        onClick: () => deleteNode(nodeId),
      });
      return items;
    }

    const flowPos = menu.flowPos ?? { x: 0, y: 0 };
    const items: ContextMenuItem[] = [
      {
        label: "Ajouter un membre ici",
        onClick: () => addNodeAt({ x: flowPos.x - CARD_WIDTH / 2, y: flowPos.y - CARD_HEIGHT / 2 }),
      },
      {
        label: hasFrames ? "Ajouter une page" : "Ajouter une page (multi-pages)",
        onClick: () => {
          const frameId = addFrame();
          const frame = useOrgChartStore.getState().frames.find((f) => f.id === frameId);
          if (frame) {
            requestAnimationFrame(() => fitBounds(frameRectPx(frame), { duration: motionMs(300), padding: 0.1 }));
          }
        },
      },
      {
        label: "Ranger automatiquement",
        separator: true,
        onClick: async () => {
          await applyAutoLayout();
          requestAnimationFrame(() => fitView({ duration: motionMs(300), padding: 0.2 }));
        },
      },
      { label: "Recadrer la vue", onClick: () => fitView({ duration: motionMs(300), padding: 0.2 }) },
    ];
    if (collapsedNodeIds.length > 0) {
      items.push({ label: "Tout déplier", separator: true, onClick: expandAll });
    }
    return items;
  }, [
    menu,
    childrenMap,
    collapsedNodeIds,
    descendantCounts,
    storeEdges,
    frames,
    membership,
    hasFrames,
    addNode,
    addNodeAt,
    duplicateNode,
    deleteNode,
    deleteEdge,
    toggleCollapsed,
    expandAll,
    applyAutoLayout,
    setEdgeKind,
    fitView,
    fitBounds,
    addFrame,
    addFrameForBranch,
    arrangeFrame,
    duplicateFrame,
    deleteFrame,
  ]);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes }) => selectNodes(nodes.map((n) => n.id)),
    [selectNodes]
  );

  // Couleurs de fond de la grille
  const gridColor = themeMode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.05)";
  const maskColor = themeMode === "dark" ? "rgba(9, 9, 11, 0.7)" : "rgba(250, 249, 246, 0.7)";

  return (
    <div ref={ref} className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChangeBase}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={["Meta", "Control"]}
        className="transition-colors duration-300"
      >
        <Background gap={24} color={gridColor} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor={maskColor} />

        {/* Guides magnétiques : traits violets pendant l'aimantation */}
        {guides && (guides.v !== undefined || guides.h !== undefined) && (
          <ViewportPortal>
            {guides.v !== undefined && (
              <div
                className="pointer-events-none"
                style={{
                  position: "absolute",
                  left: guides.v,
                  top: -100000,
                  width: 1,
                  height: 200000,
                  background: "rgba(109, 74, 174, 0.7)",
                }}
              />
            )}
            {guides.h !== undefined && (
              <div
                className="pointer-events-none"
                style={{
                  position: "absolute",
                  top: guides.h,
                  left: -100000,
                  height: 1,
                  width: 200000,
                  background: "rgba(109, 74, 174, 0.7)",
                }}
              />
            )}
          </ViewportPortal>
        )}
      </ReactFlow>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          themeMode={themeMode}
        />
      )}
    </div>
  );
});

Canvas.displayName = "Canvas";
