import { useEffect, useState } from 'react';
import { ArrowRight, Copy } from 'lucide-react';
import {
  siClaude,
  siCursor,
  siDeepseek,
  siGithubcopilot,
  siGooglegemini,
  siOpencode,
} from 'simple-icons';
import { BorderBeam } from '@/components/ui/border-beam';
import { useLang, useT } from '../i18n.jsx';
import { Brand, Icon, REPO, useCopyPrompt } from '../shared.jsx';

const OpenAIIcon = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1636a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.401-.686zM20.1774 7.744a4.485 4.485 0 0 1 .5346 3.0137l-.142-.0852-4.783-2.7582a.7712.7712 0 0 0-.7806 0L9.1636 11.2828V8.9504a.0804.0804 0 0 1 .0332-.0615l4.9807-2.8763a4.4992 4.4992 0 0 1 6.0001 1.7313zM10.7401 12.074l2.5-1.4435 2.5 1.4435v2.887l-2.5 1.4435-2.5-1.4435z"/>
  </svg>
);

const AGENTS = [
  { name: 'Claude Code', icon: (p) => <Brand icon={siClaude} {...p} /> },
  { name: 'Cursor', icon: (p) => <Brand icon={siCursor} {...p} /> },
  { name: 'Codex', icon: (p) => <OpenAIIcon {...p} /> },
  { name: 'DeepSeek Harness', icon: (p) => <Brand icon={siDeepseek} {...p} /> },
  { name: 'Gemini CLI', icon: (p) => <Brand icon={siGooglegemini} {...p} /> },
  { name: 'Copilot CLI', icon: (p) => <Brand icon={siGithubcopilot} {...p} /> },
];

const SUPPORTED_HOSTS = [
  { name: 'Claude Code', icon: (p) => <Brand icon={siClaude} {...p} /> },
  { name: 'Cursor', icon: (p) => <Brand icon={siCursor} {...p} /> },
  { name: 'Codex', icon: (p) => <OpenAIIcon {...p} /> },
  { name: 'DeepSeek Harness', icon: (p) => <Brand icon={siDeepseek} {...p} /> },
  { name: 'Gemini CLI', icon: (p) => <Brand icon={siGooglegemini} {...p} /> },
  { name: 'Copilot CLI', icon: (p) => <Brand icon={siGithubcopilot} {...p} /> },
  { name: 'OpenCode', icon: (p) => <Brand icon={siOpencode} {...p} /> },
];

export default function Hero() {
  const { lang } = useLang();
  const t = useT();
  const copyPrompt = useCopyPrompt();
  const [agentIdx, setAgentIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setAgentIdx((i) => (i + 1) % AGENTS.length);
        setFading(false);
      }, 200);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  const activeAgent = AGENTS[agentIdx];

  return (
    <section className="hero pt-16 pb-12 sm:pt-20 sm:pb-16" aria-labelledby="hero-title">
      <div className="hero-paper" aria-hidden="true" />
      <div className="wrap">
        {/* Eyebrow Badge */}
        <div className="mb-6">
          <a
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] text-xs text-[var(--muted)] font-medium hover:border-[var(--line-2)] hover:text-[var(--ink)] transition-colors shadow-xs"
            href={t.hero.eyebrowHref}
            target="_blank"
            rel="noreferrer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-[var(--ink)]">Pinwhy v0.2.0</span>
            <span className="text-[var(--line-2)]">|</span>
            <span>{lang === 'zh' ? "安全审计模式与多宿主接入" : "Security audit mode & multi-host setup"}</span>
            <ArrowRight size={13} className="text-[var(--muted)]" />
          </a>
        </div>

        {/* Multica-style Main Heading with Rotating Agent Pill */}
        <h1
          id="hero-title"
          className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--ink)] leading-[1.12] max-w-5xl"
          style={{ fontFamily: 'var(--sans)' }}
        >
          {lang === 'zh' ? (
            <>
              给{' '}
              <span className="relative inline-flex items-center gap-[0.3em] rounded-full border border-emerald-500/25 bg-emerald-500/10 px-[0.38em] py-[0.04em] text-[var(--ink)] align-middle shadow-xs overflow-hidden">
                <BorderBeam size={70} duration={4.5} colorFrom="#10b981" colorTo="#38bdf8" borderWidth={1.5} />
                <span className="inline-flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                  {activeAgent.icon({ size: 22, className: 'shrink-0' })}
                </span>
                <span
                  className="transition-all duration-200 inline-block font-sans font-bold"
                  style={{
                    opacity: fading ? 0 : 1,
                    transform: fading ? 'translateY(4px)' : 'none',
                  }}
                >
                  {activeAgent.name}
                </span>
              </span>
              留下判断的依据。
            </>
          ) : (
            <>
              Give{' '}
              <span className="relative inline-flex items-center gap-[0.3em] rounded-full border border-emerald-500/25 bg-emerald-500/10 px-[0.38em] py-[0.04em] text-[var(--ink)] align-middle shadow-xs overflow-hidden">
                <BorderBeam size={70} duration={4.5} colorFrom="#10b981" colorTo="#38bdf8" borderWidth={1.5} />
                <span className="inline-flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                  {activeAgent.icon({ size: 22, className: 'shrink-0' })}
                </span>
                <span
                  className="transition-all duration-200 inline-block font-sans font-bold"
                  style={{
                    opacity: fading ? 0 : 1,
                    transform: fading ? 'translateY(4px)' : 'none',
                  }}
                >
                  {activeAgent.name}
                </span>
              </span>
              a record to build on.
            </>
          )}
        </h1>
        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-[var(--muted)] max-w-3xl leading-relaxed">
          {lang === 'zh'
            ? "把关键判断、证据与未决问题留在项目里。上下文压缩或切换会话后，Agent 可以读回已有进展；人在工作台里，也能看清判断从何而来。"
            : "Keep key judgments, evidence, and open questions in your project. Agents can read back progress across sessions, while people can review the evidence behind each judgment."}
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <button
            onClick={copyPrompt}
            className="h-12 px-6 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-medium text-sm inline-flex items-center gap-2.5 shadow-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
          >
            <Copy size={16} />
            <span>{t.hero.cta}</span>
          </button>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="h-12 px-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] font-medium text-sm inline-flex items-center gap-2.5 hover:bg-[var(--surface-2)] transition-all"
          >
            <Icon.github width="16" height="16" />
            <span>{t.hero.gh}</span>
          </a>
        </div>

        {/* Supported Hosts Bar */}
        <div className="mt-12 pt-7 border-t border-[var(--line)] flex flex-wrap items-center gap-2.5 text-xs text-[var(--muted)]">
          <span className="font-semibold text-[var(--ink)] mr-1">
            {lang === 'zh' ? "支持接入：" : "Works with:"}
          </span>
          {SUPPORTED_HOSTS.map((host) => (
            <span
              key={host.name}
              className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text)] font-sans text-xs inline-flex items-center gap-1.5 shadow-2xs hover:border-[var(--line-2)] transition-colors"
            >
              {host.icon({ size: 14, className: 'shrink-0 opacity-80' })}
              <span>{host.name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
