#!/usr/bin/env node
// Builds the synthetic demo boards shown on the site and exports each as the real offline workspace.
//   node site/scripts/make-demo.mjs
// Writes site/public/demo/board-zh.html and board-en.html. Everything goes through the public CLI;
// the content is synthetic and mirrors the repository's own demo (scripts/demo.js) in two languages.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CLI = path.join(REPO, 'bin', 'pinwhy.js');
const OUT = path.join(REPO, 'site', 'public', 'demo');

const TEXT = {
  zh: {
    title: '内部 API 审计 · 演示',
    start: '审计入口：内部管理后台',
    goalAuth: '确认管理 API 的匿名访问边界',
    goalTenant: '确认导出链路的租户隔离',
    intent: '枚举前端 bundle 中的 API 路由',
    obsBundle: ['bundle 含 47 个 /api/v2/* 路径', '静态提取共得到 47 条唯一路由'],
    hyAuth: '管理读接口可能遗漏统一鉴权',
    hyReason: '路由枚举后形成新猜测',
    obsUsers: ['GET /api/v2/admin/users 无 Cookie 返回 200', '响应包含 total=12043 和用户角色'],
    obsWrite: ['写接口在匿名请求下返回 403', 'POST reset-password → 403'],
    fdAuth: '管理读接口匿名暴露全量用户列表',
    qMiddleware: '读写路由是否挂载了不同的鉴权中间件',
    hint: '优先比较 router.get 与 router.post 的中间件参数',
    tenantReason: '切换到租户隔离分支',
    action: '使用低权限账号修改 export 请求中的 tenantId',
    obsExport: '服务端接受任意 tenantId 并返回其他租户订单',
    fdExport: '导出接口存在跨租户数据越权',
    hyFiles: '异步导出文件可能存在可枚举下载路径',
    obsJob: 'jobId 为递增整数，/exports/<jobId>.csv 无鉴权',
    fdFiles: '导出文件下载无鉴权且可枚举',
    qUpload: '上传内容能否与导出链路形成组合利用',
    obsSvg: '上传接口接受同源可访问的脚本 SVG',
    counter: '利用仍需要管理员访问，当前没有触发路径',
    cursorReason: '保留组合利用问题，等待后续条件',
    cp1: '已确认三个发现；当前停在上传与导出链路的组合利用问题。',
    hyCsrf: '管理写接口的 CSRF 防护可能不一致',
    obsCsrf: 'POST /api/v2/admin/roles 未校验 CSRF token',
    cp2: '研究分支：写接口 CSRF 防护待复现，主线保持在组合利用问题。',
  },
  en: {
    title: 'Internal API audit · demo',
    start: 'Entry point: internal admin console',
    goalAuth: 'Map the anonymous access boundary of the admin API',
    goalTenant: 'Verify tenant isolation in the export pipeline',
    intent: 'Enumerate API routes in the frontend bundle',
    obsBundle: ['Bundle contains 47 /api/v2/* paths', 'Static extraction found 47 unique routes'],
    hyAuth: 'Admin read endpoints may skip shared auth',
    hyReason: 'New hypothesis after route enumeration',
    obsUsers: ['GET /api/v2/admin/users returns 200 without a cookie', 'Response includes total=12043 and user roles'],
    obsWrite: ['Write endpoints return 403 to anonymous requests', 'POST reset-password → 403'],
    fdAuth: 'Admin read API exposes the full user list anonymously',
    qMiddleware: 'Do read and write routes mount different auth middleware?',
    hint: 'Compare middleware arguments of router.get and router.post first',
    tenantReason: 'Switch to the tenant isolation branch',
    action: 'Change tenantId in the export request as a low-privilege user',
    obsExport: 'Server accepts any tenantId and returns other tenants’ orders',
    fdExport: 'Export API allows cross-tenant data access',
    hyFiles: 'Async export files may have enumerable download paths',
    obsJob: 'jobId is sequential and /exports/<jobId>.csv has no auth',
    fdFiles: 'Export downloads are unauthenticated and enumerable',
    qUpload: 'Can uploads be chained with the export pipeline?',
    obsSvg: 'Upload endpoint accepts same-origin scriptable SVG',
    counter: 'Exploitation still needs admin access; no trigger path yet',
    cursorReason: 'Park the chaining question until conditions change',
    cp1: 'Three findings confirmed; paused on chaining uploads with exports.',
    hyCsrf: 'CSRF protection on admin writes may be inconsistent',
    obsCsrf: 'POST /api/v2/admin/roles does not check the CSRF token',
    cp2: 'Research branch: write-endpoint CSRF awaits reproduction; main line stays on chaining.',
  },
};

function build(lang) {
  const T = TEXT[lang];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pinwhy-site-demo-${lang}-`));
  const bb = (...args) => execFileSync(process.execPath, [CLI, ...args, '--cwd', dir], {
    cwd: dir, env: { ...process.env, PINWHY_CWD: dir, PINWHY_QUIET: '1' }, encoding: 'utf8',
  }).trim();
  const add = (kind, title, ...args) => JSON.parse(bb('node', 'add', kind, title, ...args, '--json')).node.id;
  const link = (a, b, rel) => bb('link', a, b, '--rel', rel);

  bb('init', '--here', '--title', T.title);
  const start = add('start', T.start, '--enter');
  const goalAuth = add('goal', T.goalAuth);
  const goalTenant = add('goal', T.goalTenant);
  link(start, goalAuth, 'related-to');
  link(start, goalTenant, 'related-to');

  const intent = add('intent', T.intent, '--status', 'done');
  const obsBundle = add('observation', T.obsBundle[0], '-d', T.obsBundle[1]);
  link(goalAuth, intent, 'derived-from');
  link(intent, obsBundle, 'supports');

  const hyAuth = add('hypothesis', T.hyAuth, '--enter', '--reason', T.hyReason);
  link(obsBundle, hyAuth, 'supports');
  const obsUsers = add('observation', T.obsUsers[0], '-d', T.obsUsers[1], '--at', 'evidence/admin-users.http:12');
  const obsWrite = add('observation', T.obsWrite[0], '-d', T.obsWrite[1]);
  link(obsUsers, hyAuth, 'supports');
  link(obsWrite, hyAuth, 'supports');
  const fdAuth = add('finding', T.fdAuth, '--sev', 'critical', '--status', 'confirmed');
  link(obsUsers, fdAuth, 'proves');
  link(hyAuth, fdAuth, 'refines');

  const qMiddleware = add('question', T.qMiddleware);
  link(hyAuth, qMiddleware, 'derived-from');
  const hint = add('hint', T.hint);
  link(qMiddleware, hint, 'related-to');

  bb('cursor', goalTenant, '--reason', T.tenantReason);
  const action = add('action', T.action, '--enter');
  link(goalTenant, action, 'derived-from');
  const obsExport = add('observation', T.obsExport);
  link(action, obsExport, 'derived-from');
  const fdExport = add('finding', T.fdExport, '--sev', 'high', '--status', 'confirmed');
  link(obsExport, fdExport, 'proves');

  const hyFiles = add('hypothesis', T.hyFiles);
  link(obsExport, hyFiles, 'derived-from');
  const obsJob = add('observation', T.obsJob);
  link(obsJob, hyFiles, 'supports');
  const fdFiles = add('finding', T.fdFiles, '--sev', 'high', '--status', 'confirmed');
  link(obsJob, fdFiles, 'proves');

  const qUpload = add('question', T.qUpload, '--status', 'deferred');
  link(fdExport, qUpload, 'related-to');
  link(fdFiles, qUpload, 'related-to');
  const obsSvg = add('observation', T.obsSvg);
  link(obsSvg, qUpload, 'supports');
  const counter = add('observation', T.counter);
  link(counter, qUpload, 'contradicts');

  bb('cursor', qUpload, '--reason', T.cursorReason);
  bb('checkpoint', '--summary', T.cp1);

  // Edits give the records a history; a second Agent explores a side branch with its own cursor.
  bb('edit', fdAuth, '--confidence', 'suspected');
  bb('edit', fdAuth, '--confidence', 'reproduced');
  bb('edit', hyAuth, '--status', 'confirmed');
  bb('edit', fdFiles, '--confidence', 'static-confirmed');
  const R = ['--agent', 'agent:research'];
  const hyCsrf = add('hypothesis', T.hyCsrf, ...R, '--parent', goalAuth, '--rel', 'related-to', '--enter');
  add('observation', T.obsCsrf, ...R, '--to', hyCsrf, '--rel', 'supports', '--tag', 'csrf');
  bb('checkpoint', '--summary', T.cp2, ...R);

  const out = path.join(OUT, `board-${lang}.html`);
  bb('export', '--out', out);
  const html = fs.readFileSync(out, 'utf8');
  if (html.includes(os.homedir()) || html.includes(dir)) throw new Error(`${out} contains a local path`);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`exported ${path.relative(REPO, out)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
}

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(path.join(OUT, 'board.html'), { force: true });
build('zh');
build('en');
