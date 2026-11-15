import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// scene.ts と clawd/ は拡張子なしの import なので、test/setup.mjs（--import）で .ts を補って読む。
const ORIGINAL = pathToFileURL(join(homedir(), '.claude/plugins/cache/claude-code-themes/rainy-window/0.3.0/hooks/scene.ts')).href
const original: { sceneSvg: () => string } = await import(ORIGINAL)
const mine: { sceneSvg: (now?: Date) => string } = await import('../hooks/scene.ts')

// 日本時間の hh:mm:ss の瞬間。
const jst = (h: number, m: number, s = 0) => new Date(Date.UTC(2026, 10, 15, h - 9, m, s))

// 時計の中心（-380 178）に付いた外側の rotate(...) だけを取り除く。
const withoutHands = (svg: string) => svg.replace(/(<g transform="translate\(-380 178\))(?: rotate\([-\d.]+\))?">/g, '$1">')

test('針の角度のほかは、元の絵と完全に同じ', () => {
  const a = original.sceneSvg()
  for (const d of [jst(10, 10), jst(3, 30, 15), jst(0, 0), jst(23, 59, 59)]) {
    const b = mine.sceneSvg(d)
    assert.equal(b.length > 10000, true)
    assert.equal(withoutHands(b), withoutHands(a))
  }
})

test('元の時計は 10:10 固定（短針 300°・長針 60°）', () => {
  const a = original.sceneSvg()
  assert.ok(a.includes('<g transform="translate(-380 178) rotate(300)">'))
  assert.ok(a.includes('<g transform="translate(-380 178) rotate(60)">'))
})

test('日本時間で針が決まる', () => {
  const at1010 = mine.sceneSvg(jst(10, 10, 0))
  const at0330 = mine.sceneSvg(jst(3, 30, 15))
  assert.notEqual(at1010, at0330)
  assert.ok(at1010.includes('<g transform="translate(-380 178) rotate(305)">'), '短針 305°')
  assert.ok(at1010.includes('<g transform="translate(-380 178) rotate(60)">'), '長針 60°')
  assert.ok(at1010.includes('<g transform="translate(-380 178) rotate(0)">'), '秒針 0°')
  // 3:30:15 → 短針 105°、長針 181.5°、秒針 90°
  assert.ok(at0330.includes('rotate(105)">'))
  assert.ok(at0330.includes('rotate(181.5)">'))
  assert.ok(at0330.includes('rotate(90)">'))
})

test('同じ時刻なら同じ絵（毎回作り直さない）', () => {
  assert.equal(mine.sceneSvg(jst(8, 0)), mine.sceneSvg(jst(8, 0)))
})

test('絵は 131,072 文字の上限の内側', () => {
  assert.ok(mine.sceneSvg(jst(23, 59, 59)).length < 131072)
})

test('部屋の壁をテーマで染めても、変わるのは色の定義（svg{…}）だけ。染めなければ元のまま', async () => {
  const { roomColors } = await import('../hooks/lib/palette.ts')
  const scene = mine.sceneSvg as (now?: Date, room?: unknown) => string
  const d = jst(10, 10)
  const plain = scene(d)
  const forest = scene(d, roomColors('緑', '夜'))
  const grape = scene(d, roomColors('桜', '夜'))
  assert.equal(scene(d, undefined), plain)
  assert.notEqual(forest, plain)
  assert.notEqual(forest, grape)
  const withoutPalette = (svg: string) => svg.replace(/<style>svg\{[^}]*\}/, '<style>svg{}')
  assert.equal(withoutPalette(forest), withoutPalette(plain))
  assert.equal(withoutPalette(grape), withoutPalette(plain))
  // 壁の上の色（--top）が変わり、窓の外の空（--sky）は変わらない
  const varOf = (svg: string, name: string) => svg.match(new RegExp(`--${name}:([^;}]*)`))?.[1]
  assert.notEqual(varOf(forest, 'top'), varOf(plain, 'top'))
  assert.equal(varOf(forest, 'sky'), varOf(plain, 'sky'))
})

test('クロードくん抜き：標準と clawd:true は今と同じ。clawd:false は corner だけを抜く', () => {
  type Scene = (now?: Date, room?: unknown, opts?: { clawd?: boolean }) => string
  const scene = mine.sceneSvg as Scene
  const d = jst(10, 10)
  const full = scene(d)
  assert.equal(scene(d, undefined, { clawd: true }), full)
  const room = scene(d, undefined, { clawd: false })
  assert.ok(!room.includes('class="corner"'))
  assert.ok(full.includes('class="corner"'))
  // 部屋は、全体から corner の1つの svg を抜いたもの（<defs> は同じ）
  const head = room.slice(0, -'</svg>'.length)
  assert.ok(full.startsWith(head))
  assert.ok(full.endsWith('</svg>'))
  assert.ok(full.slice(head.length).startsWith('<svg x="100%" y="100%"'))
  assert.ok(room.includes('id="c0"'))
  // 続けて呼んでも、フラグごとの絵が混ざらない
  assert.equal(scene(d, undefined, { clawd: true }), full)
  assert.equal(scene(d, undefined, { clawd: false }), room)
})

// ---- Task 1b：1枚の絵に戻す（layer と seamless）----
type SceneFn = (now?: Date, room?: unknown, opts?: { clawd?: boolean; layer?: string; seamless?: boolean }) => string
const sceneOf = mine.sceneSvg as SceneFn
const beginsOf = (svg: string) => [...svg.matchAll(/begin="([^"]+)"/g)].map(m => m[1])
const handsOf = (svg: string) => [...svg.matchAll(/<animateTransform[^>]*type="rotate"[^>]*dur="(?:43200|3600|60)s"[^>]*\/>/g)].map(m => m[0])
const rainBegin = (svg: string) => svg.match(/<animateTransform[^>]*to="0 192"[^>]*dur="1\.5s"[^>]*?(?: begin="([^"]+)")?\/>/)?.[1]

test('layer：corner の代わりに、同じ場所へ層を置く（corner は入れない）', () => {
  const d = jst(10, 10)
  const svg = sceneOf(d, undefined, { layer: 'X' })
  assert.ok(svg.includes('translate(-520 -360)">X'))
  assert.ok(!svg.includes('class="corner"'))
  assert.ok(svg.includes('<svg x="100%" y="100%" width="1" height="1" overflow="visible"><g transform="translate(-520 -360)">X</g></svg></svg>'))
  // キャッシュ：層ごとの絵が混ざらない
  assert.notEqual(sceneOf(d, undefined, { layer: 'Y' }), svg)
  assert.equal(sceneOf(d, undefined, { layer: 'X' }), svg)
  assert.equal(sceneOf(d, undefined, { clawd: false }).includes('translate(-520 -360)'), false)
})

test('seamless：繰り返しの動きの begin を -(t mod dur) ずらす。時計の針はずらさない。標準はずらさない', () => {
  const a = jst(10, 10, 0)
  const b = new Date(a.getTime() + 5000)
  const plainA = sceneOf(a)
  const seamA = sceneOf(a, undefined, { seamless: true })
  const seamB = sceneOf(b, undefined, { seamless: true })
  // 標準は元と同じ begin のまま（星の遅れの負の値は元からある）
  assert.deepEqual(beginsOf(plainA), beginsOf(original.sceneSvg()))
  assert.notEqual(seamA, plainA)
  const t = (d: Date) => d.getTime() / 1000
  // ずれが 0 のときは begin を書かない（書かなくても同じ）
  const want = (d: Date) => ((t(d) % 1.5) === 0 ? undefined : (-(t(d) % 1.5)).toFixed(2) + 's')
  assert.equal(rainBegin(seamA), want(a))
  assert.equal(rainBegin(seamB), want(b))
  assert.notEqual(rainBegin(seamA), rainBegin(seamB))
  // 時計の針の animate は、どちらにも begin が無く、同じ
  const ha = handsOf(seamA)
  assert.equal(ha.length, 3)
  assert.ok(ha.every(h => !h.includes('begin=')))
  assert.deepEqual(handsOf(seamB), ha)
  // 遅れ（星の -1s など）は残したまま、ずらす
  const stars = [...seamA.matchAll(/<animate attributeName="opacity" values="1;\.4"[^>]*dur="3s"[^>]*?(?: begin="([^"]+)")?[/]>/g)].map(m => parseFloat(m[1] ?? "0"))
  assert.equal(stars.length, 7)
  const phase = t(a) % 3
  for (const s of stars) assert.ok([0, -1, -2].some(delay => Math.abs(s - (delay - phase)) < 0.011), String(s))
})

test('層つきの部屋全体（今の層）も 131,072 文字の内側', async () => {
  const { layerBody, legacyInner } = await import('../hooks/clawd/layer.ts')
  const svg = sceneOf(jst(10, 10), undefined, { layer: layerBody(legacyInner(), { fine: false }), seamless: true })
  assert.ok(svg.length <= 131072, String(svg.length))
  assert.equal((svg.match(/id="c0"/g) ?? []).length, 1)
  assert.equal(svg.includes('<style>') && svg.split('<style>').length === 2, true)
})

test('seamless：層（関数で渡す）の中の湯気も、部屋と同じように -(t mod dur) ずれる', async () => {
  const { layerBody, legacyInner } = await import('../hooks/clawd/layer.ts')
  const a = jst(10, 10, 0)
  const b = new Date(a.getTime() + 5000)
  const layerPart = (d: Date) => {
    const svg = sceneOf(d, undefined, { layer: () => layerBody(legacyInner(), { fine: false }), seamless: true })
    return svg.slice(svg.indexOf('translate(-520 -360)'))
  }
  // 湯気は drift：dur 2s の animateTransform（begin は遅れ 0 と -1 を残して -(t mod 2) ずれる）
  const steam = (part: string) => [...part.matchAll(/<animateTransform[^>]*type="translate"[^>]*from="0 0" to="1 -6" dur="2s"[^>]*?(?: begin="([^"]+)")?[/]>/g)].map(m => parseFloat(m[1] ?? '0'))
  const sa = steam(layerPart(a))
  const sb = steam(layerPart(b))
  assert.equal(sa.length, 2)
  const t = (d: Date) => d.getTime() / 1000
  sa.forEach((v, i) => {
    assert.ok(Math.abs(v - (-i - (t(a) % 2))) < 0.011, `a${i} ${v}`)
    assert.ok(Math.abs(sb[i]! - (-i - (t(b) % 2))) < 0.011, `b${i} ${sb[i]}`)
  })
  // 文字列で渡したものはずらさない（呼び出し側が作った文字列のまま）
  const fixed = layerBody(legacyInner(), { fine: false })
  assert.ok(sceneOf(a, undefined, { layer: fixed, seamless: true }).includes(fixed))

})
