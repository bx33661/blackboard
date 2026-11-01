import { CanvasTexture, SRGBColorSpace } from 'three';
import type { BoardNode } from '../types';
import { presentNode, severityLabel, statusLabel, typeLabel } from '../presentation';
import { t } from '../i18n';
import { ratedSeverity } from './model';
import { nodeToken, type Palette } from './palette';

const RADIUS = 10;

/** Everything a card face or label draws; equal keys mean the existing texture still holds. */
export const cardKey = (item: BoardNode) => [item.type, item.title, item.detail, item.status, item.severity].join('\0');

/** Breaks text into at most `lines` lines that fit `width`, per character so CJK titles wrap too. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number) {
  const out: string[] = [];
  let line = '';
  for (const char of text) {
    if (ctx.measureText(line + char).width > width && line) {
      out.push(line);
      line = char.trimStart();
      if (out.length === lines) break;
    } else line += char;
  }
  if (out.length < lines && line) out.push(line);
  else if (out.length === lines) {
    let last = out[lines - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    out[lines - 1] = `${last}…`;
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * The top face of a block reads like the 2D card: accent bar and type in the kind's hue, the recorded
 * status and severity, then the headline and (on full-size cards) the supporting sentence. `scale` is
 * texture pixels per canvas pixel: sharp when the camera flies close, lower on large boards to save memory.
 */
export function cardTexture(item: BoardNode, width: number, height: number, compact: boolean, current: boolean, palette: Palette, font: string, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const hue = palette.css(nodeToken(item.type));
  const ink = palette.css('--ink');
  const muted = palette.css('--ink-3');

  roundRect(ctx, 0, 0, width, height, RADIUS);
  ctx.fillStyle = palette.css(`color-mix(in srgb, var(${nodeToken(item.type)}) 9%, var(--surface))`);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = current ? palette.css('--live') : palette.css(`color-mix(in srgb, var(${nodeToken(item.type)}) 40%, var(--line))`);
  ctx.stroke();
  roundRect(ctx, 0, 12, 3.5, height - 24, 2);
  ctx.fillStyle = hue;
  ctx.fill();

  const left = 16, right = width - 14;
  ctx.textBaseline = 'middle';
  ctx.font = `600 11px ${font}`;
  ctx.fillStyle = hue;
  const type = current ? `${typeLabel(item.type)} · ${t('node.current')}` : typeLabel(item.type);
  ctx.fillText(type, left, 20);

  let edge = right;
  if (item.severity) {
    ctx.font = `600 10px ${font}`;
    const label = severityLabel(item.severity);
    const w = ctx.measureText(label).width + 10;
    const rated = ratedSeverity(item.severity);
    const tone = palette.css(rated ? `--severity-${rated}` : '--ink-3');
    roundRect(ctx, edge - w, 12, w, 16, 4);
    ctx.fillStyle = palette.css(`color-mix(in srgb, ${tone} 16%, var(--surface))`);
    ctx.fill();
    ctx.strokeStyle = palette.css(`color-mix(in srgb, ${tone} 45%, var(--line))`);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.fillText(label, edge - w + 5, 20.5);
    edge -= w + 8;
  }
  if (item.status) {
    ctx.font = `450 10.5px ${font}`;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.fillText(statusLabel(item.status), edge, 20.5);
    ctx.textAlign = 'left';
  }

  const text = presentNode(item);
  const titleSize = compact ? 14 : 15;
  ctx.font = `600 ${titleSize}px ${font}`;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'top';
  const titleLines = wrap(ctx, text.headline, right - left, compact ? 3 : 2);
  titleLines.forEach((line, i) => ctx.fillText(line, left, 36 + i * (titleSize + 5)));
  if (!compact && text.summary) {
    ctx.font = `450 11.5px ${font}`;
    ctx.fillStyle = muted;
    const top = 38 + titleLines.length * (titleSize + 5) + 2;
    const room = Math.floor((height - 10 - top) / 17);
    wrap(ctx, text.summary.replace(/\s+/g, ' '), right - left, Math.max(0, room)).forEach((line, i) => ctx.fillText(line, left, top + i * 17));
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** CSS pixel height of a floating label; it keeps this size on screen at any distance. */
export const LABEL_PX = 28;
const LABEL_MAX_TITLE = 230;

/**
 * The far-away stand-in for a card: a pill with the kind's dot, the headline and a rated severity.
 * Returns the texture with its width-to-height ratio so the sprite keeps the pill's shape.
 */
export function labelTexture(item: BoardNode, palette: Palette, font: string, ratio: number) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const titleFont = `600 13px ${font}`, badgeFont = `600 10px ${font}`;
  ctx.font = titleFont;
  let title = presentNode(item).headline;
  if (ctx.measureText(title).width > LABEL_MAX_TITLE) {
    while (title && ctx.measureText(`${title}…`).width > LABEL_MAX_TITLE) title = title.slice(0, -1);
    title = `${title}…`;
  }
  const titleW = ctx.measureText(title).width;
  const severity = ratedSeverity(item.severity);
  ctx.font = badgeFont;
  const badge = severity ? severityLabel(severity) : '';
  const badgeW = badge ? ctx.measureText(badge).width + 10 : 0;
  const width = Math.ceil(12 + 8 + 7 + titleW + (badge ? 8 + badgeW : 0) + 12);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(LABEL_PX * ratio);
  ctx.scale(ratio, ratio);

  const hue = palette.css(nodeToken(item.type));
  roundRect(ctx, 0.75, 0.75, width - 1.5, LABEL_PX - 1.5, LABEL_PX / 2);
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = palette.css('--surface');
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = palette.css(`color-mix(in srgb, var(${nodeToken(item.type)}) 55%, var(--line))`);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(16, LABEL_PX / 2, 4, 0, Math.PI * 2);
  ctx.fillStyle = hue;
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.font = titleFont;
  ctx.fillStyle = palette.css('--ink');
  ctx.fillText(title, 27, LABEL_PX / 2 + 0.5);
  if (severity) {
    const tone = palette.css(`--severity-${severity}`);
    const x = 27 + titleW + 8;
    roundRect(ctx, x, 6, badgeW, 16, 4);
    ctx.fillStyle = palette.css(`color-mix(in srgb, ${tone} 18%, var(--surface))`);
    ctx.fill();
    ctx.font = badgeFont;
    ctx.fillStyle = tone;
    ctx.fillText(badge, x + 5, LABEL_PX / 2 + 0.5);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: width / LABEL_PX };
}

/** The name of an overview group: a pill like a card's label, in the group's colour. */
export function zoneTexture(label: string, color: string, palette: Palette, font: string, ratio: number) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const type = `700 13px ${font}`;
  ctx.font = type;
  const width = Math.ceil(ctx.measureText(label).width + 24);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(LABEL_PX * ratio);
  ctx.scale(ratio, ratio);
  roundRect(ctx, 0.75, 0.75, width - 1.5, LABEL_PX - 1.5, 6);
  ctx.fillStyle = palette.css(`color-mix(in srgb, ${color} 14%, var(--surface))`);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = type;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(label, 12, LABEL_PX / 2 + 0.5);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: width / LABEL_PX };
}
