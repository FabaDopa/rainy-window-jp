import { test } from 'node:test'
import assert from 'node:assert/strict'

// tabs.ts は拡張子なしの import を使うかもしれないので、test/setup.mjs（--import）で .ts を補って読む。
const { TABS, TAB_LABEL, isTab, tabButtonLabel, tabSpot, tabStripSvg, tabTitleSvg, tabRuleText } = await import('../hooks/lib/tabs.ts')

/** 名前が name の属性の値（無ければ undefined）。 */
const attr = (tag: string, name: string) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
/** attributeName が name の <animate …/> のタグ（属性のあいだは空白1つ）。 */
const animateOf = (svg: string, name: string) => svg.match(new RegExp(`<animate [^>]*attributeName="${name}"[^>]*/>`))?.[0]

test('タブ：2つ、名前は 🎨 背景 と 🐾 クロードくんの見た目', () => {
  assert.deepEqual([...TABS], ['room', 'clawd'])
  assert.deepEqual(TAB_LABEL, { room: '🎨 背景', clawd: '🐾 クロードくんの見た目' })
  assert.equal(isTab('room'), true)
  assert.equal(isTab('clawd'), true)
  assert.equal(isTab('x'), false)
  assert.equal(isTab(undefined), false)
})

test('tabButtonLabel：選んだタブのボタンのラベルは、どの画面でも ✓ で終わる', () => {
  assert.equal(tabButtonLabel('room', true), '🎨 背景 ✓')
  assert.equal(tabButtonLabel('room', false), '🎨 背景')
  assert.equal(tabButtonLabel('clawd', true), '🐾 クロードくんの見た目 ✓')
  assert.equal(tabButtonLabel('clawd', false), '🐾 クロードくんの見た目')
})

test('tabSpot：背景のタブが左、見た目のタブが右。狭くても横幅に収まる', () => {
  for (const selected of ['room', 'clawd'] as const) {
    for (const width of [600, 320, 120]) {
      const room = tabSpot('room', width, selected)
      const clawd = tabSpot('clawd', width, selected)
      assert.ok(room.x >= 0 && room.w > 0)
      assert.ok(clawd.x > room.x + room.w - 0.01, `${selected} ${width}: 見た目のタブは背景のタブの右`)
      assert.ok(clawd.x + clawd.w <= width + 0.01, `${selected} ${width}: 横幅に収まる`)
    }
  }
  // 名前の長い見た目のタブのほうが広い
  assert.ok(tabSpot('clawd', 600, 'room').w > tabSpot('room', 600, 'room').w)
})

test('tabSpot：選んだタブのボタンは ✓ のぶん広く、その右のボタンは右へずれる', () => {
  assert.ok(tabSpot('room', 600, 'room').w > tabSpot('room', 600, 'clawd').w)
  assert.ok(tabSpot('clawd', 600, 'clawd').w > tabSpot('clawd', 600, 'room').w)
  assert.ok(tabSpot('clawd', 600, 'room').x > tabSpot('clawd', 600, 'clawd').x)
  assert.equal(tabSpot('room', 600, 'room').x, 0)
})

test('tabStripSvg：横 width・縦 10。背景 → 見た目で、光の帯が左から右へ 0.3 秒ですべり、最後で止まる', () => {
  const svg = tabStripSvg('room', 'clawd', 600)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="10"'))
  const move = animateOf(svg, 'x')
  assert.ok(move !== undefined, 'attributeName="x" の animate がある')
  const from = Number(attr(move, 'from'))
  const to = Number(attr(move, 'to'))
  // 帯はタブを押したあとの並び（選んだ見た目のタブに ✓）の上で、背景のボタンの下から見た目のボタンの下へ
  assert.equal(from, tabSpot('room', 600, 'clawd').x)
  assert.equal(to, tabSpot('clawd', 600, 'clawd').x)
  assert.ok(from < to)
  assert.equal(attr(move, 'dur'), '0.3s')
  assert.equal(attr(move, 'fill'), 'freeze')
  const grow = animateOf(svg, 'width')
  assert.ok(grow !== undefined)
  assert.equal(Number(attr(grow, 'from')), tabSpot('room', 600, 'clawd').w)
  assert.equal(Number(attr(grow, 'to')), tabSpot('clawd', 600, 'clawd').w)
  // 帯そのものの x は行き先（SMIL が動かない画面でも、選んだタブの下にある）
  assert.ok(svg.includes(`<rect x="${to}" y="5" width="${tabSpot('clawd', 600, 'clawd').w}"`))
  // 帯の先に小さなキラッ（不透明度が上がって消える）
  assert.ok(/attributeName="opacity" values="0;1;1;0"/.test(svg))
})

test('tabStripSvg：見た目 → 背景では右から左へ（選んだ背景のタブに ✓ の並びで）', () => {
  const move = animateOf(tabStripSvg('clawd', 'room', 600), 'x')
  assert.ok(move !== undefined)
  assert.ok(Number(attr(move, 'from')) > Number(attr(move, 'to')))
  assert.equal(Number(attr(move, 'from')), tabSpot('clawd', 600, 'room').x)
  assert.equal(Number(attr(move, 'to')), tabSpot('room', 600, 'room').x)
})

test('tabStripSvg：同じタブなら動かない帯（animate が1つも無い）', () => {
  for (const tab of ['room', 'clawd'] as const) {
    const svg = tabStripSvg(tab, tab, 600)
    assert.ok(!svg.includes('<animate'), tab)
    assert.ok(svg.includes(`<rect x="${tabSpot(tab, 600, tab).x}" y="5" width="${tabSpot(tab, 600, tab).w}"`))
  }
})

test('tabStripSvg・tabTitleSvg：同じ引数なら同じ文字列（描き直しても動き直さない）', () => {
  assert.equal(tabStripSvg('room', 'clawd', 600), tabStripSvg('room', 'clawd', 600))
  assert.equal(tabTitleSvg('clawd', 600), tabTitleSvg('clawd', 600))
  assert.notEqual(tabStripSvg('room', 'clawd', 600), tabStripSvg('clawd', 'room', 600))
  assert.notEqual(tabTitleSvg('room', 600), tabTitleSvg('clawd', 600))
})

test('tabTitleSvg：タブの名前の帯が、左から 0.25 秒ですっと入る（不透明度と位置）', () => {
  for (const tab of ['room', 'clawd'] as const) {
    const svg = tabTitleSvg(tab, 600)
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600"'))
    assert.ok(svg.includes(`>${TAB_LABEL[tab]}</text>`))
    const fade = animateOf(svg, 'opacity')
    assert.ok(fade !== undefined)
    assert.equal(attr(fade, 'from'), '0')
    assert.equal(attr(fade, 'to'), '1')
    assert.equal(attr(fade, 'dur'), '0.25s')
    assert.equal(attr(fade, 'fill'), 'freeze')
    const slide = svg.match(/<animateTransform\s[^>]*type="translate"[^>]*\/>/)?.[0]
    assert.ok(slide !== undefined)
    assert.ok(Number(attr(slide, 'from')?.split(' ')[0]) < 0, '左から入る')
    assert.equal(attr(slide, 'to'), '0 0')
    assert.equal(attr(slide, 'dur'), '0.25s')
    assert.equal(attr(slide, 'fill'), 'freeze')
  }
})

test('タブの SVG：SMIL だけ（CSS のアニメーション・script・foreignObject は使わない）、大きさの上限より小さい', () => {
  for (const svg of [tabStripSvg('room', 'clawd', 600), tabStripSvg('clawd', 'clawd', 320), tabTitleSvg('room', 600), tabTitleSvg('clawd', 320)]) {
    assert.ok(!/<script|<foreignObject|@keyframes|animation\s*:/i.test(svg))
    assert.ok(svg.length <= 131072)
    assert.ok(svg.endsWith('</svg>'))
  }
})

test('tabRuleText（ターミナル）：選んだタブの下だけ太い線 ━、ほかは細い線 ─', () => {
  const room = tabRuleText('room')
  const clawd = tabRuleText('clawd')
  assert.ok(/^━+─+$/.test(room), room)
  assert.ok(/^─+━+$/.test(clawd), clawd)
  assert.equal(room.length, clawd.length)
})
