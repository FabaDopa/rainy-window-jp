// クロードくんの状態の機械（純粋）。出来事と時刻（ミリ秒の数）から、どの状態を見せるかを決める。
// 状態が短い間にちらつかないよう、最低の見せる時間を守る。Date もタイマーも使わない。
import type { Phase } from '../clawd/scripts'

export type ClawdEvent = 'submit' | 'think' | 'tool' | 'text' | 'complete' | 'abort' | 'tick'
// pending は「まだ移れないので覚えている、次の状態」
export type Machine = { phase: Phase; since: number; pending?: Phase }

export const ALERT_MS = 900 // ！を見せる長さ
export const HOLD_MS = 1500 // think・tool・write の最低の長さ
export const DONE_MS = 1500 // やった、の長さ
export const WAVE_MS = 3000 // 手をふる、の長さ

type Result = { machine: Machine; wakeAt?: number }

export function startMachine(now: number): Machine {
  return { phase: 'wait', since: now }
}

// 出来事が指す次の状態（それ以外は null）
const TARGET: Partial<Record<ClawdEvent, Phase>> = { think: 'think', tool: 'tool', text: 'write', complete: 'done' }

// この状態にいる長さ（時間で自動的に移る状態だけ）
function span(phase: Phase): number | undefined {
  if (phase === 'alert') return ALERT_MS
  if (phase === 'done') return DONE_MS
  if (phase === 'wave') return WAVE_MS
  return undefined
}

// 状態に入る。時間で出ていく状態なら、次の tick の時刻も返す。
function enter(phase: Phase, now: number): Result {
  const ms = span(phase)
  return { machine: { phase, since: now }, wakeAt: ms === undefined ? undefined : now + ms }
}

// 今の状態のまま、次の tick の時刻だけを返す（早すぎる tick・覚えただけの出来事）
function waiting(m: Machine): Result {
  const ms = span(m.phase) ?? (m.pending ? HOLD_MS : undefined)
  return { machine: m, wakeAt: ms === undefined ? undefined : m.since + ms }
}

export function advance(m: Machine, ev: ClawdEvent, now: number): Result {
  if (ev === 'submit') return enter('alert', now)
  if (ev === 'abort') return { machine: { phase: 'wait', since: now } }

  if (ev === 'tick') {
    if (span(m.phase) !== undefined || m.pending) {
      const due = m.since + (span(m.phase) ?? HOLD_MS)
      if (now < due) return waiting(m)
    }
    if (m.phase === 'alert') return enter(m.pending ?? 'think', now)
    if (m.phase === 'done') return enter('wave', now)
    if (m.phase === 'wave') return enter('wait', now)
    if (m.pending) return enter(m.pending, now)
    return { machine: m }
  }

  const to = TARGET[ev]
  if (!to || m.phase === 'wait' || m.phase === 'done' || m.phase === 'wave') return waiting(m)

  // やったを覚えている（最低の長さを待っている）間の think・tool・text は無視する。後のかけらで
  // やったを消すと、次のメッセージまで働く姿（と演出）のまま止まってしまう
  if (m.pending === 'done' && to !== 'done') return waiting(m)

  // ！の間は覚えておくだけ（後のものが勝つ）
  if (m.phase === 'alert') return waiting({ ...m, pending: to })

  // think・tool・write：1.5 秒たっていればすぐ移る
  if (to === m.phase) return waiting({ phase: m.phase, since: m.since })
  if (now - m.since >= HOLD_MS) return enter(to, now)
  return waiting({ ...m, pending: to })
}
