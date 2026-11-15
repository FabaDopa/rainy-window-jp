// 設定（背景色・時間帯・明るさ・クロードくん）の型、標準の値、優先順位の解決。
// 保存された値は古い版や手で書き換えたものかもしれないので、必ず normalizeChoice を通す。
// 背景色の名前は、型の上では今まで通り `theme` と呼ぶ（保存の形を変えないため）。

import { DEFAULT_CLAWD, normalizeClawd } from './clawd-choice'
import type { ClawdChoice } from './clawd-choice'
import { BANDS, bandOf } from './time'
import type { Band } from './time'

/** 背景色。紺は元の rainy-window の色。なし＝オフ（この mod の見た目を外す）。 */
export type ThemeName = '紺' | '緑' | '桜' | '橙' | '灰' | 'なし'
export type TimeMode = { kind: 'auto' } | { kind: 'fixed'; band: Band }
export type Brightness = 'system' | 'dark' | 'light'
export type Choice = { theme: ThemeName; time: TimeMode; brightness: Brightness; clawd: ClawdChoice }

/** 保存されていた生の値（どの層も、無い・壊れている、がありうる）。 */
export type Layers = { session?: unknown; project?: unknown; global?: unknown }
export type Source = 'session' | 'project' | 'global' | 'default'

export const THEME_NAMES: readonly ThemeName[] = ['紺', '緑', '桜', '橙', '灰', 'なし']
export const BRIGHTNESSES: readonly Brightness[] = ['system', 'dark', 'light']

/** 前の版（テーマの名前）で保存された値の読み替え。 */
const LEGACY: Readonly<Record<string, ThemeName>> = { 雨: '紺', 森: '緑', 墨: '灰', 葡萄: '桜' }

/** 何も保存していないとき：元の rainy-window と同じ「紺（雨）の夜」。 */
export const DEFAULT_CHOICE: Choice = { theme: '紺', time: { kind: 'fixed', band: '夜' }, brightness: 'system', clawd: { ...DEFAULT_CLAWD } }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTime(raw: unknown): TimeMode | undefined {
  if (!isRecord(raw)) return undefined
  if (raw.kind === 'auto') return { kind: 'auto' }
  if (raw.kind === 'fixed' && (BANDS as readonly unknown[]).includes(raw.band)) return { kind: 'fixed', band: raw.band as Band }
  return undefined
}

function normalizeTheme(raw: unknown): ThemeName | undefined {
  if ((THEME_NAMES as readonly unknown[]).includes(raw)) return raw as ThemeName
  if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(LEGACY, raw)) return LEGACY[raw]
  return undefined
}

/** 正しい設定ならその設定（余分な項目は落とす）、そうでなければ undefined。例外は投げない。 */
export function normalizeChoice(raw: unknown): Choice | undefined {
  if (!isRecord(raw)) return undefined
  const theme = normalizeTheme(raw.theme)
  const brightness = raw.brightness
  if (theme === undefined) return undefined
  if (!(BRIGHTNESSES as readonly unknown[]).includes(brightness)) return undefined
  const time = normalizeTime(raw.time)
  if (time === undefined) return undefined
  // clawd は無い・壊れているときも、背景は捨てずに、クロードくんだけ標準に戻す（項目ごと）
  return { theme, time, brightness: brightness as Brightness, clawd: normalizeClawd(raw.clawd) }
}

/** セッション ＞ プロジェクト ＞ 全体 ＞ 標準。壊れた層は無いものとして次へ進む。 */
export function resolveChoice(layers: Layers): { choice: Choice; source: Source } {
  for (const source of ['session', 'project', 'global'] as const) {
    const choice = normalizeChoice(layers[source])
    if (choice !== undefined) return { choice, source }
  }
  return { choice: DEFAULT_CHOICE, source: 'default' }
}

export const SOURCE_LABEL: Record<Source, string> = { session: 'この会話だけ', project: 'このフォルダ', global: 'すべての会話', default: '標準' }

/** 「緑・時間帯で自動」「紺・夜」のような説明。明るさはシステム以外のときだけ添える。オフは「オフ」。 */
export function describeChoice(choice: Choice): string {
  if (choice.theme === 'なし') return 'オフ'
  const time = choice.time.kind === 'auto' ? '時間帯で自動' : choice.time.band
  const brightness = choice.brightness === 'dark' ? '・黒' : choice.brightness === 'light' ? '・白' : ''
  return `${choice.theme}・${time}${brightness}`
}

/** 色に使う時間帯：固定ならその時間帯、自動なら今の日本時間の時間帯。 */
export function effectiveBand(choice: Choice, now: Date): Band {
  return choice.time.kind === 'fixed' ? choice.time.band : bandOf(now)
}
