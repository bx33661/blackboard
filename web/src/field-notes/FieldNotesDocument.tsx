import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { locale, t, tOptional } from '../i18n';
import { confidenceLabel, severityLabel, statusLabel, typeLabel } from '../presentation';
import { values, type BoardEdge, type BoardNode, type Checkpoint } from '../types';
import type { FieldNotesDocumentProps } from './types';
import { sourceLocation } from '../research-state';
import './field-notes.css';

const nodeAnchor = (id: string) => `fn-node-${encodeURIComponent(id)}`;
const fragment = (id: string) => `#${encodeURIComponent(id)}`;
const checkpointAnchor = (id: string) => `fn-checkpoint-${encodeURIComponent(id)}`;
const dateFormatter = new Intl.DateTimeFormat(locale, {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  second: '2-digit', hour12: false, timeZoneName: 'short',
});

function RecordedTime({ value }: { value?: number }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) {
    return <span className="fn-unrecorded">{t('notes.unrecorded')}</span>;
  }
  return <time dateTime={new Date(value).toISOString()}>{dateFormatter.format(value)}</time>;
}

function Metadata({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fn-metadata-item"><dt>{label}</dt><dd>{children}</dd></div>;
}

function StoredDimension({ value, label }: { value?: string | null; label: string }) {
  return <><span>{label}</span>{value && value !== label && <code className="fn-stored-value">{value}</code>}</>;
}

function InputTruncation({ loss }: { loss: unknown }) {
  const entries = Object.entries(loss && typeof loss === 'object' ? loss : {}).filter((entry): entry is [string, { originalLength: number; storedLength: number }] => {
    const value: unknown = entry[1];
    return value !== null && typeof value === 'object' && 'originalLength' in value && 'storedLength' in value
      && typeof value.originalLength === 'number' && typeof value.storedLength === 'number'
      && Number.isSafeInteger(value.originalLength) && Number.isSafeInteger(value.storedLength)
      && value.originalLength > value.storedLength && value.storedLength >= 0;
  });
  if (!entries.length) return null;
  return <ul className="fn-integrity" role="note">{entries.map(([field, value]) => <li key={field}>
    {t('notes.truncatedInput', { field, stored: value.storedLength, original: value.originalLength })}
  </li>)}</ul>;
}

function CheckpointMetadata({ id, checkpoint }: { id: string; checkpoint: Checkpoint }) {
  return <dl className="fn-metadata fn-checkpoint-meta">
    <Metadata label={t('notes.checkpointId')}><code>{id}</code></Metadata>
    <Metadata label={t('notes.time')}><RecordedTime value={checkpoint.at} /></Metadata>
    <Metadata label={t('notes.author')}>{checkpoint.agentId || <span className="fn-unrecorded">{t('notes.unrecorded')}</span>}</Metadata>
  </dl>;
}

function NodeSources({ node }: { node: BoardNode }) {
  const location = sourceLocation(node);
  const tags = Array.isArray(node.tags) ? node.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  if (!location && !tags.length && !node.updatedBy) return null;
  return <dl className="fn-metadata fn-node-meta">
    {location && <Metadata label={t('source.location')}><code>{location}</code></Metadata>}
    {tags.length > 0 && <Metadata label={t('source.tags')}>{tags.map((tag, index) => <code key={index}>{tag}{index < tags.length - 1 ? ' · ' : ''}</code>)}</Metadata>}
    {typeof node.updatedBy === 'string' && node.updatedBy && <Metadata label={t('source.updatedBy')}>{node.updatedBy}</Metadata>}
  </dl>;
}

function GraphPreview({ nodes, edges, focus }: { nodes: BoardNode[]; edges: BoardEdge[]; focus?: string }) {
  const markerId = `fn-arrow-${useId().replace(/:/g, '')}`;
  const visible = nodes.slice(0, 12);
  const positions = new Map(visible.map((node, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / visible.length;
    return [node.id, { x: 180 + Math.cos(angle) * 126, y: 160 + Math.sin(angle) * 115 }];
  }));
  const visibleEdges = edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to));
  return <figure className="fn-preview">
    {visible.length ? <svg viewBox="0 0 360 320" role="img" aria-label={t('notes.previewLabel')}>
      <title>{t('notes.previewLabel')}</title>
      <defs><marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
      <circle className="fn-preview-orbit" cx="180" cy="160" r="139" />
      {visibleEdges.map((edge) => {
        const from = positions.get(edge.from)!;
        const to = positions.get(edge.to)!;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const path = length === 0
          ? `M ${from.x - 11} ${from.y - 12} C ${from.x - 49} ${from.y - 60}, ${from.x + 49} ${from.y - 60}, ${from.x + 11} ${from.y - 12}`
          : `M ${from.x + (to.x - from.x) * 19 / length} ${from.y + (to.y - from.y) * 19 / length} L ${to.x - (to.x - from.x) * 21 / length} ${to.y - (to.y - from.y) * 21 / length}`;
        return <path className="fn-preview-edge" key={edge.id} d={path} markerEnd={`url(#${markerId})`}><title>{`${edge.from} → ${edge.to} · ${edge.kind}`}</title></path>;
      })}
      {visible.map((node, index) => {
        const point = positions.get(node.id)!;
        return <g key={node.id} className={node.id === focus ? 'fn-preview-node fn-preview-focus' : 'fn-preview-node'}>
          <title>{`${node.id} · ${node.title}`}</title>
          <circle cx={point.x} cy={point.y} r="17" />
          <text x={point.x} y={point.y} dy=".35em" textAnchor="middle">{String(index + 1).padStart(2, '0')}</text>
        </g>;
      })}
    </svg> : <div className="fn-preview-empty"><svg viewBox="0 0 120 100" aria-hidden="true"><rect x="20" y="10" width="80" height="80" rx="5" /><path d="M 40 36 H 80 M 40 50 H 80 M 40 64 H 63" /></svg><p>{t('notes.previewEmpty')}</p></div>}
    <figcaption>{t('notes.previewCoverage', { shown: visible.length, total: nodes.length, edges: visibleEdges.length, totalEdges: edges.length })}</figcaption>
  </figure>;
}

/** A read-only document of the supplied snapshot; authored text is never summarized. */
export function FieldNotesDocument({ snapshot, cover, theme, onContinue, onNode, onCheckpoint }: FieldNotesDocumentProps) {
  const { nodes, edges, byId, groups, checkpoints } = useMemo(() => {
    const nodes = values(snapshot.nodes);
    const edges = values(snapshot.edges);
    const groups = new Map<string, BoardNode[]>();
    for (const node of nodes) {
      const group = groups.get(node.type);
      if (group) group.push(node);
      else groups.set(node.type, [node]);
    }
    // Replay insertion order remains meaningful when recorded clocks tie or move backwards.
    const checkpoints = Object.entries(snapshot.checkpoints || {}).map(([key, checkpoint]) => ({
      id: checkpoint.id || key, checkpoint,
    }));
    return { nodes, edges, byId: new Map(nodes.map((node) => [node.id, node])), groups, checkpoints };
  }, [snapshot]);
  const latest = checkpoints[checkpoints.length - 1];
  const focus = snapshot.meta.focus;
  const endpoint = (id: string) => {
    const node = byId.get(id);
    return node ? <a href={fragment(nodeAnchor(id))}><code>{id}</code><span className="fn-original">{node.title || t('notes.recordTitleEmpty')}</span></a>
      : <span className="fn-missing-endpoint"><code>{id}</code><small>{t('notes.missingEndpoint')}</small></span>;
  };

  return <article data-field-notes data-theme={theme} style={{ '--notes-accent': cover.accent } as CSSProperties}>
    <header className="fn-cover" id="fn-overview">
      <div className="fn-cover-main">
        <p className="fn-brand">{cover.logo && <img className="fn-logo" src={cover.logo} alt="" />}<span>{t('notes.eyebrow')}</span></p>
        <h1 className="fn-original">{cover.title}</h1>
        {cover.subtitle && <p className="fn-subtitle fn-original">{cover.subtitle}</p>}
        <p className="fn-offline-label">{t('notes.offline')}</p>
        {snapshot.meta.asOf && <div className="fn-asof"><span>{t('notes.asOf', { id: snapshot.meta.asOf.id })}</span><RecordedTime value={snapshot.meta.asOf.at ?? undefined} /></div>}
        <div className="fn-cover-counts"><span>{t('notes.recordCount', { n: nodes.length })}</span><span>{t('notes.relationCount', { n: edges.length })}</span><span>{t('notes.checkpointCount', { n: checkpoints.length })}</span></div>
        {focus && <p className="fn-focus"><span className="fn-focus-dot" aria-hidden="true" />{t('notes.focus')}<span>{byId.has(focus) ? <a href={fragment(nodeAnchor(focus))}>{focus}</a> : <code>{focus}</code>}</span></p>}
        <button type="button" data-notes-action className="fn-button fn-button-primary" onClick={onContinue}>{t('notes.continue')}<span aria-hidden="true">↗</span></button>
      </div>
      <GraphPreview nodes={nodes} edges={edges} focus={focus} />
    </header>

    <nav className="fn-contents" aria-label={t('notes.contents')}>
      <span className="fn-eyebrow">{t('notes.contents')}</span>
      <a href="#fn-checkpoints"><span aria-hidden="true">01</span>{t('notes.checkpoints')}</a>
      <a href="#fn-records"><span aria-hidden="true">02</span>{t('notes.records')}</a>
      <a href="#fn-relations"><span aria-hidden="true">03</span>{t('notes.relations')}</a>
    </nav>

    <section className="fn-latest" aria-labelledby="fn-latest-title">
      <div className="fn-latest-heading"><span className="fn-latest-mark" aria-hidden="true">“</span><h2 id="fn-latest-title">{t('notes.latestCheckpoint')}</h2></div>
      {latest ? <>
        <p className="fn-original fn-checkpoint-summary">{latest.checkpoint.summary || t('notes.checkpointSummaryEmpty')}</p>
        <InputTruncation loss={latest.checkpoint.inputTruncation} />
        <CheckpointMetadata id={latest.id} checkpoint={latest.checkpoint} />
        {onCheckpoint && <button type="button" className="fn-text-button" data-notes-action onClick={() => onCheckpoint(latest.id)}>{t('notes.openCheckpoint')}<span aria-hidden="true"> ↗</span></button>}
      </> : <p className="fn-empty">{t('notes.checkpointEmpty')}</p>}
    </section>

    <section className="fn-section" id="fn-checkpoints" aria-labelledby="fn-checkpoints-title">
      <div className="fn-section-heading"><span className="fn-section-number" aria-hidden="true">01</span><h2 id="fn-checkpoints-title">{t('notes.checkpoints')}</h2><span className="fn-section-count">{checkpoints.length}</span></div>
      {checkpoints.length ? <ol className="fn-checkpoints">{checkpoints.map(({ id, checkpoint }, index) => <li className="fn-checkpoint" key={id} id={checkpointAnchor(id)}>
        <div className="fn-checkpoint-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
        <div className="fn-checkpoint-body">
          <h3 className="fn-checkpoint-title"><code>{id}</code></h3>
          <p className="fn-original fn-checkpoint-summary">{checkpoint.summary || t('notes.checkpointSummaryEmpty')}</p>
          <InputTruncation loss={checkpoint.inputTruncation} />
          <CheckpointMetadata id={id} checkpoint={checkpoint} />
          {onCheckpoint && <button type="button" data-notes-action className="fn-text-button" onClick={() => onCheckpoint(id)}>{t('notes.openCheckpoint')}<span aria-hidden="true"> ↗</span></button>}
        </div>
      </li>)}</ol> : <p className="fn-empty">{t('notes.checkpointEmpty')}</p>}
    </section>

    <section className="fn-section" id="fn-records" aria-labelledby="fn-records-title">
      <div className="fn-section-heading"><span className="fn-section-number" aria-hidden="true">02</span><h2 id="fn-records-title">{t('notes.records')}</h2><span className="fn-section-count">{nodes.length}</span></div>
      <p className="fn-section-intro">{t('notes.storedText')}</p>
      {nodes.length ? Array.from(groups, ([type, records]) => <section className="fn-record-group" key={type}>
        <h3 className="fn-group-heading"><StoredDimension value={type} label={typeLabel(type)} /><span className="fn-group-count">{records.length}</span></h3>
        <div className="fn-records">{records.map((node) => <section className="fn-record" key={node.id} id={nodeAnchor(node.id)} aria-labelledby={`${nodeAnchor(node.id)}-title`}>
          <div className="fn-record-topline"><code>{node.id}</code>{node.id === focus && <span className="fn-focus-badge">{t('notes.focus')}</span>}</div>
          <h4 id={`${nodeAnchor(node.id)}-title`} className="fn-original">{node.title || t('notes.recordTitleEmpty')}</h4>
          <dl className="fn-dimensions">
            <Metadata label={t('notes.type')}><StoredDimension value={node.type} label={typeLabel(node.type)} /></Metadata>
            <Metadata label={t('notes.status')}><StoredDimension value={node.status} label={statusLabel(node.status)} /></Metadata>
            <Metadata label={t('notes.severity')}><StoredDimension value={node.severity} label={severityLabel(node.severity)} /></Metadata>
            <Metadata label={t('notes.confidence')}><StoredDimension value={node.confidence} label={confidenceLabel(node.confidence)} /></Metadata>
          </dl>
          <div className="fn-detail"><h5>{t('notes.detail')}</h5>{node.detail ? <div className="fn-original">{node.detail}</div> : <p className="fn-empty">{t('notes.detailEmpty')}</p>}</div>
          <InputTruncation loss={node.inputTruncation} />
          <NodeSources node={node} />
          <dl className="fn-metadata fn-node-meta">
            <Metadata label={t('notes.nodeId')}><code>{node.id}</code></Metadata>
            <Metadata label={t('notes.time')}><RecordedTime value={node.ts} /></Metadata>
            <Metadata label={t('notes.updated')}><RecordedTime value={node.updated} /></Metadata>
            <Metadata label={t('notes.author')}>{typeof node.author === 'string' && node.author ? node.author : <span className="fn-unrecorded">{t('notes.unrecorded')}</span>}</Metadata>
            {node.session && <Metadata label={t('notes.session')}>{node.session}</Metadata>}
          </dl>
          <button type="button" data-notes-action className="fn-text-button" onClick={() => onNode(node.id)}>{t('notes.openNode')}<span aria-hidden="true"> ↗</span></button>
        </section>)}</div>
      </section>) : <p className="fn-empty">{t('notes.nodesEmpty')}</p>}
    </section>

    <section className="fn-section" id="fn-relations" aria-labelledby="fn-relations-title">
      <div className="fn-section-heading"><span className="fn-section-number" aria-hidden="true">03</span><h2 id="fn-relations-title">{t('notes.relations')}</h2><span className="fn-section-count">{edges.length}</span></div>
      {edges.length ? <ol className="fn-relations">{edges.map((edge) => <li className="fn-relation" key={edge.id}>
        <div className="fn-relation-heading"><code>{edge.id}</code><span>{t('notes.relationDirection')}</span></div>
        <div className="fn-relation-path"><div className="fn-endpoint">{endpoint(edge.from)}</div><span className="fn-direction-arrow" aria-hidden="true">→</span><div className="fn-endpoint">{endpoint(edge.to)}</div></div>
        <dl className="fn-metadata fn-relation-meta"><Metadata label={t('notes.relationKind')}><StoredDimension value={edge.kind} label={tOptional(`relation.${edge.kind}`) || edge.kind} /></Metadata><Metadata label={t('notes.time')}><RecordedTime value={edge.ts} /></Metadata></dl>
        {edge.label !== undefined && <div className="fn-relation-label"><h4>{t('notes.relationLabel')}</h4><p className="fn-original">{edge.label}</p></div>}
        <InputTruncation loss={edge.inputTruncation} />
      </li>)}</ol> : <p className="fn-empty">{t('notes.relationsEmpty')}</p>}
    </section>

    <footer className="fn-footer"><a href="#fn-overview">{t('notes.eyebrow')}<span aria-hidden="true"> ↑</span></a><button type="button" data-notes-action className="fn-button" onClick={onContinue}>{t('notes.continue')}<span aria-hidden="true">↗</span></button></footer>
  </article>;
}
