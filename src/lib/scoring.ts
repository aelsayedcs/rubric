// ─────────────────────────────────────────────────────────────
// scoring.ts — the single source of truth for QA scoring.
// Ported from Apps Script (Code.js / Emails.js). Pure & deterministic
// so the API and the ETL reconciliation produce identical results.
//
//   • Start at 100.
//   • Each NON-critical criterion marked 'fail' deducts its weight.
//   • 'pass' and 'na' deduct nothing.
//   • If ANY critical criterion is 'fail', the final score is 0.
// ─────────────────────────────────────────────────────────────

export type Result = 'pass' | 'fail' | 'na'

export interface Criterion {
  id: string
  weight: number
  is_critical: boolean
}

export interface ResponseInput {
  criterion_id: string
  result: Result
}

export interface ScoreResult {
  score: number              // 0–100
  total_errors: number       // count of all 'fail'
  total_critical_errors: number
  critical_fail: boolean
}

export function computeScore(
  responses: ResponseInput[],
  criteria: Criterion[],
): ScoreResult {
  const byId = new Map(criteria.map(c => [c.id, c]))

  let score = 100
  let totalErrors = 0
  let criticalErrors = 0

  for (const r of responses) {
    if (r.result !== 'fail') continue
    const c = byId.get(r.criterion_id)
    if (!c) continue
    totalErrors++
    if (c.is_critical) {
      criticalErrors++
    } else {
      score -= c.weight
    }
  }

  const criticalFail = criticalErrors > 0
  if (criticalFail) score = 0
  if (score < 0) score = 0

  return {
    score,
    total_errors: totalErrors,
    total_critical_errors: criticalErrors,
    critical_fail: criticalFail,
  }
}
