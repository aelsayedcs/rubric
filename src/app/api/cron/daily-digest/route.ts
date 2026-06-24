import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, escapeHtml } from '@/lib/email'
import { slackDM } from '@/lib/slack'
import { COMPANY_NAME } from '@/lib/config'

// GET /api/cron/daily-digest — runs late each day (vercel.json).
// Emails + Slack-DMs each team lead a summary of their team's evaluations done
// today, and each agent a summary of their own. "Today" is the calendar day in
// the team's timezone (DIGEST_TZ, default UTC — DST-aware). Protected
// by CRON_SECRET when set.
export const maxDuration = 120
const TZ = process.env.DIGEST_TZ || 'UTC'

interface Ev {
  id: string; agent_email: string; team_lead_email: string | null; ticket_number: string; channel: string
  score: number; total_critical_errors: number; coached: boolean; evaluator_email: string | null
  notes: string | null; areas_for_improvement: string | null; customer_email: string | null
}
interface Resp { section: string; label: string; is_critical: boolean; sort_order: number; result: 'pass' | 'fail' | 'na' }

const td = (s: string) => `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155">${s}</td>`
const scoreColor = (s: number) => s >= 85 ? '#16a34a' : s >= 70 ? '#d97706' : '#dc2626'
const RES: Record<string, { icon: string; color: string }> = {
  pass: { icon: '✓', color: '#16a34a' }, fail: { icon: '✗', color: '#dc2626' }, na: { icon: '–', color: '#94a3b8' },
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Today's window in the team's timezone (DST-aware via Intl, no fixed offset).
  const now = new Date()
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const offsetMs = tzNow.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const y = tzNow.getFullYear(), m = tzNow.getMonth(), d = tzNow.getDate()
  const fromIso = new Date(Date.UTC(y, m, d, 0, 0, 0) - offsetMs).toISOString()
  const dateLabel = tzNow.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const svc = createServiceClient()
  const { data, error } = await svc.schema('qa').from('qa_evaluations')
    .select('id, agent_email, team_lead_email, ticket_number, channel, score, total_critical_errors, coached, evaluator_email, notes, areas_for_improvement, customer_email')
    .is('deleted_at', null).gte('created_at', fromIso).order('created_at', { ascending: false }).limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const evals = (data ?? []) as Ev[]

  // Per-criterion responses for every evaluation today (for the agent's full breakdown).
  const respByEval = new Map<string, Resp[]>()
  const ids = evals.map(e => e.id)
  for (let i = 0; i < ids.length; i += 40) {
    const { data: rs } = await svc.schema('qa').from('qa_evaluation_responses')
      .select('evaluation_id, result, qa_criteria!inner(section, label, is_critical, sort_order)')
      .in('evaluation_id', ids.slice(i, i + 40))
    for (const r of (rs ?? []) as unknown as { evaluation_id: string; result: 'pass' | 'fail' | 'na'; qa_criteria: { section: string; label: string; is_critical: boolean; sort_order: number } | null }[]) {
      const c = r.qa_criteria; if (!c) continue
      const arr = respByEval.get(r.evaluation_id) ?? []
      arr.push({ section: c.section, label: c.label, is_critical: c.is_critical, sort_order: c.sort_order, result: r.result })
      respByEval.set(r.evaluation_id, arr)
    }
  }

  const summarize = (rows: Ev[]) => {
    const n = rows.length
    const avg = n ? Math.round(rows.reduce((s, r) => s + Number(r.score), 0) / n) : 0
    const crit = rows.filter(r => r.total_critical_errors > 0).length
    return { n, avg, crit }
  }

  // Test mode: ?test=<email> sends a single sample digest only to that address
  // (verifies the production email+Slack path without messaging the whole team).
  const testTo = req.nextUrl.searchParams.get('test')
  if (testTo) {
    const s = summarize(evals)
    const appUrl0 = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const cards = evals.slice(0, 10).map(e => ticketCard(e, respByEval.get(e.id) ?? [], appUrl0)).join('')
      || `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;color:#64748b;font-size:13px">No evaluations created today — this is a delivery test.</div>`
    const html = detailHtml(`Your QA evaluations — ${dateLabel} (delivery test)`, `Delivery test · <b>${s.n}</b> evaluations today · avg <b>${s.avg}%</b> · ${s.crit} with a critical error.`, cards)
    const text = `*Daily QA digest — delivery test (${dateLabel})*\n${s.n} evaluations today · avg ${s.avg}% · ${s.crit} critical\n_(Production scheduled path test — sent only to you.)_`
    const [em, sl] = await Promise.allSettled([
      sendEmail({ to: testTo, subject: `${COMPANY_NAME} QA — digest delivery test (${dateLabel})`, html }),
      slackDM(testTo, text),
    ])
    return NextResponse.json({ ok: true, test: testTo, evaluations: evals.length,
      email: em.status === 'fulfilled' ? em.value : false, slack: sl.status === 'fulfilled' ? sl.value : false })
  }

  if (evals.length === 0) return NextResponse.json({ ok: true, date: dateLabel, evaluations: 0, sent: 0 })

  // Group for team leads (their team) and agents (their own).
  const byTl = new Map<string, Ev[]>(), byAgent = new Map<string, Ev[]>()
  for (const e of evals) {
    if (e.team_lead_email) { const k = e.team_lead_email.toLowerCase(); (byTl.get(k) ?? byTl.set(k, []).get(k)!).push(e) }
    const a = e.agent_email.toLowerCase(); (byAgent.get(a) ?? byAgent.set(a, []).get(a)!).push(e)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let sent = 0
  const jobs: Promise<unknown>[] = []

  // Team-lead digests
  for (const [tl, rows] of byTl) {
    const s = summarize(rows)
    const table = rows.map(r => `<tr>${td(escapeHtml(r.ticket_number))}${td(escapeHtml(r.agent_email.split('@')[0]))}${td(`<b style="color:${scoreColor(r.score)}">${r.score}%</b>`)}${td(r.total_critical_errors > 0 ? '⚠ critical' : '—')}</tr>`).join('')
    const html = digestHtml(`Daily QA summary — ${dateLabel}`, `Your team had <b>${s.n}</b> evaluation${s.n > 1 ? 's' : ''} today · avg <b>${s.avg}%</b> · ${s.crit} with a critical error.`,
      ['Ticket', 'Agent', 'Score', 'Flag'], table)
    const lines = rows.slice(0, 12).map(r => `• <${appUrl}/results?eval=${r.id}|#${r.ticket_number}> — ${r.agent_email.split('@')[0]} · ${r.score}%${r.total_critical_errors > 0 ? ' ⚠️' : ''}`).join('\n')
    const more = rows.length > 12 ? `\n…and ${rows.length - 12} more` : ''
    const text = `*Daily QA summary — ${dateLabel}*\nYour team: *${s.n}* evaluations · avg *${s.avg}%* · ${s.crit} with a critical error\n\n${lines}${more}\n\n<${appUrl}/analysis|Open Analysis →>`
    jobs.push(sendEmail({ to: tl, subject: `Daily QA summary — ${dateLabel} (${s.n})`, html }))
    jobs.push(slackDM(tl, text))
    sent++
  }

  // Agent digests — full per-ticket scorecard breakdown + dispute button.
  for (const [agent, rows] of byAgent) {
    const s = summarize(rows)
    const cards = rows.map(e => ticketCard(e, respByEval.get(e.id) ?? [], appUrl)).join('')
    const html = detailHtml(`Your QA evaluations — ${dateLabel}`, `You had <b>${s.n}</b> evaluation${s.n > 1 ? 's' : ''} today · avg <b>${s.avg}%</b>${s.crit ? ` · ${s.crit} with a critical error` : ''}.`, cards)
    const lines = rows.slice(0, 12).map(r => `• <${appUrl}/results?eval=${r.id}|#${r.ticket_number}> (${r.channel}) · ${r.score}%${r.total_critical_errors > 0 ? ' ⚠️' : ''}${r.coached ? ' · coached' : ''}`).join('\n')
    const more = rows.length > 12 ? `\n…and ${rows.length - 12} more` : ''
    const text = `*Your QA evaluations — ${dateLabel}*\n*${s.n}* today · avg *${s.avg}%*${s.crit ? ` · ${s.crit} with a critical error` : ''}\n\n${lines}${more}\n\n<${appUrl}/results|View full detail in ${COMPANY_NAME} →>`
    jobs.push(sendEmail({ to: agent, subject: `Your QA evaluations — ${dateLabel} (${s.n})`, html }))
    jobs.push(slackDM(agent, text))
    sent++
  }

  await Promise.allSettled(jobs)
  return NextResponse.json({ ok: true, date: dateLabel, evaluations: evals.length, teamLeads: byTl.size, agents: byAgent.size, recipients: sent })
}

function digestHtml(title: string, intro: string, head: string[], rows: string): string {
  const th = head.map(h => `<th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;border-bottom:2px solid #cbd5e1">${h}</th>`).join('')
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
    <h2 style="color:#0f172a;margin:0 0 4px">${title}</h2>
    <p style="color:#475569;margin:0 0 16px;font-size:13px">${intro}</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">${COMPANY_NAME} Quality · automated daily summary</p>
  </div>`
}

// Wrapper for the detailed (per-ticket card) agent email.
function detailHtml(title: string, intro: string, cards: string): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
    <h2 style="color:#0f172a;margin:0 0 4px">${title}</h2>
    <p style="color:#475569;margin:0 0 16px;font-size:13px">${intro}</p>
    ${cards}
    <p style="color:#94a3b8;font-size:12px;margin-top:8px">${COMPANY_NAME} Quality · automated daily summary</p>
  </div>`
}

// One evaluation rendered as a full scorecard card + a Review & dispute button.
function ticketCard(e: Ev, resps: Resp[], appUrl: string): string {
  const sections = new Map<string, Resp[]>()
  for (const r of [...resps].sort((a, b) => a.sort_order - b.sort_order)) {
    const arr = sections.get(r.section) ?? []; arr.push(r); sections.set(r.section, arr)
  }
  const critTag = `<span style="background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px">Critical</span>`
  const body = [...sections.entries()].map(([sec, items]) => `
    <div style="margin-top:10px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:700;margin-bottom:4px">${escapeHtml(sec)}</div>
      ${items.map(r => `<div style="font-size:13px;color:#334155;padding:3px 0;border-bottom:1px solid #f1f5f9">
        <span style="color:${RES[r.result].color};font-weight:800;display:inline-block;width:14px">${RES[r.result].icon}</span>
        ${escapeHtml(r.label)}${r.is_critical ? critTag : ''}</div>`).join('')}
    </div>`).join('')
  const notes = e.notes ? `<div style="margin-top:10px;font-size:13px;color:#334155"><b style="color:#0ea5e9">Notes:</b> ${escapeHtml(e.notes)}</div>` : ''
  const areas = e.areas_for_improvement ? `<div style="margin-top:6px;font-size:13px;color:#334155"><b style="color:#0ea5e9">Areas for improvement:</b> ${escapeHtml(e.areas_for_improvement)}</div>` : ''
  return `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:14px">
    <div style="font-size:15px;font-weight:800;color:#0f172a">Ticket ${escapeHtml(e.ticket_number)}
      <span style="color:#64748b;font-weight:600;font-size:13px">· ${escapeHtml(e.channel)} · </span>
      <span style="color:${scoreColor(e.score)}">${e.score}%</span>
      ${e.total_critical_errors > 0 ? `<span style="background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;margin-left:6px">CRITICAL</span>` : ''}
    </div>
    <div style="font-size:12px;color:#64748b;margin-top:2px">Agent: ${escapeHtml(e.agent_email)}${e.customer_email ? ` · Customer: ${escapeHtml(e.customer_email)}` : ''}</div>
    ${body}${notes}${areas}
    <a href="${appUrl}/results?eval=${e.id}" style="display:inline-block;margin-top:12px;background:#0ea5e9;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:8px 16px;border-radius:8px">Review &amp; dispute →</a>
  </div>`
}
