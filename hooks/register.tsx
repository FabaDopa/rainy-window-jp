// rainy-window-jp: the rainy-window theme (by Ishu Agrawal, MIT) with a clock on
// Japan's time, five room colors that also follow the time of day, and a choice
// kept for everything, for a project or for one session. /rj shows a card.
//
// The recipe is the original's: one `$.theme.set` call with the colors and the
// backdrop, and a `ui.render` hook that draws the scene at the `Backdrop` site.
// It calls no model and reaches no network: the time is the PC's own clock,
// read as Japan's time with `Intl`.
//
// クロードくん（部屋の右下のキャラクター）は、アプリのイベント（turn の始まり・返事の流れ・ツール・終わり、
// サブエージェント、モデル）を見て動く。返事の流れ（turn.step）は読むだけで、止めず・落とさず・並べ替えず・変えない。

import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, SvgProps, ThemeSetArgs, TurnStepChunk } from 'claude-code'

import type { RjCard, RjClawd, RjDraft } from '../types'
import { DEFAULT_CHOICE, SOURCE_LABEL, describeChoice, effectiveBand, normalizeChoice, resolveChoice } from './lib/choice'
import { DEFAULT_CLAWD, describeClawd, describeClawdPatch, levelOfEffort, lookOfModel, normalizeClawd, viewOf } from './lib/clawd-choice'
import type { ClawdChoice } from './lib/clawd-choice'
import { advance, startMachine } from './lib/clawd-state'
import type { ClawdEvent, Machine } from './lib/clawd-state'
import type { Brightness, Choice, Layers, Source, ThemeName } from './lib/choice'
import { RJ_USAGE, parseRj } from './lib/command'
import type { Scope } from './lib/command'
import { buildTheme, roomColors } from './lib/palette'
import { GLOBAL_KEY, mergeChoice, projectKeyOf, sessionKeyOf, sessionKeysToPrune, storeKeyFor } from './lib/store'
import { STRIP_H, TABS, TAB_LABEL, TITLE_H, isTab, tabButtonLabel, tabRuleText, tabStripSvg, tabTitleSvg } from './lib/tabs'
import type { Tab } from './lib/tabs'
import { bandOf, isSceneStale } from './lib/time'
import type { Band } from './lib/time'
import { clawdLayerBody, fitScene, layerBody, legacyInner } from './clawd/layer'
import type { ClawdView } from './clawd/layer'
import type { Look } from './clawd/scripts'
import { TILE_H, TILE_W, clawdTiles } from './clawd/tiles'
import type { ClawdTiles } from './clawd/tiles'
import { SCENE_ALT, sceneSvg } from './scene'

/** The scene's name for 紺 at night, the original's look. Every other look has a name of its own (sceneNameOf). */
const SCENE = 'rainy-window-jp'
const COMMAND = 'rj'
const NONE = 'none'

const CLOSED: RjCard = { isOpen: false, inBand: false, draft: null, nowLine: '', previewing: false, tab: 'room', tabFrom: 'room' }
// 検証（plugin validate）が読めるように、plugin と key は文字列のまま書く。
// 見た目のタブの大きな動く見本をやめて、そのポンの印（pop）を外したので card-4（card-3 までの古い値は、閉じたカードとして読む）。
const card = atom({ plugin: 'rainy-window-jp', key: 'card' } as const, CLOSED, { shape: 'card-4' })

/** クロードくんの様子の標準。層（Svg）だけを描き直すために、部屋とは別の atom に置く。 */
const CLAWD_NOW: RjClawd = { phase: 'wait', model: '', effort: '', subagents: 0, arrive: [], leave: [], choice: { ...DEFAULT_CLAWD } }
// choice を足し、確かめ（probe）を外したので clawd-3（古い値は、標準として読む）。
const clawd = atom({ plugin: 'rainy-window-jp', key: 'clawd' } as const, CLAWD_NOW, { shape: 'clawd-3' })

// 下の変数は mod を読み直すと空に戻る。読み直すとテーマも外れるので、session.start でどちらも作り直す。
/** What this session shows: a look's key, NONE, or undefined before the first set. */
let shownKey: string | undefined
/** The last drawing made, by scene name: its clock starts from the moment it was made. */
let drawn: { scene: string; clawdKey: string; source: string; madeAt: number } | undefined
/** The card shows a choice that is not saved yet: a turn's start leaves the window as it is. */
let isPreviewing = false
let keysKept: { root: string; keys: Keys } | undefined
/** モデルの見張り（1.5秒ごと）の時計。 */
let stopModelWatch: { cancel: () => void } | undefined
/** クロードくんの atom に最後に書いた時刻（$.clock.now）と、2秒あけるために待たせている書き込み（書く回の並び。先頭を次に書く）。 */
let lastPublishAt = -Infinity
let pendingPublish: { timer: { cancel: () => void }; slots: Slot[] } | undefined
/**
 * クロードくんの見た目が変わっても、絵を描き直す（雨が一瞬途切れるかもしれない）のはこの間隔より多くしない。
 * 本人が選んだ代わり A（1枚の Svg、描き直しは最低2秒あけてまとめる）なので、0.9・1.5・3 秒の決まりは状態の機械のもの。
 * 絵はこの間隔に従う（！はおよそ2秒、やったは2秒以上、手をふるは機械の許すだけ）。
 */
const REDRAW_GAP_MS = 2000

/** クロードくんの状態の機械（clawd-state.ts）と、時間で移る状態の次の tick の時計（いつも1つだけ）。 */
let machine: Machine | undefined
let tickTimer: { cancel: () => void } | undefined
/** 会話の始めに読んだモデル。atom の model が '' のあいだは、これで姿を決める。 */
let startModel = ''
/** 最後に絵にした atom の値と、その値のけむり（子の出入り）をもう描いたか。けむりは1回だけ見せる。 */
let lastClawdSeen: string | undefined
let puffsSpent = false
/** 同じ失敗を、デバッグの記録に続けて何度も書かない。 */
let lastClawdTrouble = ''
/** 一度に見せるサブエージェントの子は5人まで（Haiku の姿のときは、層が2人までにする）。 */
const MAX_SUBAGENTS = 5
/**
 * turn が終わったサブエージェントの id。一覧（$.agent.list）が遅れて、まだ running・pending と言っている間も数えない。
 * 一覧がその子を running・pending と言わなくなったら（または、その子の turn がまた始まったら）忘れる。
 * 覚えるのは ENDED_MAX 人まで（あふれたら古いものから忘れる）。
 */
const endedAgents = new Set<string>()
const ENDED_MAX = 64
/** 1回の書き込み：phase 以外の変更（あとの変更も重ねられる）と、見せる状態（無ければ変えない）。 */
type Slot = { change: (was: RjClawd) => RjClawd; phase?: RjClawd['phase'] }
/** 必ず1回は絵にする状態（「！」と「やった」）。待っている間に、後の状態で置きかえない。 */
const ONCE_PHASES: readonly RjClawd['phase'][] = ['alert', 'done']
/** 返事のかけらの種類 → 状態の機械への出来事。ほかの種類（input・stop・engine）は送らない。 */
const KIND_EVENT: Partial<Record<TurnStepChunk['kind'], ClawdEvent>> = { thinking: 'think', text: 'text', tool: 'tool' }

/** 前の仕事が終わってから、次の仕事を1つずつ動かす列（1つが失敗しても、列は止めない）。 */
type Lane = { tail: Promise<void> }
/** 状態の機械・サブエージェントの数え直し・atom への書き込み、それぞれの列。順番が入れかわらない。 */
const machineLane: Lane = { tail: Promise.resolve() }
const countLane: Lane = { tail: Promise.resolve() }
const publishLane: Lane = { tail: Promise.resolve() }

function inLane(lane: Lane, work: () => Promise<void>): Promise<void> {
  const run = lane.tail.then(work)
  lane.tail = run.catch(() => undefined)
  return run
}

type Keys = { project: string; session: string | undefined }

const SCOPE_LABEL: Record<Scope, string> = { global: SOURCE_LABEL.global, project: SOURCE_LABEL.project, session: SOURCE_LABEL.session }
const NARROWNESS: Record<Source, number> = { default: 0, global: 1, project: 2, session: 3 }

/** 失敗の中身を、人に見せる短い文にする。 */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** 呼んでみて、その呼び出しが無い・断られた・失敗したときは undefined にする。 */
function tryOr<T>(work: () => Promise<T>): Promise<T | undefined> {
  return Promise.resolve()
    .then(work)
    .catch(() => undefined)
}

/**
 * セッションの開始・メッセージの送信・ボタンを、この mod の失敗で止めないための包み。
 * 失敗したことは、会話に薄い1行で残す（モデルには送られない）。
 */
async function safely($: EngineInterface, work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (err) {
    try {
      $.ui.log(`rainy-window-jp: うまくいかなかったので、見た目はそのままです（${messageOf(err)}）`)
    } catch {
      // 1行も書けないときは、黙って続ける。
    }
  }
}

/** クロードくんの失敗は、デバッグの記録にだけ書く（同じものは続けて書かない）。会話・返事・コマンドは止めない。 */
function clawdTrouble($: EngineInterface, what: string, err: unknown): void {
  const text = `rainy-window-jp: clawd ${what} failed (${messageOf(err)})`
  if (text === lastClawdTrouble) return
  lastClawdTrouble = text
  try {
    $.ui.log(text, { to: 'debug' })
  } catch {
    // 記録できなくても続ける。
  }
}

/** クロードくんの仕事を、待たずに動かす（呼んだフックはすぐ先へ進む）。失敗はデバッグの記録だけ。 */
function soon($: EngineInterface, what: string, work: () => Promise<void>): void {
  try {
    void Promise.resolve()
      .then(work)
      .catch(err => clawdTrouble($, what, err))
  } catch {
    // ここで失敗しても、呼んだフックは止めない。
  }
}

/** 時計を止める。止められなくても（例外が出ても）続ける：呼んだフックの残り（テーマを付ける・next）を飛ばさない。 */
function cancelQuietly(timer: { cancel: () => void } | undefined): void {
  try {
    timer?.cancel()
  } catch {
    // 止められなくても続ける。
  }
}

/** The store's keys for this session's project and for the session itself, made once per root. */
async function keysOf($: EngineInterface): Promise<Keys> {
  const root = await $.session.root()
  if (keysKept !== undefined && keysKept.root === root) return keysKept.keys
  const repo = await tryOr(() => $.session.repo())
  const repoRoot = repo?.root ?? null
  let linked = false
  if (repoRoot !== null) {
    const sep = root.includes('\\') ? '\\' : '/'
    const git = await tryOr(() => $.fs.stat(root.replace(/[\\/]+$/, '') + sep + '.git'))
    linked = git?.kind === 'file'
  }
  // 会話の id：デスクトップアプリが渡す、会話の行の id（/clear しても変わらない）を先に使う。無ければ Claude Code の会話の id。
  const hostId = await tryOr(() => $.env.get('CLAUDE_CODE_HOST_SESSION_ID'))
  const id = hostId !== undefined && hostId !== '' ? hostId : await tryOr(() => $.session.id())
  const keys = { project: projectKeyOf(root, repoRoot, linked), session: sessionKeyOf(id) }
  keysKept = { root, keys }
  return keys
}

/** The three stored layers, as stored: resolveChoice reads a broken one as absent. */
async function readLayers($: EngineInterface): Promise<Layers> {
  const keys = await keysOf($)
  const layers: Layers = { global: await $.store.get(GLOBAL_KEY), project: await $.store.get(keys.project) }
  if (keys.session !== undefined) layers.session = await $.store.get(keys.session)
  return layers
}

async function writeChoice($: EngineInterface, scope: Scope, choice: Choice): Promise<void> {
  const key = storeKeyFor(scope, await keysOf($))
  if (key === undefined) throw new Error('この会話の id が分からないので、「この会話だけ」には保存できません')
  // 会話ごとの設定は、保存した順に並べて、古いものから捨てる。$.store.keys() は入れた順に返すので、
  // 一度消してから入れ直すと、この会話がいちばん新しい位置に来る。
  if (scope === 'session') await $.store.delete(key)
  await $.store.set(key, choice)
  if (scope === 'session') await pruneSessions($)
}

/** 会話ごとの設定を、新しいものから決まった数だけ残す。掃除だけの失敗は無視する（次の保存でまた掃除する）。 */
async function pruneSessions($: EngineInterface): Promise<void> {
  try {
    const stale = sessionKeysToPrune(await $.store.keys())
    for (const key of stale) await $.store.delete(key)
  } catch {
    // 無視する。
  }
}

async function clearChoice($: EngineInterface, scope: Scope): Promise<void> {
  const key = storeKeyFor(scope, await keysOf($))
  if (key !== undefined) await $.store.delete(key)
}

/** A look's key: what decides whether the window must be set again. */
function keyOf(choice: Choice, band: Band): string {
  return choice.theme === 'なし' ? NONE : `${choice.theme}|${band}|${choice.brightness}`
}

// A scene's name takes 1 to 64 letters, digits, _ or - (the host refuses any other), so each
// color and time of day has a plain word in it.
const COLOR_WORD: Record<Exclude<ThemeName, 'なし'>, string> = { 紺: 'navy', 緑: 'green', 桜: 'pink', 橙: 'orange', 灰: 'gray' }
const BAND_WORD: Record<Band, string> = { 朝: 'morning', 昼: 'day', 夕方: 'evening', 夜: 'night' }

/**
 * The scene's name for a room color and a time of day, such as
 * rainy-window-jp-green-night. Each look has a name of its own, so a surface
 * that draws a backdrop by its name draws it again when the look changes;
 * 紺 at night keeps the plain name.
 */
function sceneNameOf(theme: Exclude<ThemeName, 'なし'>, band: Band): string {
  return theme === '紺' && band === '夜' ? SCENE : `${SCENE}-${COLOR_WORD[theme]}-${BAND_WORD[band]}`
}

/** The color and the time of day a scene name of this mod stands for; undefined for any other name. */
function sceneLookOf(name: unknown): { theme: Exclude<ThemeName, 'なし'>; band: Band } | undefined {
  if (name === SCENE) return { theme: '紺', band: '夜' }
  for (const [theme, color] of Object.entries(COLOR_WORD) as [Exclude<ThemeName, 'なし'>, string][]) {
    for (const [band, word] of Object.entries(BAND_WORD) as [Band, string][]) {
      if (name === `${SCENE}-${color}-${word}`) return { theme, band }
    }
  }
  return undefined
}

/**
 * クロードくんの層（部屋の SVG の中に置く）を作る関数。作れなかったときは今までの姿に戻し、それも駄目なら空（部屋だけ）。
 * view が無い（様子を決められなかった）ときも、今までの姿にする。
 */
function layerOf(view: ClawdView | undefined): () => string {
  // 関数で渡す：sceneSvg が「ずらし」を決めたあとに呼ぶ（今までの姿の湯気なども、部屋と同じようにずれる）。
  return () => {
    try {
      if (view !== undefined) return clawdLayerBody(view)
    } catch {
      // 下の、今までの姿にする。
    }
    try {
      return layerBody(legacyInner(), { fine: false })
    } catch {
      return ''
    }
  }
}

/** 描いた絵を見分けるクロードくんの鍵：見せ方（view）そのもの。 */
function clawdKeyOf(view: ClawdView): string {
  return JSON.stringify(view)
}

/** 同じ名前・同じクロードくんで、1分以内に作った絵があればそれ（雨を最初からにしない）。 */
function keptDrawing(name: string, clawdKey: string): string | undefined {
  if (drawn === undefined || drawn.scene !== name || drawn.clawdKey !== clawdKey || isSceneStale(drawn.madeAt, Date.now())) return undefined
  return drawn.source
}

/**
 * The drawing for a scene name and the look of クロードくん (one Svg: the room with him in it).
 * One made for the same name and look within the last minute is handed back as it is, so the
 * rain is not restarted; a different look, or an older one (its hands start from the moment it
 * was made), is made again. A new drawing's animations start where the last one's had got to
 * (seamless), so the rain and lights seem to go on.
 * 最後の手段：できた絵が Svg の上限（131,072 文字）を超えたら、今までの姿、それでも超えたら空の層（部屋だけ）で作り直す。
 */
function drawingFor(name: string, look: { theme: Exclude<ThemeName, 'なし'>; band: Band }, clawdKey: string, layer: () => string): string {
  const kept = keptDrawing(name, clawdKey)
  if (kept !== undefined) return kept
  const now = new Date()
  const colors = roomColors(look.theme, look.band)
  const source = fitScene(each => sceneSvg(now, colors, { layer: each, seamless: true }), [layer, layerOf(undefined), () => ''])
  drawn = { scene: name, clawdKey, source, madeAt: Date.now() }
  return drawn.source
}

/** クロードくんの今の様子。読めなければ標準（失敗の代価はクロードくんだけにする）。 */
async function clawdNow($: EngineInterface): Promise<RjClawd> {
  return (await tryOr(() => read($, clawd))) ?? CLAWD_NOW
}

/**
 * いま見せるクロードくん：保存してある設定（atom の choice）、モデル、effort、状態、子の数と出入り、カードが開いているか。
 * カードを開いている間は、保存してある設定の代わりに、カードで選んでいる（まだ保存していない）姿・演出・ドットを見せる。
 * Backdrop と show で同じものを使う。読めない値は標準にする。
 */
async function clawdViewNow($: EngineInterface): Promise<{ view: ClawdView; seen: string }> {
  const now = await clawdNow($)
  const cardNow = await tryOr(() => read($, card))
  const draft = cardNow?.isOpen === true ? (cardNow.draft ?? null) : null
  const view = viewOf({
    choice: draft !== null ? clawdOfDraft(draft) : normalizeClawd(now.choice),
    model: typeof now.model === 'string' && now.model !== '' ? now.model : startModel,
    effort: now.effort,
    phase: now.phase,
    subagents: typeof now.subagents === 'number' ? now.subagents : 0,
    arrive: Array.isArray(now.arrive) ? now.arrive : [],
    leave: Array.isArray(now.leave) ? now.leave : [],
    cardOpen: cardNow?.isOpen === true,
  })
  return { view, seen: JSON.stringify(now) }
}

/**
 * いまの絵（部屋にクロードくんを入れた1枚）。クロードくんの部分で何が失敗しても、部屋は描く。
 * 子の出入りのけむりは1回だけ：同じ様子の絵を作り直すとき（部屋の色が変わった・絵が古くなった）は出し直さない。
 */
async function sceneNow($: EngineInterface, name: string, look: { theme: Exclude<ThemeName, 'なし'>; band: Band }): Promise<string> {
  let clawdKey = 'legacy'
  let layer = layerOf(undefined)
  try {
    const { view, seen } = await clawdViewNow($)
    if (seen !== lastClawdSeen) {
      lastClawdSeen = seen
      puffsSpent = false
    }
    let shown = view
    const puffs = view.arrive.length > 0 || view.leave.length > 0
    if (puffs && puffsSpent && keptDrawing(name, clawdKeyOf(view)) === undefined) shown = { ...view, arrive: [], leave: [] }
    if (puffs) puffsSpent = true
    clawdKey = clawdKeyOf(shown)
    layer = layerOf(shown)
  } catch (err) {
    clawdTrouble($, 'view', err)
  }
  return drawingFor(name, look, clawdKey, layer)
}

/** from から to−1 までの場所（増えた子・減った子の場所）。 */
function slots(from: number, to: number): number[] {
  const n = Math.max(0, to - from)
  return Array.from({ length: Number.isFinite(n) ? n : 0 }, (_, i) => from + i)
}

/**
 * 書く値：前の値に変更を当てたもの。arrive・leave は、前に書いた子の数からの増減だけ
 * （新しい子は次の場所に、減ったときは大きい場所から帰る）。前の書き込みのけむりは持ち越さない。
 */
function applyClawd(was: RjClawd, change: (was: RjClawd) => RjClawd): RjClawd {
  const next = change({ ...was, arrive: [], leave: [] })
  return { ...next, arrive: slots(was.subagents, next.subagents), leave: slots(next.subagents, was.subagents) }
}

/** 見た目の変わらない書き込みか。けむりを消すだけの書き込みもしない（次の書き込みで消える）。 */
function isSameClawd(was: RjClawd, next: RjClawd): boolean {
  return next.arrive.length === 0 && next.leave.length === 0 && JSON.stringify(next) === JSON.stringify({ ...was, arrive: [], leave: [] })
}

async function writeClawd($: EngineInterface, change: (was: RjClawd) => RjClawd): Promise<void> {
  await update($, clawd, was => applyClawd(was, change))
  lastClawdTrouble = ''
}

/** 1回の書き込みの変更（phase があれば、それも当てる）。 */
function slotChange(slot: Slot): (was: RjClawd) => RjClawd {
  const { change, phase } = slot
  return phase === undefined ? change : was => ({ ...change(was), phase })
}

/**
 * 待っている書き込みに重ねる。phase 以外の変更は、いちばん先に書く回へ（早く見える）。phase は最後の回へ：
 * その回が「！」か「やった」で、ちがう状態が来たら、その状態は次の回（2秒あと）にする（後のものに消されない）。
 */
function addToSlots(slots: Slot[], change: (was: RjClawd) => RjClawd, phase: RjClawd['phase'] | undefined): void {
  const first = slots[0]
  if (first === undefined) {
    slots.push({ change, phase })
    return
  }
  const older = first.change
  first.change = was => change(older(was))
  if (phase === undefined) return
  const last = slots[slots.length - 1] ?? first
  if (last.phase !== undefined && last.phase !== phase && ONCE_PHASES.includes(last.phase)) slots.push({ change: was => was, phase })
  else last.phase = phase
}

/**
 * 待たせた書き込みを、時刻が来たら1回書く（列の中で受け取るので、列で先に待っている変更は書く前に重なる）。
 * まだ回が残っていれば、書いた時刻から2秒あけて次を書く。見た目の変わらない回は書かず、2秒も使わない。
 */
function flushLater($: EngineInterface, held: { timer: { cancel: () => void }; slots: Slot[] }, wait: number): void {
  held.timer = $.clock.after(Math.max(0, wait), () => {
    inLane(publishLane, async () => {
      if (pendingPublish !== held) return
      let trouble: unknown
      let at = lastPublishAt
      try {
        at = await $.clock.now()
        const slot = held.slots.shift()
        if (slot !== undefined) {
          const full = slotChange(slot)
          const current = await read($, clawd)
          if (!isSameClawd(current, applyClawd(current, full))) {
            lastPublishAt = at
            await writeClawd($, full)
          }
        }
      } catch (err) {
        trouble = err
      }
      // 失敗しても、残りの回は捨てずに続ける（止まったままにしない）。
      if (held.slots.length === 0) pendingPublish = undefined
      else {
        try {
          flushLater($, held, lastPublishAt + REDRAW_GAP_MS - at)
        } catch (err) {
          pendingPublish = undefined
          trouble = trouble ?? err
        }
      }
      if (trouble !== undefined) throw trouble
    }).catch(err => clawdTrouble($, 'write', err))
  })
}

/**
 * クロードくんの atom へのただ一つの書き込み口。書くと絵ぜんたいが描き直されるので、
 * 最後の書き込みから REDRAW_GAP_MS（2秒）あける：あいていれば今書く。あいていなければ、変更を
 * 溜めておいて（新しい変更は重ねる。後のものが勝つ。ただし「！」「やった」は消さずに次の回へ）、その時刻に書く。
 * 見た目が変わらない変更は書かない（書かないので、次の書き込みを待たせもしない）。書き込みは1つずつ順に（列で）行う。
 * change は phase 以外を変える。phase は別に渡す。
 * atOnce は、人が押したボタン（カードの「保存して閉じる」）の変更：2秒を待たずに今書く（待っている書き込みは、そのまま後で書く）。
 */
function publishClawd($: EngineInterface, change: (was: RjClawd) => RjClawd, phase?: RjClawd['phase'], o: { atOnce?: boolean } = {}): Promise<void> {
  return inLane(publishLane, async () => {
    const now = await $.clock.now()
    const waiting = pendingPublish
    if (waiting !== undefined && o.atOnce !== true) {
      addToSlots(waiting.slots, change, phase)
      return
    }
    const full = slotChange({ change, phase })
    const was = await read($, clawd)
    if (isSameClawd(was, applyClawd(was, full))) return
    const wait = lastPublishAt + REDRAW_GAP_MS - now
    if (wait <= 0 || o.atOnce === true) {
      lastPublishAt = now
      await writeClawd($, full)
      return
    }
    const held = { timer: { cancel: () => undefined }, slots: [{ change, phase }] }
    pendingPublish = held
    try {
      flushLater($, held, wait)
    } catch (err) {
      pendingPublish = undefined
      throw err
    }
  })
}

/** 待たずに書く（失敗はデバッグの記録だけ）。 */
function publishSoon($: EngineInterface, change: (was: RjClawd) => RjClawd, phase?: RjClawd['phase']): void {
  try {
    publishClawd($, change, phase).catch(err => clawdTrouble($, 'write', err))
  } catch (err) {
    clawdTrouble($, 'write', err)
  }
}

/** 時間で移る状態の次の tick を、1つだけ置く（前のものは取り消す）。過ぎた時刻なら、すぐ（0 ミリ秒後）。 */
function setTick($: EngineInterface, wakeAt: number | undefined, now: number): void {
  tickTimer?.cancel()
  tickTimer = undefined
  if (wakeAt === undefined) return
  const timer = $.clock.after(Math.max(0, wakeAt - now), () => {
    if (tickTimer === timer) tickTimer = undefined
    soon($, 'tick', () => fire($, 'tick'))
  })
  tickTimer = timer
}

/**
 * 状態の機械に出来事を1つ送る（列で1つずつ、順番どおり）。状態が変わったら atom に書く（待たない）。
 * 時間で移る状態なら、その時刻に tick を送る時計を置く。
 */
function fire($: EngineInterface, ev: ClawdEvent): Promise<void> {
  return inLane(machineLane, async () => {
    const now = await $.clock.now()
    const was = machine ?? startMachine(now)
    const { machine: next, wakeAt } = advance(was, ev, now)
    machine = next
    setTick($, wakeAt, now)
    if (next.phase === was.phase) return
    publishSoon($, c => c, next.phase)
  })
}

/** turn が終わった子として覚える（覚えすぎたら、古いものから忘れる）。 */
function rememberEnded(id: string): void {
  endedAgents.delete(id)
  endedAgents.add(id)
  for (const old of endedAgents) {
    if (endedAgents.size <= ENDED_MAX) break
    endedAgents.delete(old)
  }
}

/**
 * いま動いているサブエージェントの数：status が running か pending のもの（5人まで）。
 * turn が終わったと覚えている子（endedAgents）は、一覧でまだ running でも数えない。一覧がもう running・pending と
 * 言わない子は、覚えから捨てる。一覧が読めなければ例外（覚えはそのまま）。
 */
async function countAgents($: EngineInterface): Promise<number | undefined> {
  const list = await $.agent.list()
  if (!Array.isArray(list)) return undefined
  const busy = list.filter(a => a.status === 'running' || a.status === 'pending')
  for (const id of endedAgents) if (!busy.some(a => a.id === id)) endedAgents.delete(id)
  return Math.min(MAX_SUBAGENTS, busy.filter(a => !endedAgents.has(a.id)).length)
}

/**
 * サブエージェントを数え直して atom に書く（列で1つずつ）。一覧が読めないときは、前の数のまま。
 * ended は turn が終わった子（覚える）、started は turn が始まった子（また動きだしたので忘れる）。どちらも数える前に、列の中で。
 */
function recountAgents($: EngineInterface, o: { ended?: string; started?: string } = {}): Promise<void> {
  return inLane(countLane, async () => {
    if (o.started !== undefined) endedAgents.delete(o.started)
    if (o.ended !== undefined) rememberEnded(o.ended)
    const n = await countAgents($)
    if (n === undefined) return
    publishSoon($, c => ({ ...c, subagents: n }))
  })
}

/**
 * turn.step のはじめ：このステップのモデルと effort を覚える（effort はここでしか分からない）。
 * effort が無い（effort の無いモデル・自動）ときは ''＝分からない：設計書 §3.3 のとおり low と同じ（演出なし）。
 */
function noteStep($: EngineInterface, model: unknown, effort: unknown): void {
  const name = typeof model === 'string' ? model : ''
  const level = typeof effort === 'string' ? effort : typeof effort === 'number' ? String(effort) : ''
  publishSoon($, c => ({ ...c, model: name === '' ? c.model : name, effort: level }))
}

/**
 * 返事の流れ（メインの turn.step）の見張り：かけらを読むだけで、変えない・待たない。
 * かけらの種類が変わったときだけ、状態の機械に送る（考える・書く・道具）。何が起きても例外を外に出さない。
 */
function stepWatcher($: EngineInterface, e: { model: unknown; effort?: unknown }): (chunk: TurnStepChunk) => void {
  try {
    noteStep($, e.model, e.effort)
  } catch (err) {
    clawdTrouble($, 'step', err)
  }
  let last: ClawdEvent | undefined
  return chunk => {
    try {
      const ev = KIND_EVENT[chunk.kind]
      if (ev === undefined || ev === last) return
      last = ev
      fire($, ev).catch(err => clawdTrouble($, ev, err))
    } catch {
      // 見張りの失敗で、かけらを止めない。
    }
  }
}

/** 下の流れを閉じる（上が途中で読むのをやめたとき）。閉じるのに失敗しても、元のことを優先する。 */
async function closeQuietly(it: AsyncIterator<unknown, unknown>): Promise<void> {
  try {
    await it.return?.()
  } catch {
    // 閉じられなくても続ける。
  }
}

/**
 * 会話の始め（fresh）と /clear・resume のあと：状態を待つに戻し、サブエージェントを数え、保存してある
 * クロードくんの設定を atom に置く。会話の始めは、モデルを会話の始めのもの（''）に戻す。
 * /clear・resume のあとは、いまのモデルを読み直して置く。
 */
async function resetClawd($: EngineInterface, fresh: boolean): Promise<void> {
  tickTimer?.cancel()
  tickTimer = undefined
  machine = undefined
  // /clear・resume のあとは、いまのモデルを読み直す（落ちた書き込みにあったモデルの変化を失わない）。
  const model = fresh ? '' : await tryOr(() => $.session.model())
  let choice: ClawdChoice | undefined
  try {
    choice = resolveChoice(await readLayers($)).choice.clawd
  } catch (err) {
    clawdTrouble($, 'choice', err)
  }
  let n: number | undefined
  try {
    n = await countAgents($)
  } catch (err) {
    clawdTrouble($, 'count', err)
  }
  await publishClawd(
    $,
    was => ({
      ...was,
      ...(fresh ? { model: '' } : typeof model === 'string' && model !== '' ? { model } : {}),
      choice: choice ?? was.choice,
      subagents: n ?? was.subagents,
    }),
    'wait',
  )
}

/**
 * Shows a choice. Nothing is asked of the engine when it shows already, so the
 * rain is broken only where the look changes. オフ (なし) clears only a theme this
 * session showed: a clear wipes whatever theme stands, another mod's included.
 */
async function show($: EngineInterface, choice: Choice, force: boolean): Promise<void> {
  const band = effectiveBand(choice, new Date())
  const key = keyOf(choice, band)
  if (!force && key === shownKey) return
  const built = buildTheme(choice, band)
  if (built === null || choice.theme === 'なし') {
    const hadOurs = shownKey !== undefined && shownKey !== NONE
    shownKey = NONE
    if (hadOurs) await $.theme.clear()
    return
  }
  const unpainted = built.problems.find(line => line.startsWith("Desktop won't paint"))
  if (unpainted !== undefined) $.ui.toast(`rainy-window-jp: ${unpainted}`)
  const scene = sceneNameOf(choice.theme, band)
  await sceneNow($, scene, { theme: choice.theme, band })
  const args: ThemeSetArgs =
    built.scheme === undefined
      ? { colors: built.theme, backdrop: { scene, glass: { blur: 18, opacity: 0.62 } } }
      : { colors: built.theme, backdrop: { scene, glass: { blur: 18, opacity: 0.62 } }, overrideColorScheme: built.scheme }
  const set = await $.theme.set(args)
  shownKey = key
  if (!set.isDrawn) $.ui.log(`rainy-window-jp: the theme is set but not drawn here: ${set.reason}`, { to: 'debug' })
}

/**
 * 保存してある設定を読み直して、見た目をそれに合わせる（時間帯が変わった、ほかの会話が保存した、など）。
 * クロードくんの設定も atom に置く（変わったときだけ描き直す。待たない）。
 */
async function follow($: EngineInterface, force: boolean): Promise<{ choice: Choice; source: Source }> {
  const resolved = resolveChoice(await readLayers($))
  const kept = resolved.choice.clawd
  publishSoon($, c => ({ ...c, choice: kept }))
  await show($, resolved.choice, force)
  return resolved
}

/** カードと返事に出す、保存してある設定の説明。 */
function nowLineOf(resolved: { choice: Choice; source: Source }): string {
  return `保存してある設定：${describeChoice(resolved.choice)}（${SOURCE_LABEL[resolved.source]}）`
}

/** Said where a narrower place's choice stands over the one just saved. */
function shadowNote(scope: Scope, resolved: { source: Source }): string {
  if (NARROWNESS[resolved.source] <= NARROWNESS[scope]) return ''
  return `この会話では「${SOURCE_LABEL[resolved.source]}」の設定が優先されているので、保存した見た目にはなりません。`
}

function othersNote(scope: Scope): string {
  return scope === 'session' ? '' : '開いているほかの会話は、次のメッセージを送ったときに切り替わります。'
}

function draftOf(choice: Choice, source: Source): RjDraft {
  return {
    theme: choice.theme,
    time: choice.time.kind === 'auto' ? '自動' : choice.time.band,
    brightness: choice.brightness,
    scope: source === 'session' || source === 'project' ? source : 'global',
    look: choice.clawd.look,
    effect: choice.clawd.effect,
    dots: choice.clawd.dots,
  }
}

/** 下書きのクロードくんの設定（姿・演出・ドット）。足りない・壊れた項目は標準にする。 */
function clawdOfDraft(draft: RjDraft): ClawdChoice {
  return normalizeClawd({ look: draft.look, effect: draft.effect, dots: draft.dots })
}

/** カードの下書き（背景とクロードくん）を、保存する設定の形にする。 */
function choiceOf(draft: RjDraft): Choice {
  return {
    theme: draft.theme,
    time: draft.time === '自動' ? { kind: 'auto' } : { kind: 'fixed', band: draft.time },
    brightness: draft.brightness,
    clawd: clawdOfDraft(draft),
  }
}

/** カードの atom への書き込み（タブの切りかえ pickTab のほか、すべてここを通す）。 */
function updateCard($: EngineInterface, change: (was: RjCard) => RjCard): Promise<RjCard> {
  return update($, card, change)
}

/**
 * A press on the card: the card's choice changes and shows at once, unsaved.
 * Only a change the eye can see asks the engine again (a place alone does not).
 * クロードくんの姿・演出・ドットを押したときは、テーマを付け直さない：カードの atom が変わると、
 * Backdrop が下書きのクロードくんで描き直される（clawdViewNow）。
 */
async function pickItem($: EngineInterface, change: Partial<RjDraft>): Promise<void> {
  const now = await updateCard($, was => ({
    ...was,
    previewing: true,
    draft: { ...(was.draft ?? draftOf(DEFAULT_CHOICE, 'default')), ...change },
  }))
  if (now.draft === null) return
  isPreviewing = true
  await show($, choiceOf(now.draft), false)
}

async function saveDraft($: EngineInterface): Promise<void> {
  const draft = (await read($, card)).draft
  if (draft === null) return
  isPreviewing = false
  // 背景とクロードくんを、選んだ保存先にまとめて保存する（設計書 §3.5・§3.6）。
  const choice = choiceOf(draft)
  try {
    await writeChoice($, draft.scope, choice)
  } catch (error) {
    $.ui.toast(`rainy-window-jp: 保存できませんでした（${messageOf(error)}）`)
    return
  }
  // The look shown may be the one saved already: then nothing is set again.
  const resolved = await follow($, false)
  // 保存した（いま効いている）クロードくんの設定を、カードを閉じる前に atom へ今書く。2秒の間隔を待つと、
  // 閉じたとたんに前の姿が（最大2秒）出てしまう。人が押したボタンなので待たない（姿・演出のボタンがすぐ絵を変えるのと同じ考え）。
  try {
    await publishClawd($, c => ({ ...c, choice: resolved.choice.clawd }), undefined, { atOnce: true })
  } catch (err) {
    clawdTrouble($, 'write', err)
  }
  const note = shadowNote(draft.scope, resolved)
  $.ui.toast(`${SCOPE_LABEL[draft.scope]}に「${describeChoice(choice)}」と「${describeClawd(choice.clawd)}」を保存しました。${note}`)
  await updateCard($, was => ({ ...was, isOpen: false, previewing: false }))
}

async function clearDraftScope($: EngineInterface): Promise<void> {
  const draft = (await read($, card)).draft
  if (draft === null) return
  isPreviewing = false
  try {
    await clearChoice($, draft.scope)
  } catch (error) {
    $.ui.toast(`rainy-window-jp: 消せませんでした（${messageOf(error)}）`)
    return
  }
  const resolved = await follow($, false)
  $.ui.toast(`${SCOPE_LABEL[draft.scope]}の設定を消しました。${nowLineOf(resolved)}`)
  await updateCard($, was => ({
    ...was,
    previewing: false,
    nowLine: nowLineOf(resolved),
    draft: { ...draftOf(resolved.choice, resolved.source), scope: draft.scope },
  }))
}

/** Closes the card. A choice shown and not saved goes back to the one saved. */
async function closeCard($: EngineInterface): Promise<void> {
  const wasPreviewing = isPreviewing
  isPreviewing = false
  try {
    if (wasPreviewing) await follow($, false)
  } finally {
    await updateCard($, was => ({ ...was, isOpen: false, previewing: false }))
  }
}

/** Opens the card above the prompt, where it stays while the conversation scrolls. */
async function openCard($: EngineInterface): Promise<void> {
  const resolved = resolveChoice(await readLayers($))
  await updateCard($, (): RjCard => ({
    isOpen: true,
    inBand: true,
    draft: draftOf(resolved.choice, resolved.source),
    nowLine: nowLineOf(resolved),
    previewing: false,
    // 開くときは、いつも 🎨 背景 のタブから（帯は動かない）。
    tab: 'room',
    tabFrom: 'room',
  }))
}

/**
 * タブを押した：今のタブを tabFrom に、新しいタブを tab に置く。帯の SVG は tabFrom → tab で決まるので、
 * 押したときだけ光の帯がすべる。いま開いているタブをもう一度押したときは何もしない（帯を動き直させない）。
 */
async function pickTab($: EngineInterface, tab: Tab): Promise<void> {
  const now = await read($, card)
  if (!now.isOpen || now.tab === tab) return
  await updateCard($, was => ({ ...was, tabFrom: isTab(was.tab) ? was.tab : 'room', tab }))
}

/** カードが開いていたら、打って変えた設定にカードを合わせる（あとで古い選択を保存してしまわないように）。 */
async function syncOpenCard($: EngineInterface, resolved: { choice: Choice; source: Source }): Promise<void> {
  if (!(await read($, card)).isOpen) return
  await updateCard($, was => ({
    ...was,
    previewing: false,
    nowLine: nowLineOf(resolved),
    draft: draftOf(resolved.choice, resolved.source),
  }))
}


async function runCommand($: EngineInterface, args: string): Promise<string> {
  const parsed = parseRj(args)
  if (parsed.kind === 'card') {
    // The same command opens the card and closes it.
    if ((await read($, card)).isOpen) {
      await closeCard($)
      return 'カードを閉じました。'
    }
    await openCard($)
    return '入力欄の上のカードで色を押すと、すぐ背景が変わります。気に入ったら「保存して閉じる」を押してください。'
  }
  if (parsed.kind === 'help') return `${parsed.reason}\n${RJ_USAGE}`
  isPreviewing = false
  if (parsed.kind === 'reset') {
    await clearChoice($, parsed.scope)
    const resolved = await follow($, true)
    await syncOpenCard($, resolved)
    return `${SCOPE_LABEL[parsed.scope]}の設定を消しました。${nowLineOf(resolved)}。${othersNote(parsed.scope)}`
  }
  const keys = await keysOf($)
  const key = storeKeyFor(parsed.scope, keys)
  const stored = key === undefined ? undefined : await $.store.get(key)
  const patch: { theme?: ThemeName; time?: Choice['time']; brightness?: Brightness; clawd?: Partial<ClawdChoice> } = {}
  if (parsed.theme !== undefined) patch.theme = parsed.theme
  if (parsed.clawd !== undefined) patch.clawd = parsed.clawd
  if (parsed.time !== undefined) patch.time = parsed.time
  if (parsed.brightness !== undefined) patch.brightness = parsed.brightness
  // 背景の語が無いとき（クロードくんの語だけ）は、見えている背景を変えないよう、保存が無ければ、いま効いている設定から始める
  const hasBackground = parsed.theme !== undefined || parsed.time !== undefined || parsed.brightness !== undefined
  const base = hasBackground ? stored : (normalizeChoice(stored) ?? resolveChoice(await readLayers($)).choice)
  const choice = mergeChoice(base, patch)
  await writeChoice($, parsed.scope, choice)
  const resolved = await follow($, hasBackground)
  await syncOpenCard($, resolved)
  const saved = [...(hasBackground ? [describeChoice(choice)] : []), ...(parsed.clawd !== undefined ? [describeClawdPatch(parsed.clawd)] : [])]
  return `${SCOPE_LABEL[parsed.scope]}に${saved.map(x => `「${x}」`).join('と')}を保存しました。${shadowNote(parsed.scope, resolved)}${othersNote(parsed.scope)}`
}

/** カードを描く部品（画面ごとの部品表から、どの画面にもある3つ）。 */
type Parts = ReturnType<EngineInterface['ui']['resolve']>
type CardParts = { Box: Parts['Box']; Text: Parts['Text']; Button: Parts['Button'] }
/**
 * デスクトップ・スマホだけ：カードの Svg（帯・タイトル・見た目のタブの小さな絵）と、帯とタイトルの横幅（CSS px）。ターミナルには無い。
 * どの Svg にも isInteractive は付けず（枠にすると、スクロールする帯の中で、ホイールが取られてスクロールが詰まった）、大きさだけ付けて画像で描く。
 * 帯とタイトルは最後の形で止まって見える（デスクトップでは、すべる動きは出ない）。部屋の1枚には何も付けない。
 */
type CardArt = { Svg: ElementConstructor<SvgProps>; width: number }
/**
 * 見た目のタブに出す、いまのクロードくん：自動のボタンに添える姿と effort（分からなければ undefined）、
 * 小さな絵（姿の行・演出の行。作れなかったときやターミナルでは undefined）と、演出の絵の姿（カードで選んでいる姿。自動なら今のモデルの姿）。
 */
type ClawdCard = { autoLook: Look; autoEffort: string | undefined; tiles: ClawdTiles | undefined; workLook: Look }

// Each color carries a mark of its own, so it can be found without reading.
const COLOR_BUTTONS: [Exclude<ThemeName, 'なし'>, string][] = [
  ['紺', '🟦 紺'],
  ['緑', '🟩 緑'],
  ['桜', '🌸 桜'],
  ['橙', '🟧 橙'],
  ['灰', '⬜ 灰'],
]
const TIME_BUTTONS: RjDraft['time'][] = ['自動', '朝', '昼', '夕方', '夜']
const SCOPE_BUTTONS: Scope[] = ['global', 'project', 'session']
/** The app's own light or dark mode changes the room the most, and a mod cannot set it: the card says where it is. */
const APPEARANCE_HINT = '💡 明るい・暗いは、アプリの 設定 → 外観 → テーマ（🖥 ☀ 🌙）で切り替えます。☀ は昼の部屋、🌙 は夜の部屋、🖥 は Windows に合わせます。'

/** クロードくんの姿の名前（ボタンと、自動のボタンに添える「いま …」）。 */
const LOOK_NAME: Record<Look, string> = { sonnet: 'Sonnet', haiku: 'Haiku', opus: 'Opus', fable: 'Fable' }
const LOOK_BUTTONS: Exclude<RjDraft['look'], 'auto'>[] = ['sonnet', 'haiku', 'opus', 'fable']
const EFFECT_BUTTONS: [Exclude<RjDraft['effect'], 'auto'>, string][] = [
  ['none', 'なし'],
  ['medium', 'medium'],
  ['high', 'high'],
  ['xhigh', 'xhigh'],
  ['max', 'max'],
]
const DOTS_BUTTONS: [RjDraft['dots'], string][] = [
  ['normal', 'ふつう'],
  ['fine', '細かい'],
]
/** 帯とタイトルの横幅（CSS px）。ボタンは左から並ぶので、帯の位置はこの幅によらない（狭い画面だけ小さく）。 */
const ART_WIDTH = { desktop: 600, mobile: 320 } as const

const mark = (isOn: boolean, word: string) => (isOn ? `${word} ✓` : word)

/** カードのボタンを押したとき：保存せずに、その場で見た目を変える（押したときの関数を作る）。 */
function pickWith($: EngineInterface): (change: Partial<RjDraft>) => () => Promise<void> {
  return change => () => safely($, () => pickItem($, change))
}

/**
 * 見た目のタブに出す、いまのクロードくん：自動のボタンに添える姿（モデルから）と effort（分かるときだけ）、
 * 小さな止まった絵（withTiles のとき）。姿の絵は姿ごとに決まった絵（Claude の状態では変わらない）、演出の絵は
 * カードで選んでいる姿が書いているところに、その演出。演出の「自動」は今の effort（分からなければ なし）。
 * ドットと部屋の色は、カードで選んでいるもの。読めない・作れないときは添えない（カードは描く）。
 */
async function clawdCardNow($: EngineInterface, now: RjCard, withTiles: boolean): Promise<ClawdCard | undefined> {
  try {
    const atomNow = await clawdNow($)
    const model = typeof atomNow.model === 'string' && atomNow.model !== '' ? atomNow.model : startModel
    const level = levelOfEffort(atomNow.effort)
    const autoEffort = level === undefined ? undefined : String(atomNow.effort)
    const autoLook = lookOfModel(model)
    const draft = now.draft ?? draftOf(DEFAULT_CHOICE, 'default')
    const chosen = clawdOfDraft(draft)
    const workLook = chosen.look === 'auto' ? autoLook : chosen.look
    let tiles: ClawdTiles | undefined
    if (withTiles) {
      try {
        const shown = choiceOf(draft)
        tiles = clawdTiles({ autoLook, look: workLook, autoLevel: level ?? 0, dots: chosen.dots, room: roomColors(shown.theme, effectiveBand(shown, new Date())) })
      } catch (err) {
        clawdTrouble($, 'tiles', err)
      }
    }
    return { autoLook, autoEffort, tiles, workLook }
  } catch (err) {
    clawdTrouble($, 'card', err)
    return undefined
  }
}

/** 🎨 背景のタブの中身：状態の行と、背景色・時間帯の行（今までのカードと同じ言葉・同じ順）。 */
function roomRows($: EngineInterface, { Box, Text, Button }: CardParts, now: RjCard, draft: RjDraft) {
  const pick = pickWith($)
  const status = now.previewing ? `表示中：${describeChoice(choiceOf(draft))}（まだ保存していません）　／　${now.nowLine}` : now.nowLine
  return [
    <Text dimColor>{status}</Text>,
    <Box flexDirection="row" gap={1}>
      <Text>背景色　</Text>
      {COLOR_BUTTONS.map(([theme, name]) => {
        const word = mark(draft.theme === theme, name)
        return (
          <Button key={`rj-color-${theme}`} label={word} onPress={pick({ theme })}>
            {word}
          </Button>
        )
      })}
    </Box>,
    <Box flexDirection="row" gap={1}>
      <Text>時間帯　</Text>
      {TIME_BUTTONS.map(time => {
        const word = mark(draft.time === time, time === '自動' ? `自動（いま${bandOf(new Date())}）` : time)
        return (
          <Button key={`rj-time-${time}`} label={word} onPress={pick({ time })}>
            {word}
          </Button>
        )
      })}
    </Box>,
  ]
}

/**
 * 🐾 クロードくんの見た目のタブの中身：姿・演出・ドットの行。デスクトップ・スマホでは、姿と演出の行を小さな止まった絵の
 * 一覧にする（1つずつ、絵の下の端に、そのボタンを重ねる。Button は絵を持てず、Box は押せないので、ボタンを絵の上に置く）。
 * 行の上の薄い1行に、「自動」が今なにかを書く。
 * 押すと保存せずに、すぐ部屋のクロードくんが変わる。ボタンだけの行では、自動のボタンに今のモデルの姿と今の effort を添える。
 * ターミナル（Svg が無い）と、絵を作れなかったときは、今までどおりボタンだけの行。
 */
function clawdRows($: EngineInterface, { Box, Text, Button }: CardParts, draft: RjDraft, art: CardArt | undefined, now: ClawdCard | undefined) {
  const pick = pickWith($)
  const autoLook = now === undefined ? '自動' : `自動（いま ${LOOK_NAME[now.autoLook]}）`
  const autoEffect = now?.autoEffort === undefined ? '自動' : `自動（いま ${now.autoEffort}）`
  const named: [RjDraft['look'], string][] = LOOK_BUTTONS.map(look => [look, LOOK_NAME[look]] as [RjDraft['look'], string])
  const looks: [RjDraft['look'], string][] = [['auto', autoLook], ...named]
  const effects: [RjDraft['effect'], string][] = [['auto', autoEffect], ...EFFECT_BUTTONS]
  // 絵の上のボタンの名前は短く（「自動」。いまの姿・effort は、行の上の薄い1行に書く）
  const looksShort: [RjDraft['look'], string][] = [['auto', '自動'], ...named]
  const effectsShort: [RjDraft['effect'], string][] = [['auto', '自動'], ...EFFECT_BUTTONS]
  // lit: 絵の上のボタンだけ、絵の枠（keyed Box）を指すと文字が太くなる（枠の無いボタンに hover は付けられない）
  const button = <K extends 'look' | 'effect' | 'dots'>(item: K, value: RjDraft[K], name: string, lit = false) => {
    const word = mark(draft[item] === value, name)
    return (
      <Button key={`rj-${item}-${value}`} label={word} {...(lit ? { hover: { bold: true } } : {})} onPress={pick({ [item]: value } as Partial<RjDraft>)}>
        {word}
      </Button>
    )
  }
  const row = <K extends 'look' | 'effect' | 'dots'>(head: string, item: K, list: [RjDraft[K], string][]) => (
    <Box flexDirection="row" gap={1}>
      <Text>{head}</Text>
      {list.map(([value, name]) => button(item, value, name))}
    </Box>
  )
  const tiles = now?.tiles
  if (art === undefined || tiles === undefined || now === undefined) return [row('姿　　　', 'look', looks), row('演出　　', 'effect', effects), row('ドット　', 'dots', DOTS_BUTTONS)]
  // 絵の一覧の行：狭い画面では折り返す。絵の説明（alt）は、その絵のボタンと同じ名前。
  // 1つずつ、位置の基準の Box（hover の範囲でもある）に、絵と、絵の下の端に重ねたボタン（絵の上を指すと文字が太くなる）。
  // Box の width・height は文字のマス数なので付けず、絵（px）が枠の大きさを決める。
  const gallery = <K extends 'look' | 'effect'>(head: string, item: K, list: [RjDraft[K], string][], tileOf: (value: RjDraft[K]) => string, alt: (name: string) => string, autoLine: string) => (
    <Box flexDirection="column">
      <Text dimColor>{autoLine}</Text>
      <Box flexDirection="row" gap={1}>
        <Text>{head}</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {list.map(([value, name]) => (
            <Box key={`rj-tile-${item}-${value}`} position="relative">
              <art.Svg source={tileOf(value)} alt={alt(name)} width={TILE_W} height={TILE_H} />
              <Box position="absolute" left={0} right={0} bottom={0} alignItems="center">
                {button(item, value, name, true)}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
  const lookLine = `自動＝いまのモデル（${LOOK_NAME[now.autoLook]}）`
  const effectLine = now.autoEffort === undefined ? '自動＝effort が分からないので演出なし' : `自動＝いまの effort（${now.autoEffort}）`
  return [
    gallery('姿　　　', 'look', looksShort, value => tiles.looks[value], name => `クロードくんの絵：姿 ${name}`, lookLine),
    gallery('演出　　', 'effect', effectsShort, value => tiles.effects[value], name => `クロードくんの絵：${LOOK_NAME[now.workLook]}・演出 ${name}`, effectLine),
    row('ドット　', 'dots', DOTS_BUTTONS),
  ]
}

/**
 * 入力欄の上のカード：見出し → タブのボタン → 光の帯（ターミナルは線の文字）→ タブの名前の帯 → タブの中身 → 保存先 → ボタン。
 * 🎨 背景のタブは今までのカードの中身（状態の行・背景色・時間帯・オフにする・明るさの案内）を、今までと同じ場所に描く。
 * 🐾 クロードくんの見た目のタブは、姿・演出の小さな止まった絵の一覧（絵の下の端にボタンを重ねる）と、ドットの行。保存先と「保存して閉じる」「保存先の設定を消す」は両方のタブで共通。
 * 押すと保存せずにすぐ見た目を変える（続けて試せる）。「保存して閉じる」で保存先に背景とクロードくんをまとめて保存し、
 * 「閉じる」で保存してある見た目に戻す。
 * デスクトップのボタンはラベルの文字だけを描き、行は折り返さないので、ラベルは短くし、✓ もラベルに入れる。
 * 選んだタブのボタンは primary で、どの画面でもラベルの終わりに ✓（光の帯の位置の見当も、この ✓ の幅を入れて決める）。
 */
function cardView($: EngineInterface, parts: CardParts, now: RjCard, art: CardArt | undefined, clawdNowCard: ClawdCard | undefined) {
  const { Box, Text, Button } = parts
  const draft = now.draft ?? draftOf(DEFAULT_CHOICE, 'default')
  const tab: Tab = isTab(now.tab) ? now.tab : 'room'
  const from: Tab = isTab(now.tabFrom) ? now.tabFrom : tab
  const pick = pickWith($)
  const inRoom = tab === 'room'
  const off = mark(draft.theme === 'なし', 'オフにする')
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} gap="sm">
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text bold>Rainy window JP</Text>
        <Button key="rj-close" label="閉じる" role="dismiss" onPress={() => safely($, () => closeCard($))}>
          閉じる
        </Button>
      </Box>
      <Box flexDirection="row" gap={1}>
        {TABS.map(t => {
          const word = tabButtonLabel(t, t === tab)
          return (
            <Button key={`rj-tab-${t}`} label={word} {...(t === tab ? { variant: 'primary' as const } : {})} onPress={() => safely($, () => pickTab($, t))}>
              {word}
            </Button>
          )
        })}
      </Box>
      {art === undefined ? (
        <Text dimColor>{tabRuleText(tab)}</Text>
      ) : (
        <art.Svg source={tabStripSvg(from, tab, art.width)} alt={`選んでいるタブ：${TAB_LABEL[tab]}`} width={art.width} height={STRIP_H} />
      )}
      {art === undefined ? null : <art.Svg source={tabTitleSvg(tab, art.width)} alt={TAB_LABEL[tab]} width={art.width} height={TITLE_H} />}
      {inRoom ? roomRows($, parts, now, draft) : clawdRows($, parts, draft, art, clawdNowCard)}
      <Box flexDirection="row" gap={1}>
        <Text>保存先　</Text>
        {SCOPE_BUTTONS.map(scope => {
          const word = mark(draft.scope === scope, SCOPE_LABEL[scope])
          return (
            <Button key={`rj-scope-${scope}`} label={word} onPress={pick({ scope })}>
              {word}
            </Button>
          )
        })}
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="rj-save" label="保存して閉じる" variant="primary" onPress={() => safely($, () => saveDraft($))}>
          保存して閉じる
        </Button>
        <Button key="rj-clear" label="保存先の設定を消す" onPress={() => safely($, () => clearDraftScope($))}>
          保存先の設定を消す
        </Button>
        {inRoom ? (
          <Button key="rj-off" label={off} onPress={pick({ theme: 'なし' })}>
            {off}
          </Button>
        ) : null}
      </Box>
      {inRoom ? <Text dimColor>{APPEARANCE_HINT}</Text> : null}
    </Box>
  )
}

export const register: Register = on => {
  // Neither a reload of this mod nor --resume keeps a theme, so set it here.
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Rainy window JP：/rj で背景色のカードを開け閉め。/rj 緑 自動 p のように打っても選べます（p＝このフォルダ、s＝この会話だけ）',
      })
    } catch (error) {
      $.ui.toast(`rainy-window-jp: /${COMMAND} が使えません（${messageOf(error)}）`)
    }
    // モデルの見張り：アプリのメニューでモデルを変えると、クロードくんの姿（自動のとき）を変える。変化はデバッグの記録にも残す。
    // 前の見張りと待たせた書き込みの時計は止める（止められなくても、下のテーマを付ける処理は続ける）。
    cancelQuietly(stopModelWatch)
    stopModelWatch = undefined
    cancelQuietly(pendingPublish?.timer)
    pendingPublish = undefined
    lastPublishAt = -Infinity
    // クロードくん：前の読み込みの機械・時計・列は使わない。
    machineLane.tail = Promise.resolve()
    countLane.tail = Promise.resolve()
    publishLane.tail = Promise.resolve()
    lastClawdSeen = undefined
    puffsSpent = false
    // 会話の始めのモデル（見張りの最初の値にもする）。読めなければ ''（見張りが読めたときに姿を合わせる）。
    const firstModel = await tryOr(() => $.session.model())
    startModel = typeof firstModel === 'string' ? firstModel : ''
    let lastModel: string | undefined = typeof firstModel === 'string' ? firstModel : undefined
    let failed = false
    // 時計が使えなくても、テーマを付ける処理は止めない。
    try {
      stopModelWatch = $.clock.every(1500, () => {
        // 見張りの失敗は会話に出さない。デバッグの記録に、失敗が始まったときの1回だけ残す。
        void (async () => {
          try {
            const model = await $.session.model()
            failed = false
            if (model === lastModel) return
            if (lastModel !== undefined) {
              $.ui.log(`rainy-window-jp: model ${lastModel} -> ${model}`, { to: 'debug' })
            }
            await publishClawd($, was => ({ ...was, model }))
            lastModel = model
          } catch (error) {
            if (failed) return
            failed = true
            try {
              $.ui.log(`rainy-window-jp: model watch failed (${messageOf(error)})`, { to: 'debug' })
            } catch {
              // 記録できなくても続ける。
            }
          }
        })()
      })
    } catch {
      // 見張りを始められなくても続ける。
    }
    // クロードくんを待つに戻し、サブエージェントを数え、保存してある設定を置く（失敗はデバッグの記録だけ）。
    try {
      await resetClawd($, true)
    } catch (err) {
      clawdTrouble($, 'start', err)
    }
    // A look left showing by an earlier load is not shown in this one.
    isPreviewing = false
    await safely($, async () => {
      await updateCard($, was => ({ ...was, previewing: false }))
    })
    await safely($, async () => {
      await follow($, true)
    })
    return next(e)
  })

  // セッションが終わったら、クロードくんの時計を止める。
  // /clear と resume は、同じ窓（同じ読み込み）で別の会話として続き、session.start は来ない：クロードくんを待つに
  // 戻して数え直し（待っている書き込みは捨てずに重ねる）、モデルの見張りは続ける。
  on('session.end', async ($, e, next) => {
    const goesOn = e.reason === 'clear' || e.reason === 'resume'
    // 時計は止められなくても続ける（next を飛ばさない）。
    cancelQuietly(tickTimer)
    tickTimer = undefined
    machine = undefined
    if (goesOn) {
      soon($, e.reason, () => resetClawd($, false))
    } else {
      cancelQuietly(pendingPublish?.timer)
      pendingPublish = undefined
      cancelQuietly(stopModelWatch)
      stopModelWatch = undefined
    }
    return next(e)
  })

  // メッセージを送るたびに、時間帯が変わったか・ほかの会話が設定を変えたかを見て、変わっていれば付け直す。
  // カードで試している途中は、見ている見た目を勝手に戻さない。何があっても、メッセージはそのまま送る。
  on('prompt.submit', async ($, e, next) => {
    if (!isPreviewing) {
      await safely($, async () => {
        await follow($, false)
      })
    }
    return next(e)
  })

  // メインの turn が始まった（メッセージを送った）：「！」。/rj のようなコマンドでは Claude が考え始めないので、
  // prompt.submit ではなくこちらを使う。子（agentId 付き）の turn は、サブエージェントを数え直すだけ（終わったと
  // 覚えていた子なら、また動きだしたので忘れる）。どちらも待たない。
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) soon($, 'submit', () => fire($, 'submit'))
    else {
      const child = e.agentId
      soon($, 'count', () => recountAgents($, { started: child }))
    }
    return next(e)
  })

  // 返事の流れ：下から1つずつかけらを取り出し、そのまま・順番どおりに必ず yield してから次へ。
  // 下が終わったら、その結果をそのまま返す。見張り（メインだけ）は読むだけで待たず、失敗しても流れは止めない。
  on('turn.step', async function* ($, e, next) {
    const it = next(e)[Symbol.asyncIterator]()
    const watch = e.agentId === undefined ? stepWatcher($, e) : undefined
    let finished = false
    try {
      for (;;) {
        const got = await it.next()
        if (got.done === true) {
          finished = true
          return got.value
        }
        watch?.(got.value)
        yield got.value
      }
    } finally {
      // 上が途中で読むのをやめた（止めた・失敗した）ときは、下の流れも閉じる。
      if (!finished) await closeQuietly(it)
    }
  })

  // メインのツール：道具（next の前に送る。待たない）。子のツールは見ない。
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) soon($, 'tool', () => fire($, 'tool'))
    return next(e)
  })

  // 返事が終わった：やった（止めたときは、すぐ待つ）。子の turn の終わりは、その子を終わった子として覚えて
  // 数え直す（一覧が遅れて、まだ running と言う間も数えない）。メインの終わりでも数え直す（一覧が遅れていた子が残らないように）。
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const ev: ClawdEvent = e.isAborted ? 'abort' : 'complete'
      soon($, ev, () => fire($, ev))
      soon($, 'count', () => recountAgents($))
    } else {
      const child = e.agentId
      soon($, 'count', () => recountAgents($, { ended: child }))
    }
    return next(e)
  })

  // サブエージェントが動きだした：起動のあとで数え直す（待たない）。
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    soon($, 'count', () => recountAgents($))
    return started
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    try {
      return { text: await runCommand($, e.args) }
    } catch (error) {
      return { text: `うまくいきませんでした（${messageOf(error)}）。設定は変えていません。` }
    }
  })

  // The scene itself. This hook hears every mod's backdrop, and another mod
  // could use the same scene name, so it draws only its own: the name says
  // which room color and time of day to draw.
  // クロードくんの atom（とカード）が変わると、アプリがこの1枚を描き直す（クロードくんの atom に書くのは、多くても
  // 2秒に1回：publishClawd）。同じ絵を返すときと作り直すときは drawingFor を見る。
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.plugin !== $.plugin.name) return next(e)
    const look = sceneLookOf(e.props.scene)
    if (look === undefined) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    // 1枚の Svg（部屋にクロードくんを入れた絵）。クロードくんの atom（とカード）が変わると、その1枚が描き直される。
    return Svg({ source: await sceneNow($, e.props.scene as string, look), alt: SCENE_ALT })
  })

  // The card stands above the prompt, so it stays in view as the conversation
  // scrolls. A survey that holds the band goes first.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const now = await read($, card)
    if (!now.isOpen) return next(e)
    // Svg（光の帯・タブの名前の帯・見た目のタブの小さな絵）は、デスクトップとスマホだけ。ターミナルは ✓ と線の文字とボタン。
    const art = e.surface === 'desktop' || e.surface === 'mobile' ? { Svg: $.ui.resolve(e).Svg, width: ART_WIDTH[e.surface] } : undefined
    // クロードくんの atom を読むのは見た目のタブのときだけ（背景のタブは、クロードくんが動いても描き直さない）。
    const clawdCard = now.tab === 'clawd' ? await clawdCardNow($, now, art !== undefined) : undefined
    return cardView($, $.ui.resolve(e), now, art, clawdCard)
  })
}
