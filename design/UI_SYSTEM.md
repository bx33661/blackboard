# Pinwhy UI

Quiet tool chrome for exploration. General and security-audit modes are two reading surfaces over the same authored board.

## Layout

- **Top bar (48px at 1024px and above)**: sidebar toggle · brand / task title · view
  switch (现场 / 逻辑 / 全局) · Agent perspective · ⌘K · Agent activity · new node ·
  digest · theme. Narrow screens use two compact rows. The Agent menu appears only
  when there is more than one perspective; long names truncate in the trigger,
  with the full identity available in its tooltip and menu.
- **About Pinwhy**: the brand mark and name open a centred dialog with the app
  icon, project introduction, available version/build/commit information, and Docs /
  GitHub links. Escape or the close button dismisses it and restores trigger focus.
  It follows the current language and theme and remains usable on narrow screens.
  The dialog icon and browser favicon share the transparent mint mark in
  `design/pinwhy-logo/pinwhy-mark-mint.svg`, without a dark app tile.
  Vite inlines both so live pages and self-contained offline exports need no image fetch.
  Live workspaces also offer an explicit Check for updates button with loading,
  failure/retry, current/ahead/available results, and an upgrade-document link when
  an update is available. It checks the official main package version only when
  clicked. Offline snapshots show a notice and make no update request.
- **Sidebar (256px, collapsible; overlay below 1024px)**: outline of the board —
  current position, open items, findings, unconnected records — plus counts.
  Rows show recorded status, severity and confidence independently; footer counts wrap
  between labels without splitting a label.
- **Canvas**: full-bleed React Flow. One floating toolbar (bottom-left) holds
  fit / locate current / layout direction / minimap / zoom. At narrow widths the zoom
  controls wrap together onto another row, keeping every button visible.
- **Inspector**: floats over the canvas right edge (bottom sheet on phones), so
  selecting a node never resizes or re-lays-out the canvas.
- **⌘K command palette** (cmdk): jump to any node, switch view/theme, copy digest.
  Search no longer dims the canvas; it navigates.
- **Host embedding**: framed workspaces use one compact toolbar and the host's validated language,
  colour scheme, text/code font families and sizes without persisting those settings locally.
  Host navigation selects a reader node only. A live embed may explicitly offer a node-reference
  action; it sends an id to its host, which owns canonical reading and draft insertion. Historical
  and static views do not offer that action. No reader gesture moves the authored Agent cursor.

## Workspace modes

- A top-level General / Security audit selector is separate from the general Context / Logic / Global view switch. General remains the default. Reader mode, issue, candidate, selected node, Agent and checkpoint are navigation state, never board events.
- General retains its canvas, 2.5D sandbox and existing controls. Security audit starts with recorded questions/goals and their explicitly associated candidates, then presents a local argument graph. Opening evidence does not silently replace the chosen issue or candidate.
- Audit support, counterevidence, necessary conditions and related records are separate reading groups. Relation direction and authored explanation remain visible; a weak association or a failed experiment is not automatically counterevidence. Unknown relation kinds and unassigned/custom records stay reachable.
- Shared evidence and conditions keep one node identity. Show their other references as navigation rather than copying records. Do not infer issue membership, source versions, AND/OR conditions or verdicts from prose or graph reachability.
- Both modes use the same Inspector, explicit editing, conflict drafts, search, live snapshot and checkpoint history. Checkpoint and offline views are read-only; changing modes preserves that boundary. Audit content is included in the main bundle so standalone HTML can render it without a server.
- At overview zoom, uncertainty remains visible alongside severity. A suspected candidate must not appear confirmed because its detail header disappeared. A support family label must not claim that every support relation proves its conclusion.
- Evidence and condition cards expose counts of authored incoming contradictions and necessary dependencies. A counterargument to evidence stays attached to that evidence; it is not silently promoted to counterevidence against the root. Indicators describe records, never automatically invalidate or confirm a claim.
- Audit indexes belong to a snapshot and are reused across reader selections. Relation groups, issue candidates and record catalogues disclose their total and remaining counts, with explicit expansion and collapse. Hidden records remain reachable by search or links. Record order is authored order, not a confidence ranking.
- Every explicit mutation carries an idempotency key. An uncertain outcome retains its original request and payload for receipt lookup or explicit retry; editing, duplicate submission and discard must not turn it into a new request. Recovery is session-local and warns before unload. Read-only checkpoints and offline pages never retry mutations. Related-node creation submits the node and its declared relation through one recoverable store request.


## Components

shadcn-style primitives live in `web/src/components/ui/` (Button, Tooltip, Popover,
Dialog, Command, Slider, Kbd, Segmented/ToggleGroup) on Radix + cmdk. Official React
Flow UI sources (BaseNode, LabeledGroupNode) are vendored in
`web/src/components/react-flow/`. Panels are in `web/src/panels/`.
Canvas and chrome colours come from CSS tokens in `web/src/styles.css`; Tailwind 4
is compiled by `@tailwindcss/vite`.

## Reading the board

- Context and logic use the ELK layered layout. Title-only nodes are 88px tall;
  nodes with supporting text are 128px tall (width 288).
- Global view uses display-only frames for purpose, reasoning, findings and
  unconnected records. Empty groups are omitted. Parents are never persisted.
- Semantic zoom: below 65% only a large heading (cards and frame labels scale up);
  65–90% heading plus type/status; 90%+ adds supporting text.
- Selecting a node highlights only its explicitly recorded one-hop edges and
  neighbours. Other nodes/edges are muted; Escape clears the selection.
- Arrow keys move the selection along explicit one-hop edges, towards the
  neighbour most directly in that direction. `/` opens the palette, `[` toggles
  the sidebar.
- **Follow Agent** (toolbar; disabled in the global view): when the Agent's
  current node changes, the canvas re-centres on it.
- Every node kind has its own hue: a faint wash, a tinted edge, an accent bar and a
  coloured type label/icon (`--c` set from `--node-<type>`).
- Severity has its own labelled badge, independent of node type, status and confidence:
  critical red, high orange, medium amber, low blue, information neutral. Cards, sidebar
  and Inspector share the same badge; rated badges remain visible in the zoomed-out
  overview. Missing severity stays unassessed; unknown values keep their authored label
  and a neutral tone.
  Recorded ruled-out, refuted and superseded states also remain labelled when zoomed out.
- `?` lists the shortcuts. The selected node is mirrored in the address (`?node=id`),
  so a reload or a shared link reopens it; Inspector has a copy-link button.
- Sidebar filter (type · status · high risk) replaces the outline with a flat result list.
- The toolbar and ⌘K can export the whole board as a PNG (capped at 8000px per side).
  Export bounds include display-only parents; the image carries resolved SVG edge,
  arrowhead and label colours for the current theme without changing the live canvas.
- A connection lost for more than 1.5s shows a banner with the last sync time; the
  status dot is always visible. Empty boards show how to write the first node.
- Nodes the Agent just wrote or changed pulse for a few seconds (`fresh-pulse`).
- Relation kinds fall into six families with one colour each — 证实 / 反驳 / 推导 /
  产出 / 取代 / 关联 (`relationGroup` in `graph.ts`; `--rel-*` / `--edge-*` tokens).
  反驳 is dashed, 取代 dotted; a focused edge keeps its family colour at full strength.
  Links use a separate grey from the background grid. Strokes keep a constant screen
  width while zooming (1.5px, 1.75px for emphasized relations, 2px when focused).
- The legend (top-left, toolbar toggle, hidden on phones) lists only the node types
  and relation families present in the current view.
- Connections can be drawn as curves (default), rounded steps or straight lines
  (toolbar → 连线样式).
- Curves and steps follow the route ELK computed (`edge-route.ts`, `RoutedEdge.tsx`), so long
  edges go around the nodes between their ends instead of passing behind them. After a node is
  dragged its edges fall back to a plain curve/step; straight lines never avoid nodes.
- Direction, minimap, edge style and follow settings persist in localStorage (`use-pref.ts`).
- If ELK layout throws, `gridLayout` places nodes on a simple grid instead of
  leaving the canvas empty.

## 2.5D sandbox (experimental)

- Toolbar → 2.5D opens a read-only WebGL view of the current view's layout (`web/src/scene3d/`).
  three.js, React Three Fiber, drei and postprocessing load as a separate lazy chunk; the flat
  canvas does not load that stack. If the chunk or WebGL fails (offline HTML export, blocked GPU or a lost
  context), a notice appears and the board returns to the flat canvas. The choice persists (`scene3d`
  pref). The covered flat canvas is inert; entering focuses the 3D toolbar and exiting restores focus.
- The board is a finished circuit board: a lacquered slab with a printed border and plated mounting
  holes, floating over a plain stage and lit by a small painted environment (no image is fetched).
  Chip positions are the ELK layout, unstretched, so routes end exactly on chip edges. Height encodes
  recorded severity only: critical > high > medium > unknown authored levels > low > unset. High and
  critical chips carry a seam of light at the base; medium and worse bleed heat onto the board. The
  package stays neutral (`model.ts`, `board-material.ts`, `BoardMesh.tsx`, `Hardware.tsx`).
- Relations are copper traces along ELK's route, with corners cut at 45°; without a usable route a
  trace runs at right angles between the facing chip edges. All traces are one mesh: signals run in
  each relation's recorded direction inside the shader. Solid arrowheads keep that direction readable
  with motion disabled and in PNGs; reversed layouts still point to the recorded destination. 反驳 is
  dashed, 取代 dotted. Selected relations are named in the sharp canvas label layer. Which relations
  are drawn follows the flat canvas rules.
- Card faces are canvas textures drawn with the system font (CJK without bundled fonts): type,
  status, severity badge, headline and supporting sentence, coloured from the same CSS tokens.
  From afar a floating headline stands in for the face at a constant screen size; it steps aside once
  the card is past the flat canvas's overview zoom (`detailLevel`). At a distance only goals, rated
  chips, the selection, the current position and the hovered chip are named, and labels never overlap.
  They are drawn after post-processing, so tilt-shift never blurs them.
- The current position is a hovering green gem with a light cone and ripples on its chip; a sweep
  runs outwards over the pads from it.
- Selecting a chip flies the camera to it, outlines it, mutes everything outside the
  one-hop neighbourhood and opens the Inspector; follow mode flies to the Agent's cursor. Clearing
  the selection flies back to the whole board, unless the reader has dragged or zoomed the camera since.
  Framing waits for the requested view's layout; selection and follow wait for their chip's coordinates.
  A measured Inspector reserves space on the right or, on narrow screens, at the bottom; focus and
  whole-board framing use the remaining viewport. The toolbar rises above a bottom drawer.
  Idle orbit is off by default and remembers the reader's choice (`scene3d-orbit` pref).
- Past 40 drawn relations traces dim and only every third carries a signal until a selection names
  the ones that matter.
- Stream ticks stay cheap: traces and hardware rebuild only when `shapeKey`/`tracesKey` change, and
  card faces and labels redraw per card when `cardKey` changes.
- A view opens with a power-on: current spreads from the goals along recorded relations (`bootDepths`)
  and each chip seats and flashes as it arrives, while the camera dives in. `homeFrame` places the
  camera so every corner of the board's box fits the frame, centred; fog follows that distance. A
  chip-height legend sits bottom-right while nothing is selected.
- Dark: glowing pads, bloom, light film grain, tilt-shift at the frame's far edges, vignette; severe
  seams breathe. Light: pale ceramic on a grey stage, no bloom.
  `PerformanceMonitor` lowers DPR relative to the device's initial resolution, so a downgrade never
  raises it. MSAA, shadow-map size, bloom, tilt-shift and grain drop with the quality level; low quality
  keeps a lightweight base pass and the sharp labels.
  Shaders must never output NaN: bloom spreads one bad pixel across the whole frame.
- Reduced motion disables the power-on, intro dive, idle orbit, flights, signals, sweep, breathing and
  flashes on incoming edits. Chips waiting for power-on cannot be picked. With motion disabled the
  canvas renders on demand: camera interaction, selection, theme and stream changes request a frame,
  then drawing stops again.
- Both the toolbar and command palette export the currently visible renderer. A 3D PNG includes
  static arrowheads and selected relation names. No dragging or editing in this view.

## Theme

Neutral zinc surfaces, near-black (light) / near-white (dark) as the only accent.
Colour carries meaning only: node-kind hues, green for the current position, and
separate severity badges. Light and dark themes each define legible severity colours.
Follows `prefers-color-scheme` until the user toggles. Reduced-motion disables zoom
animation and transitions.

## Verification

`npm test`, `npm run build`, and `./node_modules/.bin/tsc --noEmit`.
The canvas suite checks semantic zoom thresholds, real one-hop adjacency,
group membership, empty state, parent bounds and a 150-node non-overlap fixture.
