/**
 * Generic host embedding. Any page may frame the board — an integration is never imported here:
 * `embed=1` asks for the compact presentation, the host keeps its own page chrome, and it alone
 * decides the framed board's appearance, language and type scale.
 *
 * The framing page is the only authority. Every parent message is accepted only from the exact
 * `window.parent` object; the host page is expected to post back with its own origin. Nothing a
 * host sends is stored: a framed board never writes host preferences to the reader's profile.
 */

export type EmbedAppearance = 'light' | 'dark';
export type EmbedLocale = 'zh-CN' | 'zh-HK' | 'en' | 'ja';

export const EMBED_LOCALES: readonly EmbedLocale[] = ['zh-CN', 'zh-HK', 'en', 'ja'];

export const FONT_SIZE_RANGE = { min: 10, max: 22 } as const;
export const CODE_FONT_SIZE_RANGE = { min: 10, max: 16 } as const;

/** Host type preferences. `null` means "this update does not speak about it". */
export type EmbedFonts = {
  readonly fontFamily: string | null;
  readonly codeFontFamily: string | null;
  readonly fontSize: number | null;
  readonly codeFontSize: number | null;
};

export const NO_FONTS: EmbedFonts = Object.freeze({
  fontFamily: null, codeFontFamily: null, fontSize: null, codeFontSize: null,
});

export type EmbedPresentation = {
  /** The page is framed: one compact toolbar instead of the full product header. */
  embedded: boolean;
  /** Appearance requested by the framing URL; never applied to a standalone page. */
  appearance: EmbedAppearance | null;
  /** Interface language requested by the framing URL; never applied to a standalone page. */
  locale: EmbedLocale | null;
  /** Type preferences requested by the framing URL; empty outside an embed. */
  fonts: EmbedFonts;
  /** The host asked for an explicit "reference this node" affordance (`reference=1`). */
  reference: boolean;
};

const appearance = (value: unknown): EmbedAppearance | null => value === 'light' || value === 'dark' ? value : null;

const locale = (value: unknown): EmbedLocale | null => typeof value === 'string' && EMBED_LOCALES.includes(value as EmbedLocale) ? value as EmbedLocale : null;

/** A family list is inert CSS once set as a custom property, but keep it a family list, not a stylesheet. */
const family = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 160 && !/[\u0000-\u001F\u007F;{}<>]/.test(text) ? text : null;
};

const size = (value: unknown, range: { min: number; max: number }): number | null => {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d{1,3}$/.test(value.trim()) ? Number(value.trim())
      : Number.NaN;
  return Number.isInteger(parsed) && parsed >= range.min && parsed <= range.max ? parsed : null;
};

const nodeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 256 && !/[\u0000-\u001F\u007F]/.test(text) ? text : null;
};

/**
 * `embed=1` (or a bare `embed`) opts in. An explicit off switch keeps ordinary links shareable:
 * a reader who frames a normal board URL still gets the page it was written to be.
 * Every other parameter speaks only for an embed, so a standalone page ignores a stray `lang=ja`.
 */
export function readPresentation(search: string): EmbedPresentation {
  const params = new URLSearchParams(search);
  const flag = params.get('embed');
  const embedded = flag !== null && flag !== '0' && flag !== 'false';
  if (!embedded) return { embedded: false, appearance: null, locale: null, fonts: NO_FONTS, reference: false };
  return {
    embedded: true,
    appearance: appearance(params.get('theme')),
    locale: locale(params.get('lang')),
    fonts: {
      fontFamily: family(params.get('fontFamily')),
      codeFontFamily: family(params.get('codeFontFamily')),
      fontSize: size(params.get('fontSize'), FONT_SIZE_RANGE),
      codeFontSize: size(params.get('codeFontSize'), CODE_FONT_SIZE_RANGE),
    },
    reference: params.get('reference') === '1',
  };
}

/** Host → board appearance, language and type updates, posted to the framed window. */
export const APPEARANCE_MESSAGE = 'pinwhy:appearance';
/** Host → board: focus and reveal one node; reading never writes a board event. */
export const NAVIGATE_MESSAGE = 'pinwhy:navigate';
/** Board → host: the reader asked to reference the selected node in the host conversation. */
export const REFERENCE_MESSAGE = 'pinwhy:reference';
/** Host → board: the answer to one reference request, matched by `requestId`. */
export const REFERENCE_RESULT_MESSAGE = 'pinwhy:reference-result';

export type HostAppearance = {
  theme: EmbedAppearance | null;
  locale: EmbedLocale | null;
  fonts: EmbedFonts;
};

/**
 * Validate an appearance message. Every field is optional, but a message that changes nothing —
 * wrong type, unknown vocabulary, or no usable field — is ignored instead of repainting the board.
 */
export function hostAppearance(data: unknown): HostAppearance | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.type !== APPEARANCE_MESSAGE) return null;
  const update: HostAppearance = {
    theme: appearance(message.theme),
    locale: locale(message.locale),
    fonts: {
      fontFamily: family(message.fontFamily),
      codeFontFamily: family(message.codeFontFamily),
      fontSize: size(message.fontSize, FONT_SIZE_RANGE),
      codeFontSize: size(message.codeFontSize, CODE_FONT_SIZE_RANGE),
    },
  };
  const typed = update.theme !== null || update.locale !== null || Object.values(update.fonts).some((value) => value !== null);
  return typed ? update : null;
}

/** A navigate message names one node; the board decides whether it can be revealed. */
export function hostNavigate(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  return message.type === NAVIGATE_MESSAGE ? nodeId(message.nodeId) : null;
}

export type ReferenceResult = {
  requestId: string;
  ok: boolean;
  /** A host explanation for a failure; never a node payload. */
  message: string | null;
};

/** The host's answer to `pinwhy:reference`. Ids are opaque: only the matching request is settled. */
export function hostReferenceResult(data: unknown): ReferenceResult | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.type !== REFERENCE_RESULT_MESSAGE) return null;
  if (typeof message.requestId !== 'string' || message.requestId.length === 0 || message.requestId.length > 128) return null;
  if (typeof message.ok !== 'boolean') return null;
  const detail = typeof message.message === 'string' ? message.message.trim().slice(0, 500) : '';
  return { requestId: message.requestId, ok: message.ok, message: detail || null };
}

/** The board sends the node id and its own correlation id; the host rereads the canonical node. */
export function referenceRequest(nodeId: string, requestId: string) {
  return { type: REFERENCE_MESSAGE, nodeId, requestId } as const;
}

/**
 * True only for the exact framing window. Comparing `event.source` by identity is stricter than
 * comparing an origin string: a sibling frame, a popup or another window is never the host.
 */
export function isHostSource(source: unknown, host: unknown): boolean {
  return Boolean(source) && source === host;
}

// The iframe's load event can reach its parent before React has mounted. Retain early host
// messages until the workspace subscribes so the initial appearance and focus are not lost.
let earlyMessages: unknown[] | null = null;
let stopEarlyMessages: (() => void) | null = null;
if (typeof window !== 'undefined' && window.parent !== window && typeof location !== 'undefined' && readPresentation(location.search).embedded) {
  const host = window.parent;
  const queue: unknown[] = [];
  earlyMessages = queue;
  const listener = (event: MessageEvent) => {
    if (!isHostSource(event.source, host)) return;
    if (queue.length === 64) queue.shift();
    queue.push(event.data);
  };
  window.addEventListener('message', listener);
  stopEarlyMessages = () => window.removeEventListener('message', listener);
}

/**
 * Listen while framed. A page that is its own top window has no host and never subscribes, so a
 * `postMessage` addressed to a standalone tab cannot repaint or navigate it.
 */
export function onParentMessage(receive: (data: unknown) => void): () => void {
  if (typeof window === 'undefined' || window.parent === window) return () => {};
  const host = window.parent;
  const listener = (event: MessageEvent) => {
    if (!isHostSource(event.source, host)) return;
    receive(event.data);
  };
  window.addEventListener('message', listener);
  stopEarlyMessages?.();
  stopEarlyMessages = null;
  const queued = earlyMessages;
  earlyMessages = null;
  queued?.forEach(receive);
  return () => window.removeEventListener('message', listener);
}

/**
 * The framing page's origin from the referrer, used as the `postMessage` target. When the browser
 * withholds the referrer, `*` is the only target left; the host still has to validate the sender.
 */
export function parentOrigin(referrer: string | null | undefined): string {
  try {
    const origin = new URL(referrer || '').origin;
    return origin && origin !== 'null' ? origin : '*';
  } catch {
    return '*';
  }
}

/** The tiny slice of `<html>` that host fonts touch; a DOM element satisfies it. */
export type EmbedFontTarget = {
  style: {
    fontSize: string;
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
  dataset: Record<string, string | undefined>;
};

/**
 * Apply host type preferences through custom properties, so every panel follows one scale.
 * `fontSize` is the reader's base size in px: the root element and body text both move, and
 * rem-based labels follow. Absent fields are removed, restoring the board's own typography.
 */
export function applyEmbedFonts(fonts: EmbedFonts, target?: EmbedFontTarget | null) {
  const root = target ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!root) return;
  const set = (name: string, value: string | null) => value === null ? root.style.removeProperty(name) : root.style.setProperty(name, value);
  set('--pinwhy-font-sans', fonts.fontFamily);
  set('--pinwhy-font-size', fonts.fontSize === null ? null : `${fonts.fontSize}px`);
  set('--pinwhy-code-font', fonts.codeFontFamily);
  set('--pinwhy-code-size', fonts.codeFontSize === null ? null : `${fonts.codeFontSize}px`);
  root.style.fontSize = fonts.fontSize === null ? '' : `${fonts.fontSize}px`;
  for (const [flag, present] of [['embedCodeFont', fonts.codeFontFamily !== null], ['embedCodeSize', fonts.codeFontSize !== null]] as const) {
    if (present) root.dataset[flag] = ''; else delete root.dataset[flag];
  }
}
