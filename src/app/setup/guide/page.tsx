import Link from 'next/link'

export const metadata = { title: 'Setup guide' }

export default function SetupGuide() {
  return (
    <div className="min-h-screen p-4 py-10" style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(14,165,233,0.12), transparent), #080c14' }}>
      <div className="glass-strong p-8 w-full max-w-2xl mx-auto shadow-glass-lg">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Setup guide</h1>
          <Link href="/setup" className="text-sm text-sky-400 hover:underline">← Back to wizard</Link>
        </div>

        <ol className="space-y-6 text-sm text-slate-300">
          <Step n={1} title="Create a free Supabase project">
            Go to <A href="https://supabase.com">supabase.com</A> → <b>New project</b>. Pick a name, a strong
            database password, and a region close to your team. Wait ~1 minute for it to provision.
          </Step>

          <Step n={2} title="Copy your API keys">
            In the project: <b>Project Settings → API</b>. You need three values:
            <ul className="mt-2 space-y-1.5">
              <li><Code>NEXT_PUBLIC_SUPABASE_URL</Code> — the <i>Project URL</i></li>
              <li><Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code> — the <i>anon</i> public key (browser-safe)</li>
              <li><Code>SUPABASE_SERVICE_ROLE_KEY</Code> — the <i>service_role</i> key (<b>secret</b> — server only, never commit it)</li>
            </ul>
          </Step>

          <Step n={3} title="Add the keys as environment variables">
            <b>Local:</b> copy <Code>.env.example</Code> to <Code>.env.local</Code> and paste the values in.<br />
            <b>Vercel:</b> Project → <b>Settings → Environment Variables</b> → add the same three, then redeploy.
            Anything starting with <Code>NEXT_PUBLIC_</Code> is exposed to the browser; the rest stay server-only.
          </Step>

          <Step n={4} title="Initialize the database">
            Open your Supabase <b>SQL editor</b>, paste the full contents of <Code>supabase/setup.sql</Code> from
            the repo, and click <b>Run</b>. This creates every table and seeds a sample scorecard and team.
            Back in the wizard, click <b>Verify</b>.
          </Step>

          <Step n={5} title="Finish in the wizard">
            Set your branding (company name, login domain, ticket links, timezone) and create your admin
            account. That&apos;s it — you&apos;ll land in a working app.
          </Step>
        </ol>

        <div className="mt-8 pt-5 border-t border-white/10 text-sm text-slate-400">
          Optional later: <Code>EMAIL_SMTP_*</Code> for coaching/digest emails, <Code>SLACK_BOT_TOKEN</Code> for
          Slack DMs, and <Code>CRON_SECRET</Code> to protect the scheduled jobs. See <Code>.env.example</Code> for all options.
        </div>
        <div className="mt-6"><Link href="/setup" className="btn btn-primary">← Continue setup</Link></div>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-sky-500 text-white grid place-items-center text-xs font-bold shrink-0">{n}</div>
      <div><div className="font-semibold text-white mb-1">{title}</div><div className="leading-relaxed">{children}</div></div>
    </li>
  )
}
const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">{children}</a>
const Code = ({ children }: { children: React.ReactNode }) => <code className="text-sky-300 bg-white/5 px-1.5 py-0.5 rounded text-[12px]">{children}</code>
