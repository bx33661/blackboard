import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../storage/layout.js';
import { replay } from '../storage/event-log.js';
import { OUTPUTS } from '../contracts.js';
import { renderFileResult } from './results.js';

/** Export and archive commands own file destinations without changing board records. */
export function createFileCommands({ cwd, needInitRead, readSource, refOrFail, fail, out }, { version: VERSION }) {
  async function cmdExport(args, flags) {
    needInitRead();
    const { renderExport } = await import('../export.js');
    const format = flags.format || 'html';
    const extension = { html: 'html', markdown: 'md', mermaid: 'mmd', sarif: 'sarif' }[format];
    if (!extension) fail('--format must be html|markdown|mermaid|sarif');
    const abs = path.resolve(cwd(), flags.out || `pinwhy.${extension}`);
    const board = paths(cwd());
    let actual = abs, target;
    try { actual = fs.realpathSync(abs); target = fs.statSync(abs); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if ([abs, actual].some((file) => file.split(path.sep).includes(path.basename(board.root)))) fail('Export files cannot be written to the board data directory');
    if (target) {
      for (const file of [board.events, board.state, board.config, board.digest]) {
        if (!fs.existsSync(file)) continue;
        const source = fs.statSync(file);
        if (target.dev === source.dev && target.ino === source.ino) fail('Export files cannot overwrite board data or aliases of its files');
      }
    }
    const source = readSource(flags);
    const relatedTo = flags['related-to'] ? refOrFail(replay(cwd(), source).nodes, flags['related-to']) : undefined;
    const content = renderExport({
      cwd: cwd(), source: flags['as-of'] === undefined ? undefined : source, format, version: VERSION, query: args.join(' '),
      type: flags.type, status: flags.status, severity: flags.sev, confidence: flags.confidence,
      tags: flags.tag, relation: flags.rel, relatedTo, sort: flags.sort, groupBy: flags['group-by'],
      maxNodes: flags['max-nodes'] === undefined ? undefined : Number(flags['max-nodes']),
    });
    fs.writeFileSync(abs, content);
    if (flags.json) return out(flags, { file: abs, format }, OUTPUTS.export);
    console.log(renderFileResult('export', { file: abs, format, cwd: cwd(),
      ...(source.asOf ? { asOf: source.asOf.id } : {}),
      ...(format !== 'html' && args.length ? { query: args.join(' ') } : {}),
    }));
  }
  async function cmdBackup(args, flags) {
    needInitRead();
    const { backupBoard } = await import('../backup.js');
    const result = backupBoard(cwd(), path.resolve(cwd(), flags.out));
    if (flags.json) return out(flags, result, OUTPUTS.backup);
    console.log(renderFileResult('backup', result));
  }

  async function cmdRestore(args, flags) {
    const { restoreBoard } = await import('../backup.js');
    const result = restoreBoard(path.resolve(process.cwd(), args[0]), path.resolve(process.cwd(), flags.into));
    if (flags.json) return out(flags, result, OUTPUTS.restore);
    console.log(renderFileResult('restore', result));
  }
  return { cmdExport, cmdBackup, cmdRestore };
}
