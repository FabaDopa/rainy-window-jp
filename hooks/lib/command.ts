// /rj の引数の読み取り。AI は使わない。語の順番は自由。
//   /rj                         → カード
//   /rj <背景色> [時間帯] [明るさ] [p|s]
//   /rj 姿 <自動|sonnet|haiku|opus|fable> / 演出 <自動|low|medium|high|xhigh|max> / ドット <ふつう|細かい>（背景の語と混ぜてよい）
//   /rj reset [p|s]             → その保存先の設定を消す（書かなければ すべての会話）

import type { ClawdChoice, ClawdEffect, ClawdLook, Dots } from './clawd-choice'
import type { Brightness, ThemeName, TimeMode } from './choice'
import type { Band } from './time'

export type Scope = 'global' | 'project' | 'session'

export type Parsed =
  | { kind: 'card' }
  | { kind: 'apply'; scope: Scope; theme?: ThemeName; time?: TimeMode; brightness?: Brightness; clawd?: Partial<ClawdChoice> }
  | { kind: 'reset'; scope: Scope }
  | { kind: 'help'; reason: string }

const THEMES: Record<string, ThemeName> = {
  紺: '紺', navy: '紺',
  緑: '緑', green: '緑',
  桜: '桜', pink: '桜',
  橙: '橙', orange: '橙',
  灰: '灰', gray: '灰', grey: '灰',
  なし: 'なし', オフ: 'なし', none: 'なし', off: 'なし',
  // 前の版の名前
  雨: '紺', rain: '紺',
  森: '緑', forest: '緑',
  墨: '灰', ink: '灰',
  葡萄: '桜', grape: '桜',
}
const BANDS: Record<string, Band> = {
  朝: '朝', morning: '朝',
  昼: '昼', day: '昼', noon: '昼',
  夕方: '夕方', evening: '夕方',
  夜: '夜', night: '夜',
}
const BRIGHTNESS: Record<string, Brightness> = {
  システム: 'system', system: 'system',
  黒: 'dark', dark: 'dark',
  白: 'light', light: 'light',
}
const AUTO = new Set(['自動', 'auto'])
const FIXED = new Set(['固定', 'fixed'])
const SCOPES: Record<string, Scope> = { p: 'project', s: 'session' }
const RESET = new Set(['reset', 'リセット'])
const LOOK_KEY = new Set(['姿', 'look'])
const EFFECT_KEY = new Set(['演出', 'effect'])
const DOTS_KEY = new Set(['ドット', 'dots'])
const LOOKS: Record<string, ClawdLook> = { 自動: 'auto', auto: 'auto', sonnet: 'sonnet', haiku: 'haiku', opus: 'opus', fable: 'fable' }
const EFFECTS: Record<string, ClawdEffect> = {
  自動: 'auto', auto: 'auto', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
  // 前の版の書き方
  なし: 'low', none: 'low',
}
const DOT_SIZES: Record<string, Dots> = { ふつう: 'normal', normal: 'normal', 細かい: 'fine', fine: 'fine' }

export const RJ_USAGE = [
  '/rj だけで、設定のカードが出ます。打って指定するときは：',
  '  /rj <背景色> [時間帯] [明るさ] [p|s]',
  '  背景色：紺 緑 桜 橙 灰、オフ（navy green pink orange gray off）',
  '  時間帯：自動、または 朝 昼 夕方 夜（固定 夕方 とも書ける。auto morning day evening night）',
  '  明るさ：システム 黒 白（system dark light）',
  '  姿：自動、または sonnet haiku opus fable（クロードくんの姿。look）',
  '  演出：自動、または low medium high xhigh max（effect。low は演出なし）',
  '  ドット：ふつう 細かい（dots）',
  '  保存先：書かない＝すべての会話、p＝このフォルダ、s＝この会話だけ',
  '  /rj reset [p|s]：その保存先の設定を消す',
  '例：/rj 緑、/rj 緑 自動 p、/rj 紺 夜 s、/rj 演出 max、/rj 姿 opus ドット 細かい',
].join('\n')

const own = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key)

export function parseRj(args: string): Parsed {
  const words = args.split(/[\s　]+/).filter(w => w !== '').map(w => w.toLowerCase())
  if (words.length === 0) return { kind: 'card' }

  let theme: ThemeName | undefined
  let time: TimeMode | undefined
  let brightness: Brightness | undefined
  let scope: Scope | undefined
  const clawd: Partial<ClawdChoice> = {}
  let reset = false
  const help = (reason: string): Parsed => ({ kind: 'help', reason })

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    if (LOOK_KEY.has(w) || EFFECT_KEY.has(w) || DOTS_KEY.has(w)) {
      // クロードくんの語は、あとに値の語が付く（「演出」のあとの なし は、背景のオフではなく演出の low）
      const next = words[i + 1]
      if (LOOK_KEY.has(w)) {
        if (clawd.look !== undefined) return help('姿は1つだけ書けます。')
        if (next === undefined || !own(LOOKS, next)) return help('「姿」のあとに 自動・sonnet・haiku・opus・fable のどれかを書いてください。')
        clawd.look = LOOKS[next]!
      } else if (EFFECT_KEY.has(w)) {
        if (clawd.effect !== undefined) return help('演出は1つだけ書けます。')
        if (next === undefined || !own(EFFECTS, next)) return help('「演出」のあとに 自動・low・medium・high・xhigh・max のどれかを書いてください。')
        clawd.effect = EFFECTS[next]!
      } else {
        if (clawd.dots !== undefined) return help('ドットは1つだけ書けます。')
        if (next === undefined || !own(DOT_SIZES, next)) return help('「ドット」のあとに ふつう・細かい のどちらかを書いてください。')
        clawd.dots = DOT_SIZES[next]!
      }
      i++
    } else if (RESET.has(w)) {
      if (reset) return help('reset が2回あります。')
      reset = true
    } else if (own(SCOPES, w)) {
      if (scope !== undefined) return help('保存先（p・s）は1つだけ書けます。')
      scope = SCOPES[w]
    } else if (own(THEMES, w)) {
      if (theme !== undefined) return help('背景色は1つだけ書けます。')
      theme = THEMES[w]
    } else if (own(BRIGHTNESS, w)) {
      if (brightness !== undefined) return help('明るさは1つだけ書けます。')
      brightness = BRIGHTNESS[w]
    } else if (AUTO.has(w)) {
      if (time !== undefined) return help('時間は1つだけ書けます。')
      time = { kind: 'auto' }
    } else if (FIXED.has(w)) {
      if (time !== undefined) return help('時間は1つだけ書けます。')
      const next = words[i + 1]
      if (next === undefined || !own(BANDS, next)) return help('「固定」のあとに 朝・昼・夕方・夜 のどれかを書いてください。')
      time = { kind: 'fixed', band: BANDS[next]! }
      i++
    } else if (own(BANDS, w)) {
      if (time !== undefined) return help('時間は1つだけ書けます。')
      time = { kind: 'fixed', band: BANDS[w]! }
    } else {
      return help(`「${w}」は分かりませんでした。`)
    }
  }

  const hasClawd = Object.keys(clawd).length > 0
  if (reset) {
    if (theme !== undefined || time !== undefined || brightness !== undefined || hasClawd) return help('reset には保存先（p・s）だけを書けます。')
    return { kind: 'reset', scope: scope ?? 'global' }
  }
  if (theme === undefined && !hasClawd) return help('背景色（紺・緑・桜・橙・灰・オフ）か、クロードくんの語（姿・演出・ドット）を書いてください。')
  const parsed: Parsed = { kind: 'apply', scope: scope ?? 'global' }
  if (theme !== undefined) parsed.theme = theme
  if (time !== undefined) parsed.time = time
  if (brightness !== undefined) parsed.brightness = brightness
  if (hasClawd) parsed.clawd = clawd
  return parsed
}
