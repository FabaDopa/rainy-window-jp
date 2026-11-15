// /rj のカードの2つのタブ（🎨 背景・🐾 クロードくんの見た目）と、切りかわりの絵（SVG）。純粋な関数だけ。
// タブのボタンの上に、暗い吹き出しが1つ（参考にした Morph tooltip）。タブを切りかえると、吹き出しは新しいタブのほうへ
// 伸びながら移り、新しい言葉の幅で止まる（動く向きの側の端はかたいばね LEAD、反対の端はやわらかいばね TRAIL）。
// しっぽは自分のばねで追いかけ、古い言葉は来た側へ、新しい言葉は向こう側から、少しぼけて入れかわる。
// タブのボタンの下の帯も、同じ LEAD・TRAIL の端で動く。
// ばねは絵を作るときに前もって計算し（springs.ts）、1/60 秒ごとの値を SMIL の animate（calcMode linear・fill freeze・1回だけ）にする。
// 基の属性は動いたあとの姿にしてあるので、SMIL が動かない画面や、止まった絵でも正しい場所に出る。同じ引数なら同じ文字列。

import { FPS, LABEL, LEAD, TAIL, TRAIL, simulate, springOf } from './springs'

export type Tab = 'room' | 'clawd'

export const TABS: readonly Tab[] = ['room', 'clawd']

export const TAB_LABEL: Record<Tab, string> = { room: '🎨 背景', clawd: '🐾 クロードくんの見た目' }

/** 吹き出しの言葉：そのタブで選べるもの。 */
export const TIP_TEXT: Record<Tab, string> = { room: '背景色・時間帯・保存先', clawd: '姿・演出・ドットを選ぶ' }

export function isTab(value: unknown): value is Tab {
  return (TABS as readonly unknown[]).includes(value)
}

/** タブのボタンのラベル：選んだタブは、どの画面でも ✓ で終わる（カードのほかのボタンと同じ）。 */
export function tabButtonLabel(tab: Tab, selected: boolean): string {
  return selected ? `${TAB_LABEL[tab]} ✓` : TAB_LABEL[tab]
}

// ---- 横の位置の見当（デスクトップ・スマホのボタンは、ラベルの文字だけを描く） ----

/** 文字の幅の見当（CSS px、13px の文字）：絵文字 15、全角 13、✓ 11、空白 3.5、そのほか 7。 */
function textPx(text: string): number {
  let px = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x1f000) px += 15
    else if (code >= 0x2e80) px += 13
    else if (ch === '✓') px += 11
    else if (ch === ' ') px += 3.5
    else px += 7
  }
  return px
}

/** ボタンの左右の余白の合計と、ボタンのあいだ（見当、CSS px）。 */
const BUTTON_PAD_PX = 20
const BUTTON_GAP_PX = 8

const round1 = (v: number) => Math.round(v * 10) / 10
// 「+ 0」で -0 を 0 にする（文字にしたときと、比べたときに同じ数になるように）
const round2 = (v: number) => Math.round(v * 100) / 100 + 0
const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * タブのボタンの場所（左端 x と幅 w、CSS px）。ボタンは左から順に並び、選んだタブ（selected）のボタンは
 * ラベルの ✓ のぶん広い（その右のボタンは右へずれる）。横幅に収まらないときは、全体を同じ割合で縮める。
 */
export function tabSpot(tab: Tab, width: number, selected: Tab): { x: number; w: number } {
  const widths = TABS.map(t => textPx(tabButtonLabel(t, t === selected)) + BUTTON_PAD_PX)
  const total = widths.reduce((a, b) => a + b, 0) + BUTTON_GAP_PX * (TABS.length - 1)
  const k = Math.min(1, Math.max(1, width) / total)
  let x = 0
  for (const [i, t] of TABS.entries()) {
    const w = widths[i] ?? 0
    if (t === tab) return { x: round1(x * k), w: round1(w * k) }
    x += w + BUTTON_GAP_PX
  }
  return { x: 0, w: round1((widths[0] ?? 0) * k) }
}

// ---- 色と大きさ（カードの Svg は画像として描かれるので、アプリの文字色は届かない。明るい画面でも暗い画面でも見える決まった色） ----
const ACCENT = '#D97757'
const TIP_FILL = '#1F1F26'
const TIP_INK = '#FFFFFF'
const FONT = "system-ui, -apple-system, 'Segoe UI', 'Yu Gothic UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif"

/** 吹き出しの絵の縦（CSS px）：吹き出し 34 と、その下に出るしっぽ（参考と同じ並び：しっぽの真ん中は、吹き出しの下の端の 3 px 上）。 */
export const TIP_H = 46
const BOX_H = 34
const RADIUS = 11
/** 吹き出しの幅は、言葉の幅の見当に左右の余白 12 px ずつを足したもの。 */
const TIP_PAD_PX = 24
const TAIL_Y = 31
/** しっぽは、吹き出しの両端から 12 px より内側。吹き出しはいちばん狭くて 30 px。 */
const TAIL_INSET = 12
const MIN_TIP_W = 30
/** 言葉の入れかわり：14 px すべり、途中は 3 px までぼける。言葉の縦の位置（文字の下の線）。 */
const SLIDE_PX = 14
const BLUR_PX = 3
const TEXT_Y = 21.5

/** 帯の SVG の縦（CSS px）。帯はいちばん狭くて 20 px。 */
export const STRIP_H = 10
const MIN_BAND_W = 20

const sizeOf = (width: number) => Math.max(1, Math.round(width))

// ---- 吹き出しと帯の形、ばねの動き ----

/** ばねで動かす5つの値：吹き出しの左右の端（tl・tr）、しっぽの真ん中（tx）、帯の左右の端（hl・hr）。 */
type Edges = { tl: number; tr: number; tx: number; hl: number; hr: number }
/** 1つの言葉の見え方：不透明度、横のずれ（px）、ぼかし（px）。 */
export type TipLabel = { opacity: number; dx: number; blur: number }
/** 1コマの形：吹き出しの左端と幅、しっぽの真ん中、帯の左端と幅、古い言葉（from）と新しい言葉（to）。 */
export type TabFrame = { tipX: number; tipW: number; tail: number; bandX: number; bandW: number; from: TipLabel; to: TipLabel }

/** tab に吹き出しが止まっているときのばねの値（ボタンの場所は selected を選んだ並び）。 */
function edgesAt(tab: Tab, W: number, selected: Tab): Edges {
  const spot = tabSpot(tab, W, selected)
  const c = spot.x + spot.w / 2
  const half = (textPx(TIP_TEXT[tab]) + TIP_PAD_PX) / 2
  return { tl: c - half, tr: c + half, tx: c, hl: spot.x, hr: spot.x + spot.w }
}

/**
 * ばねの値から描く形を決める（参考の tooltip.js の render と同じ決まり）。吹き出しの左端は左の端のばねか右の端 −30 の
 * 小さいほう、幅はそこから右の端まで。吹き出しは絵の中に収めて（はみ出すときは横へずらし、絵より広ければ絵の幅に）、
 * しっぽは吹き出しの両端から 12 px より内側。帯は 20 px より狭くせず、絵の中に収める。
 */
function shapeOf(e: Edges, W: number): Omit<TabFrame, 'from' | 'to'> {
  const l0 = Math.min(e.tl, e.tr - MIN_TIP_W)
  const w = Math.min(e.tr - l0, W)
  const l = clamp(l0, 0, Math.max(0, W - w))
  const tail = clamp(e.tx, l + TAIL_INSET, l + w - TAIL_INSET)
  const hx = clamp(Math.min(e.hl, e.hr - MIN_BAND_W), 0, Math.max(0, W - MIN_BAND_W))
  const hr = clamp(e.hr, hx + MIN_BAND_W, Math.max(hx + MIN_BAND_W, W))
  return { tipX: round2(l), tipW: round2(w), tail: round2(tail), bandX: round2(hx), bandW: round2(hr - hx) }
}

/** 言葉の見え方（o は 0 で見えない、1 で見える。dir の向きに、まだ見えていないぶんだけずれる。途中だけぼける）。 */
function labelOf(o: number, dir: number): TipLabel {
  const k = clamp(o, 0, 1)
  return { opacity: round3(k), dx: round2(dir * (1 - k) * SLIDE_PX), blur: k > 0.02 && k < 0.98 ? round2((1 - k) * BLUR_PX) : 0 }
}

/** tab に止まっている吹き出しの形（左端 x・幅 w・しっぽの真ん中 tail）。 */
export function tipSpot(tab: Tab, width: number): { x: number; w: number; tail: number } {
  const W = sizeOf(width)
  const s = shapeOf(edgesAt(tab, W, tab), W)
  return { x: s.tipX, w: s.tipW, tail: s.tail }
}

/**
 * from → to の切りかわりの、1/60 秒ごとの形（frames[0] は押した瞬間、最後は to に止まった形そのもの）。
 * ボタンの場所は、どちらも押したあとの並び（to のボタンに ✓）。右へ動くなら右の端が LEAD、左の端が TRAIL（左へなら逆）。
 * しっぽは TAIL、言葉は LABEL のばね。ぜんぶ止まるまで（1.2 秒まで）。from と to が同じなら、止まった形の1コマ。
 */
export function tabMotion(from: Tab, to: Tab, width: number): { frames: TabFrame[]; settled: boolean } {
  const W = sizeOf(width)
  const end = edgesAt(to, W, to)
  const dir = Math.sign(TABS.indexOf(to) - TABS.indexOf(from))
  const rest: TabFrame = { ...shapeOf(end, W), from: labelOf(0, -dir), to: labelOf(1, dir) }
  if (from === to) return { frames: [rest], settled: true }
  const start = edgesAt(from, W, to)
  const right = dir >= 0
  const run = simulate(
    [
      springOf(start.tl, end.tl, right ? TRAIL : LEAD),
      springOf(start.tr, end.tr, right ? LEAD : TRAIL),
      springOf(start.tx, end.tx, TAIL),
      springOf(start.hl, end.hl, right ? TRAIL : LEAD),
      springOf(start.hr, end.hr, right ? LEAD : TRAIL),
      springOf(1, 0, LABEL),
      springOf(0, 1, LABEL),
    ],
    [1, 1, 1, 1, 1, SLIDE_PX, SLIDE_PX],
  )
  const [tl = [], tr = [], tx = [], hl = [], hr = [], oFrom = [], oTo = []] = run.frames
  const frames: TabFrame[] = []
  for (let i = 0; i < tl.length - 1; i++) {
    const e = { tl: tl[i] ?? end.tl, tr: tr[i] ?? end.tr, tx: tx[i] ?? end.tx, hl: hl[i] ?? end.hl, hr: hr[i] ?? end.hr }
    frames.push({ ...shapeOf(e, W), from: labelOf(oFrom[i] ?? 0, -dir), to: labelOf(oTo[i] ?? 1, dir) })
  }
  // 最後のコマは、止まった形そのもの（止まった絵と同じ場所で終わる）
  frames.push(rest)
  return { frames, settled: run.settled }
}

// ---- SVG ----

const durOf = (frames: readonly TabFrame[]) => `${Math.round(((frames.length - 1) / FPS) * 10000) / 10000}s`
const ONCE = 'calcMode="linear" fill="freeze" repeatCount="1"'
const animate = (name: string, values: readonly number[], dur: string) => `<animate attributeName="${name}" values="${values.join(';')}" dur="${dur}" ${ONCE}/>`
const slide = (xs: readonly number[], y: number, dur: string) =>
  `<animateTransform attributeName="transform" type="translate" values="${xs.map(x => `${x} ${y}`).join(';')}" dur="${dur}" ${ONCE}/>`
const tailOf = (x: number, move: string) =>
  `<g id="tail" transform="translate(${x} ${TAIL_Y})">${move}<rect x="-6" y="-6" width="12" height="12" rx="3" transform="rotate(45)" fill="${TIP_FILL}"/></g>`
const textOf = (tab: Tab, x: number) =>
  `<text x="${x}" y="${TEXT_Y}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="500" fill="${TIP_INK}">${TIP_TEXT[tab]}</text>`
/** 吹き出しの角丸（id と色があれば描くほう、無ければ言葉を切り抜く形）。inner は中の animate。 */
const boxOf = (x: number, w: number, inner: string, fill?: string) =>
  `<rect${fill === undefined ? '' : ' id="tip"'} x="${x}" y="0" width="${w}" height="${BOX_H}" rx="${RADIUS}"${fill === undefined ? '' : ` fill="${fill}"`}${inner === '' ? '/>' : `>${inner}</rect>`}`

/**
 * タブのボタンの上に置く、横 width・縦 46 の吹き出しの絵。暗い角丸（半径 11）に白い言葉、下に 45° 回したしっぽ（12×12、角 3）。
 * animate が true で from と to が違うときだけ、from → to へばねで動く（tabMotion のコマを animate にする）。
 * そうでなければ、to に止まった絵（<animate は無い）。
 */
export function tabTipSvg(from: Tab, to: Tab, width: number, animate_: boolean): string {
  const W = sizeOf(width)
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TIP_H}" viewBox="0 0 ${W} ${TIP_H}">`
  if (!animate_ || from === to) {
    const s = tipSpot(to, W)
    return `${head}${tailOf(s.tail, '')}${boxOf(s.x, s.w, '', TIP_FILL)}${textOf(to, round2(s.x + s.w / 2))}</svg>`
  }
  const { frames } = tabMotion(from, to, W)
  const dur = durOf(frames)
  const end = frames[frames.length - 1] as TabFrame
  const edges = animate('x', frames.map(f => f.tipX), dur) + animate('width', frames.map(f => f.tipW), dur)
  // 言葉は吹き出しの真ん中に、ずれ（dx）を足した場所。吹き出しの形で切り抜く（はみ出さない）
  const label = (tab: Tab, side: 'from' | 'to') => {
    const xs = frames.map(f => round2(f.tipX + f.tipW / 2 + f[side].dx))
    return (
      `<g id="label-${tab}" opacity="${end[side].opacity}" filter="url(#blur-${tab})">` +
      animate('opacity', frames.map(f => f[side].opacity), dur) +
      `<g transform="translate(${xs[xs.length - 1] ?? 0} 0)">${slide(xs, 0, dur)}${textOf(tab, 0)}</g></g>`
    )
  }
  // ぼかしは言葉ごとのフィルター（範囲は絵の全体、絵の座標で）
  const blur = (tab: Tab, side: 'from' | 'to') =>
    `<filter id="blur-${tab}" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${TIP_H}">` +
    `<feGaussianBlur stdDeviation="${end[side].blur}">${animate('stdDeviation', frames.map(f => f[side].blur), dur)}</feGaussianBlur></filter>`
  return (
    head +
    `<defs><clipPath id="tipclip">${boxOf(end.tipX, end.tipW, edges)}</clipPath>${blur(from, 'from')}${blur(to, 'to')}</defs>` +
    tailOf(end.tail, slide(frames.map(f => f.tail), TAIL_Y, dur)) +
    boxOf(end.tipX, end.tipW, edges, TIP_FILL) +
    `<g clip-path="url(#tipclip)">${label(from, 'from')}${label(to, 'to')}</g>` +
    `</svg>`
  )
}

/**
 * タブのボタンの下に置く、横 width・縦 10 の帯。選んだタブのボタンの下に、色の帯（縦 3）。
 * animate が true で from と to が違うときだけ、吹き出しと同じ LEAD・TRAIL の端で from → to へ動く（同じ長さ）。
 */
export function tabStripSvg(from: Tab, to: Tab, width: number, animate_: boolean): string {
  const W = sizeOf(width)
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${STRIP_H}" viewBox="0 0 ${W} ${STRIP_H}"><rect x="0" y="6" width="${W}" height="1" fill="${ACCENT}" opacity="0.25"/>`
  const band = (x: number, w: number, inner: string) => `<rect id="band" x="${x}" y="5" width="${w}" height="3" rx="1.5" fill="${ACCENT}"${inner === '' ? '/>' : `>${inner}</rect>`}`
  const { frames } = tabMotion(animate_ ? from : to, to, W)
  const end = frames[frames.length - 1] as TabFrame
  if (frames.length === 1) return `${head}${band(end.bandX, end.bandW, '')}</svg>`
  const dur = durOf(frames)
  return `${head}${band(end.bandX, end.bandW, animate('x', frames.map(f => f.bandX), dur) + animate('width', frames.map(f => f.bandW), dur))}</svg>`
}

// ---- ターミナル（Svg が無い）：タブのボタンの下に、文字で線を引く ----

/** 文字の幅（ターミナルのマス）：絵文字・全角は 2、ほか（✓ も）は 1。 */
function cellsOf(text: string): number {
  let n = 0
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1
  return n
}

/**
 * ターミナルのタブの下の線：選んだタブの下だけ太い線 ━、ほかは細い線 ─（アニメーションなし）。
 * 選んだボタンは [ ラベル ✓ ]（primary）、ほかはラベルのまわりに1マスずつ、あいだ1マスの見当で長さを決める。
 */
export function tabRuleText(tab: Tab): string {
  return TABS.map((t, i) => {
    const isOn = t === tab
    const cells = cellsOf(tabButtonLabel(t, isOn)) + (isOn ? 4 : 2)
    const gap = i < TABS.length - 1 ? '─' : ''
    return (isOn ? '━' : '─').repeat(cells) + gap
  }).join('')
}
