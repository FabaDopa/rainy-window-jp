// effort の演出（none / 数字の雨 / 炎の柱 / 虹色 / くっきり暴走）。純粋な関数だけ。
// 承認された見本（tmp-pick/gen の clawd-fx・fx2・fx3）を、同じ見た目のまま移したもの。座標はクロードくんの絵のマス。
// 乱数は種つき（rnd）で、時刻や Math.random には頼らない：同じ入力なら同じ文字列になる（背景のキャッシュとテストのため）。
import { Px } from './px'
import type { Pose } from './pose'
import type { Look, Level } from './scripts'
import { HAIKU_X } from './scripts'
import { EYE } from './body'

export type Glow = { cx: number; cy: number; r: number; color?: string; base?: number; anim?: string; mask?: string }
export type Target = { x0: number; x1: number; y0: number; y1: number; s: number }
export type FX = { back: string; front: string; glows: Glow[]; shake: number; eyes?: string; screen?: string }
type Pal = { outer: string; mid: string; inner: string }

// モデルごとのオーラの色
export const PAL: Record<Look, Pal> = {
  sonnet: { outer: '#F5A623', mid: '#FFD84D', inner: '#FFF7CC' },
  haiku: { outer: '#1FB57A', mid: '#62E6A6', inner: '#DBFFEC' },
  opus: { outer: '#D92F4C', mid: '#FF7A59', inner: '#FFD6B0' },
  fable: { outer: '#5A47E6', mid: '#9D8CFF', inner: '#E4DEFF' },
}
const NONE = (): FX => ({ back: '', front: '', glows: [], shake: 0 })

// ---- 小さな道具 ----------------------------------------------------------------------
// 種つきの乱数（0 以上 1 未満）
const rnd = (i: number) => {
  let n = Math.imul(i ^ 0x9e3779b9, 2654435761)
  n ^= n >>> 15
  return ((n >>> 0) % 10000) / 10000
}
const dot = (x: number, y: number, c: string, w = 1, h = 1) =>
  `<rect x="${+x.toFixed(2)}" y="${+y.toFixed(2)}" width="${w}" height="${h}" fill="${c}"/>`
const FLOOR = 16
const center = (T: Target[]) => {
  const x0 = Math.min(...T.map(t => t.x0))
  const x1 = Math.max(...T.map(t => t.x1))
  const y0 = Math.min(...T.map(t => t.y0))
  const y1 = Math.max(...T.map(t => t.y1))
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }
}
// 指定の向きへゆっくり動いて（fade なら薄れて）消える。SMIL だけ
const drift = (inner: string, dx: number, dy: number, dur: number, delay = 0, fade = false) => {
  const t = `dur="${dur}s" repeatCount="indefinite"${delay ? ` begin="${delay.toFixed(2)}s"` : ''}`
  return `<g><animateTransform attributeName="transform" type="translate" from="0 0" to="${dx} ${dy}" ${t}/>${fade ? `<animate attributeName="opacity" from="1" to="0" ${t}/>` : ''}${inner}</g>`
}

// コマ送り（1秒12コマ）：frames を順に1つずつ見せる
function flick(frames: string[], step = 1 / 12): string {
  const n = frames.length
  const dur = (n * step).toFixed(4)
  return frames
    .map((f, i) => {
      if (!f) return ''
      const vals = i === 0 ? '1;0' : i === n - 1 ? '0;1' : '0;1;0'
      const keys = i === 0 ? `0;${(1 / n).toFixed(4)}` : i === n - 1 ? `0;${(i / n).toFixed(4)}` : `0;${(i / n).toFixed(4)};${((i + 1) / n).toFixed(4)}`
      return `<g opacity="${i === 0 ? 1 : 0}"><animate attributeName="opacity" values="${vals}" keyTimes="${keys}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>${f}</g>`
    })
    .join('')
}
const pulse = (cx: number, cy: number, r: number, color: string, base: number, dur: number, mask = 'c2'): Glow => ({
  cx, cy, r, color, base, mask,
  anim: `<animate attributeName="opacity" values="${(base * 0.45).toFixed(2)};${base};${(base * 0.45).toFixed(2)}" dur="${dur}s" repeatCount="indefinite"/>`,
})
export const shakeAnim = (a: number) =>
  a ? `<animateTransform attributeName="transform" type="translate" values="0 0;${a} 0;0 ${-a / 2};${-a} 0;0 ${a / 2};${a / 2} 0" calcMode="discrete" dur="${a >= 1 ? 0.5 : 0.75}s" repeatCount="indefinite"/>` : ''

// ---- 炎のオーラ ----------------------------------------------------------------------
function flameFrames(T: Target[], m: number, amp: number, pal: Pal, n = 4): string[] {
  return Array.from({ length: n }, (_, f) => {
    const px = new Px()
    for (const t of T) {
      const layer = (mm: number, a: number, c: string, seed: number) => {
        for (let x = Math.floor(t.x0 - mm); x <= Math.ceil(t.x1 + mm); x++) {
          const side = x < t.x0 || x > t.x1
          const wave = Math.abs(Math.sin(x * 0.85 + f * 1.9 + rnd(x * 7 + seed + f * 3) * 4))
          let h = mm + Math.round(a * (0.3 + 0.7 * wave))
          if (side) h = Math.round(h * 0.55)
          for (let y = Math.floor(t.y0 - h); y <= FLOOR; y++) px.put(x, y, c)
        }
      }
      const s = t.s
      const M = Math.max(1, Math.round(m * s))
      const A = Math.round(amp * s)
      layer(M, A, pal.outer, 1)
      layer(Math.max(0, M - 1), Math.round(A * 0.65), pal.mid, 2)
      if (M >= 2) layer(Math.max(0, M - 2), Math.round(A * 0.35), pal.inner, 3)
    }
    return px.svg()
  })
}
// 炎の背景。lite は 4 コマ → 2 コマ（1コマの長さを倍にして、揺れる速さは同じ）
const flameBack = (T: Target[], m: number, amp: number, pal: Pal, lite: boolean) =>
  lite ? flick(flameFrames(T, m, amp, pal, 2), 1 / 6) : flick(flameFrames(T, m, amp, pal))
// 上へのぼる粒
function rising(T: Target[], n: number, colors: string[], speed: number, seed: number, reach = 10): string {
  let o = ''
  for (const [ti, t] of T.entries())
    for (let i = 0; i < n; i++) {
      const k = seed + ti * 100 + i
      const x = Math.round(t.x0 - 2 + rnd(k) * (t.x1 - t.x0 + 4))
      const y = Math.round(t.y1 - rnd(k + 50) * (t.y1 - t.y0))
      o += drift(dot(x, y, colors[i % colors.length]!), (rnd(k + 70) - 0.5) * 2, -(reach * t.s + rnd(k + 90) * reach * t.s), speed * (0.7 + rnd(k + 30) * 0.6), -rnd(k + 10) * speed, true)
    }
  return o
}
// 炎の柱。見本では L = 0〜4 を取れたが、mod で使うのは high（L = 4）だけ
function flameFx(L: number, look: Look, T: Target[], lite = false): FX {
  if (L === 0) return NONE()
  const pal = PAL[look]
  const m = [0, 1, 2, 2, 3][L]!
  const amp = [0, 1, 3, 5, 10][L]!
  const c = center(T)
  return {
    back: flameBack(T, m, amp, pal, lite),
    front: L >= 2 ? rising(T, lite ? [0, 0, 2, 3, 6][L]! : [0, 0, 3, 6, 12][L]!, [pal.inner, pal.mid, '#FFFFFF'], [0, 0, 1.6, 1.2, 0.8][L]!, 11, 6 + amp) : '',
    glows: L >= 3 ? [pulse(c.cx, c.cy, c.w * 0.7 + amp, pal.mid, L === 4 ? 0.75 : 0.5, L === 4 ? 0.8 : 1.4)] : [],
    shake: L === 4 ? 1 : 0,
  }
}

// ---- 虹色の超覚醒（xhigh） ------------------------------------------------------------
const RAINBOW = ['#FF4D4D', '#FF9F1A', '#FFE14D', '#4DE07A', '#4DC9FF', '#6B6BFF', '#C25BFF']
function rainbow(T: Target[], lite = false): FX {
  const token: Pal = { outer: '#000001', mid: '#000002', inner: '#000003' }
  const anim = (shift: number, dur: number) => {
    const vals = RAINBOW.map((_, i) => RAINBOW[(i + shift) % RAINBOW.length]).join(';')
    return `<animate attributeName="fill" values="${vals}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`
  }
  // 炎の色の目印（#000001〜3）を、色が移り変わる path に置きかえる
  const flames = (lite ? flick(flameFrames(T, 3, 12, token, 2), 1 / 6) : flick(flameFrames(T, 3, 12, token)))
    .replace(/<path fill="#000001" d="([^"]*)"\/>/g, (_, d) => `<path fill="${RAINBOW[0]}" d="${d}">${anim(0, 1.2)}</path>`)
    .replace(/<path fill="#000002" d="([^"]*)"\/>/g, (_, d) => `<path fill="${RAINBOW[2]}" d="${d}">${anim(2, 1.2)}</path>`)
    .replace(/<path fill="#000003" d="([^"]*)"\/>/g, (_, d) => `<path fill="#FFFFFF" d="${d}"/>`)
  const c = center(T)
  let rays = ''
  const nRays = lite ? 7 : 14
  for (let i = 0; i < nRays; i++) {
    const a = (i / nRays) * Math.PI * 2
    rays += `<path d="M${(c.cx + Math.cos(a) * 9).toFixed(1)} ${(c.cy + Math.sin(a) * 7).toFixed(1)}L${(c.cx + Math.cos(a) * 38).toFixed(1)} ${(c.cy + Math.sin(a) * 30).toFixed(1)}" stroke="${RAINBOW[(lite ? i * 2 : i) % 7]}" stroke-width=".9" fill="none"/>`
  }
  return {
    back: `<g opacity=".7"><animateTransform attributeName="transform" type="rotate" from="0 ${c.cx} ${c.cy}" to="360 ${c.cx} ${c.cy}" dur="9s" repeatCount="indefinite"/>${rays}</g>` + flames,
    front: rising(T, lite ? 5 : 12, RAINBOW, 0.8, 41, 14),
    glows: [pulse(c.cx - 4, c.cy, c.w * 0.6 + 5, '#FF7AD8', 0.55, 1.1), pulse(c.cx + 4, c.cy - 3, c.w * 0.6 + 5, '#5FD8FF', 0.55, 1.4), pulse(c.cx, c.cy + 2, c.w * 0.5 + 6, '#FFE14D', 0.5, 0.9)],
    shake: 0.5,
  }
}

// ---- 緑の数字の雨（medium） -----------------------------------------------------------
const G = { main: '#1FD16B', light: '#8DF5B5', dark: '#0B7A3B', head: '#E3FFEE' }
const GLYPH: Record<'0' | '1', string[]> = {
  '0': ['.#.', '#.#', '#.#', '#.#', '.#.'],
  '1': ['.#', '##', '.#', '.#', '.#'],
}
const half = (v: number) => Math.round(v * 2) / 2 // 細かいドットの格子（0.5 マス）にそろえる
// 1文字を、1辺 u マスの点で描く。細かいドットは u = 0.5、ふつうのドットは u = 1（小さすぎて消えないように。設計書 §4.6）。
// ふつうのドットでは x・y も整数なので、点が格子の点にぴったり乗る
function digit(ch: '0' | '1', x: number, y: number, color: string, u = 0.5): string {
  let d = ''
  GLYPH[ch].forEach((row, j) => [...row].forEach((c, i) => c === '#' && (d += `M${half(x) + i * u} ${half(y) + j * u}h${u}v${u}h${-u}z`)))
  return `<path fill="${color}" d="${d}"/>`
}
const bit = (k: number): '0' | '1' => (rnd(k) < 0.5 ? '0' : '1')
// 字の並べ方。細かいドット（u = 0.5、字は 1.5×2.5 マス）は見本のまま：列は 2.5 マスおき、字は 3 マスおき。
// ふつうのドット（u = 1、字は 3×5 マス）は、そのままだと上下・左右の字が重なって読めないので、
// 列は 4 マスおき（となりの列と 1 マス以上あく）、字は 6 マスおき（上下で 1 マスあく）にして、1列の字の数を半分にする（列の長さはほぼ同じ）。
// lite は列の間隔を倍にする（列が半分）。
function bitsRain(T: Target[], u: number, lite = false): FX {
  const coarse = u >= 1
  const colStep = (coarse ? 4 : 2.5) * (lite ? 2 : 1)
  const rowStep = coarse ? 6 : 3
  const c = center(T)
  let o = ''
  const x0 = Math.floor(c.cx - c.w / 2 - 10)
  const x1 = Math.ceil(c.cx + c.w / 2 + 10)
  let col = 0
  for (let x = x0; x <= x1; x += colStep, col++) {
    if (rnd(col + 300) < 0.25) continue
    const dur = 1.8 + rnd(col) * 1.4
    const n = 4 + Math.floor(rnd(col + 50) * 4)
    const len = coarse ? Math.ceil(n / 2) : n
    let stream = ''
    for (let j = 0; j < len; j++) {
      const color = j === 0 ? G.head : j < 2 ? G.main : G.dark
      stream += `<g opacity="${(1 - j / (len + 1)).toFixed(2)}">${digit(bit(col * 31 + j), x, -j * rowStep, color, u)}</g>`
    }
    const t = `dur="${dur.toFixed(2)}s" begin="${(-rnd(col + 77) * dur).toFixed(2)}s" repeatCount="indefinite"`
    o += `<g opacity="0"><animateTransform attributeName="transform" type="translate" values="0 -18;0 14" ${t}/><animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.15;.8;1" ${t}/>${stream}</g>`
  }
  return { back: o, front: '', glows: [pulse(c.cx, c.cy, c.w * 0.6 + 5, '#2BE07A', 0.25, 2.4, 'c3')], shake: 0 }
}

// ---- くっきり暴走（max） -------------------------------------------------------------
// 黒い炎は、ふちを明るい赤で縁取り、内側を深い赤→黒にする（明るい部屋でも暗い部屋でも形が読める）
const BLACK_FLAME: Pal = { outer: '#FF2D45', mid: '#5C0A1D', inner: '#1C0510' }
const EMBER = ['#FF2D45', '#FF8A3D', '#FFD0B0', '#FF5A5A']
type Pt = [number, number]
function jag(x: number, y: number, len: number, dx: number, dy: number, seed: number, wob = 2.2): Pt[] {
  const pts: Pt[] = []
  let cx = x
  let cy = y
  for (let k = 0; k < len; k++) {
    cx += dx + Math.round((rnd(seed + k) - 0.5) * wob)
    cy += dy + (dx ? Math.round((rnd(seed + k + 40) - 0.5) * wob) : 0)
    pts.push([cx, cy])
  }
  return pts
}
// 太い赤い稲妻（白い芯・赤い縁・暗い赤の影）
function redBolt(px: Px, pts: Pt[], n = pts.length, dim = false) {
  for (const [x, y] of pts.slice(0, n)) {
    if (dim) {
      px.put(x, y, '#B5122E')
      continue
    }
    for (const [a, b] of [[-1, 0], [1, 0]] as Pt[]) if (!px.has(x + a, y + b)) px.put(x + a, y + b, '#FF1E3C')
    if (!px.has(x, y + 1)) px.put(x, y + 1, '#B5122E')
    px.put(x, y, '#FFFFFF')
  }
}
// 床から立ちのぼる赤い稲妻：体の左右（体の前は通らない）から、伸びて光って消える
function floorBolts(T: Target[], events: number, reach: number, seedBase = 0, lite = false): string {
  const n = lite ? 6 : 12
  const frames = Array.from({ length: n }, () => new Px())
  for (const [ti, t] of T.entries()) {
    for (let k = 0; k < events; k++) {
      const seed = seedBase + ti * 101 + k * 37
      const left = k % 2 === 0
      const x = Math.round(left ? t.x0 - 2 - rnd(seed) * 4 * Math.max(t.s, 0.6) : t.x1 + 2 + rnd(seed) * 4 * Math.max(t.s, 0.6))
      const pts = jag(x, FLOOR, Math.round(reach * Math.max(t.s, 0.55)), 0, -1, seed, 1.6)
      const mid = pts[Math.floor(pts.length * 0.55)]!
      const br = jag(mid[0], mid[1], 4, left ? -1 : 1, -1, seed + 9)
      const start = Math.round((k * n) / events + ti * 3) % n
      const lens = [Math.ceil(pts.length * 0.35), Math.ceil(pts.length * 0.7), pts.length, pts.length, pts.length]
      if (lite) {
        // 6コマ（1コマ 1/6 秒）：伸びる → 光る（枝つき） → 暗く消える の3コマだけ
        const seq = [0, 2, 4]
        seq.forEach((g, i) => {
          const px = frames[(start + i) % n]!
          redBolt(px, pts, lens[g], g === 4)
          if (g === 2) redBolt(px, br, br.length)
        })
        continue
      }
      for (let g = 0; g < 5; g++) {
        const px = frames[(start + g) % n]!
        redBolt(px, pts, lens[g], g === 4)
        if (g === 2 || g === 3) redBolt(px, br, br.length)
      }
    }
  }
  return flick(frames.map(px => px.svg()), lite ? 1 / 6 : 1 / 12)
}
// 机のひび：足もとのまん中から、机の上を左右へぎざぎざに走る線（赤く光る、白い芯）
function redCracks(T: Target[]): string {
  let d = ''
  for (const [ti, t] of T.entries()) {
    const cx = (t.x0 + t.x1) / 2
    const s = Math.max(t.s, 0.6)
    const rays: [number, number][] = [[-1, 0.25], [-1, 0.75], [1, 0.3], [1, 0.8], [-0.35, 1], [0.4, 1]]
    rays.forEach(([dx, dy], k) => {
      let x = cx
      let y = FLOOR + 0.3
      d += `M${x.toFixed(1)} ${y.toFixed(1)}`
      const steps = dy >= 1 ? 3 : 5
      for (let i = 0; i < steps; i++) {
        x += dx * (1.6 + rnd(ti * 40 + k * 7 + i) * 1.4) * s
        y += dy * (0.5 + rnd(ti * 40 + k * 7 + i + 20) * 0.6) * s + (rnd(k * 3 + i) - 0.5) * 0.5
        d += `L${x.toFixed(1)} ${y.toFixed(1)}`
      }
    })
  }
  return `<path d="${d}" stroke="#FF3044" stroke-width=".7" fill="none"/><path d="${d}" stroke="#FFD0D6" stroke-width=".25" fill="none"/>`
}
const redFlicker = (c: { cx: number; cy: number; w: number }, base = 0.55): Glow => ({
  cx: c.cx, cy: c.cy, r: c.w * 0.7 + 6, color: '#FF2A48', base, mask: 'c2',
  anim: `<animate attributeName="opacity" values="${(base * 0.6).toFixed(2)};${base};${(base * 0.7).toFixed(2)};${base};${(base * 0.5).toFixed(2)}" calcMode="discrete" dur=".6s" repeatCount="indefinite"/>`,
})
function rampageClear(T: Target[], lite = false): FX {
  const c = center(T)
  return {
    back: lite ? flick(flameFrames(T, 3, 12, BLACK_FLAME, 2), 1 / 6) : flick(flameFrames(T, 3, 12, BLACK_FLAME)),
    front: floorBolts(T, 3, 16, 0, lite) + redCracks(T) + rising(T, lite ? 5 : 10, EMBER, 0.9, 81, 14),
    glows: [redFlicker(c)],
    shake: 1,
    eyes: '#E8102E',
  }
}

// ---- 入口 ---------------------------------------------------------------------------
// 演出の対象（体の箱）。Haiku は HAIKU_X の3人（半分の大きさ）、ほかは大きい子ひとり
export function targetsOf(look: Look): Target[] {
  if (look === 'haiku') return HAIKU_X.map(X => ({ x0: X + 2, x1: X + 9.5, y0: 9, y1: 15, s: 0.5 }))
  return [{ x0: 5, x1: 20, y0: look === 'sonnet' ? 1 : -1, y1: 12, s: 1 }]
}

// effort の段階 → 演出。fine は細かいドットか（数字の字の単位だけが 0.5 ／ 1 マスに変わる）。
// lite は軽い版：色・要素・動きは同じで、コマ数と粒の数を減らす（SVG の大きさの上限のため。設計書 §4.6）
export function effectFor(level: Level, look: Look, fine: boolean, lite = false): FX {
  const T = targetsOf(look)
  if (level === 1) return bitsRain(T, fine ? 0.5 : 1, lite)
  if (level === 2) return flameFx(4, look, T, lite)
  if (level === 3) return rainbow(T, lite)
  if (level === 4) return rampageClear(T, lite)
  return NONE()
}

// クロードくんの絵に足すもの：光る目（目の色だけ。形は変えない）
// kind：big は大きい子、mini は小さい子。fine：細かいドット版の絵か（行の数え方が違う）。
// 目と口は同じ色（EYE）なので、行で分ける。実際の絵（paintBig・paintMini・細かい版）で確かめた境目：
//   big は 目 ≤ top+4・口 ≥ top+5 ／ mini は 目 ≤ top+1・口 ≥ top+2 ／ bigFine は 目 ≤ 2top+9・口 ≥ 2top+11 ／ miniFine は 目 ≤ top+3・口 ≥ top+4
export function fxPainter(base: (p: Pose) => Px, kind: 'big' | 'mini', fx: FX, fine = true): (p: Pose) => Px {
  if (!fx.eyes) return base
  return (p: Pose) => {
    const px = base(p)
    const top = 1 + p.dy - p.lift
    const limit = kind === 'big' ? (fine ? 2 * top + 10 : top + 5) : fine ? top + 4 : top + 2
    for (const [k, c] of px.m) if (c === EYE && Number(k.split(',')[1]) < limit) px.m.set(k, fx.eyes!)
    return px
  }
}
