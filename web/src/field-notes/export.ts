import fieldNotesCss from './field-notes.css?inline';
import type { FieldNotesExportOptions } from './types';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const RASTER_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/=\s]+$/i;
const SVG_IMAGE = /^data:image\/svg\+xml((?:;charset=(?:utf-8|us-ascii)|;utf8)?)(;base64)?,([\s\S]*)$/i;
const UNSUPPORTED_ELEMENTS: Record<string, true> = {
  base: true, link: true, meta: true, iframe: true, frame: true, frameset: true,
  object: true, embed: true, audio: true, video: true, source: true, track: true, foreignobject: true,
};
const REMOVED_ELEMENTS: Record<string, true> = {
  script: true, style: true, noscript: true, button: true, input: true, select: true,
  textarea: true, option: true, datalist: true, animate: true, animatemotion: true,
  animatetransform: true, set: true,
};

function unsupportedResource(): never {
  throw new Error('Field notes export requires embedded images and local SVG references; external or unsupported resources remain.');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Only local fragment URLs occur in the document stylesheet and SVG paint attributes. */
function assertLocalCss(value: string): void {
  const css = value.replace(/\/\*[\s\S]*?\*\//g, '').replace(
    /\\([\da-f]{1,6})\s?|\\([^\r\n])/gi,
    (_, hex: string | undefined, character: string | undefined) => {
      const point = hex ? Number.parseInt(hex, 16) : 0;
      return hex ? String.fromCodePoint(point > 0 && point <= 0x10ffff ? point : 0xfffd) : character!;
    },
  );
  if (/@import\b|(?:image-set|expression)\s*\(|-moz-binding\s*:/i.test(css)) unsupportedResource();
  const urls = css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi);
  let parsedUrls = 0;
  for (const match of urls) {
    parsedUrls += 1;
    if (!/^#[^\s"'<>]*$/.test((match[1] ?? match[2] ?? match[3]).trim())) unsupportedResource();
  }
  if ((css.match(/url\s*\(/gi)?.length ?? 0) !== parsedUrls) unsupportedResource();
}

function assertEmbeddedImage(value: string): void {
  if (RASTER_IMAGE.test(value)) return;
  const match = SVG_IMAGE.exec(value);
  if (!match) unsupportedResource();
  let source: string;
  try {
    source = match[2]
      ? new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(match[3]), (character) => character.charCodeAt(0)))
      : decodeURIComponent(match[3]);
  } catch {
    unsupportedResource();
  }
  // A logo is an image, not a second document with its own executable content or resources.
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(source)) unsupportedResource();
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (svg.documentElement.localName !== 'svg' || svg.querySelector('parsererror')) unsupportedResource();
  for (const element of [svg.documentElement, ...svg.documentElement.querySelectorAll('*')]) {
    const tag = element.localName.toLowerCase();
    if (element.namespaceURI !== SVG_NAMESPACE || UNSUPPORTED_ELEMENTS[tag]
      || (REMOVED_ELEMENTS[tag] && tag !== 'style')) unsupportedResource();
    if (tag === 'style') assertLocalCss(element.textContent ?? '');
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      if (name.startsWith('on') || name === 'src' || name === 'srcset' || name === 'base') unsupportedResource();
      if (name === 'href' && !attribute.value.startsWith('#')) {
        if (tag !== 'image' || !RASTER_IMAGE.test(attribute.value)) unsupportedResource();
      }
      if (name === 'style' || /url\s*\(|\\/i.test(attribute.value)) assertLocalCss(attribute.value);
    }
  }
}

function prepareClone(article: HTMLElement): HTMLElement {
  if (!article.matches('[data-field-notes]') || article.hasAttribute('data-notes-action')) {
    throw new Error('Field notes export requires the document root.');
  }
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-notes-action]').forEach((element) => element.remove());
  const elements = [clone, ...clone.querySelectorAll('*')];
  for (const element of elements) {
    // Parents removed above or earlier in this walk need no further processing.
    if (element !== clone && !clone.contains(element)) continue;
    const tag = element.localName.toLowerCase();
    if (REMOVED_ELEMENTS[tag]) {
      element.remove();
      continue;
    }
    if (UNSUPPORTED_ELEMENTS[tag] || (element.namespaceURI !== HTML_NAMESPACE
      && element.namespaceURI !== SVG_NAMESPACE) || tag.includes('-')) unsupportedResource();
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      if (name.startsWith('on') || ['contenteditable', 'autofocus', 'ping', 'target', 'download', 'action', 'formaction'].includes(name)) {
        element.removeAttributeNode(attribute);
        continue;
      }
      if (name === 'srcset' || name === 'imagesrcset' || name === 'srcdoc' || name === 'background'
        || name === 'poster' || name === 'data' || name === 'codebase' || name === 'manifest' || name === 'base') {
        if (attribute.value.trim()) unsupportedResource();
        element.removeAttributeNode(attribute);
        continue;
      }
      if (name === 'src') {
        if (tag !== 'img') unsupportedResource();
        assertEmbeddedImage(attribute.value);
      }
      if (name === 'href') {
        if (tag === 'a') {
          // Offline navigation only: preserve the actual document's internal anchors.
          if (!attribute.value.startsWith('#')) element.removeAttributeNode(attribute);
        } else if (!attribute.value.startsWith('#')) {
          if (tag !== 'image') unsupportedResource();
          assertEmbeddedImage(attribute.value);
        }
      }
      if (name === 'style' || /url\s*\(|\\/i.test(attribute.value)) assertLocalCss(attribute.value);
    }
  }
  clone.setAttribute('data-offline', '');
  return clone;
}

/** Serialize the rendered document without reinterpreting record text as markup. Throws on non-offline resources. */
export function renderFieldNotesHtml(article: HTMLElement, options: FieldNotesExportOptions): string {
  const clone = prepareClone(article);
  assertLocalCss(fieldNotesCss);
  // A literal '<' in a CSS string/comment must never close the HTML style element.
  const css = fieldNotesCss.replace(/</g, '\\3c ');
  const theme = clone.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const icon = clone.querySelector<HTMLImageElement>('.fn-logo')?.getAttribute('src');
  const favicon = icon ? `<link rel="icon" href="${escapeHtml(icon)}">` : '';
  const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html>
<html lang="${escapeHtml(options.locale)}" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
<meta name="color-scheme" content="${theme}">
${favicon}
<title>${escapeHtml(options.title)}</title>
<style>${css}</style>
</head>
<body data-theme="${theme}">${clone.outerHTML}</body>
</html>`;
}

/** Download a self-contained HTML copy; the live document and graph are never modified. */
export function downloadFieldNotes(article: HTMLElement, options: FieldNotesExportOptions): void {
  const html = renderFieldNotesHtml(article, options);
  const filename = options.title.replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, '').trim().replace(/[. ]+$/g, '') || 'field-notes';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = article.ownerDocument.createElement('a');
  link.href = url;
  link.download = `${filename}.html`;
  link.hidden = true;
  try {
    article.ownerDocument.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Keep the URL alive until the browser has started consuming the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
