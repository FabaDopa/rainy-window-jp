// /rj のカードの2つのタブ（🎨 背景・🐾 クロードくんの見た目）と、切りかわりのアニメーションの SVG。純粋な関数だけ。
// 帯の SVG は「前のタブ → 今のタブ」だけで中身が決まる。ほかのボタンで描き直しても同じ文字列なので、動き直さない。
// 動きはすべて SMIL（animate・animateTransform）。基の属性は動いたあとの姿にしてあるので、SMIL が動かない画面でも正しい場所に出る。

export type Tab = 'room' | 'clawd'

export const TABS: readonly Tab[] = ['room', 'clawd']

export const TAB_LABEL: Record<Tab, string> = { room: '🎨 背景', clawd: '🐾 クロードくんの見た目' }

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

/**
 * タブのボタンの下の場所（左端 x と幅 w、CSS px）。ボタンは左から順に並び、選んだタブ（selected）のボタンは
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

// ---- 色（明るい画面でも暗い画面でも見える、決まった色。カードの Svg は別の枠（台本なしの枠や画像）で描かれるので、アプリの文字色は届かない） ----
const ACCENT = '#D97757'
const SPARK = '#FFC774'
const FONT = "system-ui, -apple-system, 'Segoe UI', 'Yu Gothic UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif"
/** 出だしが速く、最後にそっと止まる動き。 */
const EASE = 'calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"'

/** 帯の SVG の縦（CSS px）。 */
export const STRIP_H = 10
/** タイトルの SVG の縦（CSS px）。 */
export const TITLE_H = 24

const sizeOf = (width: number) => Math.max(1, Math.round(width))

// 4つの角の小さな星（キラッ）と、白い芯
const STAR = `<path d="M0 -3.5L0.8 -0.8L3.5 0L0.8 0.8L0 3.5L-0.8 0.8L-3.5 0L-0.8 -0.8Z" fill="${SPARK}"/><circle r="0.9" fill="#FFFFFF"/>`

/**
 * タブのボタンの下に置く、横 width・縦 10 の帯。光の帯が from の下から to の下へ 0.3 秒ですべって止まり、
 * 帯の先に小さなキラッ（出だしで光って、着くころに消える）。from と to が同じなら、動かない帯だけ。
 * 帯が動くのはタブを押したあとなので、どちらの場所も、押したあとの並び（to のボタンに ✓）で決める。
 */
export function tabStripSvg(from: Tab, to: Tab, width: number): string {
  const W = sizeOf(width)
  const a = tabSpot(from, W, to)
  const b = tabSpot(to, W, to)
  const still = from === to
  const move = (name: string, f: number, t: number) => `<animate attributeName="${name}" from="${f}" to="${t}" dur="0.3s" ${EASE} fill="freeze"/>`
  const band = `<rect x="${b.x}" y="5" width="${b.w}" height="3" rx="1.5" fill="${ACCENT}">${still ? '' : move('x', a.x, b.x) + move('width', a.w, b.w)}</rect>`
  let spark = ''
  if (!still) {
    // 帯の先：右へ行くときは右の端、左へ行くときは左の端
    const right = b.x >= a.x
    const tipFrom = round1(right ? a.x + a.w : a.x)
    const tipTo = round1(right ? b.x + b.w : b.x)
    spark =
      `<g transform="translate(${tipTo} 6.5)" opacity="0">` +
      `<animateTransform attributeName="transform" type="translate" from="${tipFrom} 6.5" to="${tipTo} 6.5" dur="0.3s" ${EASE} fill="freeze"/>` +
      `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.7;1" dur="0.45s" fill="freeze"/>` +
      `<g><animateTransform attributeName="transform" type="scale" values="0.4;1.3;0.7" keyTimes="0;0.4;1" dur="0.45s" fill="freeze"/>${STAR}</g>` +
      `</g>`
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${STRIP_H}" viewBox="0 0 ${W} ${STRIP_H}">` +
    `<rect x="0" y="6" width="${W}" height="1" fill="${ACCENT}" opacity="0.25"/>` +
    band +
    spark +
    `</svg>`
  )
}

/**
 * タブの中身の頭に置く、タブの名前の帯（横 width・縦 24）。左から 0.25 秒ですっと入ってくる（不透明度と位置）。
 * 帯は文字のうしろがいちばん濃く、右へ行くほど薄くなる。
 */
export function tabTitleSvg(tab: Tab, width: number): string {
  const W = sizeOf(width)
  const label = TAB_LABEL[tab]
  // 文字の右から 16px までは濃いまま、そこから右の端へ薄くなる
  const solid = round1(Math.min(0.9, (10 + textPx(label) + 16) / W) * 100) / 100
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TITLE_H}" viewBox="0 0 ${W} ${TITLE_H}">` +
    `<defs><linearGradient id="band" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${ACCENT}" stop-opacity="0.95"/>` +
    `<stop offset="${solid}" stop-color="${ACCENT}" stop-opacity="0.85"/>` +
    `<stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<g>` +
    `<animate attributeName="opacity" from="0" to="1" dur="0.25s" fill="freeze"/>` +
    `<animateTransform attributeName="transform" type="translate" from="-28 0" to="0 0" dur="0.25s" ${EASE} fill="freeze"/>` +
    `<rect x="0" y="2" width="${W}" height="20" rx="5" fill="url(#band)"/>` +
    `<text x="10" y="16.5" font-family="${FONT}" font-size="13" font-weight="700" fill="#FFFFFF">${label}</text>` +
    `</g></svg>`
  )
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
