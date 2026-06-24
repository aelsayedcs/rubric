// Slack delivery — DM a user by their email. Requires a bot token with scopes
// chat:write and users:read.email, set as SLACK_BOT_TOKEN. Every function is
// fire-and-forget: if the token is missing or a call fails, it returns false
// and never throws into the caller.

const token = () => process.env.SLACK_BOT_TOKEN

async function slackApi(method: string, body: object): Promise<{ ok: boolean; [k: string]: unknown }> {
  const t = token()
  if (!t) return { ok: false, error: 'no_token' }
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export function slackEnabled(): boolean { return !!token() }

// Look up a Slack user id by email (cached per-process for the run).
const idCache = new Map<string, string | null>()
export async function slackUserId(email: string): Promise<string | null> {
  const key = email.toLowerCase()
  if (idCache.has(key)) return idCache.get(key)!
  let id: string | null = null
  const t = token()
  if (t) {
    try {
      const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      const r = await res.json()
      if (r?.ok) id = r.user?.id as string
    } catch { /* ignore */ }
  }
  idCache.set(key, id)
  return id
}

// DM a user by email. text is fallback; blocks (Slack Block Kit) optional.
export async function slackDM(email: string, text: string, blocks?: unknown[]): Promise<boolean> {
  if (!token()) return false
  const uid = await slackUserId(email)
  if (!uid) return false
  const r = await slackApi('chat.postMessage', { channel: uid, text, blocks, unfurl_links: false })
  return !!r.ok
}
