import { test } from 'node:test'
import assert from 'node:assert/strict'

// 拡張子なしの import は test/setup.mjs（--import）で .ts を補って読む。
const R = await import('../hooks/room-tile.ts')
const { roomColors } = await import('../hooks/lib/palette.ts')

const THEMES = ['紺', '緑', '桜', '橙', '灰'] as const
const BANDS = ['朝', '昼', '夕方', '夜'] as const

/**
 * 入力欄の上の帯に、本物のアプリで描けたことが確かめてある量（前の版のカードの絵の合計 約 77,000 字）。
 * 背景のタブは部屋の絵を5枚並べるので、5枚の合計をこれより小さくする（2026-11-15：1枚 92,000 字の絵を5枚並べたら、カードごと出なかった）。
 */
const BAND_PROVEN = 77_000

test('部屋の小さな絵：暗い画面の部屋の上に、明るい画面の部屋を右下半分だけ重ねる。5色を並べても、帯で描けた量より小さい', () => {
  for (const band of BANDS) {
    let total = 0
    for (const theme of THEMES) {
      const name = `${theme}・${band}`
      const svg = R.roomTileSvg(roomColors(theme, band), 104, 65)
      total += svg.length
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="104" height="65" viewBox="0 0 160 100">/, name)
      // 暗い画面の部屋（全体）と、明るい画面の部屋（右下半分に切ったもの）
      assert.equal(svg.split('data-mode="dark"').length - 1, 1, name)
      assert.equal(svg.split('data-mode="light"').length - 1, 1, name)
      assert.match(svg, /<g data-mode="light" clip-path="url\(#[^)]+\)">/, name)
      // 止まった絵（動きは無い）。色は文字色に頼らず、明るい画面・暗い画面の色をそのまま書く（画像として描かれても同じ色）
      assert.equal(svg.includes('<animate'), false, name)
      assert.equal(svg.includes('currentColor'), false, name)
      // id は重ならない
      const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1])
      assert.equal(new Set(ids).size, ids.length, `${name}: id が重なる`)
      // 角に、月（暗い画面）と太陽（明るい画面）の印
      assert.ok(svg.includes('data-mark="moon"') && svg.includes('data-mark="sun"'), name)
    }
    // 5枚で 60,000 字まで（カードのほかの部分を足しても、帯で描けた量に収まるように）
    assert.ok(total <= 60_000 && total < BAND_PROVEN, `${band}：5枚で ${total} 文字`)
  }
})

test('部屋の小さな絵：部屋の色（壁・光・床）は、本物の部屋の色をそのまま使う。明るい画面は light の色、暗い画面は dark の色', () => {
  for (const theme of THEMES) {
    const room = roomColors(theme, '夜')!
    const svg = R.roomTileSvg(room, 104, 65)
    const dark = /<g data-mode="dark">([\s\S]*?)<\/g><g data-mode="light"/.exec(svg)?.[1] ?? ''
    const light = /<g data-mode="light"[^>]*>([\s\S]*)<\/g>/.exec(svg)?.[1] ?? ''
    for (const key of ['top', 'mid', 'bottom']) {
      assert.ok(svg.includes(room.dark[key]!), `${theme}：暗い画面の ${key}`)
      assert.ok(svg.includes(room.light[key]!), `${theme}：明るい画面の ${key}`)
    }
    assert.ok(dark.length > 0 && light.length > 0, theme)
  }
})

test('部屋の小さな絵：同じ色・同じ大きさなら同じ文字列（作り直さない）。色が違えば違う絵', () => {
  const a = R.roomTileSvg(roomColors('緑', '夜'), 104, 65)
  assert.equal(R.roomTileSvg(roomColors('緑', '夜'), 104, 65), a)
  assert.notEqual(R.roomTileSvg(roomColors('桜', '夜'), 104, 65), a)
  assert.notEqual(R.roomTileSvg(roomColors('緑', '朝'), 104, 65), a)
  assert.match(R.roomTileSvg(roomColors('緑', '夜'), 88, 55), /width="88" height="55"/)
})
