// /rj のカードの「🐾 クロードくんの見た目」のタブに並べる、小さな止まった絵（タイル）。純粋な関数だけ。
// 絵は、部屋のクロードくんの層と同じ組み立て（layer.ts の clawdInnerOf）を、文書の時刻 0 の姿で止めて（freezeSvg）、
// クロードくんのまわりだけを切り出したもの。SMIL は1つも残さない。
// なぜ止めるか：入力欄の上の帯は、スクロールのたびに Svg を出し直す。動く絵は出し直すたびに最初から動き直す
// （前の大きな見本は、出だしのポンで大きくなったり小さくなったりをくり返して見えた）。止まった絵なら、何度出し直しても同じ。

import type { ClawdEffect, ClawdLook, Dots } from '../lib/clawd-choice'
import type { RoomColors } from '../lib/palette'
import { clawdFineMasks, clawdMasks, styleOf } from '../scene'
import { LAYER_H, LAYER_ORIGIN, clawdInnerOf } from './layer'
import type { ClawdView } from './layer'
import { YOU } from './pose'
import type { Frame } from './pose'
import { scriptsFor } from './scripts'
import type { Level, Look } from './scripts'

// ---- SVG を止める ---------------------------------------------------------------------------

type El = { tag: string; attrs: [string, string][]; kids: Node[] }
type Node = El | string

const ANIMS = new Set(['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set'])
const isAnim = (n: Node): n is El => typeof n !== 'string' && ANIMS.has(n.tag)
const attrOf = (el: El, name: string): string | undefined => el.attrs.find(([k]) => k === name)?.[1]
function setAttr(el: El, name: string, value: string): void {
  const at = el.attrs.find(([k]) => k === name)
  if (at !== undefined) at[1] = value
  else el.attrs.push([name, value])
}

// この mod の SVG（引用符は " だけ、属性の値に < も " も無い）を読む。ほかの形の < は文字として残す。
const TAG = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/y
const ATTR = /\s+([\w:-]+)="([^"]*)"/g
function parse(src: string): Node[] {
  const root: El = { tag: '', attrs: [], kids: [] }
  const stack: El[] = [root]
  let text = ''
  const top = () => stack[stack.length - 1] ?? root
  const flush = () => {
    if (text !== '') top().kids.push(text)
    text = ''
  }
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt < 0) {
      text += src.slice(i)
      break
    }
    text += src.slice(i, lt)
    TAG.lastIndex = lt
    const m = TAG.exec(src)
    if (m === null) {
      text += '<'
      i = lt + 1
      continue
    }
    flush()
    const [all, close, tag = '', attrs = '', self] = m
    if (close === '/') {
      // 閉じるタグ：同じ名前の開いたタグまで戻る
      const at = stack.map(e => e.tag).lastIndexOf(tag)
      if (at > 0) stack.length = at
    } else {
      const el: El = { tag, attrs: [...attrs.matchAll(ATTR)].map(a => [a[1] ?? '', a[2] ?? ''] as [string, string]), kids: [] }
      top().kids.push(el)
      if (self !== '/') stack.push(el)
    }
    i = lt + all.length
  }
  flush()
  return root.kids
}

function print(n: Node): string {
  if (typeof n === 'string') return n
  const attrs = n.attrs.map(([k, v]) => ` ${k}="${v}"`).join('')
  const inner = n.kids.map(print).join('')
  return inner === '' ? `<${n.tag}${attrs}/>` : `<${n.tag}${attrs}>${inner}</${n.tag}>`
}

// 時間（"2s" "0.25s" "-1.00s" "300ms" "1.5"）を秒に。読めない（click など）ときは undefined
function seconds(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const m = /^\s*(-?[\d.]+)\s*(ms|s)?\s*$/.exec(v)
  if (m === null) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  return m[2] === 'ms' ? n / 1000 : n
}

// 止めた値の数は、小数2けたまで（クロードくんの絵の 1/100 マスは、小さな絵では 0.02px にも満たない）
const fmt = (x: number) => String(Math.round(x * 100) / 100 || 0)
const nums = (v: string) => v.trim().split(/[\s,]+/).map(Number)
const allNums = (v: string) => nums(v).every(Number.isFinite)

// 2つの値のあいだ（f は 0〜1）。数の並びどうしなら数ごとに、そうでなければ（色など）前の値のまま
function mix(a: string, b: string, f: number): string {
  if (f <= 0) return a.trim()
  const x = nums(a)
  const y = nums(b)
  if (x.length !== y.length || !allNums(a) || !allNums(b)) return a.trim()
  return x.map((n, k) => fmt(n + ((y[k] ?? n) - n) * f)).join(' ')
}

// keySplines の3次ベジェ（x から y を二分法で）
function spline(f: number, spec: string | undefined): number {
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = spec === undefined ? [] : nums(spec)
  const at = (t: number, p1: number, p2: number) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t
  let lo = 0
  let hi = 1
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    if (at(mid, x1, x2) < f) lo = mid
    else hi = mid
  }
  return at((lo + hi) / 2, y1, y2)
}

// 動きの値の並び（values、または from・to・by）。to だけのときは元の値から
function valuesOf(a: El, base: string | undefined): string[] {
  const listed = attrOf(a, 'values')
  if (listed !== undefined) return listed.split(';').map(v => v.trim()).filter(v => v !== '')
  const from = attrOf(a, 'from')
  const to = attrOf(a, 'to')
  const by = attrOf(a, 'by')
  if (to !== undefined) return [from ?? base ?? to, to]
  const start = from ?? base
  if (by !== undefined && start !== undefined && allNums(start) && allNums(by)) return [start, nums(start).map((n, k) => fmt(n + (nums(by)[k] ?? 0))).join(' ')]
  return from !== undefined ? [from] : []
}

/** 動き a の、文書の時刻 t での値。まだ始まっていない・もう終わって元に戻ったときは undefined（元の値のまま）。 */
function valueAt(a: El, t: number, base: string | undefined): string | undefined {
  const begin = seconds(attrOf(a, 'begin') ?? '0')
  if (begin === undefined) return undefined
  const local = t - begin
  if (local < 0) return undefined
  if (a.tag === 'set') return attrOf(a, 'to')
  const values = valuesOf(a, base)
  const first = values[0]
  if (first === undefined) return undefined
  const dur = seconds(attrOf(a, 'dur'))
  if (dur === undefined || dur <= 0 || values.length === 1) return first
  const count = attrOf(a, 'repeatCount')
  const repeatDur = attrOf(a, 'repeatDur')
  let reps = 1
  if (count === 'indefinite' || repeatDur === 'indefinite') reps = Infinity
  else if (count !== undefined) reps = Number(count) > 0 ? Number(count) : 1
  else if (repeatDur !== undefined) reps = (seconds(repeatDur) ?? dur) / dur
  let p: number
  if (local >= dur * reps) {
    // 終わったあと：fill="freeze" なら最後の姿、そうでなければ元の値に戻る
    if (attrOf(a, 'fill') !== 'freeze') return undefined
    const part = reps - Math.floor(reps)
    p = part === 0 ? 1 : part
  } else p = (local % dur) / dur
  const n = values.length
  const keys = attrOf(a, 'keyTimes')?.split(';').map(Number)
  const mode = attrOf(a, 'calcMode') ?? 'linear'
  if (mode === 'discrete') {
    const times = keys?.length === n ? keys : values.map((_, k) => k / n)
    let k = 0
    for (let j = 0; j < n; j++) if ((times[j] ?? 0) <= p) k = j
    return values[k] ?? first
  }
  const times = keys?.length === n ? keys : values.map((_, k) => k / (n - 1))
  if (p >= (times[n - 1] ?? 1)) return values[n - 1] ?? first
  let k = 0
  while (k < n - 2 && p >= (times[k + 1] ?? 1)) k++
  const t0 = times[k] ?? 0
  const t1 = times[k + 1] ?? 1
  let f = t1 > t0 ? (p - t0) / (t1 - t0) : 0
  if (mode === 'spline') f = spline(f, attrOf(a, 'keySplines')?.split(';')[k])
  return mix(values[k] ?? first, values[k + 1] ?? first, f)
}

// 見えない（opacity 0・display none）
function isHidden(el: El): boolean {
  const opacity = attrOf(el, 'opacity')
  if (opacity !== undefined && Number(opacity) <= 0) return true
  if (attrOf(el, 'display') === 'none') return true
  const style = attrOf(el, 'style') ?? ''
  return /(?:^|;)\s*display\s*:\s*none/.test(style) || /(?:^|;)\s*opacity\s*:\s*[0.]+\s*(?:;|$)/.test(style)
}

// 要素の子の動きを、時刻 t の値にして当て、動きを外す。見えなくなったものと、空になった g は落とす
function still(el: El, t: number): El | undefined {
  for (const a of el.kids.filter(isAnim)) {
    // ほかの要素をさす動き（href）と、道すじの動き（animateMotion）は、この mod の絵に無いので外すだけ
    if (attrOf(a, 'href') !== undefined || attrOf(a, 'xlink:href') !== undefined || a.tag === 'animateMotion') continue
    const isTransform = a.tag === 'animateTransform'
    const name = isTransform ? 'transform' : attrOf(a, 'attributeName')
    if (name === undefined) continue
    const base = attrOf(el, name)
    const value = valueAt(a, t, isTransform ? undefined : base)
    if (value === undefined) continue
    const sum = attrOf(a, 'additive') === 'sum'
    if (isTransform) {
      // SMIL のとおり：標準（replace）は元の transform の代わり、sum は元の transform のあとに続ける
      const move = `${attrOf(a, 'type') ?? 'translate'}(${value})`
      setAttr(el, 'transform', sum && base !== undefined && base.trim() !== '' ? `${base} ${move}` : move)
    } else if (sum && base !== undefined && allNums(base) && allNums(value)) {
      setAttr(el, name, nums(base).map((n, k) => fmt(n + (nums(value)[k] ?? 0))).join(' '))
    } else setAttr(el, name, value)
  }
  if (isHidden(el)) return undefined
  const kids: Node[] = []
  for (const kid of el.kids) {
    if (isAnim(kid)) continue
    if (typeof kid === 'string') kids.push(kid)
    else {
      const kept = still(kid, t)
      if (kept !== undefined) kids.push(kept)
    }
  }
  el.kids = kids
  if (el.tag === 'g' && kids.length === 0) return undefined
  return el
}

/**
 * SMIL で動く SVG（またはその一部）を、文書の時刻 0 の姿で止める。
 * animate は、その属性を時刻 0 の値（begin が無ければ values の1つ目、無ければ from）にして外す。無い属性は足す。
 * animateTransform は transform を type（translate・rotate・scale など）の形で置く。元の transform は SMIL のとおり
 * （標準は置きかえ、additive="sum" は元のあとに続ける）。begin が負のもの（もう動いている）は、その分だけ進んだ値、
 * begin が正のもの（まだ始まらない）は元の値。そのあと、見えなくなったもの（opacity 0・display none）を子ごと落とし、
 * 空になった g も落とす。
 */
export function freezeSvg(markup: string): string {
  let out = ''
  for (const n of parse(markup)) {
    if (typeof n === 'string') out += n
    else {
      const kept = still(n, 0)
      if (kept !== undefined) out += print(kept)
    }
  }
  return out
}

// ---- 絵の外に出たものを落とす ---------------------------------------------------------------

/** 長方形（x・y が左上）。 */
type Box = { x0: number; y0: number; x1: number; y1: number }
/** 変換の行列（SVG の matrix(a b c d e f) と同じ並び）。 */
type Mat = [number, number, number, number, number, number]
const ID: Mat = [1, 0, 0, 1, 0, 0]
const times = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

// transform の文字（translate・scale・rotate・matrix の並び）を行列に。読めないもの（skew など）は undefined
function matrixOf(transform: string | undefined): Mat | undefined {
  if (transform === undefined) return ID
  let m = ID
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let rest = transform
  for (const [all, name, args = ''] of transform.matchAll(re)) {
    rest = rest.replace(all, '')
    const v = nums(args)
    if (!v.every(Number.isFinite)) return undefined
    const [p = 0, q, r, s, t, u] = v
    if (name === 'translate') m = times(m, [1, 0, 0, 1, p, q ?? 0])
    else if (name === 'scale') m = times(m, [p, 0, 0, q ?? p, 0, 0])
    else if (name === 'rotate') {
      const a = (p * Math.PI) / 180
      const turn: Mat = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]
      const cx = q ?? 0
      const cy = r ?? 0
      m = times(times(times(m, [1, 0, 0, 1, cx, cy]), turn), [1, 0, 0, 1, -cx, -cy])
    } else if (name === 'matrix' && u !== undefined) m = times(m, [p, q ?? 0, r ?? 0, s ?? 0, t ?? 0, u])
    else return undefined
  }
  return rest.trim() === '' ? m : undefined
}

// 行列で移した長方形を、また軸にそった長方形に
function moved(m: Mat, b: Box): Box {
  const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x = 0, y = 0]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const)
  return { x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) }
}
const meets = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

// path の d の、1つの M から始まる部分の長方形（M L H V Z だけ。ほかの命令があれば undefined）
function pathBox(d: string): Box | undefined {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let cmd = ''
  const xs: number[] = []
  const ys: number[] = []
  const at = (px: number, py: number) => {
    x = px
    y = py
    xs.push(x)
    ys.push(y)
  }
  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i] ?? ''
    if (/[A-Za-z]/.test(tok)) {
      cmd = tok
      i++
      if (cmd === 'Z' || cmd === 'z') {
        at(sx, sy)
        continue
      }
      if (!'MmLlHhVv'.includes(cmd)) return undefined
      continue
    }
    const n = (k: number) => Number(tokens[i + k])
    if (cmd === 'M' || cmd === 'm' || cmd === 'L' || cmd === 'l') {
      const rel = cmd === 'm' || cmd === 'l'
      at(rel ? x + n(0) : n(0), rel ? y + n(1) : n(1))
      if (cmd === 'M' || cmd === 'm') {
        sx = x
        sy = y
        cmd = cmd === 'M' ? 'L' : 'l'
      }
      i += 2
    } else if (cmd === 'H' || cmd === 'h') {
      at(cmd === 'h' ? x + n(0) : n(0), y)
      i++
    } else if (cmd === 'V' || cmd === 'v') {
      at(x, cmd === 'v' ? y + n(0) : n(0))
      i++
    } else return undefined
  }
  if (xs.length === 0 || !xs.every(Number.isFinite) || !ys.every(Number.isFinite)) return undefined
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

const num = (el: El, name: string) => Number(attrOf(el, name) ?? 0)
// 形の長方形（rect・circle・ellipse）。ほかは undefined
function shapeBox(el: El): Box | undefined {
  if (el.tag === 'rect') return { x0: num(el, 'x'), y0: num(el, 'y'), x1: num(el, 'x') + num(el, 'width'), y1: num(el, 'y') + num(el, 'height') }
  if (el.tag === 'circle') return { x0: num(el, 'cx') - num(el, 'r'), y0: num(el, 'cy') - num(el, 'r'), x1: num(el, 'cx') + num(el, 'r'), y1: num(el, 'cy') + num(el, 'r') }
  if (el.tag === 'ellipse') return { x0: num(el, 'cx') - num(el, 'rx'), y0: num(el, 'cy') - num(el, 'ry'), x1: num(el, 'cx') + num(el, 'rx'), y1: num(el, 'cy') + num(el, 'ry') }
  return undefined
}
// 線の太さのぶん、少し広げる（線は stroke-width .9 まで。1マス広げれば足りる）
const grow = (b: Box, k: number): Box => ({ x0: b.x0 - k, y0: b.y0 - k, x1: b.x1 + k, y1: b.y1 + k })
const KEEP = new Set(['defs', 'style', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'clipPath', 'svg', 'text'])

/** これより薄い（重なった opacity をかけ合わせた値）ものは、小さな絵では見えないので落とす。 */
const FAINT = 0.1

function crop(el: El, m: Mat, view: Box, alpha = 1): El | undefined {
  if (KEEP.has(el.tag)) return el
  const own = Number(attrOf(el, 'opacity') ?? 1)
  const seen = alpha * (Number.isFinite(own) ? own : 1)
  if (seen < FAINT) return undefined
  const local = matrixOf(attrOf(el, 'transform'))
  if (local === undefined) return el
  const here = times(m, local)
  const sees = (b: Box) => meets(moved(here, grow(b, 1)), view)
  if (el.tag === 'path') {
    // 1つの M から始まる部分ごとに：絵の外のものだけ落とす（読めない部分は残す）
    const d = attrOf(el, 'd') ?? ''
    const parts = d.split(/(?=M)/).filter(p => p.trim() !== '')
    const kept = parts.filter(p => {
      const b = pathBox(p)
      return b === undefined || sees(b)
    })
    if (kept.length === 0) return undefined
    if (kept.length < parts.length) setAttr(el, 'd', kept.join(''))
    return el
  }
  const box = shapeBox(el)
  if (box !== undefined) return sees(box) ? el : undefined
  if (el.tag !== 'g') return el
  const kids: Node[] = []
  for (const kid of el.kids) {
    if (typeof kid === 'string') kids.push(kid)
    else {
      const kept = crop(kid, here, view, seen)
      if (kept !== undefined) kids.push(kept)
    }
  }
  el.kids = kids
  return kids.length === 0 ? undefined : el
}

const isIdentity = (m: Mat | undefined) => m !== undefined && m.every((v, k) => Math.abs(v - (ID[k] ?? 0)) < 1e-9)

// 数を短く書く（0.5 → .5）
const short = (x: number) => fmt(x).replace(/^(-?)0\./, '$1.')
const RECT = /^M(-?[\d.]+)[ ,](-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h(-?[\d.]+)z$/
type Run = { x: number; y: number; w: number; h: number }
/**
 * path の d が長方形（M x y h w v h h -w z。Px と数字の雨の書き方）だけのとき：同じ横はばで縦につながる長方形を
 * 1つにまとめて、数を短く書く。塗る場所は同じ（同じ向きの長方形を重ねて塗るので、つなぎ目も出ない）。ほかの d は undefined。
 */
function compactD(d: string): string | undefined {
  const runs: Run[] = []
  for (const part of d.split(/(?=M)/)) {
    const m = RECT.exec(part)
    if (m === null) return undefined
    const [x = NaN, y = NaN, w = NaN, h = NaN, back = NaN] = m.slice(1).map(Number)
    if (!(w > 0 && h > 0) || Math.abs(back + w) > 1e-9) return undefined
    runs.push({ x, y, w, h })
  }
  const columns = new Map<string, Run[]>()
  for (const r of runs) {
    const key = `${r.x}|${r.w}`
    const list = columns.get(key) ?? []
    list.push(r)
    columns.set(key, list)
  }
  const merged: Run[] = []
  for (const list of columns.values()) {
    list.sort((a, b) => a.y - b.y)
    let cur: Run | undefined
    for (const r of list) {
      if (cur !== undefined && Math.abs(cur.y + cur.h - r.y) < 1e-9) cur.h += r.h
      else {
        cur = { ...r }
        merged.push(cur)
      }
    }
  }
  merged.sort((a, b) => a.y - b.y || a.x - b.x)
  return merged.map(r => `M${short(r.x)} ${short(r.y)}h${short(r.w)}v${short(r.h)}h${short(-r.w)}z`).join('')
}

// 見た目の変わらない書き直し（文字数を減らす）：何もしない transform と opacity="1" を外す、属性の無い g をほどく、
// 子が1つだけの g（opacity・transform だけ）は子に移す（子1つなら、g の不透明度と子の不透明度は同じ見え方）、
// 平行移動だけの rect は x・y に足しこむ
function tidy(kids: Node[]): Node[] {
  const out: Node[] = []
  for (const kid of kids) {
    if (typeof kid === 'string') {
      out.push(kid)
      continue
    }
    if (KEEP.has(kid.tag)) {
      out.push(kid)
      continue
    }
    kid.kids = tidy(kid.kids)
    if (isIdentity(matrixOf(attrOf(kid, 'transform')))) kid.attrs = kid.attrs.filter(([k]) => k !== 'transform')
    if (Number(attrOf(kid, 'opacity')) === 1) kid.attrs = kid.attrs.filter(([k]) => k !== 'opacity')
    if (kid.tag === 'path') {
      const d = compactD(attrOf(kid, 'd') ?? '')
      if (d !== undefined) setAttr(kid, 'd', d)
    }
    if (kid.tag !== 'g') {
      out.push(kid)
      continue
    }
    if (kid.attrs.length === 0) {
      out.push(...kid.kids)
      continue
    }
    const only = kid.kids.length === 1 ? kid.kids[0] : undefined
    if (only === undefined || typeof only === 'string' || KEEP.has(only.tag) || !kid.attrs.every(([k]) => k === 'opacity' || k === 'transform')) {
      out.push(kid)
      continue
    }
    const move = attrOf(kid, 'transform')
    const fade = attrOf(kid, 'opacity')
    if (fade !== undefined) {
      const own = attrOf(only, 'opacity')
      setAttr(only, 'opacity', own === undefined ? fade : fmt(Number(own) * Number(fade)))
    }
    if (move !== undefined) {
      const own = attrOf(only, 'transform')
      const m = matrixOf(move)
      if (only.tag === 'rect' && own === undefined && m !== undefined && m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) {
        setAttr(only, 'x', fmt(num(only, 'x') + m[4]))
        setAttr(only, 'y', fmt(num(only, 'y') + m[5]))
      } else setAttr(only, 'transform', own === undefined ? move : `${move} ${own}`)
    }
    out.push(only)
  }
  return out
}

/**
 * 止めた絵（freezeSvg のあと）のうち、view（長方形 x・y・w・h、同じ座標）にかからない形と、とても薄いもの
 * （重なった opacity が FAINT 未満）を落とす。path は M から始まる部分ごとに落とす。transform が読めないもの・
 * 形の分からないものは残す。
 * そのあと、見た目の変わらない書き直しで文字数を減らす（tidy）。
 */
export function cropSvg(markup: string, view: { x: number; y: number; w: number; h: number }): string {
  const box: Box = { x0: view.x, y0: view.y, x1: view.x + view.w, y1: view.y + view.h }
  const kept: Node[] = []
  for (const n of parse(markup)) {
    if (typeof n === 'string') kept.push(n)
    else {
      const el = crop(n, ID, box)
      if (el !== undefined) kept.push(el)
    }
  }
  return tidy(kept).map(print).join('')
}

/** 見た目の変わらない書き直し（tidy）だけをする。タイルの中の、ある絵の部分を探すとき（テスト）に、同じ書き直しをして比べる。 */
export function compactSvg(markup: string): string {
  return tidy(parse(markup)).map(print).join('')
}

// ---- 小さな絵（タイル） -----------------------------------------------------------------------

/** タイルの大きさ（CSS px）。カードの Svg にも、この大きさを渡す。いちばん広い行（演出：「自動（いま medium） ✓」と5つ）が約 700px のカードに収まる。 */
export const TILE_W = 80
export const TILE_H = 60
// 切り出す場所（クロードくんの絵のマス）：黒板（左上 -10, -12）からマグの取っ手（右 33）まで、頭の上から机まで。横:縦 = 4:3
const VIEW = { x: -11, y: -14, w: 44, h: 33 }
// 机の天板の上の線：部屋の desk() は下から 64px（層では 360 − 64 = 296）。クロードくんのマスに直す
const DESK_Y = Math.round(((LAYER_H - 64 - LAYER_ORIGIN.y) / LAYER_ORIGIN.scale) * 1000) / 1000
// うしろの壁（部屋の壁の、机の近くの色 --bottom）と、机の天板。絵の1枚1枚が、小さな写真のように見える
const WALL = `<rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" style="fill:var(--bottom)"/>`
const DESK = `<rect x="${VIEW.x}" y="${DESK_Y}" width="${VIEW.w}" height="${Math.round((VIEW.y + VIEW.h - DESK_Y) * 1000) / 1000}" class="f-deskTop"/>`

/**
 * タイルの <style>：部屋の styleOf のうち、絵が使う class の決まりと、その決まり（と絵の style="fill:var(--…)"）が使う
 * 色の変数だけ（styleOf まるごとは1万3千字近くあり、1枚の上限 12,000 字を超える）。色の値は styleOf と同じ
 * （文字色から明るい・暗いを決める）。
 */
function tileStyle(art: string, room?: RoomColors): string {
  const full = styleOf(room)
  const head = /^svg\{([^}]*)\}/.exec(full)
  const decls = head?.[1]?.split(';') ?? []
  const rest = full.slice(head?.[0].length ?? 0)
  const used = new Set([...art.matchAll(/class="([^"]+)"/g)].flatMap(m => (m[1] ?? '').split(/\s+/)))
  const rules = (rest.match(/\.[A-Za-z]-[A-Za-z0-9]+\{[^}]*\}/g) ?? []).filter(r => used.has(r.slice(1, r.indexOf('{'))))
  const vars = new Set([...(rules.join('') + art).matchAll(/var\(--([A-Za-z0-9]+)\)/g)].map(m => m[1]))
  const kept = decls.filter(d => vars.has(d.slice(2, d.indexOf(':'))))
  return `svg{${kept.join(';')}}${rules.join('')}`
}

// 点のマスク（部屋の clawdMasks・clawdFineMasks の、絵が使うものだけ）
function masksFor(art: string, fine: boolean): string {
  const all = fine ? clawdFineMasks() : clawdMasks()
  const used = new Set([...art.matchAll(/mask="url\(#([^)]+)\)"/g)].map(m => m[1]))
  return (all.match(/<pattern [^>]*>.*?<\/pattern><mask id="[^"]+"[^>]*>.*?<\/mask>/g) ?? []).filter(pair => used.has(/<mask id="([^"]+)"/.exec(pair)?.[1])).join('')
}

// 層の中身を止めて、絵の外に出たものを落とし、壁と机の上に置いて、まわりを切り出す
function tileOf(inner: string, fine: boolean, room?: RoomColors): string {
  const art = WALL + DESK + cropSvg(freezeSvg(inner), VIEW)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}">` +
    `<style>${tileStyle(art, room)}</style><defs>${masksFor(art, fine)}</defs>${art}</svg>`
  )
}

// 同じ絵を何度も作らない（カードは描き直すたびにタイルを求める）。入力が同じなら同じ文字列なので、覚えておいて返す
const made = new Map<string, string>()
const MADE_MAX = 96
function remember(key: string, make: () => string): string {
  const kept = made.get(key)
  if (kept !== undefined) return kept
  const svg = make()
  if (made.size >= MADE_MAX) made.clear()
  made.set(key, svg)
  return svg
}

const viewFor = (look: Look, o: Pick<ClawdView, 'phase' | 'effect' | 'tempo' | 'showEffect' | 'dots'>): ClawdView => ({ look, ...o, subagents: 0, arrive: [], leave: [] })

/**
 * 姿のタイル：その姿が落ち着いて机にいるところ（待つの最初のコマを、こちらを見てにっこりにしたもの）。
 * 小物つき（ノートパソコン・小さい3人のノートパソコン・譜面台・黒板）。演出なし。
 */
export function lookTileSvg(look: Look, dots: Dots, room?: RoomColors): string {
  return remember(`look|${look}|${dots}|${JSON.stringify(room ?? null)}`, () => {
    // 最初のコマだけ差しかえる（光の明るさなど、ほかの決まりは台本のまま）
    const calm = (s: Frame[]): Frame[] => s.map(([pose, secs], i) => [i === 0 ? { ...pose, look: YOU, mouth: 'smile' } : pose, secs])
    const v = viewFor(look, { phase: 'wait', effect: 0, tempo: 1, showEffect: false, dots })
    return tileOf(clawdInnerOf(v, scriptsFor(look, 'wait', 1).map(calm)), dots === 'fine', room)
  })
}

/** 演出のタイル：その姿が書いているところ（書くの最初のコマ）に、その演出の最初のコマ。level 0 は演出なし。 */
export function effectTileSvg(look: Look, level: Level, dots: Dots, room?: RoomColors): string {
  return remember(`effect|${look}|${level}|${dots}|${JSON.stringify(room ?? null)}`, () => {
    // 動きの速さは、カードで選んだときと同じ（なし＝ふつうの速さ、medium〜max＝その段階。clawd-choice.ts の viewOf）
    const tempo: Level = level === 0 ? 1 : level
    const v = viewFor(look, { phase: 'write', effect: level, tempo, showEffect: true, dots })
    return tileOf(clawdInnerOf(v, scriptsFor(look, 'write', tempo)), dots === 'fine', room)
  })
}

/** 見た目のタブの全部のタイル：姿の行（自動と4つ）と、演出の行（自動となし〜max）。 */
export type ClawdTiles = { looks: Record<ClawdLook, string>; effects: Record<ClawdEffect, string> }

/**
 * 見た目のタブのタイル。autoLook は今のモデルの姿（姿の「自動」）、look はカードで選んでいる姿（自動なら autoLook）、
 * autoLevel は今の effort の段階（演出の「自動」。分からなければ 0＝なし）。dots・room はカードで選んでいるドットと部屋の色。
 */
export function clawdTiles(o: { autoLook: Look; look: Look; autoLevel: Level; dots: Dots; room?: RoomColors }): ClawdTiles {
  const lookTile = (look: Look) => lookTileSvg(look, o.dots, o.room)
  const effectTile = (level: Level) => effectTileSvg(o.look, level, o.dots, o.room)
  return {
    looks: { auto: lookTile(o.autoLook), sonnet: lookTile('sonnet'), haiku: lookTile('haiku'), opus: lookTile('opus'), fable: lookTile('fable') },
    effects: { auto: effectTile(o.autoLevel), none: effectTile(0), medium: effectTile(1), high: effectTile(2), xhigh: effectTile(3), max: effectTile(4) },
  }
}
