// クロードくん（部屋の右下にいるキャラクター）の設定：姿・演出・ドット。
// 保存の形、モデル名→姿、effort→段階、そして「いま何を見せるか」(viewOf) を決める純粋な関数だけ。
// 保存された値は古い版や手で書き換えたものかもしれないので、必ず normalizeClawd を通す。

import type { ClawdView } from '../clawd/layer'
import type { Level, Look, Phase } from '../clawd/scripts'

export type ClawdLook = 'auto' | Look
export type ClawdEffect = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Dots = 'normal' | 'fine'
export type ClawdChoice = { look: ClawdLook; effect: ClawdEffect; dots: Dots }

export const CLAWD_LOOKS: readonly ClawdLook[] = ['auto', 'sonnet', 'haiku', 'opus', 'fable']
export const CLAWD_EFFECTS: readonly ClawdEffect[] = ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
export const DOTS: readonly Dots[] = ['normal', 'fine']

/** 何も保存していないとき：姿も演出も自動、ドットはふつう。 */
export const DEFAULT_CLAWD: Readonly<ClawdChoice> = Object.freeze({ look: 'auto', effect: 'auto', dots: 'normal' })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pick<T extends string>(list: readonly T[], raw: unknown, fallback: T): T {
  return (list as readonly unknown[]).includes(raw) ? (raw as T) : fallback
}

/** 項目ごとに、正しくなければ標準。余分な項目は落とす。例外は投げない。 */
export function normalizeClawd(raw: unknown): ClawdChoice {
  if (!isRecord(raw)) return { ...DEFAULT_CLAWD }
  return {
    look: pick(CLAWD_LOOKS, raw.look, DEFAULT_CLAWD.look),
    // 前の版の「なし」（none）は low として読む（演出なし・打つ速さはふつうで、見た目は同じ）
    effect: pick(CLAWD_EFFECTS, raw.effect === 'none' ? 'low' : raw.effect, DEFAULT_CLAWD.effect),
    dots: pick(DOTS, raw.dots, DEFAULT_CLAWD.dots),
  }
}

const MODEL_LOOKS: readonly Look[] = ['haiku', 'sonnet', 'opus', 'fable']

/** モデル名に haiku・sonnet・opus・fable を含むか（大文字小文字は区別しない）。どれでもなければ sonnet。 */
export function lookOfModel(model: string | undefined): Look {
  if (typeof model !== 'string') return 'sonnet'
  const name = model.toLowerCase()
  return MODEL_LOOKS.find(look => name.includes(look)) ?? 'sonnet'
}

const EFFORT_LEVELS: Readonly<Record<string, Level>> = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 }

/** effort の文字（low medium high xhigh max）を段階 0〜4 に。数字・auto・そのほかは undefined。 */
export function levelOfEffort(effort: unknown): Level | undefined {
  if (typeof effort !== 'string' || !Object.prototype.hasOwnProperty.call(EFFORT_LEVELS, effort)) return undefined
  return EFFORT_LEVELS[effort]
}

const FIXED_EFFECT: Readonly<Record<'medium' | 'high' | 'xhigh' | 'max', Level>> = { medium: 1, high: 2, xhigh: 3, max: 4 }
const ACTIVE_PHASES: readonly Phase[] = ['alert', 'think', 'tool', 'write', 'done']

export type ViewInput = {
  choice: ClawdChoice
  model?: string
  effort?: unknown
  phase: Phase
  subagents: number
  arrive?: number[]
  leave?: number[]
  cardOpen: boolean
}

/** 設定と、いまの様子（モデル・effort・状態・子の数）から、層に渡す見せ方を決める。 */
export function viewOf(i: ViewInput): ClawdView {
  const { choice } = i
  const look: Look = choice.look === 'auto' ? lookOfModel(i.model) : choice.look
  let effect: Level
  let tempo: Level
  if (choice.effect === 'low') {
    // low は演出なし。打つ速さはふつう（low は速さを表すものではない）
    effect = 0
    tempo = 1
  } else if (choice.effect === 'auto') {
    const level = levelOfEffort(i.effort)
    effect = level ?? 0
    tempo = level ?? 1
  } else {
    effect = tempo = FIXED_EFFECT[choice.effect]
  }
  return {
    look,
    phase: i.phase,
    effect,
    tempo,
    showEffect: i.cardOpen || ACTIVE_PHASES.includes(i.phase),
    dots: choice.dots,
    subagents: i.subagents,
    arrive: i.arrive ?? [],
    leave: i.leave ?? [],
  }
}

const labelOfLook = (v: ClawdLook) => (v === 'auto' ? '自動' : v)
const labelOfEffect = (v: ClawdEffect) => (v === 'auto' ? '自動' : v)
const labelOfDots = (v: Dots) => (v === 'fine' ? '細かい' : 'ふつう')

/** 「姿 自動・演出 max・ドット ふつう」のような説明。 */
export function describeClawd(c: ClawdChoice): string {
  return `姿 ${labelOfLook(c.look)}・演出 ${labelOfEffect(c.effect)}・ドット ${labelOfDots(c.dots)}`
}

/** 指定した項目だけの説明（「演出 max」など）。/rj の返事で、いま保存した項目を伝えるのに使う。 */
export function describeClawdPatch(patch: Partial<ClawdChoice>): string {
  const parts: string[] = []
  if (patch.look !== undefined) parts.push(`姿 ${labelOfLook(patch.look)}`)
  if (patch.effect !== undefined) parts.push(`演出 ${labelOfEffect(patch.effect)}`)
  if (patch.dots !== undefined) parts.push(`ドット ${labelOfDots(patch.dots)}`)
  return parts.join('・')
}
