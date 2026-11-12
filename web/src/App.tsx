import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { History } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BoardGroup } from './BoardGroup';
import { BrandMark } from './BrandMark';
import { SecurityNode } from './SecurityNode';
import { RoutedEdge } from './RoutedEdge';
import { formatTime, project, typeLabel as typeLabelOf, type CanvasNode } from './graph';
import { EMPTY_FILTER, type NodeFilter } from './presentation';
import { useGraphStream } from './use-graph-stream';
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
import { locale, t } from './i18n';
import { SessionDrafts, WriteRecovery } from './session-drafts';
import { useWorkspaceData } from './workspace/use-workspace-data';
import { useWorkspaceLocation } from './workspace/use-workspace-location';
import { useWorkspaceLayout } from './workspace/use-workspace-layout';
import { useWorkspaceViewport } from './workspace/use-workspace-viewport';
import { useWorkspaceSelection } from './workspace/use-workspace-selection';
import { useWorkspacePresentation } from './workspace/use-workspace-presentation';
import { useWorkspaceFeedback } from './workspace/use-workspace-feedback';
import { useWorkspaceScene } from './workspace/use-workspace-scene';
import { useWorkspaceTimeline } from './workspace/use-workspace-timeline';
import { useWorkspaceChrome, useWorkspaceShortcuts } from './workspace/use-workspace-chrome';
import { AuditNavigation } from './panels/AuditNavigation';
import { AuditContext } from './panels/AuditContext';
import { isAuditIssue } from './workspace/audit';
import type { BoardNode } from './types';
import type { Scene3DProps } from './scene3d/shared';

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

function Workspace() {
  const { snapshot: live, connection, syncedAt, isStatic, reload } = useGraphStream();
  const { workspace, navigateWorkspace, issueId, candidateId, agentId, setAgentId, mode, setMode, selectedId, setSelectedId, asOf, setAsOf, deepLink, pendingFocus } = useWorkspaceLocation();
  // A checkpoint view replaces what every panel reads; the live stream keeps running underneath.
  const timeline = useWorkspaceTimeline(live, asOf, setAsOf, isStatic);
  const snapshot = timeline.snapshot;
  const [timelineOpen, setTimelineOpen] = useState(() => Boolean(asOf) && !isStatic);
  const {
    theme, setTheme, direction, setDirection, sidebarOpen, setSidebarOpen, closeSidebar,
    showMap, setShowMap, showLegend, setShowLegend, edgeStyle, setEdgeStyle, follow, setFollow,
    showChanges, setShowChanges, paletteOpen, setPaletteOpen, digestOpen, setDigestOpen,
    newOpen, setNewOpen, shortcutsOpen, setShortcutsOpen,
  } = useWorkspaceChrome();
  const [filter, setFilter] = useState<NodeFilter>(EMPTY_FILTER);
  const digestTrigger = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  const auditMode = workspace === 'audit';
  const canvasMode = auditMode ? 'logic' : mode;
  const { board, agent, audit, expandAudit, projection, results, legend } = useWorkspaceData(snapshot, mode, agentId, filter, auditMode ? { issueId, candidateId, selectedId: selectedId ?? deepLink.current } : undefined);
  const { allNodes, allEdges, activities, byId, inbox, paletteNodes, filterOptions, counts } = board;
  const { agentIds, digest, currentId, current, findings, openItems } = agent;
  // Stepping through checkpoints is not the Agent writing: only the live board pulses.
  const { fresh, notice, flash, linkCopied, copyNodeLink, copied, copyDigest, offlineShown } = useWorkspaceFeedback(timeline.active ? null : snapshot, allNodes, digest, agentId, connection, isStatic);
  const { nodes, edges, onNodesChange, layoutRevision, layoutMode, laying } = useWorkspaceLayout(projection, canvasMode, direction);
  const { centerOnNode, motion } = useWorkspaceViewport({ viewportRef, pendingFocus, layoutRevision, mode: canvasMode, follow: follow && !auditMode, currentId, selectedId });
  const { scene3d, sceneRef, openScene, closeScene, occlusion, exporting, exportImage } = useWorkspaceScene({ viewportRef, flatRef, inspectorRef, selectedId, mode: canvasMode, flash, enabled: !auditMode });
  // Resolve selection against the requested checkpoint, never its loading fallback.
  const { selected, focusNode, clearSelection, switchMode, handleNodesChange, onNodeClick } = useWorkspaceSelection({
    snapshot: timeline.active && !timeline.point ? null : snapshot,
    byId, projection, nodes, edges, mode, setMode, selectedId, setSelectedId,
    deepLink, pendingFocus, centerOnNode, onNodesChange, closeSidebar, scene3d, revealInGeneral: !auditMode,
  });
  const { highlighted, displayNodes, displayEdges } = useWorkspacePresentation(nodes, edges, selectedId, fresh, canvasMode, edgeStyle, showChanges && timeline.active ? timeline.changeMap : null);

  useWorkspaceShortcuts(clearSelection, setPaletteOpen, setShortcutsOpen, setSidebarOpen);
  const openAuditArgument = (node: BoardNode) => {
    navigateWorkspace(isAuditIssue(node) ? { issueId: node.id, candidateId: null, node: node.id } : { candidateId: node.id, node: node.id });
    focusNode(node.id);
    pendingFocus.current = node.id;
  };
  const chooseIssue = (id: string | null) => {
    navigateWorkspace({ issueId: id, candidateId: null, node: id });
    if (id) focusNode(id); else clearSelection();
    pendingFocus.current = id;
  };
  const chooseCandidate = (id: string | null) => {
    navigateWorkspace({ candidateId: id, node: id ?? issueId });
    if (id ?? issueId) focusNode((id ?? issueId)!); else clearSelection();
    pendingFocus.current = id ?? issueId;
  };


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
        workspace={workspace}
        onWorkspace={(next) => {
          navigateWorkspace({ workspace: next });
          if (selectedId) pendingFocus.current = selectedId;
          if (next === 'general' && snapshot && selectedId && !project(snapshot, mode, '', agentId).nodes.some((node) => node.id === selectedId)) setMode('all');
        }}
        mode={mode}
        onMode={switchMode}
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
        onNew={writable ? () => setNewOpen(true) : undefined}
        digestRef={digestTrigger}
        activities={activities}
        activityTotal={stats.activities || activities.length}
        timelineOpen={timelineOpen}
        onTimeline={isStatic ? undefined : () => {
          if (timelineOpen) { timeline.pause(); setAsOf(null); }
          setTimelineOpen(!timelineOpen);
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            <button className="absolute inset-0 z-20 bg-black/20 lg:hidden" aria-label={t('app.closeNav')} onClick={() => setSidebarOpen(false)} />
            <aside className="z-30 w-64 shrink-0 border-r bg-background max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-float">
              {audit ? <AuditNavigation audit={audit} selectedId={selectedId} onSelect={focusNode} onIssue={chooseIssue} onCandidate={chooseCandidate} onCandidateIssue={(id) => navigateWorkspace({ issueId: id })} onOpenArgument={openAuditArgument} onExpand={expandAudit} onSearch={() => { setPaletteOpen(true); closeSidebar(); }} /> :
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
              />}
            </aside>
          </>
        )}

        <main ref={viewportRef} className="relative flex min-w-0 flex-1 flex-col" aria-label={t('app.canvas')}>
          {audit && <AuditContext audit={audit} selected={selected} onNavigate={() => setSidebarOpen(true)} onSelect={focusNode} onOpenArgument={openAuditArgument} onExpand={expandAudit} />}
          <div className="relative min-h-0 flex-1">
          <div ref={flatRef} className="absolute inset-0" inert={scene3d} aria-hidden={scene3d}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={(event, node) => {
              onNodeClick(event, node);
              const detail = (event.target as Element).closest<HTMLButtonElement>('button[data-audit-detail]')?.dataset.auditDetail;
              if (audit && (detail === 'contradiction' || detail === 'condition')) {
                const context = audit.contexts.get(node.id);
                if (context && !context.pages[detail].open) expandAudit(context.pages[detail].key, 'more', 0);
                setSidebarOpen(true);
              }
            }}
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
              hasCurrent={!auditMode && Boolean(currentId)}
              canFollow={!isStatic && !auditMode}
              canExport={Boolean(projection?.nodes.length) && nodes.length > 0 && !exporting}
              onExport={exportImage}
              grouped={auditMode || canvasMode === 'all'}
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
              onScene3d={auditMode ? undefined : openScene}
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
                mode={canvasMode}
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

          {projection && projection.nodes.length === 0 && (!auditMode || allNodes.length === 0) && (
            <EmptyBoard viewEmpty={!auditMode && allNodes.length > 0} isStatic={isStatic} onShowAll={() => switchMode('all')} />
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
          </div>
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

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        nodes={paletteNodes}
        theme={theme}
        copied={copied}
        onSelect={focusNode}
        onMode={auditMode ? undefined : switchMode}
        onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onCopyDigest={copyDigest}
        onExport={projection?.nodes.length && nodes.length > 0 && !exporting ? exportImage : null}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <WriteRecovery writable={writable} />
      {writable && <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />}
      <DigestDialog open={digestOpen} onOpenChange={setDigestOpen} digest={digest} copied={copied} onCopy={copyDigest} returnFocus={digestTrigger} byId={byId} onFocus={focusNode} agentId={agentId} checkpoints={snapshot?.checkpoints} isStatic={isStatic} connected={connection === 'live'} revision={syncedAt} />
    </div>
  );
}

export function App() {
  return <TooltipProvider delayDuration={300}><ReactFlowProvider><SessionDrafts><Workspace /></SessionDrafts></ReactFlowProvider></TooltipProvider>;
}
