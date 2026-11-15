import { test } from 'node:test'
import assert from 'node:assert/strict'

import { makeColors } from '../hooks/make-colors.js'
import { DEFAULT_CHOICE } from '../hooks/lib/choice.ts'
import type { Brightness, Choice, ThemeName } from '../hooks/lib/choice.ts'
import { anchorsFor, buildTheme, hexToHsl } from '../hooks/lib/palette.ts'
import type { Band } from '../hooks/lib/time.ts'

// 元の rainy-window 0.3.0 の hooks/register.ts の引数を、そのまま写したもの。
const ORIGINAL = makeColors({
  label: 'Rainy window',
  roles: { accent: '#5562C9', danger: '#C9553E', success: '#4E8B62', warning: '#D9892F', pro: '#7E5FC0' },
  light: {
    gray: {
      anchors: { 'surface-0': '#E9E3D6', 'surface-1': '#F0EBE1', 'surface-2': '#F6F2EA', 'text-primary': '#1F1F26', 'text-secondary': '#45444F', 'text-muted': '#5F5D68' },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#12142A',
        'surface-1': '#181B33',
        'surface-2': '#1D2140',
        'surface-3': '#22264A',
        'text-primary': '#EDE6D6',
        'text-secondary': '#CBC3B3',
        'text-muted': '#A8A192',
      },
    },
  },
})


const THEMES: ThemeName[] = ['紺', '緑', '桜', '橙', '灰']
const BANDS: Band[] = ['朝', '昼', '夕方', '夜']
const BRIGHT: Brightness[] = ['system', 'dark', 'light']
const fixed = (theme: ThemeName, band: Band, brightness: Brightness = 'system'): Choice => ({ theme, time: { kind: 'fixed', band }, brightness })

test('標準（紺・夜・システム）は元と完全に同じ', () => {
  const built = buildTheme(DEFAULT_CHOICE, '夜')
  assert.ok(built)
  assert.deepStrictEqual(built.theme, ORIGINAL.theme)
  assert.deepStrictEqual(built.problems, ORIGINAL.problems)
  assert.equal(built.scheme, undefined)
})

test('5色×4時間帯×3明るさすべてで例外が無く、デスクトップが描けない色・文字の読みにくさが無い', () => {
  for (const theme of THEMES) for (const band of BANDS) for (const brightness of BRIGHT) {
    const where = `${theme}・${band}・${brightness}`
    const built = buildTheme(fixed(theme, band, brightness), band)
    assert.ok(built, where)
    const bad = built.problems.filter(p => p.startsWith("Desktop won't paint") || /^text-(primary|secondary|muted) on surface-/.test(p))
    assert.deepEqual(bad, [], where)
  }
})

function hueGap(hex: string, target = 25): number {
  const d = Math.abs(hexToHsl(hex).h - target) % 360
  return Math.min(d, 360 - d)
}

test('面の色：夕方は昼より色相が 25° に近い（灰・橙は除く）', () => {
  for (const theme of ['紺', '緑', '桜'] as const) for (const mode of ['dark', 'light'] as const) {
    const evening = anchorsFor(theme, '夕方', mode)['surface-0']
    const day = anchorsFor(theme, '昼', mode)['surface-0']
    assert.ok(hueGap(evening) < hueGap(day), `${theme} ${mode}: ${evening} vs ${day}`)
  }
})

test('面の色：夜は朝・昼より暗い', () => {
  for (const theme of THEMES) for (const mode of ['dark', 'light'] as const) {
    const night = hexToHsl(anchorsFor(theme, '夜', mode)['surface-0']).l
    for (const band of ['朝', '昼'] as const) assert.ok(night < hexToHsl(anchorsFor(theme, band, mode)['surface-0']).l, `${theme} ${mode} ${band}`)
  }
})

test('紺の夜の面の色は元の色', () => {
  assert.equal(anchorsFor('紺', '夜', 'dark')['surface-0'], '#12142A')
  assert.equal(anchorsFor('紺', '夜', 'light')['surface-0'], '#E9E3D6')
})

test('文字色は全色・全時間帯で元のまま', () => {
  for (const theme of THEMES) for (const band of BANDS) {
    const d = anchorsFor(theme, band, 'dark')
    const l = anchorsFor(theme, band, 'light')
    assert.equal(d['text-primary'], '#EDE6D6')
    assert.equal(d['text-muted'], '#A8A192')
    assert.equal(l['text-primary'], '#1F1F26')
    assert.equal(l['text-muted'], '#5F5D68')
    assert.equal('surface-3' in l, false)
  }
})

test('黒は暗い色だけ、白は明るい色だけを持ち、その明るさを指定する', () => {
  for (const theme of THEMES) for (const band of BANDS) {
    const sys = buildTheme(fixed(theme, band), band)
    const dark = buildTheme(fixed(theme, band, 'dark'), band)
    const light = buildTheme(fixed(theme, band, 'light'), band)
    assert.ok(sys && dark && light)
    assert.deepEqual(Object.keys(dark.theme.inputs), ['dark'])
    assert.deepEqual(Object.keys(light.theme.inputs), ['light'])
    assert.equal(dark.scheme, 'dark')
    assert.equal(light.scheme, 'light')
    assert.deepStrictEqual(dark.theme.inputs.dark, sys.theme.inputs.dark)
    assert.deepStrictEqual(light.theme.inputs.light, sys.theme.inputs.light)
  }
})

test('オフ（なし）は null', () => {
  assert.equal(buildTheme({ ...DEFAULT_CHOICE, theme: 'なし' }, '夜'), null)
  assert.equal(buildTheme({ ...DEFAULT_CHOICE, theme: 'なし', brightness: 'dark' }, '昼'), null)
})

// ---- 部屋の色（背景色） ----
import { ROOM_KEYS, roomColors } from '../hooks/lib/palette.ts'

// scene.ts の元の部屋の色（壁の上）。
const ORIGINAL_TOP = { light: '#F2ECE2', dark: '#13152E' }
const rgbGap = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!)
}

// scene.ts の元の部屋の色（暗い画面）。
const ORIGINAL_DARK_ROOM: Record<string, string> = { top: '#13152E', mid: '#181A35', bottom: '#221A35', tex: '#20234A', shade: '#33284F', mat: '#1C1F3E', cool: '#3B4AB8', rose: '#7A3F8C', floor: '#C9704A' }

test('部屋：オフは色を渡さない（元の絵のまま）', () => {
  for (const band of BANDS) assert.equal(roomColors('なし', band), undefined)
})

test('部屋：紺の夜は、暗い画面では元の夜の部屋そのまま、明るい画面では淡い紺（青み）の部屋', () => {
  const navy = roomColors('紺', '夜')
  assert.ok(navy)
  assert.deepEqual(navy.dark, ORIGINAL_DARK_ROOM)
  assert.ok(rgbGap(navy.light.top!, ORIGINAL_TOP.light) >= 25, `紺 light ${navy.light.top}`)
  assert.ok(hueGap(navy.light.top!, 225) <= 15, `紺 light の色相 ${navy.light.top}`)
  assert.ok(hexToHsl(navy.light.top!).s >= 30, `紺 light の彩度 ${navy.light.top}`)
})

test('部屋：どの色・時間帯でも、壁・床・光の色が全部そろう', () => {
  for (const theme of THEMES) for (const band of BANDS) {
    const room = roomColors(theme, band)
    assert.ok(room, `${theme} ${band}`)
    assert.deepEqual(Object.keys(room.light).sort(), [...ROOM_KEYS].sort())
    assert.deepEqual(Object.keys(room.dark).sort(), [...ROOM_KEYS].sort())
  }
})

test('部屋：4色（緑・桜・橙・灰）の夜は、元の部屋とはっきり違う色（明るい画面でも暗い画面でも）', () => {
  for (const theme of ['緑', '桜', '橙', '灰'] as const) {
    const room = roomColors(theme, '夜')!
    assert.ok(rgbGap(room.light.top!, ORIGINAL_TOP.light) >= 25, `${theme} light ${room.light.top}`)
    assert.ok(rgbGap(room.dark.top!, ORIGINAL_TOP.dark) >= 25, `${theme} dark ${room.dark.top}`)
  }
  // 色どうしも、はっきり違う（明るい画面では紺も入れる）
  const tops = (['緑', '桜', '橙', '灰'] as const).map(t => roomColors(t, '夜')!)
  const navyLight = roomColors('紺', '夜')!.light.top!
  for (const room of tops) assert.ok(rgbGap(room.light.top!, navyLight) >= 25, `紺 light vs ${room.light.top}`)
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
    assert.ok(rgbGap(tops[i]!.light.top!, tops[j]!.light.top!) >= 25, `light ${i}-${j}`)
    assert.ok(rgbGap(tops[i]!.dark.top!, tops[j]!.dark.top!) >= 20, `dark ${i}-${j}`)
  }
})

test('部屋：色合い（緑は緑、桜は赤紫寄りの桃、橙は橙、灰は色味なし）', () => {
  const night = (t: ThemeName) => roomColors(t, '夜')!
  assert.ok(hueGap(night('緑').light.top!, 135) <= 15)
  assert.ok(hueGap(night('緑').dark.top!, 135) <= 15)
  assert.ok(hueGap(night('桜').light.top!, 345) <= 15)
  assert.ok(hueGap(night('橙').light.top!, 28) <= 15)
  assert.ok(hexToHsl(night('緑').light.top!).s >= 35)
  assert.ok(hexToHsl(night('灰').light.top!).s <= 10)
  assert.ok(hexToHsl(night('灰').dark.top!).s <= 10)
})

test('部屋：時間帯で変わる（朝・昼は夜より明るく、夕方は暖かい色へ）', () => {
  for (const theme of THEMES) for (const mode of ['light', 'dark'] as const) {
    const night = roomColors(theme, '夜')![mode].top!
    for (const band of ['朝', '昼'] as const) {
      assert.ok(hexToHsl(roomColors(theme, band)![mode].top!).l > hexToHsl(night).l, `${theme} ${mode} ${band}`)
    }
  }
  for (const theme of ['緑', '桜'] as const) for (const mode of ['light', 'dark'] as const) {
    assert.ok(hueGap(roomColors(theme, '夕方')![mode].top!) < hueGap(roomColors(theme, '夜')![mode].top!), `${theme} ${mode} 夕方`)
  }
})
