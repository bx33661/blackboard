import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { History } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BoardGroup } from './BoardGroup';
import { BrandMark } from './BrandMark';
import { SecurityNode } from './SecurityNode';
import { RoutedEdge } from './RoutedEdge';
import { formatTime, typeLabel as typeLabelOf, type CanvasNode, type EdgeStyle } from './graph';
import { EMPTY_FILTER, type NodeFilter } from './presentation';
import { useGraphStream } from './use-graph-stream';
import { usePref } from './use-pref';
import { CanvasToolbar } from './panels/CanvasToolbar';
import { CommandPalette } from './panels/CommandPalette';
import { DigestDialog } from './panels/DigestDialog';
import { EmptyBoard } from './panels/EmptyBoard';
import { Legend } from './panels/Legend';
import { ShortcutsDialog } from './panels/ShortcutsDialog';
import { Inspector } from './panels/Inspector';
import { NewNodeDialog } from './panels/EditPanel';
import { Sidebar } from './panels/Sidebar';
import { Topbar } from './panels/Topbar';
import { TimelineBar } from './panels/TimelineBar';
import { FieldNotesPanel } from './field-notes/FieldNotesPanel';
import { locale, t } from './i18n';
import { SessionDrafts } from './session-drafts';
import { useWorkspaceData } from './workspace/use-workspace-data';
import { useWorkspaceLocation } from './workspace/use-workspace-location';
import { useWorkspaceLayout } from './workspace/use-workspace-layout';
import { useWorkspaceViewport } from './workspace/use-workspace-viewport';
import { useWorkspaceSelection } from './workspace/use-workspace-selection';
import { useWorkspacePresentation } from './workspace/use-workspace-presentation';
import { useWorkspaceFeedback } from './workspace/use-workspace-feedback';
import { useWorkspaceScene } from './workspace/use-workspace-scene';
import { useWorkspaceTimeline } from './workspace/use-workspace-timeline';
import type { Scene3DProps } from './scene3d/shared';
import type { ViewMode } from './types';

const nodeTypes = { security: SecurityNode, boardGroup: BoardGroup };
const edgeTypes = { routed: RoutedEdge };
// three.js and the post-processing stack load only when the reader opens the sandbox. An offline HTML
// export has no server for that chunk; the board then announces it and stays on the flat canvas.
const Scene3D = lazy(() => import('./scene3d/Scene3D').catch(() => ({
  default: function Unavailable({ onExit, onNotice }: Scene3DProps) {
    useEffect(() => { onNotice(t('scene3d.failed')); onExit(); }, []);
    return <></>;
  },
})));
const THEME_KEY = 'pinwhy-theme-v3';

const initialTheme = (): 'light' | 'dark' => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* storage can be unavailable in sandboxed exports */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function Workspace() {
  const { snapshot: live, connection, syncedAt, isStatic, reload } = useGraphStream();
  const { agentId, setAgentId, mode, setMode, selectedId, setSelectedId, asOf, setAsOf, page, setPage, deepLink, pendingFocus } = useWorkspaceLocation();
  // A checkpoint view replaces what every panel reads; the live stream keeps running underneath.
  const timeline = useWorkspaceTimeline(live, asOf, setAsOf, isStatic);
  const snapshot = timeline.snapshot;
  const [timelineOpen, setTimelineOpen] = useState(() => Boolean(asOf) && !isStatic);
  const [showChanges, setShowChanges] = usePref('timeline-changes', true);
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [direction, setDirection] = usePref<'RIGHT' | 'DOWN'>('direction', 'RIGHT');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [showMap, setShowMap] = usePref('minimap', false);
  const [showLegend, setShowLegend] = usePref('legend-open', false);
  const [edgeStyle, setEdgeStyle] = usePref<EdgeStyle>('edge-style', 'curve');
  const [follow, setFollow] = usePref('follow', false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [filter, setFilter] = useState<NodeFilter>(EMPTY_FILTER);
  const digestTrigger = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const closeSidebar = useCallback(() => { setSidebarOpen(false); }, []);

  const { board, agent, projection, results, legend } = useWorkspaceData(snapshot, mode, agentId, filter, page === 'board');
  const { allNodes, allEdges, activities, byId, inbox, paletteNodes, filterOptions, counts } = board;
  const { agentIds, digest, currentId, current, findings, openItems } = agent;
  // Stepping through checkpoints is not the Agent writing: only the live board pulses.
  const { fresh, notice, flash, linkCopied, copyNodeLink, copied, copyDigest, offlineShown } = useWorkspaceFeedback(timeline.active ? null : snapshot, allNodes, digest, agentId, connection, isStatic);
  const { nodes, edges, onNodesChange, layoutRevision, layoutMode, laying } = useWorkspaceLayout(projection, mode, direction);
  const { centerOnNode, motion } = useWorkspaceViewport({ viewportRef, pendingFocus, layoutRevision: page === 'board' ? layoutRevision : -1, mode, follow, currentId, selectedId });
  const { scene3d, sceneRef, openScene, closeScene, occlusion, exporting, exportImage } = useWorkspaceScene({ viewportRef, flatRef, inspectorRef, selectedId, mode, flash });
  // Resolve selection against the requested checkpoint, never its loading fallback.
  const { selected, focusNode, clearSelection, switchMode, handleNodesChange, onNodeClick } = useWorkspaceSelection({
    snapshot: page === 'notes' || (timeline.active && !timeline.point) ? null : snapshot,
    byId, projection, nodes, edges, mode, setMode, selectedId, setSelectedId,
    deepLink, pendingFocus, centerOnNode, onNodesChange, closeSidebar, scene3d,
    enabled: page === 'board',
  });
  const { highlighted, displayNodes, displayEdges } = useWorkspacePresentation(nodes, edges, selectedId, fresh, mode, edgeStyle, showChanges && timeline.active ? timeline.changeMap : null);
  const continueExploring = () => {
    pendingFocus.current = selectedId ?? currentId ?? null;
    setPage('board');
  };
  const openNoteNode = (id: string) => { setPage('board'); focusNode(id); };
  const changeView = (next: ViewMode) => { setPage('board'); switchMode(next); };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);


  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (page === 'board' && !event.metaKey && !event.ctrlKey && !event.altKey && !(event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]') && !document.querySelector('[role="dialog"]') && (event.key === '/' || event.key === '[' || event.key === '?')) {
        event.preventDefault();
        if (event.key === '/') setPaletteOpen(true); else if (event.key === '?') setShortcutsOpen(true); else setSidebarOpen((open) => !open);
      } else if (page === 'board' && event.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"]')) clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, page]);


  if (!snapshot) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <BrandMark size={32} />
        <strong className="text-sm font-semibold text-foreground">Pinwhy</strong>
        <span className="text-xs">{connection === 'offline' ? t('app.waitingService') : t('app.restoring')}</span>
      </main>
    );
  }

  // While a checkpoint is shown (or still loading over the live picture) nothing can be written.
  const writable = !isStatic && !timeline.active && snapshot.meta.writable === true;
  const pastPoint = snapshot.meta.asOf;
  const stats = snapshot.stats || {};
  const hidden = projection?.hidden || 0;

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={snapshot.meta.title || t('app.untitledTask')}
        build={snapshot.meta.build}
        mode={mode}
        onMode={changeView}
        agentId={agentId}
        agentIds={agentIds}
        onAgent={setAgentId}
        theme={theme}
        onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        connection={connection}
        isStatic={isStatic}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onSearch={() => setPaletteOpen(true)}
        onDigest={() => setDigestOpen(true)}
        onNew={writable && page === 'board' ? () => setNewOpen(true) : undefined}
        digestRef={digestTrigger}
        activities={activities}
        activityTotal={stats.activities || activities.length}
        timelineOpen={timelineOpen}
        notesOpen={page === 'notes'}
        onNotes={() => { timeline.pause(); if (page === 'notes') continueExploring(); else setPage('notes'); }}
        onTimeline={isStatic ? undefined : () => {
          setPage('board');
          if (timelineOpen) { timeline.pause(); setAsOf(null); }
          setTimelineOpen(!timelineOpen);
        }}
      />

      {page === 'notes' && timeline.active && !timeline.point ? (
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <History className="size-5 text-muted-foreground" />
          <p role={timeline.error ? 'alert' : 'status'} className="m-0 text-sm text-muted-foreground">{timeline.error || t('timeline.loading')}</p>
          {timeline.error && <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => { timeline.pause(); setAsOf(null); }}>{t('timeline.backToNow')}</button>}
        </main>
      ) : page === 'notes' ? (
        <FieldNotesPanel
          key={`${live?.meta.session ?? ''}:${live?.meta.title ?? ''}`}
          snapshot={snapshot}
          theme={theme}
          isStatic={isStatic}
          onContinue={continueExploring}
          onNode={openNoteNode}
          onCheckpoint={isStatic ? undefined : (id) => { timeline.pause(); setAsOf(id); setTimelineOpen(true); setPage('board'); }}
        />
      ) : <>
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            <button className="absolute inset-0 z-20 bg-black/20 lg:hidden" aria-label={t('app.closeNav')} onClick={() => setSidebarOpen(false)} />
            <aside className="z-30 w-64 shrink-0 border-r bg-background max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-float">
              <Sidebar
                current={current}
                openItems={openItems}
                findings={findings}
                inbox={inbox}
                selectedId={selectedId}
                counts={counts}
                onSelect={focusNode}
                onSearch={() => { setPaletteOpen(true); if (window.innerWidth < 1024) setSidebarOpen(false); }}
                onShortcuts={() => setShortcutsOpen(true)}
                filter={filter}
                onFilter={setFilter}
                filterOptions={filterOptions}
                results={results}
              />
            </aside>
          </>
        )}

        <main ref={viewportRef} className="relative min-w-0 flex-1" aria-label={t('app.canvas')}>
          <div ref={flatRef} className="absolute inset-0" inert={scene3d} aria-hidden={scene3d}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={clearSelection}
            nodesConnectable={false}
            deleteKeyCode={null}
            autoPanOnNodeFocus={false}
            minZoom={0.08}
            maxZoom={1.8}
            colorMode={theme}
            fitView
            fitViewOptions={{ padding: .14, minZoom: .08, maxZoom: 1 }}
            onMove={(_, viewport) => viewportRef.current?.style.setProperty('--zoom', String(viewport.zoom))}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <CanvasToolbar
              hasCurrent={Boolean(currentId)}
              canFollow={!isStatic}
              canExport={nodes.length > 0 && !exporting}
              onExport={exportImage}
              grouped={mode === 'all'}
              direction={direction}
              showMap={showMap}
              follow={follow}
              onToggleFollow={() => setFollow((value) => !value)}
              motion={motion}
              onLocate={() => currentId && focusNode(currentId)}
              onDirection={() => setDirection(direction === 'RIGHT' ? 'DOWN' : 'RIGHT')}
              onToggleMap={() => setShowMap((open) => !open)}
              showLegend={showLegend}
              onToggleLegend={() => setShowLegend((open) => !open)}
              edgeStyle={edgeStyle}
              onEdgeStyle={setEdgeStyle}
              onScene3d={openScene}
            />
            {showMap && (
              <MiniMap
                position="bottom-left"
                style={{ marginBottom: 64 }}
                pannable
                zoomable
                nodeStrokeWidth={2}
                nodeColor={(node) => (node.data as CanvasNode['data']).group ? 'transparent' : 'var(--ink-3)'}
                nodeStrokeColor={(node) => (node.data as CanvasNode['data']).group ? 'var(--line-strong)' : 'transparent'}
              />
            )}
          </ReactFlow>
          </div>

          {scene3d && (
            <Suspense fallback={<div role="status" className="absolute inset-0 z-[5] flex items-center justify-center bg-background text-xs text-muted-foreground">{t('scene3d.loading')}</div>}>
              <Scene3D
                ref={sceneRef}
                nodes={nodes}
                edges={edges}
                mode={mode}
                layoutMode={layoutMode}
                theme={theme}
                selectedId={selectedId}
                highlighted={highlighted}
                currentId={currentId}
                follow={follow && !isStatic}
                fresh={fresh}
                motion={motion > 0}
                occlusion={occlusion}
                exporting={exporting}
                onExport={exportImage}
                onSelect={(id) => id ? setSelectedId(id) : clearSelection()}
                onExit={closeScene}
                onNotice={flash}
              />
            </Suspense>
          )}

          {showLegend && nodes.length > 0 && <Legend types={legend.types} groups={legend.groups} onClose={() => setShowLegend(false)} />}

          {projection && projection.nodes.length === 0 && (
            <EmptyBoard viewEmpty={allNodes.length > 0} isStatic={isStatic} onShowAll={() => switchMode('all')} />
          )}

          <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
            {offlineShown && (
              <div role="alert" className="whitespace-nowrap rounded-full border border-destructive/40 bg-danger-soft px-3 py-1 text-xs text-destructive shadow-xs">
                {t('app.disconnected')}{syncedAt ? t('app.frozenAt', { time: new Date(syncedAt).toLocaleTimeString(locale, { hour12: false }) }) : ''}
              </div>
            )}
            {timeline.active && (
              <div role="status" className="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground bg-card px-3 py-1 text-xs text-foreground shadow-float">
                <History className="size-3.5" />
                {t('timeline.banner', { id: timeline.point?.id ?? asOf ?? '', time: formatTime(timeline.point?.at ?? undefined) })}
                <button type="button" className="rounded px-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { timeline.pause(); setAsOf(null); }}>
                  {t('timeline.backToNow')}
                </button>
              </div>
            )}
            {isStatic && pastPoint && (
              <div role="status" className="flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground bg-card px-3 py-1 text-xs text-foreground shadow-xs">
                <History className="size-3.5" />
                {t('timeline.staticBadge', { id: pastPoint.id, time: formatTime(pastPoint.at ?? undefined) })}
              </div>
            )}
            {hidden > 0 && (
              <button
                className="pointer-events-auto whitespace-nowrap rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs transition-colors hover:border-strong hover:text-foreground"
                onClick={() => switchMode('all')}
              >
                {t('app.hiddenNodes', { n: hidden })}
              </button>
            )}
            {laying > 0 && <div role="status" className="whitespace-nowrap rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs">{t('app.laying', { n: laying })}</div>}
            {notice && <div role="status" className="whitespace-nowrap rounded-full border bg-card px-3 py-1 text-xs shadow-float">{notice}</div>}
          </div>

          <p className="sr-only" role="status" aria-live="polite">{selected ? t('app.selected', { type: typeLabelOf(selected.type), title: selected.title }) : ''}</p>

          {selected && <Inspector panelRef={inspectorRef} node={selected} edges={allEdges} byId={byId} onClose={clearSelection} onFocus={focusNode} onCopyLink={copyNodeLink} linkCopied={linkCopied} writable={writable} onReload={reload} isStatic={isStatic} connected={connection === 'live'} revision={syncedAt} />}
        </main>
      </div>

      {timelineOpen && !isStatic && (
        <TimelineBar
          points={timeline.points}
          position={timeline.position}
          active={timeline.active}
          loading={timeline.loading}
          error={timeline.error}
          previousId={timeline.previousId}
          changes={timeline.changes}
          showChanges={showChanges}
          onShowChanges={setShowChanges}
          playing={timeline.playing}
          onPlay={timeline.play}
          onPause={timeline.pause}
          onGoTo={timeline.goTo}
          onClose={() => { timeline.pause(); setAsOf(null); setTimelineOpen(false); }}
        />
      )}
      </>}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        nodes={paletteNodes}
        theme={theme}
        copied={copied}
        onSelect={openNoteNode}
        onMode={changeView}
        onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onCopyDigest={copyDigest}
        onExport={page === 'board' && nodes.length > 0 && !exporting ? exportImage : null}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {writable && <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />}
      <DigestDialog open={digestOpen} onOpenChange={setDigestOpen} digest={digest} copied={copied} onCopy={copyDigest} returnFocus={digestTrigger} byId={byId} onFocus={openNoteNode} agentId={agentId} checkpoints={snapshot?.checkpoints} isStatic={isStatic} connected={connection === 'live'} revision={syncedAt} />
    </div>
  );
}

export function App() {
  return <TooltipProvider delayDuration={300}><ReactFlowProvider><SessionDrafts><Workspace /></SessionDrafts></ReactFlowProvider></TooltipProvider>;
}
