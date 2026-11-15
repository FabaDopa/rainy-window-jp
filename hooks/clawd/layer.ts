// クロードくんの層：部屋の SVG の右下に重ねる、クロードくんの絵。
// 姿（モデル）× 状態 × effort の台本を絵にして、小物・画面の光・演出・サブエージェントの子を重ねる。純粋な関数だけ。
// 重ね方は承認された見本（tmp-pick/gen の clawd-gen6.ts の scene、clawd-lib.ts の corner、clawd-gen2.ts の m-E）と同じ。
// 部屋の SVG の中に入れるとき（1枚の Svg）は layerBody、単独の SVG（テスト・写真）は layerSvg で包む。
// カードのクロードくんのタブの止まった絵（tiles.ts）は、clawdInnerOf で組み立てた中身を止めて切り出す。

import type { RoomColors } from '../lib/palette'
import { clawdFineMasks, clawdMasks, cornerInner, styleOf } from '../scene'
import { EYE } from './body'
import { at, still, YOU, type Frame } from './pose'
import { paintBig, paintBigFine, paintMini, paintMiniBack, paintMiniBackFine, paintMiniFine } from './paint'
import { buildSprite, FPS, ticks, type Sprite } from './sheet'
import { HAIKU_X, scriptsFor, subagentScript, type Level, type Look, type Phase } from './scripts'
import { effectFor, fxPainter, shakeAnim, type FX, type Glow } from './fx'

/** 層の大きさ（CSS px）。右下に置き、部屋の corner と同じ場所に重なる。 */
export const LAYER_W = 520
export const LAYER_H = 360

// 部屋の corner は、右下から translate(-244 -47) scale(6) したあとに translate(0 -H) する（H＝スプライトの高さ 18）。
// 層の左上は部屋の (W-520, Hroom-360) なので、層の中では x = 520-244 = 276、y = 360-47-6*18 = 205。
// translate(0 -H) はこの 205 に含めたので、legacyInner() は corner の中身をそのまま返せばよい。
// 層の中で、クロードくんの絵のマス（0, 0）がある場所と、1マスの大きさ（CSS px）。tiles.ts も机の高さをこれで決める。
export const LAYER_ORIGIN = { x: 276, y: 205, scale: 6 } as const
const ORIGIN = `translate(${LAYER_ORIGIN.x} ${LAYER_ORIGIN.y}) scale(${LAYER_ORIGIN.scale})`

/**
 * 部屋の SVG の中に置く層の中身。部屋の <defs>（c0 c2 c3 のマスク）と <style> をそのまま使うので、
 * 足りないもの（細かいドット fm0 fm2 fm3）だけを <defs> に入れる。同じ id を二重に作らない。
 */
export function layerBody(inner: string, o: { fine: boolean }): string {
  return `${o.fine ? `<defs>${clawdFineMasks()}</defs>` : ''}<g transform="${ORIGIN}">${inner}</g>`
}

/** 単独の層の SVG（テストや画面の写真に使う）。style と c のマスクと layerBody。 */
export function layerSvg(inner: string, o: { fine: boolean; room?: RoomColors }): string {
  const defs = clawdMasks() + (o.fine ? clawdFineMasks() : '')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LAYER_W}" height="${LAYER_H}">` +
    `<style>${styleOf(o.room)}</style><defs>${defs}</defs>` +
    `<g transform="${ORIGIN}">${inner}</g></svg>`
  )
}

/** 今までの corner の中身：光・体・ノートパソコン・マグ・湯気。 */
export function legacyInner(): string {
  return cornerInner()
}

// ---- クロードくんの層を組み立てる ----------------------------------------------------------

/** いまのクロードくんの様子。register.tsx が設定と Claude の状態から決めて渡す。 */
export type ClawdView = {
  look: Look // 姿（モデル）
  phase: Phase // 状態（待つ・！・考え中・道具・書く・やった・手をふる）
  effect: Level // 演出の段階（0＝なし … 4＝max）
  tempo: Level // 動きの速さの段階
  showEffect: boolean // 演出を見せるか（動いている間と、カードを開いている間）
  dots: 'normal' | 'fine' // ドットの細かさ
  subagents: number // いまいるサブエージェントの子の数
  arrive: number[] // いま来た子の場所（けむりから出てくる）
  leave: number[] // いま帰った子の場所（手をふって、けむりで消える）
}

/** 層の中身（layerBody）の上限。部屋（クロードくん抜き）は最大 65,463 文字なので、131,072 − 65,463 より少し下。 */
export const LAYER_BUDGET = 65_000

/** 1つの Svg の source に入れられる文字数（アプリの決まり）。 */
export const SVG_LIMIT = 131_072

/**
 * 部屋にクロードくんの層を入れた絵を、Svg の上限（limit）に収める最後の手段（この先、部屋の絵が大きくなっても）。
 * make に層を順に渡して作り、収まった最初の絵を返す（ふつうは1回目だけ作る）。どれも収まらなければ、最後に作った絵。
 * register.tsx は、いまの層 → 今までの姿 → 空（部屋だけ）の順に渡す。
 */
export function fitScene(make: (layer: () => string) => string, layers: readonly (() => string)[], limit = SVG_LIMIT): string {
  let made = ''
  for (const layer of layers) {
    made = make(layer)
    if (made.length <= limit) return made
  }
  return made
}

/** サブエージェントの子の場所（大きい子のマスで、小さい子の左上）：机の左・頭の上・マグの上・本体のうしろの2人。 */
export const SUB_SPOTS: [number, number][] = [[-12, 9], [6, -7], [24, 3], [-3, 6], [13, 6]]
/** 本体が Haiku（小さい3人）のとき：3人のうしろの列。2人まで。 */
export const HAIKU_SUB_SPOTS: [number, number][] = [[-3, 6], [9, 6]]

// ---- 机の小物（clawd-lib.ts と同じ形・同じ色） ----
const WHITE = '#F4F1EA'
const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${fill.startsWith('f-') ? `class="${fill}"` : `fill="${fill}"`}/>`
/** ノートパソコン（Sonnet・Fable） */
export const LAPTOP = rect(5, 10, 12, 6, '#8E95A8') + rect(6, 11, 10, 4, '#A3AABC') + rect(10, 12, 2, 2, '#E9ECF4') + rect(3, 16, 16, 1, '#5E6372')
/** 小さい子のノートパソコン（小さい子の左上を 0,0 とする） */
export const MINI_LAPTOP = rect(3, 4, 6, 3, '#8E95A8') + rect(4, 5, 4, 1, '#A3AABC') + rect(1, 7, 9, 1, '#5E6372')
/** 細かいドットの小さい子のノートパソコン：大きい子のものを半分に */
export const MINI_LAPTOP_FINE = `<g transform="translate(-0.5 -0.5) scale(.5)">${LAPTOP}</g>`
/** 譜面台（Opus。ノートパソコンの代わり） */
export const STAND = rect(5, 11, 11, 3, '#3A3340') + rect(6, 11, 9, 2, WHITE) + rect(7, 11, 1, 1, EYE) + rect(10, 12, 1, 1, EYE) + rect(13, 11, 1, 1, EYE) + rect(10, 14, 1, 2, '#3A3340') + rect(7, 16, 7, 1, '#3A3340')
/** 黒板（Fable。うしろの壁） */
export const BOARD =
  rect(-10, -12, 11, 8, '#8A5A3C') + rect(-9, -11, 9, 6, '#2F4A3A') +
  ([[-8, -10], [-7, -10], [-6, -10], [-4, -10], [-3, -10], [-8, -8], [-7, -8], [-5, -8], [-4, -8], [-3, -8], [-2, -8], [-8, -6], [-6, -6], [-5, -6], [-7, -7], [-4, -7]] as [number, number][])
    .map(([x, y]) => rect(x, y, 1, 1, '#EDEBE3')).join('')
// Haiku の机のマグ（大きい姿のマグは絵の中にある）
const MUG = rect(27, 11, 5, 6, 'f-mug') + rect(27, 13, 5, 1, '#F2A25C') + rect(27, 11, 5, 1, '#6B4630') + rect(32, 13, 1, 2, 'f-mug')

// ---- 光・湯気・置き場所 ----
// 細かいドットのときは、点の間隔が半分のマスク（fm0 fm2 fm3）を使う
const mk = (id: string, fine: boolean) => (fine ? id.replace(/^c/, 'fm') : id)
const glowSvg = (g: Glow, fine: boolean) =>
  `<g mask="url(#${mk(g.mask ?? 'c3', fine)})" opacity="${g.base ?? 0.7}">${g.anim ?? ''}<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="${g.color ?? '#8FA8FF'}"/></g>`
// マグの湯気：2つの点がのぼって薄れる。anim はマグを机に置いている間だけ見せる切りかえ（いつも置いていれば空）
const rise = (inner: string, delay: number) => {
  const t = `dur="2s" repeatCount="indefinite"${delay ? ` begin="${delay.toFixed(2)}s"` : ''}`
  return `<g><animateTransform attributeName="transform" type="translate" from="0 0" to="1 -6" ${t}/><animate attributeName="opacity" from="1" to="0" ${t}/>${inner}</g>`
}
const steam = (anim: string) => `<g>${anim}${[0, 1].map(i => rise(rect(29 + i, 9, 1, 1, 'f-puff') + rect(30 - i, 7, 1, 1, 'f-puff'), -i)).join('')}</g>`
const place = (x: number, y: number, inner: string) => `<g transform="translate(${x} ${y})">${inner}</g>`

// ---- サブエージェントの子の出入り（1回だけ再生して、最後の様子のまま止める） ----
const ONCE = 'repeatCount="1" fill="freeze"'
const once = (s: Sprite) => s.body.replaceAll('repeatCount="indefinite"', ONCE)
// from（0 か 1）から、tick コマ目で反対に切りかえて、そのまま
const switchAt = (inner: string, from: 0 | 1, tick: number, total: number) =>
  `<g opacity="${from}"><animate attributeName="opacity" values="${from};${1 - from}" keyTimes="0;${(tick / total).toFixed(4)}" calcMode="discrete" dur="${(total / FPS).toFixed(4)}s" ${ONCE}/>${inner}</g>`
const lenOf = (s: Frame[]) => s.reduce((n, [, secs]) => n + ticks(secs), 0)
const puff = (k: 'puff1' | 'puff2'): Frame => [at({ hidden: true, over: [k] }), 0.17]
const gone: Frame = [at({ hidden: true }), 1 / FPS]
// 来た：けむり2コマ → こちらを見てにっこり → （打つ子に切りかわる）。clawd-gen2.ts の m-E の life と同じ
const ARRIVE: Frame[] = [puff('puff1'), puff('puff2'), still({ look: YOU, eyes: 'happy', mouth: 'smile' }, 0.4), gone]
const ARRIVE_LAPTOP = lenOf(ARRIVE.slice(0, 2)) // けむりが消えたらノートパソコンが出る
const ARRIVE_TYPE = lenOf(ARRIVE.slice(0, 3)) // にっこりのあと打ちはじめる
// 帰る：手をふって → けむり2コマ → 消える（ノートパソコンはけむりと一緒に消える）
const waving = (front: 'up' | 'wave'): Frame => [at({ look: YOU, eyes: 'happy', mouth: 'grin', front }), 0.25]
const LEAVE: Frame[] = [waving('up'), waving('wave'), waving('up'), waving('wave'), puff('puff2'), puff('puff1'), gone]
const LEAVE_LAPTOP = lenOf(LEAVE.slice(0, 4))

type Kids = { back: string; front: string; laptops: string }
// サブエージェントの子（演出も赤い目も付けない）。back は本体のうしろ（ノートパソコンごと）、front は本体の前、laptops は机の小物の前
function children(v: ClawdView, fine: boolean): Kids {
  const haiku = v.look === 'haiku'
  const spots = haiku ? HAIKU_SUB_SPOTS : SUB_SPOTS
  const n = Math.max(0, Math.min(spots.length, Math.floor(v.subagents) || 0))
  const lap = fine ? MINI_LAPTOP_FINE : MINI_LAPTOP
  const kids: Kids = { back: '', front: '', laptops: '' }
  spots.forEach(([x, y], k) => {
    // 4・5人目と、Haiku のうしろの列は、体を一段暗く
    const behind = haiku || k >= 3
    const paint = behind ? (fine ? paintMiniBackFine : paintMiniBack) : fine ? paintMiniFine : paintMini
    let kid: string
    let laptop: string
    if (k < n) {
      const typing = buildSprite(subagentScript(k), paint).body
      if (v.arrive.includes(k)) {
        const total = lenOf(ARRIVE)
        kid = once(buildSprite(ARRIVE, paint)) + switchAt(typing, 0, ARRIVE_TYPE, total)
        laptop = switchAt(lap, 0, ARRIVE_LAPTOP, total)
      } else {
        kid = typing
        laptop = lap
      }
    } else if (v.leave.includes(k)) {
      kid = once(buildSprite(LEAVE, paint))
      laptop = switchAt(lap, 1, LEAVE_LAPTOP, lenOf(LEAVE))
    } else return
    if (behind) kids.back += place(x, y, kid + laptop)
    else {
      kids.front += place(x, y, kid)
      kids.laptops += place(x, y, laptop)
    }
  })
  return kids
}

const NONE: FX = { back: '', front: '', glows: [], shake: 0 }

// 本体のスプライト（Haiku は3人）。演出の赤い目は fxPainter で（目の色は full と lite で同じ）。
// scripts は本体の台本（ふつうは姿・状態・速さの台本。カードの小さな絵は、最初のコマを差しかえたもの）
function mainSprites(v: ClawdView, fx: FX, fine: boolean, scripts: Frame[][] = scriptsFor(v.look, v.phase, v.tempo)): Sprite[] {
  const haiku = v.look === 'haiku'
  const base = haiku ? (fine ? paintMiniFine : paintMini) : fine ? paintBigFine : paintBig
  const painter = fxPainter(base, haiku ? 'mini' : 'big', fx, fine)
  return scripts.map(s => buildSprite(s, painter))
}

// 重ねる：光 → （揺れる組：演出のうしろ・うしろの子・本体・前の子・机の小物・子のノートパソコン・演出の前）→ 湯気
function assemble(v: ClawdView, main: Sprite[], kids: Kids, fx: FX, fine: boolean): string {
  const glows: Glow[] = [...fx.glows]
  let back = fx.back
  let actors: string
  let props: string
  let steamAnim = ''
  if (v.look === 'haiku') {
    const lap = fine ? MINI_LAPTOP_FINE : MINI_LAPTOP
    actors = main.map((b, i) => place(HAIKU_X[i] ?? 0, 9, b.body + b.extra)).join('')
    props = HAIKU_X.map(x => place(x, 9, lap)).join('') + MUG
    glows.push(...HAIKU_X.map(x => ({ cx: x + 6, cy: 11, r: 4.5, base: 0.55, color: fx.screen })))
  } else {
    const b = main[0]
    actors = b ? b.body + b.extra : ''
    if (v.look === 'fable') back = BOARD + back
    props = v.look === 'opus' ? STAND : LAPTOP
    const glow: Glow = { cx: 10.5, cy: 7, r: 9, anim: b?.glowAnim ?? '', color: fx.screen }
    // Opus は譜面台なので画面の光は無し（演出が画面の色を決めたときだけ、譜面台を照らす）
    if (v.look !== 'opus') glows.push(glow)
    else if (fx.screen) glows.push({ ...glow, cx: 10.5, cy: 10, r: 6 })
    steamAnim = b?.steamAnim ?? ''
  }
  return (
    glows.map(g => glowSvg(g, fine)).join('') +
    `<g mask="url(#${mk('c0', fine)})"><g>${shakeAnim(fx.shake)}${back}${kids.back}${actors}${kids.front}${props}${kids.laptops}${fx.front}</g>${steam(steamAnim)}</g>`
  )
}

/**
 * 層の中身（layerBody の中に入るもの。<style> と c のマスクは含まない）。
 * 演出はまず全部で作り、layerBody が budget を超えるなら軽い版（lite）、それでも超えるなら演出なしにする（設計書 §4.6）。
 */
export function clawdLayerInner(v: ClawdView, budget = LAYER_BUDGET): string {
  const fine = v.dots === 'fine'
  const kids = children(v, fine)
  if (v.showEffect && v.effect > 0) {
    const fits = (inner: string) => layerBody(inner, { fine }).length <= budget
    const full = effectFor(v.effect, v.look, fine)
    const main = mainSprites(v, full, fine)
    const a = assemble(v, main, kids, full, fine)
    if (fits(a)) return a
    const b = assemble(v, main, kids, effectFor(v.effect, v.look, fine, true), fine)
    if (fits(b)) return b
  }
  return assemble(v, mainSprites(v, NONE, fine), kids, NONE, fine)
}

/** 部屋の SVG に入れる層（sceneSvg の layer に渡す）。 */
export function clawdLayerBody(v: ClawdView, budget = LAYER_BUDGET): string {
  return layerBody(clawdLayerInner(v, budget), { fine: v.dots === 'fine' })
}

/** 単独の層の SVG（横 520・縦 360）。テスト・見えないブラウザの写真に使う。 */
export function clawdLayerSvg(v: ClawdView, room?: RoomColors): string {
  return layerSvg(clawdLayerInner(v), { fine: v.dots === 'fine', room })
}

/**
 * 台本を渡して組み立てた層の中身（カードのクロードくんのタブの止まった絵 tiles.ts が、止めて切り出す）。
 * 重ね方・小物・光・演出・子は clawdLayerInner と同じ。scripts は本体の台本（Haiku は3人ぶん）。
 * 演出は全部の版（大きさで軽くしない：止めた絵は、最初のコマのほかを落とすので小さい）。
 */
export function clawdInnerOf(v: ClawdView, scripts: Frame[][]): string {
  const fine = v.dots === 'fine'
  const fx = v.showEffect && v.effect > 0 ? effectFor(v.effect, v.look, fine) : NONE
  return assemble(v, mainSprites(v, fx, fine, scripts), children(v, fine), fx, fine)
}
