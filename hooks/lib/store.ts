// $.store のキーの決まりと、保存の前後の純粋な計算。
// $ を使う読み書きそのものは register.tsx にある（mod の決まりで、$ は同じファイルの関数にしか渡せない）。
//   global            … 全体の設定
//   project:<フォルダ> … このプロジェクトの設定（git のワークツリーは元のフォルダと同じ）
//   session:<id>      … このセッションだけの設定（古いものから消して SESSIONS_KEPT 件まで）

import { DEFAULT_CHOICE, normalizeChoice } from './choice'
import { normalizeClawd } from './clawd-choice'
import type { ClawdChoice } from './clawd-choice'
import type { Brightness, Choice, ThemeName, TimeMode } from './choice'
import type { Scope } from './command'

export const GLOBAL_KEY = 'global'
export const PROJECT_PREFIX = 'project:'
export const SESSION_PREFIX = 'session:'
export const SESSIONS_KEPT = 200

/**
 * パスを1つの書き方にそろえる：区切りは /、ドライブ名は大文字、末尾の区切りは落とす（C:/ や / のような根はそのまま）。
 * Windows では、git は C:/x と、セッションは C:\x や c:\x と答えることがあるため。
 */
function trimPath(path: string): string {
  let out = path.replace(/\\/g, '/').replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`)
  while (out.length > 1 && out.endsWith('/') && !/^[A-Z]:\/$/.test(out)) out = out.slice(0, -1)
  return out
}

/**
 * プロジェクトのキー。リポジトリの根そのもの、またはリンクされたワークツリー（根の .git がファイル）なら
 * リポジトリの根（ワークツリーでは元のフォルダ）を使う。それ以外は、セッションのフォルダそのもの。
 */
export function projectKeyOf(root: string, repoRoot: string | null, rootIsLinkedWorktree: boolean): string {
  const own = trimPath(root)
  if (repoRoot === null) return PROJECT_PREFIX + own
  const repo = trimPath(repoRoot)
  return PROJECT_PREFIX + (own === repo || rootIsLinkedWorktree ? repo : own)
}

export function sessionKeyOf(id: string | undefined): string | undefined {
  return id === undefined || id === '' ? undefined : SESSION_PREFIX + id
}

/** その場所の設定を置くキー。セッションの id が分からないときは undefined。 */
export function storeKeyFor(scope: Scope, keys: { project: string; session: string | undefined }): string | undefined {
  if (scope === 'global') return GLOBAL_KEY
  if (scope === 'project') return keys.project
  return keys.session
}

/** 書き込み順に並んだキーのうち、セッションのキーで古すぎるもの（消すもの）。 */
export function sessionKeysToPrune(keys: readonly string[], kept: number = SESSIONS_KEPT): string[] {
  const sessions = keys.filter(key => key.startsWith(SESSION_PREFIX))
  return sessions.slice(0, Math.max(0, sessions.length - kept))
}

/** 指定した項目だけを変える。指定の無い項目は、その場所に保存されていた値、無ければ標準から引き継ぐ。 */
export function mergeChoice(
  stored: unknown,
  patch: { theme?: ThemeName; time?: TimeMode; brightness?: Brightness; clawd?: Partial<ClawdChoice> },
): Choice {
  const base = normalizeChoice(stored) ?? DEFAULT_CHOICE
  return {
    theme: patch.theme ?? base.theme,
    time: patch.time ?? base.time,
    brightness: patch.brightness ?? base.brightness,
    // 明示的な undefined は、項目を消さない（normalizeClawd が項目ごとに標準へ戻してしまうので、先に外す）
    clawd: normalizeClawd({ ...base.clawd, ...Object.fromEntries(Object.entries(patch.clawd ?? {}).filter(([, v]) => v !== undefined)) }),
  }
}
