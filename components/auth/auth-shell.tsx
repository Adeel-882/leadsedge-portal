import { CheckCircle, LockKey } from '@phosphor-icons/react/dist/ssr';
import { ThemeToggle } from '@/components/theme-toggle';
import { Brand } from '@/components/brand';

export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <main className="grid min-h-[100dvh] bg-surface lg:grid-cols-[minmax(0,1fr)_420px]">
    <section className="flex items-center justify-center px-5 py-10 sm:px-8"><div className="w-full max-w-md"><div className="flex items-center justify-between"><Brand /><ThemeToggle /></div><div className="mt-12"><p className="page-eyebrow">{eyebrow}</p><h1 className="text-3xl font-bold tracking-[-.04em] sm:text-[38px] sm:leading-[1.08]">{title}</h1><p className="mt-3 max-w-[48ch] text-sm leading-6 text-muted">{description}</p></div>{children}</div></section>
    <aside className="hidden border-l border-line bg-surface-subtle p-9 lg:flex lg:flex-col lg:justify-between"><div><span className="grid h-11 w-11 place-items-center rounded-[10px] bg-brand-soft text-brand-text"><LockKey size={22} weight="fill" aria-hidden /></span><h2 className="mt-7 text-2xl font-bold tracking-[-.03em]">Secure client delivery without passwords.</h2><p className="mt-3 text-sm leading-6 text-muted">Leadsedge keeps project work, lead conversations, feedback, and meetings inside one role-protected workspace.</p></div><ul className="space-y-3 text-sm text-muted-strong"><li className="flex items-center gap-2"><CheckCircle size={16} weight="fill" className="text-brand-text" aria-hidden />Short-lived sign-in links</li><li className="flex items-center gap-2"><CheckCircle size={16} weight="fill" className="text-brand-text" aria-hidden />Administrator and client roles</li><li className="flex items-center gap-2"><CheckCircle size={16} weight="fill" className="text-brand-text" aria-hidden />One-time invitation verification</li></ul></aside>
  </main>;
}
