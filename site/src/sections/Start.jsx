import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n.jsx';
import { CodeXml, Package, Sparkles, SquareTerminal } from 'lucide-react';
import { siClaude, siDeepseek } from 'simple-icons';
import { Brand, Icon, REPO, reducedMotion, useInViewport } from '../shared.jsx';

const TAB_ICON = {
  auto: <Sparkles size={14} strokeWidth={1.9} aria-hidden="true" />,
  claude: <Brand icon={siClaude} size={13} aria-hidden="true" />,
  codex: <CodeXml size={14} strokeWidth={1.9} aria-hidden="true" />,
  dsh: <Brand icon={siDeepseek} size={14} aria-hidden="true" />,
  skill: <Package size={14} strokeWidth={1.9} aria-hidden="true" />,
  cli: <SquareTerminal size={14} strokeWidth={1.9} aria-hidden="true" />,
};

/** Splits a shell line into coloured tokens: command, flags, strings, variables, placeholders. */
function Shell({ text }) {
  const parts = text.match(/"[^"]*"?|<[^>]*>?|\S+|\s+/g) || [];
  let seen = false;
  return parts.map((p, i) => {
    if (/^\s+$/.test(p)) return p;
    let c = 'tk-arg';
    if (!seen) { c = 'tk-cmd'; seen = true; }
    else if (p.startsWith('"')) c = 'tk-str';
    else if (p.startsWith('<')) c = 'tk-ph';
    else if (p.startsWith('-')) c = 'tk-flag';
    else if (p.includes('$')) c = 'tk-var';
    return <span key={i} className={c}>{p}</span>;
  });
}

/** The script a tab plays: the prompt for the agent, or a three-step install session. */
function script(S, tab) {
  if (tab === 'auto') {
    return [
      { kind: 'prompt', text: S.prompt },
      { kind: 'note', text: S.start.auto.will },
      ...S.start.auto.steps.map((text) => ({ kind: 'check', text })),
      { kind: 'reply', label: S.start.reply[0], text: S.start.reply[1], url: S.start.reply[2] },
    ];
  }
  const M = S.start.manual;
  const host = M.hosts.find((h) => h.id === tab);
  return [M.install, host, M.verify].flatMap((step, i) => [
    { kind: 'step', n: i + 1, title: step.t, desc: step.d, tag: i === 1 ? host.tag : null },
    ...step.cmds.map((text) => ({ kind: 'cmd', text })),
  ]);
}

/** Reveals items one by one; commands and the prompt are typed character by character. */
function usePlayback(items, run) {
  const [state, setState] = useState({ i: 0, chars: 0 });
  useEffect(() => {
    if (!run) return undefined;
    if (reducedMotion()) { setState({ i: items.length, chars: 0 }); return undefined; }
    let i = 0; let chars = 0; let timer;
    setState({ i: 0, chars: 0 });
    const tick = () => {
      if (i >= items.length) return;
      const it = items[i];
      const typed = it.kind === 'cmd' || it.kind === 'prompt';
      if (typed && chars < it.text.length) {
        const step = it.kind === 'prompt' ? 2 : 1;
        chars = Math.min(it.text.length, chars + step);
        setState({ i, chars });
        timer = setTimeout(tick, it.kind === 'prompt' ? 22 : Math.max(8, Math.min(26, 640 / it.text.length)));
        return;
      }
      i += 1; chars = 0;
      setState({ i, chars });
      const pause = { prompt: 380, note: 260, check: 300, step: 220, cmd: 110, reply: 0 }[it.kind];
      timer = setTimeout(tick, pause);
    };
    timer = setTimeout(tick, 250);
    return () => clearTimeout(timer);
  }, [items, run]);
  return state;
}

export default function Start() {
  const { t, lang } = useLang();
  const S = t.start;
  const tabs = [['auto', S.tabAuto], ...S.manual.hosts.map((h) => [h.id, h.name])];
  const [tab, setTab] = useState('auto');
  const win = useRef(null);
  const visible = useInViewport(win, '-15% 0px');
  const [started, setStarted] = useState(false);
  if (visible && !started) setStarted(true);

  const items = useMemo(() => script(t, tab), [t, tab]);
  const { i: shown, chars } = usePlayback(items, started);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef();

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setFlash(key);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1400);
  };
  const all = tab === 'auto' ? t.prompt : items.filter((x) => x.kind === 'cmd').map((x) => x.text).join('\n');
  const body = useRef(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [tab, lang]);
  // Follow the newest line like a real terminal, without moving the page.
  useEffect(() => {
    const el = body.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [shown]);

  return (
    <section id="start" className="section start" aria-labelledby="start-title">
      <div className="wrap">
        <div className="head center rv">
          <div className="kicker">{S.kicker}</div>
          <h2 className="h2" id="start-title">{S.title}</h2>
          <p className="lead">{S.lead}</p>
        </div>

        <div className="tw-stage rv">
          <div className="tw-glow" aria-hidden="true" />
          <div className="tw" ref={win}>
            <div className="tw-bar">
              <span className="tw-lights" aria-hidden="true"><i /><i /><i /></span>
              <div className="tw-tabs" role="tablist" aria-label={S.manual.hostsAria}>
                {tabs.map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={tab === id} className={`${tab === id ? 'on' : ''}${id === 'auto' ? ' star' : ''}`} onClick={() => setTab(id)}>
                    <span className="ti">{TAB_ICON[id]}</span>{label}
                  </button>
                ))}
              </div>
              <button className={`tw-copy${flash === 'all' ? ' done' : ''}`} onClick={() => copy(all, 'all')}>
                {flash === 'all' ? <Icon.check size={14} /> : <Icon.copy size={14} />}
                <span>{flash === 'all' ? S.copied : tab === 'auto' ? S.copyPrompt : S.copyCmds}</span>
              </button>
            </div>

            <div className="tw-body" ref={body} key={`${tab}-${lang}`}>
              {items.slice(0, Math.min(items.length, shown + 1)).map((it, k) => {
                const live = k === shown;
                const text = (it.kind === 'cmd' || it.kind === 'prompt') && live ? it.text.slice(0, chars) : it.text;
                if (it.kind === 'prompt') {
                  return (
                    <div key={k} className="tw-prompt">
                      <span className="tw-caret-mark" aria-hidden="true">›</span>
                      <p>{text}{live && <span className="tw-cursor" />}</p>
                    </div>
                  );
                }
                if (it.kind === 'note') return <p key={k} className="tw-note"><span className="tw-dot" />{it.text}</p>;
                if (it.kind === 'reply') {
                  return (
                    <div key={k} className="tw-reply">
                      <span className="tw-reply-mark" aria-hidden="true">⏺</span>
                      <div><p>{it.text}<em>{it.label}</em></p><a>{it.url}</a></div>
                    </div>
                  );
                }
                if (it.kind === 'check') return <p key={k} className="tw-check"><span className="ok"><Icon.check size={12} /></span>{it.text}</p>;
                if (it.kind === 'step') {
                  return (
                    <div key={k} className="tw-step">
                      <span className="tw-step-n">{String(it.n).padStart(2, '0')}</span>
                      <div>
                        <b>{it.title}{it.tag && <em>{it.tag}</em>}</b>
                        <span>{it.desc}</span>
                      </div>
                    </div>
                  );
                }
                const key = `l${k}`;
                return (
                  <button key={k} className={`tw-cmd${flash === key ? ' done' : ''}`} onClick={() => copy(it.text, key)} title={S.hint}>
                    <span className="ps" aria-hidden="true">$</span>
                    <code><Shell text={text} />{live && <span className="tw-cursor" />}</code>
                    <span className="tw-cmd-copy" aria-hidden="true">{flash === key ? <><Icon.check size={13} />{S.copied}</> : <Icon.copy size={13} />}</span>
                  </button>
                );
              })}
              {shown >= items.length && tab !== 'auto' && (
                <div className="tw-idle"><span className="ps">$</span><span className="tw-cursor blink" /></div>
              )}
            </div>

            <div className="tw-status">
              <span><i className="tw-led" />{S.cwd}</span>
              <span className="tw-env">{S.env}</span>
            </div>
          </div>
        </div>

        <p className="tw-foot rv">
          {S.auto.note}
          <a href={`${REPO}/blob/main/skills/pinwhy/references/setup.md`} target="_blank" rel="noreferrer">{S.manual.guide}<Icon.arrow /></a>
        </p>
      </div>
    </section>
  );
}
