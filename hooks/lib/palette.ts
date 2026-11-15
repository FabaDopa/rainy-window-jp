// 背景色 × 時間帯 × 明るさ から、色を作る。
// - アプリの面の色（makeColors の結果）：変えるのは面（surface-0〜3）だけ。文字色と roles は元のまま、全色共通。
// - 部屋の色（roomColors）：部屋の絵の壁・床・光の色。背景色の違いがはっきり見えるのはこちら。
// 紺の夜は元の値をそのまま渡すので、元の rainy-window と完全に同じ色になる。

import { makeColors } from '../make-colors.js'
import type { Choice, ThemeName } from './choice'
import type { Band } from './time'

type Mode = 'dark' | 'light'
type Surface = 'surface-0' | 'surface-1' | 'surface-2' | 'surface-3'
type Anchors = { 'surface-0': string; 'text-primary': string } & Partial<Record<Surface | 'text-secondary' | 'text-muted', string>>
type Built = ReturnType<typeof makeColors>

// 元の register.ts の値。
const ROLES = { accent: '#5562C9', danger: '#C9553E', success: '#4E8B62', warning: '#D9892F', pro: '#7E5FC0' }
const TEXT: Record<Mode, Pick<Anchors, 'text-primary' | 'text-secondary' | 'text-muted'>> = {
  light: { 'text-primary': '#1F1F26', 'text-secondary': '#45444F', 'text-muted': '#5F5D68' },
  dark: { 'text-primary': '#EDE6D6', 'text-secondary': '#CBC3B3', 'text-muted': '#A8A192' },
}
// 紺（元の rainy-window）の面の色。ライトは元どおり surface-2 まで（surface-3 は makeColors が埋める）。
const RAIN: Record<Mode, Partial<Record<Surface, string>>> = {
  dark: { 'surface-0': '#12142A', 'surface-1': '#181B33', 'surface-2': '#1D2140', 'surface-3': '#22264A' },
  light: { 'surface-0': '#E9E3D6', 'surface-1': '#F0EBE1', 'surface-2': '#F6F2EA' },
}
type Color = Exclude<ThemeName, 'なし'>
// ほかの色は surface-0 だけを決め、残りは紺と同じ間隔で作る。
const BASE: Record<Color, Record<Mode, string>> = {
  紺: { dark: '#12142A', light: '#E9E3D6' },
  緑: { dark: '#12201A', light: '#E3E8DC' },
  桜: { dark: '#261620', light: '#EEE0D4' },
  橙: { dark: '#24170F', light: '#F0E3D2' },
  灰: { dark: '#17171A', light: '#E8E6E1' },
}

// ---- HSL（h: 0〜360、s・l: 0〜100）----

export type Hsl = { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const S = Math.min(100, Math.max(0, s)) / 100
  const L = Math.min(100, Math.max(0, l)) / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = L - c / 2
  const byte = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${byte(r1)}${byte(g1)}${byte(b1)}`.toUpperCase()
}

/** a から b へ、短い向きに t だけ色相を回す。 */
function towardHue(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180
  return (a + diff * t + 360) % 360
}

// ---- 時間帯のずらし（夜＝なにもしない）----

const WARM_HUE = 25

// dl：明るさを足す量、sat：彩度に掛ける量、warm：色相を暖色へ寄せる割合。
const SHIFT: Record<Exclude<Band, '夜'>, Record<Mode, { dl: number; sat: number; warm: number }>> = {
  朝: { dark: { dl: 2, sat: 0.9, warm: 0 }, light: { dl: 1.5, sat: 0.9, warm: 0 } },
  昼: { dark: { dl: 3, sat: 0.6, warm: 0 }, light: { dl: 2.5, sat: 0.6, warm: 0 } },
  夕方: { dark: { dl: 1, sat: 1.1, warm: 0.3 }, light: { dl: 0.5, sat: 1.1, warm: 0.3 } },
}

function shiftForBand(hex: string, band: Band, mode: Mode): string {
  if (band === '夜') return hex
  const { dl, sat, warm } = SHIFT[band][mode]
  const c = hexToHsl(hex)
  let { h, s } = c
  if (warm > 0) {
    // 色の無い（灰のような）色は色相に意味がないので、少しだけ暖色を付ける。
    if (s < 12) {
      h = WARM_HUE
      s = Math.max(s, 8)
    } else {
      h = towardHue(h, WARM_HUE, warm)
    }
  }
  return hslToHex({ h, s: s * sat, l: Math.min(98, c.l + dl) })
}

/** WCAG の相対輝度（0〜1）。 */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** 色相と彩度はそのままで、輝度が target になる明るさ（L）の色を探す。 */
function withLuminance(h: number, s: number, target: number): string {
  let lo = 0
  let hi = 100
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (luminance(hslToHex({ h, s, l: mid })) < target) lo = mid
    else hi = mid
  }
  return hslToHex({ h, s, l: (lo + hi) / 2 })
}

/**
 * 1つのモードの面の色。紺の夜は元の値そのもの。
 * それ以外は、surface-0 を決めてから、残りの面を「紺の面どうしの見え方の差（コントラスト比）と、
 * 色相・彩度の並び」を写して作る。緑のように明るく見える色相でも、面の差が紺と同じになる。
 */
function surfacesFor(theme: Color, band: Band, mode: Mode): Partial<Record<Surface, string>> {
  const rain = RAIN[mode]
  if (theme === '紺' && band === '夜') return { ...rain }
  const s0hex = shiftForBand(BASE[theme][mode], band, mode)
  const r0 = hexToHsl(rain['surface-0']!)
  const t0 = hexToHsl(s0hex)
  const y0 = luminance(s0hex)
  const out: Partial<Record<Surface, string>> = {}
  for (const [name, hex] of Object.entries(rain) as [Surface, string][]) {
    if (name === 'surface-0') {
      out[name] = s0hex
      continue
    }
    const r = hexToHsl(hex)
    const ratio = (luminance(hex) + 0.05) / (luminance(rain['surface-0']!) + 0.05)
    const target = Math.min(1, (y0 + 0.05) * ratio - 0.05)
    out[name] = withLuminance(t0.h + (r.h - r0.h), r0.s === 0 ? t0.s : Math.min(100, (r.s * t0.s) / r0.s), target)
  }
  return out
}

/** makeColors に渡す1つのモードの基準色（面＋文字）。 */
export function anchorsFor(theme: Color, band: Band, mode: Mode): Anchors {
  const surfaces = surfacesFor(theme, band, mode)
  return { 'surface-0': surfaces['surface-0']!, ...surfaces, ...TEXT[mode] }
}

const LABEL: Record<Color, string> = { 紺: 'Rainy window', 緑: 'Rainy window JP 緑', 桜: 'Rainy window JP 桜', 橙: 'Rainy window JP 橙', 灰: 'Rainy window JP 灰' }

/**
 * 色の組。テーマ「なし」は null（テーマを付けない）。
 * system＝ライトとダークの両方。dark／light＝そのモードだけを持ち、scheme でそのモードを指定する。
 */
export function buildTheme(choice: Choice, band: Band): { theme: Built['theme']; problems: string[]; scheme?: Mode } | null {
  if (choice.theme === 'なし') return null
  const theme = choice.theme
  const light = { gray: { anchors: anchorsFor(theme, band, 'light') } }
  const dark = { gray: { anchors: anchorsFor(theme, band, 'dark') } }
  if (choice.brightness === 'system') return makeColors({ label: LABEL[theme], roles: ROLES, light, dark })
  const scheme = choice.brightness
  const built = makeColors({ label: LABEL[theme], roles: ROLES, light, dark, only: scheme })
  return { ...built, scheme }
}

// ---- 部屋の色（背景色） ----
// 部屋の絵（scene.ts）の色は、アプリの文字色から昼用・夜用を選ぶ固定の色。そこで壁・床・光の色を
// 背景色ごとに作って渡す。壁だけ染めても、上に重なる窓の光（cool）・照明の赤み（rose）・机の光（floor）に
// 隠れて見えないので、それらも同じ色合いにそろえる。明るい画面でも分かるよう、彩度は高めにする。
// 紺の夜は、暗い画面だけ元の絵の色そのまま（明るい画面は淡い紺）。オフ（なし）は undefined を返し、元の絵のままになる。

/** 渡す色の名前（scene.ts の LIGHT / DARK の名前）。 */
export const ROOM_KEYS = ['top', 'mid', 'bottom', 'tex', 'shade', 'mat', 'cool', 'rose', 'floor'] as const
type RoomKey = (typeof ROOM_KEYS)[number]
export type RoomColors = { light: Record<string, string>; dark: Record<string, string> }

/**
 * 背景色ごとの色相（h）と、彩度に掛ける量（s）。dl・ddl は、その色だけ明るい画面・暗い画面の明るさをずらす量。
 * 紺の暗い画面だけは作らず、元の夜の部屋（ORIGINAL_ROOM.dark）を時間帯でずらす。紺の明るい画面は、
 * 元のままだとクリーム色で紺に見えないので、ほかの色と同じ作り方で淡い紺（青み）にする。
 */
const ROOM_SPEC: Record<Color, { h: number; s: number; dl?: number; ddl?: number }> = {
  紺: { h: 225, s: 1 },
  緑: { h: 135, s: 1 },
  桜: { h: 345, s: 1 },
  橙: { h: 28, s: 1.25, dl: -3 },
  灰: { h: 230, s: 0.08, ddl: 3 },
}

// scene.ts の元の部屋の色。紺の暗い画面に使う（明るい画面の値は、元の色合いを知るために残す）。
const ORIGINAL_ROOM: Record<Mode, Record<RoomKey, string>> = {
  light: { top: '#F2ECE2', mid: '#EFE7DB', bottom: '#EEDFCA', tex: '#DDD1BE', shade: '#D8C6AA', mat: '#F8F3EA', cool: '#BCC8EE', rose: '#EFC9D6', floor: '#F3D3B1' },
  dark: { top: '#13152E', mid: '#181A35', bottom: '#221A35', tex: '#20234A', shade: '#33284F', mat: '#1C1F3E', cool: '#3B4AB8', rose: '#7A3F8C', floor: '#C9704A' },
}

// [色相のずれ, 彩度, 明るさ]。写真（明るい画面・暗い画面）で見分けられることを確かめた値。
const ROOM_RECIPE: Record<Mode, Record<RoomKey, [number, number, number]>> = {
  light: {
    top: [0, 50, 85], mid: [0, 48, 82], bottom: [0, 46, 78], tex: [0, 35, 70], shade: [0, 32, 66], mat: [0, 35, 93],
    cool: [0, 55, 80], rose: [20, 50, 84], floor: [-15, 50, 78],
  },
  dark: {
    top: [0, 48, 15], mid: [0, 46, 17], bottom: [0, 44, 19], tex: [0, 40, 25], shade: [0, 35, 29], mat: [0, 38, 19],
    cool: [0, 55, 42], rose: [20, 45, 38], floor: [-15, 50, 44],
  },
}

// 時間帯のずらし：dl＝明るさを足す量、sat＝彩度に掛ける量、warm＝色相を暖色（25°）へ寄せる割合。
const ROOM_BAND: Record<Band, Record<Mode, { dl: number; sat: number; warm: number }>> = {
  夜: { light: { dl: 0, sat: 1, warm: 0 }, dark: { dl: 0, sat: 1, warm: 0 } },
  朝: { light: { dl: 3, sat: 0.95, warm: 0 }, dark: { dl: 6, sat: 0.95, warm: 0 } },
  昼: { light: { dl: 6, sat: 0.85, warm: 0 }, dark: { dl: 11, sat: 0.85, warm: 0 } },
  夕方: { light: { dl: 1, sat: 1.05, warm: 0.35 }, dark: { dl: 3, sat: 1.05, warm: 0.35 } },
}

function recipeHsl(spec: { h: number; s: number; dl?: number; ddl?: number }, mode: Mode, key: RoomKey): Hsl {
  const [dh, sat, l] = ROOM_RECIPE[mode][key]
  return { h: (spec.h + dh + 360) % 360, s: sat * spec.s, l: l + (mode === 'light' ? (spec.dl ?? 0) : (spec.ddl ?? 0)) }
}

/** 背景色と時間帯で決まる、部屋の壁・床・光の色。オフは undefined（元の絵のまま）。 */
export function roomColors(theme: ThemeName, band: Band): RoomColors | undefined {
  if (theme === 'なし') return undefined
  const out: RoomColors = { light: {}, dark: {} }
  for (const mode of ['light', 'dark'] as const) {
    const shift = ROOM_BAND[band][mode]
    for (const key of ROOM_KEYS) {
      const isOriginal = theme === '紺' && mode === 'dark'
      // 紺の夜の暗い画面は、元の夜の部屋の色をそのまま渡す（色の行き来で1つもずらさない）。
      if (isOriginal && band === '夜') {
        out[mode][key] = ORIGINAL_ROOM.dark[key]
        continue
      }
      let { h, s, l } = isOriginal ? hexToHsl(ORIGINAL_ROOM.dark[key]) : recipeHsl(ROOM_SPEC[theme], mode, key)
      if (shift.warm > 0) h = towardHue(h, WARM_HUE, shift.warm)
      out[mode][key] = hslToHex({ h, s: Math.min(100, s * shift.sat), l: Math.min(96, l + shift.dl) })
    }
  }
  return out
}
