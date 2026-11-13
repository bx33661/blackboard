import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hostAppearance, hostNavigate, hostReferenceResult, onParentMessage, parentOrigin, referenceRequest,
  type EmbedAppearance, type EmbedFonts,
} from '../embedded';
import { locale, setLocale } from '../i18n';

/** How long the reader sees "referenced" before the explicit action returns to rest. */
const SUCCESS_LINGER = 2_400;
/** A host that never answers must not leave the button spinning forever. */
const RESPONSE_TIMEOUT = 12_000;

export type ReferenceFeedback = {
  status: 'idle' | 'pending' | 'done' | 'error';
  /** Host explanation for a failure; `null` means the host stayed silent. */
  message: string | null;
  /** The node the last request named: its feedback never follows the reader to another node. */
  nodeId: string | null;
};

export type EmbedReference = ReferenceFeedback & {
  /** Ask the host to reference one node; it rereads the canonical node itself. */
  request: (nodeId: string) => void;
};

type Options = {
  /** The page is framed; a standalone tab never listens. */
  embedded: boolean;
  /** `reference=1` within an embed, and never over a checkpoint or a static export. */
  enabled: boolean;
  onAppearance: (appearance: EmbedAppearance) => void;
  onFonts: (fonts: EmbedFonts) => void;
  onNavigate: (nodeId: string) => void;
};

/**
 * The framed board's half of the host protocol. Appearance, fonts and navigation are applied
 * without writing anything; a reference request is the one explicit host action, correlated by
 * `requestId` and settled only by the framing page.
 */
export function useEmbedHost({ embedded, enabled, onAppearance, onFonts, onNavigate }: Options): EmbedReference {
  const [feedback, setFeedback] = useState<ReferenceFeedback>({ status: 'idle', message: null, nodeId: null });
  const handlers = useRef({ onAppearance, onFonts, onNavigate });
  const pendingId = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { handlers.current = { onAppearance, onFonts, onNavigate }; });

  const clearTimers = useCallback(() => {
    if (timeout.current !== null) { clearTimeout(timeout.current); timeout.current = null; }
    if (linger.current !== null) { clearTimeout(linger.current); linger.current = null; }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // A page that left the reference affordance abandons its in-flight request and its feedback.
  useEffect(() => {
    if (enabled) return;
    pendingId.current = null;
    clearTimers();
    setFeedback({ status: 'idle', message: null, nodeId: null });
  }, [enabled, clearTimers]);

  useEffect(() => {
    if (!embedded) return;
    return onParentMessage((data) => {
      const appearance = hostAppearance(data);
      if (appearance) {
        // Keep the latest host appearance in the frame URL so a later language reload retains it.
        // Updating the current entry preserves the reader's view, selected node and checkpoint.
        try {
          const url = new URL(location.href);
          if (appearance.theme) url.searchParams.set('theme', appearance.theme);
          for (const [key, value] of Object.entries(appearance.fonts)) {
            if (value !== null) url.searchParams.set(key, String(value));
          }
          history.replaceState(history.state, '', url);
        } catch { /* Appearance still applies for this document. */ }
        if (appearance.theme) handlers.current.onAppearance(appearance.theme);
        if (Object.values(appearance.fonts).some((value) => value !== null)) handlers.current.onFonts(appearance.fonts);
        // Language is fixed for a page lifetime; update its URL before reloading the frame.
        if (appearance.locale && appearance.locale !== locale) setLocale(appearance.locale);
      }
      const nodeId = hostNavigate(data);
      if (nodeId) handlers.current.onNavigate(nodeId);
      const result = hostReferenceResult(data);
      if (result && result.requestId === pendingId.current) {
        pendingId.current = null;
        clearTimers();
        if (result.ok) {
          setFeedback((current) => ({ ...current, status: 'done', message: null }));
          linger.current = setTimeout(() => setFeedback({ status: 'idle', message: null, nodeId: null }), SUCCESS_LINGER);
        } else {
          setFeedback((current) => ({ ...current, status: 'error', message: result.message }));
        }
      }
    });
  }, [embedded, clearTimers]);

  const request = useCallback((nodeId: string) => {
    if (!embedded || !enabled || pendingId.current || typeof window === 'undefined' || window.parent === window) return;
    clearTimers();
    const requestId = `reference-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    pendingId.current = requestId;
    setFeedback({ status: 'pending', message: null, nodeId });
    timeout.current = setTimeout(() => {
      if (pendingId.current !== requestId) return;
      pendingId.current = null;
      timeout.current = null;
      setFeedback({ status: 'error', message: null, nodeId });
    }, RESPONSE_TIMEOUT);
    try {
      window.parent.postMessage(referenceRequest(nodeId, requestId), parentOrigin(document.referrer));
    } catch {
      pendingId.current = null;
      clearTimers();
      setFeedback({ status: 'error', message: null, nodeId });
    }
  }, [embedded, enabled, clearTimers]);

  return { status: feedback.status, message: feedback.message, nodeId: feedback.nodeId, request };
}
