// /rj のカードの「背景」のタブに並べる、部屋の小さな絵。純粋な関数だけ。
// 部屋の絵（scene.ts）を簡単にした形（壁・窓とカーテン・額・時計・ランプ・棚・机・クロードくん・電球）を、本物の部屋の色で描く。
// 暗い画面の部屋の上に、明るい画面の部屋を右下半分だけ重ね、左上に月、右下に太陽の印を付ける
// （その色が、暗い画面・明るい画面でどう見えるかが1枚で分かる）。
//
// なぜ本物の部屋の絵を縮めないか：本物の絵は止めて軽くしても1枚 6〜9 万字あり、5枚並べると、入力欄の上の帯に描けなかった
// （2026-11-15、本物のアプリでカードごと出なかった。前の版のカードは、絵の合計 約 77,000 字で描けていた）。
// この絵は1枚 数千字なので、5枚でも前の版より軽い。
// 色は、文字色（currentColor）に頼らず、明るい画面・暗い画面の色をそのまま書く（カードの絵は画像として描かれ、文字色はいつも黒なので）。

import type { RoomColors } from './lib/palette'
import { DARK, LIGHT } from './scene'

/** 絵の広さ（viewBox の単位）。部屋の絵の横 960・縦 600 を 1/6 にしたもの。 */
const VW = 160
const VH = 100

type Mode = 'light' | 'dark'

/** その画面の色：部屋の色（壁・光・床。背景色と時間帯で変わる）があればそれ、無ければ部屋の絵のもとの色。 */
function paletteOf(room: RoomColors | undefined, mode: Mode): (key: string) => string {
  const base = mode === 'light' ? LIGHT : DARK
  const tint = room?.[mode] ?? {}
  return key => tint[key] ?? base[key] ?? '#888888'
}

const f1 = (v: number) => String(Math.round(v * 10) / 10)

/** 部屋1つ（その画面の色で）。p は id の頭（明るい画面と暗い画面で、グラデーションの id がぶつからないように）。 */
function roomBody(c: (key: string) => string, p: string): string {
  const rect = (x: number, y: number, w: number, h: number, fill: string, more = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${more}/>`
  const circle = (x: number, y: number, r: number, fill: string, more = '') => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}"${more}/>`
  const glow = (id: string, cx: number, cy: number, r: number, color: string) =>
    `<radialGradient id="${p}${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${color}"/><stop offset=".45" stop-color="${color}" stop-opacity=".42"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
  const defs =
    `<defs><linearGradient id="${p}wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c('top')}"/><stop offset=".55" stop-color="${c('mid')}"/><stop offset="1" stop-color="${c('bottom')}"/></linearGradient>` +
    `<linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c('winTop')}"/><stop offset="1" stop-color="${c('winBot')}"/></linearGradient>` +
    glow('cool', 0.9, 0.2, 0.6, c('cool')) + glow('rose', 0.12, 0.14, 0.55, c('rose')) + glow('floor', 0.5, 1.05, 0.7, c('floor')) + glow('warm', 0.5, 0.5, 0.5, c('warm')) +
    '</defs>'
  // 壁と光（部屋の絵と同じ重ね方・同じ濃さ）
  let o = rect(0, 0, VW, VH, `url(#${p}wall)`)
  o += rect(0, 0, VW, VH, `url(#${p}cool)`, ' opacity=".43"') + rect(0, 0, VW, VH, `url(#${p}rose)`, ' opacity=".3"') + rect(0, 0, VW, VH, `url(#${p}floor)`, ' opacity=".4"')
  o += rect(0, 68, VW, 21, c('shade'), ' opacity=".35"')
  o += circle(60, 73, 34, `url(#${p}warm)`, ' opacity=".52"') + circle(97, 35, 32, `url(#${p}warm)`, ' opacity=".42"')
  // 電球のひも（上の端）
  o += `<path d="M0 4Q20 9 40 4T80 4T120 4T160 4" fill="none" stroke="${c('wire')}" stroke-width=".6"/>`
  for (const [i, x] of [12, 30, 52, 70, 92, 110, 132, 150].entries()) o += circle(x, 6, 1.2, [c('bulb'), '#F7A1B5', '#BFD3FF'][i % 3]!)
  // 左：つり下げの鉢・額・レコードの棚・ギター・机のランプ
  o += `<path d="M25 0V18" stroke="${c('wire')}" stroke-width=".5"/>` + `<path d="M21 19h8l-1.4 6h-5.2z" fill="${c('pot')}"/>` + circle(23, 18, 2.4, c('leaf')) + circle(27, 18, 2.4, c('leaf2')) + rect(24.4, 25, 1.2, 14, c('leaf'))
  o += rect(50, 17, 32, 41, c('frame')) + rect(52, 19, 28, 37, c('mat')) + circle(72, 27, 5, c('print')) + `<ellipse cx="63" cy="38" rx="7" ry="8.5" fill="${c('leaf')}" transform="rotate(-18 63 38)"/>`
  o += rect(51, 62, 30, 1.4, c('box')) + rect(54, 54, 8, 8, c('sleeveA')) + rect(63, 55, 8, 7, c('sleeveB'))
  o += `<ellipse cx="20" cy="82" rx="6" ry="7" fill="${c('guitar')}" transform="rotate(-12 20 82)"/>` + rect(19, 60, 2, 18, c('box'), ' transform="rotate(-12 20 82)"')
  o += `<path d="M56 64h10l3 6h-16z" fill="${c('lamp')}"/>` + rect(60.5, 70, 1, 19, c('metal'))
  o += rect(70, 84, 14, 5, c('box')) + `<ellipse cx="77" cy="84" rx="5" ry="1.3" fill="${c('vinyl')}"/>`
  // 右：時計・立てたランプ・窓とカーテン・ラジエーター・ポットの棚
  o += circle(97, 30, 8, c('mat'), ` stroke="${c('frame')}" stroke-width="1.5"`) + `<path d="M97 30V25M97 30L100.5 31.5" stroke="${c('frame')}" stroke-width=".9" stroke-linecap="round"/>`
  o += rect(96.5, 38, 1, 51, c('metal')) + `<path d="M93 30h8l3.5 7h-15z" fill="${c('lamp')}" opacity=".9"/>`
  o += rect(119, 17, 32, 40, c('frame')) + rect(121, 19, 28, 36, `url(#${p}sky)`) + rect(134.4, 19, 1.2, 36, c('frame')) + rect(121, 36.4, 28, 1.2, c('frame'))
  o += `<path d="M121 49Q129 45 135 48T149 47V55H121z" fill="${c('hill')}"/>`
  o += `<path d="M112 15h9q-1 20-3 28q2 10 1 21h-7z" fill="${c('curtain')}"/>` + `<path d="M149 15h9v49h-7q-1-11 1-21q-2-8-3-28z" fill="${c('curtain')}"/>`
  o += rect(110, 13, 50, 1.4, c('frame'))
  o += rect(115, 57, 40, 2, c('frame')) + rect(121, 61, 28, 8, c('rad'))
  o += rect(118, 70, 32, 1.4, c('box')) + `<ellipse cx="138" cy="67" rx="3.5" ry="2.8" fill="${c('sleeveB')}"/>` + rect(124, 65, 2.4, 5, c('wax')) + rect(128, 66, 2.4, 4, c('wax'))
  // 机（天板と引き出し）
  o += rect(0, 89, VW, 6, c('deskTop')) + rect(0, 95, VW, 5, c('deskFront'))
  for (const x of [0, 40, 80, 120]) o += rect(x + 1, 95.8, 38, 4.2, c('drawer'))
  // クロードくん（机の右。部屋の絵と同じ色）とノートパソコン・マグ
  o += rect(123, 77, 16, 9, '#DA7758') + rect(138, 77, 1.5, 9, '#B9603F') + rect(121, 80, 2, 3, '#DA7758') + rect(139, 80, 2, 3, '#B9603F')
  o += rect(125.5, 79, 1.5, 1.5, '#1A1918') + rect(133, 79, 1.5, 1.5, '#1A1918')
  o += rect(123, 84, 10, 5, '#8E95A8') + rect(122, 88.4, 12, 0.8, '#5E6372')
  o += rect(141, 85, 3.5, 4, c('mug')) + rect(141, 85, 3.5, 0.8, '#6B4630')
  return defs + o
}

// 印：左上に月（三日月）、右下に太陽。小さな絵でも見えるよう、白いふちを付ける
const MARKS =
  '<mask id="mmoon"><circle cx="10.5" cy="10.5" r="6.7" fill="#fff"/><circle cx="13.5" cy="8" r="5.7" fill="#000"/></mask>' +
  '<g data-mark="moon"><circle cx="10.5" cy="10.5" r="7.7" fill="#fff" opacity=".55" mask="url(#mmoon)"/><circle cx="10.5" cy="10.5" r="6.7" fill="#F3ECD8" mask="url(#mmoon)"/></g>' +
  '<g data-mark="sun"><circle cx="149.5" cy="89.5" r="7.3" fill="#fff" opacity=".7"/><circle cx="149.5" cy="89.5" r="6" fill="#F2A35E"/></g>'

const made = new Map<string, string>()
const MADE_MAX = 64

/** 部屋の小さな絵（横 w・縦 h px）。同じ部屋の色・大きさなら、前に作ったものを返す。 */
export function roomTileSvg(room: RoomColors | undefined, w: number, h: number): string {
  const key = `${w}|${h}|${JSON.stringify(room ?? null)}`
  const kept = made.get(key)
  if (kept !== undefined) return kept
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${VW} ${VH}">` +
    `<defs><clipPath id="half"><polygon points="${VW},0 ${VW},${VH} 0,${VH}"/></clipPath></defs>` +
    `<g data-mode="dark">${roomBody(paletteOf(room, 'dark'), 'd')}</g>` +
    `<g data-mode="light" clip-path="url(#half)">${roomBody(paletteOf(room, 'light'), 'l')}</g>` +
    MARKS +
    '</svg>'
  if (made.size >= MADE_MAX) made.clear()
  made.set(key, svg)
  return svg
}
