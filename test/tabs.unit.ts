import { test } from 'node:test'
import assert from 'node:assert/strict'

// tabs.ts は拡張子なしの import を使うかもしれないので、test/setup.mjs（--import）で .ts を補って読む。
const { STRIP_H, TABS, TAB_LABEL, TIP_H, TIP_TEXT, isTab, tabButtonLabel, tabMotion, tabRuleText, tabSpot, tabStripSvg, tabTipSvg, tipSpot } = await import('../hooks/lib/tabs.ts')

type Tab = 'room' | 'clawd'
type Frame = ReturnType<typeof tabMotion>['frames'][number]

/** 名前が name の属性の値（無ければ undefined）。 */
const attr = (tag: string, name: string) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
/** open で始まる要素（閉じる close まで）。 */
const elementOf = (svg: string, open: string, close: string) => {
  const at = svg.indexOf(open)
  return at < 0 ? undefined : svg.slice(at, svg.indexOf(close, at) + close.length)
}
/** part の中の、attributeName が name の <animate …/> のタグ。 */
const animateOf = (part: string, name: string) => part.match(new RegExp(`<animate [^>]*attributeName="${name}"[^>]*/>`))?.[0]
/** values="a;b;…" の数。 */
const valuesOf = (tag: string | undefined) => (attr(tag ?? '', 'values') ?? '').split(';').map(Number)
/** 開きタグ（最初の > まで）。 */
const openTag = (part: string | undefined) => (part ?? '').slice(0, (part ?? '').indexOf('>') + 1)
/** ボタンの真ん中（selected を選んだあとの並び）。 */
const centre = (tab: Tab, width: number, selected: Tab) => {
  const s = tabSpot(tab, width, selected)
  return Math.round((s.x + s.w / 2) * 100) / 100
}
const SMIL_ONLY = /<script|<foreignObject|@keyframes|animation\s*:/i
const other = (tab: Tab): Tab => (tab === 'room' ? 'clawd' : 'room')

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

// ---- 変更 10：タブの上の吹き出し（Morph tooltip）と、タブの下の帯の、ばねの動き ----

test('吹き出しの言葉：背景 →「背景色・時間帯・保存先」、見た目 →「姿・演出・ドットを選ぶ」。絵の縦は 46（吹き出し 34 ＋ しっぽ）と 10', () => {
  assert.deepEqual(TIP_TEXT, { room: '背景色・時間帯・保存先', clawd: '姿・演出・ドットを選ぶ' })
  assert.equal(TIP_H, 46)
  assert.equal(STRIP_H, 10)
})

test('tipSpot：吹き出しの幅は言葉の幅の見当 ＋ 24（全角 11 文字 × 13 ＋ 24 ＝ 167）。しっぽは選んだタブのボタンの真ん中、吹き出しは絵の中に収まる', () => {
  for (const width of [600, 320]) {
    for (const tab of ['room', 'clawd'] as const) {
      const s = tipSpot(tab, width)
      assert.equal(s.w, 167)
      assert.equal(s.tail, centre(tab, width, tab))
      assert.ok(s.x >= 0 && s.x + s.w <= width, `${tab} ${width}`)
      assert.ok(s.tail >= s.x + 12 && s.tail <= s.x + s.w - 12)
    }
  }
  // 背景のタブは左の端にあるので、吹き出しは左の端で止まる（はみ出さない）
  assert.equal(tipSpot('room', 600).x, 0)
  // 見た目のタブでは、吹き出しの真ん中がボタンの真ん中
  const c = tipSpot('clawd', 600)
  assert.equal(c.x + c.w / 2, c.tail)
  // とても狭い絵でも、はみ出さない
  const narrow = tipSpot('clawd', 200)
  assert.ok(narrow.x >= 0 && narrow.x + narrow.w <= 200)
})

test('tabMotion（背景 → 見た目）：はじめは背景のタブの形、終わりは見た目のタブの形（ボタンの場所は、押したあとの並び）', () => {
  const { frames } = tabMotion('room', 'clawd', 600)
  const first = frames[0]
  const last = frames.at(-1)
  assert.ok(first !== undefined && last !== undefined)
  const room = tipSpot('room', 600)
  const clawd = tipSpot('clawd', 600)
  assert.deepEqual([first.tipX, first.tipW, first.tail], [room.x, room.w, centre('room', 600, 'clawd')])
  assert.deepEqual([first.bandX, first.bandW], [tabSpot('room', 600, 'clawd').x, tabSpot('room', 600, 'clawd').w])
  assert.deepEqual([last.tipX, last.tipW, last.tail], [clawd.x, clawd.w, clawd.tail])
  assert.deepEqual([last.bandX, last.bandW], [tabSpot('clawd', 600, 'clawd').x, tabSpot('clawd', 600, 'clawd').w])
  // 言葉：はじめは古い言葉だけ、終わりは新しい言葉だけ（ずれもぼかしも無い）
  assert.deepEqual(first.from, { opacity: 1, dx: 0, blur: 0 })
  assert.deepEqual(first.to, { opacity: 0, dx: 14, blur: 0 })
  assert.deepEqual(last.from, { opacity: 0, dx: -14, blur: 0 })
  assert.deepEqual(last.to, { opacity: 1, dx: 0, blur: 0 })
  // 1 秒のうちに止まる（押してから 1 秒だけ動く絵にするので）。1.2 秒の上限より前
  assert.ok(frames.length - 1 <= 60, `${frames.length - 1} コマ`)
  assert.ok(frames.length - 1 >= 20, `${frames.length - 1} コマ`)
})

test('tabMotion：動く向きの側の端（右へなら右の端）がかたいばねで先に動き、反対の端はやわらかいばねで遅れる（最初の 100 ms）。帯も同じ', () => {
  const right = tabMotion('room', 'clawd', 600).frames
  const r0 = right[0]
  const r6 = right[6]
  assert.ok(r0 !== undefined && r6 !== undefined)
  assert.ok(r6.tipX + r6.tipW - (r0.tipX + r0.tipW) > r6.tipX - r0.tipX, '吹き出し：右の端のほうが速い')
  assert.ok(r6.bandX + r6.bandW - (r0.bandX + r0.bandW) > r6.bandX - r0.bandX, '帯：右の端のほうが速い')
  // 端ごとの行き先までの道のりは違うので、道のりの何割を 100 ms で進んだかでも比べる（左へ動くときは左の端が先）
  const share = (frames: Frame[], edge: (f: Frame) => number) => {
    const [a, b, z] = [frames[0], frames[6], frames.at(-1)] as Frame[]
    return (edge(b) - edge(a)) / (edge(z) - edge(a))
  }
  const left = tabMotion('clawd', 'room', 600).frames
  const pairs: [Frame[], boolean][] = [[right, true], [left, false]]
  for (const [frames, toRight] of pairs) {
    const tip = [share(frames, f => f.tipX), share(frames, f => f.tipX + f.tipW)]
    const band = [share(frames, f => f.bandX), share(frames, f => f.bandX + f.bandW)]
    for (const [lead, trail] of [toRight ? [tip[1], tip[0]] : [tip[0], tip[1]], toRight ? [band[1], band[0]] : [band[0], band[1]]]) {
      assert.ok((lead ?? 0) > (trail ?? 0) + 0.2, `${toRight ? '右' : '左'}へ：${lead} > ${trail}`)
    }
  }
})

test('tabMotion：吹き出しは伸びてから、新しい言葉の幅に戻る。どのコマでも絵の中に収まり、しっぽは吹き出しの中（両端から 12）', () => {
  const pairs: [Tab, Tab][] = [['room', 'clawd'], ['clawd', 'room']]
  for (const [from, to] of pairs) {
    for (const width of [600, 320, 200]) {
      const { frames } = tabMotion(from, to, width)
      for (const f of frames) {
        assert.ok(f.tipX >= 0 && f.tipX + f.tipW <= width + 1e-9, `${from}→${to} ${width}: 吹き出し ${f.tipX} ${f.tipW}`)
        assert.ok(f.tipW >= 30)
        assert.ok(f.tail >= f.tipX + 12 - 1e-9 && f.tail <= f.tipX + f.tipW - 12 + 1e-9)
        assert.ok(f.bandX >= 0 && f.bandX + f.bandW <= width + 1e-9 && f.bandW >= 20)
        for (const l of [f.from, f.to]) {
          assert.ok(l.opacity >= 0 && l.opacity <= 1)
          assert.ok(l.blur >= 0 && l.blur <= 3)
          assert.ok(Math.abs(l.dx) <= 14)
        }
      }
      if (width === 600) assert.ok(Math.max(...frames.map(f => f.tipW)) > 167 + 30, `${from}→${to}: 伸びる`)
    }
  }
})

test('tabMotion：新しい言葉は向こう側から入り（右へなら右から）、古い言葉は来た側へ出ていく。途中は少しぼける（3 px まで）', () => {
  const { frames } = tabMotion('room', 'clawd', 600)
  assert.ok(frames.every(f => f.to.dx >= 0 && f.from.dx <= 0))
  assert.ok(frames.some(f => f.to.blur > 0.5))
  assert.ok(frames.some(f => f.from.blur > 0.5))
  const back = tabMotion('clawd', 'room', 600).frames
  assert.ok(back.every(f => f.to.dx <= 0 && f.from.dx >= 0))
  assert.deepEqual(back[0]?.to, { opacity: 0, dx: -14, blur: 0 })
})

test('tabTipSvg（背景 → 見た目、動く）：横 width・縦 46。吹き出しの x と width に fill="freeze" の animate（はじめは背景の形、終わりは見た目の形）。基の属性は終わりの形', () => {
  const svg = tabTipSvg('room', 'clawd', 600, true)
  const { frames } = tabMotion('room', 'clawd', 600)
  const end = frames.at(-1) as Frame
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="46" viewBox="0 0 600 46">'))
  const tip = elementOf(svg, '<rect id="tip"', '</rect>')
  assert.ok(tip !== undefined)
  const dur = `${Math.round(((frames.length - 1) / 60) * 10000) / 10000}s`
  const picks: [string, (f: Frame) => number][] = [['x', f => f.tipX], ['width', f => f.tipW]]
  for (const [name, pick] of picks) {
    const a = animateOf(tip, name)
    assert.ok(a !== undefined, name)
    assert.deepEqual(valuesOf(a), frames.map(pick))
    assert.equal(attr(a, 'fill'), 'freeze')
    assert.equal(attr(a, 'calcMode'), 'linear')
    assert.equal(attr(a, 'repeatCount'), '1')
    assert.equal(attr(a, 'dur'), dur)
    assert.equal(Number(attr(openTag(tip), name)), pick(end))
  }
  assert.equal(valuesOf(animateOf(tip, 'x'))[0], tipSpot('room', 600).x)
  assert.equal(valuesOf(animateOf(tip, 'x')).at(-1), tipSpot('clawd', 600).x)
  assert.equal(valuesOf(animateOf(tip, 'width'))[0], tipSpot('room', 600).w)
  assert.equal(valuesOf(animateOf(tip, 'width')).at(-1), tipSpot('clawd', 600).w)
  assert.equal(attr(openTag(tip), 'rx'), '11')
  assert.equal(attr(openTag(tip), 'height'), '34')
  // しっぽ：自分のばねで、背景のタブの真ん中から見た目のタブの真ん中へ
  const tail = elementOf(svg, '<g id="tail"', '</g>')
  assert.ok(tail !== undefined)
  const move = tail.match(/<animateTransform [^>]*\/>/)?.[0]
  assert.ok(move !== undefined)
  assert.equal(attr(move, 'type'), 'translate')
  assert.equal(attr(move, 'fill'), 'freeze')
  assert.equal(attr(move, 'dur'), dur)
  const points = (attr(move, 'values') ?? '').split(';').map(p => Number(p.split(' ')[0]))
  assert.deepEqual(points, frames.map(f => f.tail))
  assert.equal(attr(openTag(tail), 'transform'), `translate(${tipSpot('clawd', 600).tail} 31)`)
  assert.ok(tail.includes('width="12" height="12" rx="3" transform="rotate(45)"'))
  // 言葉は2つ（古い言葉は消えていき、新しい言葉が出る）。不透明度とずれ、ぼかし（feGaussianBlur）も動く
  const sides: [Tab, 'from' | 'to'][] = [['room', 'from'], ['clawd', 'to']]
  for (const [tab, side] of sides) {
    const label = elementOf(svg, `<g id="label-${tab}"`, '</text></g></g>')
    assert.ok(label !== undefined, tab)
    assert.ok(label.includes(`>${TIP_TEXT[tab]}</text>`))
    assert.deepEqual(valuesOf(animateOf(label, 'opacity')), frames.map(f => f[side].opacity))
    assert.equal(attr(openTag(label), 'opacity'), String(end[side].opacity))
    const slide = label.match(/<animateTransform [^>]*\/>/)?.[0]
    assert.ok(slide !== undefined)
    const xs = (attr(slide, 'values') ?? '').split(';').map(p => Number(p.split(' ')[0]))
    assert.deepEqual(xs, frames.map(f => Math.round((f.tipX + f.tipW / 2 + f[side].dx) * 100) / 100))
    const blur = elementOf(svg, `<filter id="blur-${tab}"`, '</filter>')
    assert.ok(blur !== undefined)
    assert.deepEqual(valuesOf(animateOf(blur, 'stdDeviation')), frames.map(f => f[side].blur))
  }
  assert.ok(svg.includes('fill="#1F1F26"'))
  assert.ok(svg.includes('font-size="13" font-weight="500" fill="#FFFFFF"'))
})

test('tabStripSvg（背景 → 見た目、動く）：横 width・縦 10。帯の x と width が、同じ LEAD・TRAIL の端で動く（吹き出しと同じ長さ）', () => {
  const svg = tabStripSvg('room', 'clawd', 600, true)
  const { frames } = tabMotion('room', 'clawd', 600)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="10" viewBox="0 0 600 10">'))
  const band = elementOf(svg, '<rect id="band"', '</rect>')
  assert.ok(band !== undefined)
  const x = animateOf(band, 'x')
  const w = animateOf(band, 'width')
  assert.deepEqual(valuesOf(x), frames.map(f => f.bandX))
  assert.deepEqual(valuesOf(w), frames.map(f => f.bandW))
  assert.equal(valuesOf(x)[0], tabSpot('room', 600, 'clawd').x)
  assert.equal(valuesOf(w)[0], tabSpot('room', 600, 'clawd').w)
  assert.equal(valuesOf(x).at(-1), tabSpot('clawd', 600, 'clawd').x)
  assert.equal(valuesOf(w).at(-1), tabSpot('clawd', 600, 'clawd').w)
  const tipDur = attr(animateOf(tabTipSvg('room', 'clawd', 600, true), 'x') ?? '', 'dur')
  for (const a of [x, w]) {
    assert.equal(attr(a ?? '', 'fill'), 'freeze')
    assert.equal(attr(a ?? '', 'calcMode'), 'linear')
    assert.equal(attr(a ?? '', 'repeatCount'), '1')
    assert.equal(attr(a ?? '', 'dur'), tipDur)
  }
  assert.equal(Number(attr(openTag(band), 'x')), tabSpot('clawd', 600, 'clawd').x)
  assert.equal(Number(attr(openTag(band), 'width')), tabSpot('clawd', 600, 'clawd').w)
})

test('止まった絵（animate が false か、同じタブ）：<animate が1つも無く、行き先のタブの形（動く絵の終わりと同じ場所）', () => {
  const pairs: [Tab, Tab][] = [['room', 'clawd'], ['clawd', 'room'], ['room', 'room'], ['clawd', 'clawd']]
  for (const width of [600, 320]) {
    for (const [from, to] of pairs) {
      for (const make of [tabTipSvg, tabStripSvg]) {
        const still = make(from, to, width, false)
        assert.ok(!still.includes('<animate'), `${from}→${to}`)
        assert.equal(still, make(to, to, width, true))
      }
      const tip = tabTipSvg(from, to, width, false)
      const s = tipSpot(to, width)
      assert.ok(tip.includes(`<rect id="tip" x="${s.x}" y="0" width="${s.w}" height="34" rx="11" fill="#1F1F26"/>`))
      assert.ok(tip.includes(`<g id="tail" transform="translate(${s.tail} 31)">`))
      assert.ok(tip.includes(`>${TIP_TEXT[to]}</text>`))
      assert.ok(!tip.includes(`>${TIP_TEXT[other(to)]}</text>`))
      const b = tabSpot(to, width, to)
      assert.ok(tabStripSvg(from, to, width, false).includes(`<rect id="band" x="${b.x}" y="5" width="${b.w}" height="3" rx="1.5" fill="#D97757"/>`))
    }
  }
})

test('タブの絵：同じ引数なら同じ文字列（決まった結果）。向きや横幅が違えば違う', () => {
  assert.equal(tabTipSvg('room', 'clawd', 600, true), tabTipSvg('room', 'clawd', 600, true))
  assert.equal(tabStripSvg('room', 'clawd', 600, true), tabStripSvg('room', 'clawd', 600, true))
  assert.notEqual(tabTipSvg('room', 'clawd', 600, true), tabTipSvg('clawd', 'room', 600, true))
  assert.notEqual(tabStripSvg('room', 'clawd', 600, true), tabStripSvg('clawd', 'room', 600, true))
  assert.notEqual(tabTipSvg('room', 'clawd', 600, true), tabTipSvg('room', 'clawd', 320, true))
})

test('タブの絵：SMIL だけ（CSS のアニメーション・script・foreignObject は使わない）、1枚 30,000 文字まで', () => {
  const pairs: [Tab, Tab][] = [['room', 'clawd'], ['clawd', 'room'], ['room', 'room']]
  for (const width of [600, 320]) {
    for (const [from, to] of pairs) {
      for (const animate of [true, false]) {
        for (const svg of [tabTipSvg(from, to, width, animate), tabStripSvg(from, to, width, animate)]) {
          assert.ok(!SMIL_ONLY.test(svg))
          assert.ok(svg.length <= 30000, `${svg.length}`)
          assert.ok(svg.endsWith('</svg>'))
        }
      }
    }
  }
})

test('tabRuleText（ターミナル）：選んだタブの下だけ太い線 ━、ほかは細い線 ─', () => {
  const room = tabRuleText('room')
  const clawd = tabRuleText('clawd')
  assert.ok(/^━+─+$/.test(room), room)
  assert.ok(/^─+━+$/.test(clawd), clawd)
  assert.equal(room.length, clawd.length)
})
