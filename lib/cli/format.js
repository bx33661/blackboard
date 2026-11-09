import { TYPE_LABEL, CONFIDENCE_LABEL } from '../model.js';

export const C = process.stdout.isTTY && process.env.TERM !== 'dumb' && !Object.hasOwn(process.env, 'NO_COLOR')
  ? {
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
      grn: (s) => `\x1b[32m${s}\x1b[0m`,
      blu: (s) => `\x1b[34m${s}\x1b[0m`,
      mag: (s) => `\x1b[35m${s}\x1b[0m`,
      red: (s) => `\x1b[31m${s}\x1b[0m`,
      yel: (s) => `\x1b[33m${s}\x1b[0m`,
      cyn: (s) => `\x1b[36m${s}\x1b[0m`,
      gry: (s) => `\x1b[90m${s}\x1b[0m`,
    }
  : new Proxy({}, { get: () => (s) => s });

const TYPE_COLOR = {
  start: C.gry,
  goal: C.grn,
  intent: C.blu,
  observation: C.yel,
  fact: C.yel,
  hypothesis: C.mag,
  question: C.cyn,
  action: C.blu,
  result: C.yel,
  finding: C.red,
  vuln: C.red,
  hint: C.mag,
  summary: C.cyn,
  note: C.gry,
  compact: C.cyn,
};

export const paintType = (type, text) => (TYPE_COLOR[type] || ((s) => s))(text);

export function colorType(n, width = 0) {
  return paintType(n.type, pad(oneLine(TYPE_LABEL[n.type] || n.type), width));
}

const SEVERITY_COLOR = { critical: (s) => C.bold(C.red(s)), high: C.red, medium: C.yel, low: C.blu, info: C.dim };
export const paintSeverity = (severity, text) => (SEVERITY_COLOR[severity] || ((s) => s))(text);
const colorSeverity = (severity) => paintSeverity(severity, oneLine(severity).toUpperCase());

export function shortDetail(s, n = 100) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function nodeLine(n) {
  const st = n.status ? ` ${C.dim('[' + oneLine(n.status) + ']')}` : '';
  const sev = n.severity ? ` ${colorSeverity(n.severity)}` : '';
  const confidence = n.confidence ? ` ${C.dim(oneLine(CONFIDENCE_LABEL[n.confidence] || n.confidence))}` : '';
  const loc = n.loc ? ` ${C.dim(`@${oneLine(n.loc.path)}${n.loc.line ? `:${oneLine(n.loc.line)}` : ''}`)}` : '';
  return `${C.dim(pad(oneLine(n.id), 5))} ${colorType(n, 8)}${st}${sev}${confidence} ${oneLine(n.title)}${loc}`;
}

export function activityLine(a) {
  const at = new Date(a.at || 0).toISOString().replace('T', ' ').slice(0, 19);
  return `${C.dim(a.id)} ${C.cyn(a.tool)} ${a.summary || ''} ${C.dim(at)}`;
}


export function serveBanner({ version, url, cwd, readOnly, elapsedMs }) {
  const arrow = C.grn('➜');
  const mode = readOnly ? C.yel('Read-only') : C.grn('Editable');
  return [
    '',
    `  ${C.bold(C.cyn('Pinwhy'))} ${C.dim(`v${version}`)}  ${C.grn(`ready in ${Math.round(elapsedMs)} ms`)}`,
    '',
    `  ${arrow}  ${C.bold('Local:')}    ${C.bold(C.cyn(url))}`,
    `  ${arrow}  ${C.bold('Project:')}  ${C.dim(cwd)}`,
    `  ${arrow}  ${C.bold('Mode:')}     ${mode}`,
    '',
    C.dim('  Ctrl+C to stop · pinwhy stop'),
    '',
  ].join('\n');
}

const escapes = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]/g;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Keep authored text, but never execute embedded terminal control sequences. */
export function cleanText(value) {
  return String(value ?? '').replace(escapes, '').replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
}

export const oneLine = (value) => cleanText(value).replace(/\s+/g, ' ').trim();

export function displayWidth(value) {
  let width = 0, widest = 0;
  for (const { segment } of graphemes.segment(cleanText(value))) {
    if (segment === '\n') { widest = Math.max(widest, width); width = 0; continue; }
    if (/^[\p{Mark}\p{Cf}]+$/u.test(segment)) continue;
    const cp = segment.codePointAt(0);
    const wide = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3\ufe0f]/u.test(segment)
      || cp >= 0x1100 && (cp <= 0x115f || cp === 0x2329 || cp === 0x232a
        || cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f || cp >= 0xac00 && cp <= 0xd7a3
        || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe10 && cp <= 0xfe19
        || cp >= 0xfe30 && cp <= 0xfe6f || cp >= 0xff00 && cp <= 0xff60
        || cp >= 0xffe0 && cp <= 0xffe6 || cp >= 0x20000 && cp <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return Math.max(widest, width);
}

export const indent = (text, spaces = 2) => String(text).split('\n').map((line) => line ? ' '.repeat(spaces) + line : '').join('\n');
const pad = (text, width) => String(text) + ' '.repeat(Math.max(0, width - displayWidth(text)));
export const field = (label, value, width = 16) => `${pad(oneLine(label), width)}  ${value ?? 'unspecified'}`;

export function panel(title, lines, subtitle = '') {
  return ['', `  ${C.bold(C.cyn('Pinwhy'))} ${C.bold(oneLine(title))}${subtitle ? ` ${C.dim(oneLine(subtitle))}` : ''}`, '',
    indent(lines.join('\n')), ''].join('\n');
}

/** Align by terminal cells; callers choose a narrower layout when necessary. */
export function table(headers, rows) {
  const cells = [headers, ...rows].map((row) => row.map((cell) => String(cell ?? 'unspecified').replace(/\r?\n/g, ' ↵ ')));
  const widths = headers.map(() => 0);
  for (const row of cells) for (let column = 0; column < headers.length; column++) {
    widths[column] = Math.max(widths[column], displayWidth(row[column] || ''));
  }
  return cells.map((row, index) => {
    const line = row.map((cell, column) => column === headers.length - 1 ? cell : pad(cell, widths[column])).join('  ');
    return index === 0 ? C.dim(line) : line;
  });
}

export function formatTime(value) {
  if (value === undefined || value === null || value === '') return 'unspecified';
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? oneLine(value) : date.toISOString();
}
