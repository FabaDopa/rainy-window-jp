import { test } from 'node:test'
import assert from 'node:assert/strict'

// layer.ts は拡張子なしの import を使うので、test/setup.mjs（--import）で .ts を補って読む。
const { layerSvg, legacyInner, LAYER_W, LAYER_H } = await import('../hooks/clawd/layer.ts')

test('クロードくんの層：520x360、点のマスク、元の位置の変換', () => {
  assert.equal(LAYER_W, 520)
  assert.equal(LAYER_H, 360)
  const svg = layerSvg(legacyInner(), { fine: false })
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="360">'))
  assert.ok(svg.includes('id="c0"') && svg.includes('id="c2"') && svg.includes('id="c3"'))
  assert.ok(!svg.includes('id="fm0"'))
  assert.ok(svg.includes('<style>'))
  assert.ok(svg.includes('translate(276 205) scale(6)'))
  assert.ok(svg.includes('mask="url(#c0)"'))
  assert.ok(svg.length <= 131072)
})

test('クロードくんの層：細かい点のマスク（fm0 fm2 fm3）', () => {
  const svg = layerSvg(legacyInner(), { fine: true })
  assert.ok(svg.includes('id="fm0"') && svg.includes('id="fm2"') && svg.includes('id="fm3"'))
  assert.ok(svg.length <= 131072)
})

test('layerBody：部屋に無いものだけ（style も c0 マスクも入れない）', async () => {
  const { layerBody } = await import('../hooks/clawd/layer.ts')
  const plain = layerBody('X', { fine: false })
  assert.ok(!plain.includes('<style') && !plain.includes('id="c0"') && !plain.includes('id="fm0"'))
  assert.ok(plain.includes('<g transform="translate(276 205) scale(6)">X</g>'))
  const fine = layerBody('X', { fine: true })
  assert.ok(fine.includes('id="fm0"') && !fine.includes('id="c0"') && !fine.includes('<style'))
})

// ---- Task 5：クロードくんの層を組み立てる ----
const T5 = await import('../hooks/clawd/layer.ts')
const { sceneSvg } = await import('../hooks/scene.ts')
const { roomColors } = await import('../hooks/lib/palette.ts')
const { effectFor, shakeAnim } = await import('../hooks/clawd/fx.ts')
const { PHASES } = await import('../hooks/clawd/scripts.ts')
const { paintMini, paintMiniFine } = await import('../hooks/clawd/paint.ts')
const { at, YOU } = await import('../hooks/clawd/pose.ts')

type View = Parameters<typeof T5.clawdLayerSvg>[0]
const LOOKS5 = ['sonnet', 'haiku', 'opus', 'fable'] as const
const BASE: View = { look: 'sonnet', phase: 'write', effect: 0, tempo: 1, showEffect: false, dots: 'fine', subagents: 0, arrive: [], leave: [] }
const view = (o: Partial<View>): View => ({ ...BASE, ...o })
const count = (s: string, sub: string) => s.split(sub).length - 1
const laptops = (s: string, fine: boolean) => count(s, fine ? T5.MINI_LAPTOP_FINE : T5.MINI_LAPTOP)
const ids = (s: string) => [...s.matchAll(/ id="([^"]+)"/g)].map(m => m[1]!)
const ALLOWED = new Set(['svg', 'style', 'defs', 'pattern', 'mask', 'circle', 'rect', 'path', 'g', 'animate', 'animateTransform'])
const tags = (s: string) => new Set([...s.matchAll(/<([A-Za-z]+)/g)].map(m => m[1]!))
const ONCE = 'repeatCount="1" fill="freeze"'

test('場所と上限：SUB_SPOTS・HAIKU_SUB_SPOTS・LAYER_BUDGET', () => {
  assert.deepEqual(T5.SUB_SPOTS, [[-12, 9], [6, -7], [24, 3], [-3, 6], [13, 6]])
  assert.deepEqual(T5.HAIKU_SUB_SPOTS, [[-3, 6], [9, 6]])
  assert.equal(T5.LAYER_BUDGET, 65_000)
})

test('clawdLayerSvg：520x360 の単独の SVG、clawdLayerBody は部屋に置く形', () => {
  for (const dots of ['normal', 'fine'] as const) {
    const v = view({ dots })
    const svg = T5.clawdLayerSvg(v)
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="360">'))
    assert.ok(svg.includes('<style>') && svg.includes('id="c0"') && svg.includes('translate(276 205) scale(6)'))
    assert.equal(svg.includes('id="fm0"'), dots === 'fine')
    assert.ok(svg.includes(T5.clawdLayerInner(v)))
    const body = T5.clawdLayerBody(v)
    assert.equal(body, T5.layerBody(T5.clawdLayerInner(v), { fine: dots === 'fine' }))
    assert.ok(!body.includes('<style') && !body.includes('id="c0"'))
  }
})

test('大きさの上限：いちばん重い組み合わせでも、軽い版で演出を残して入る（部屋と合わせて 131,072 文字以下）', () => {
  const t = new Date('2026-11-15T01:10:00Z')
  const room = roomColors('緑', '朝')
  const heavy: View[] = []
  for (const look of LOOKS5)
    for (const phase of PHASES)
      for (const dots of ['fine', 'normal'] as const) {
        const h = look === 'haiku'
        const o = { look, phase, effect: 4, tempo: 4, showEffect: true, dots } as const
        // 場所がぜんぶ埋まっているところ（帰る子の指定は、埋まった場所では絵に出ないので付けない）
        heavy.push(view({ ...o, subagents: h ? 2 : 5, arrive: h ? [1] : [4], leave: [] }))
        // 実際に起きる重さ：4人（Haiku 1人）がいて1人が来たところ、もう1人が帰るところ
        heavy.push(view({ ...o, subagents: h ? 1 : 4, arrive: h ? [0] : [3], leave: h ? [1] : [4] }))
      }
  for (const v of heavy) {
    const name = `${v.look}/${v.phase}/${v.dots}/${v.subagents}/${v.leave}`
    const body = T5.clawdLayerBody(v)
    assert.ok(body.length <= T5.LAYER_BUDGET, `${name}: ${body.length}`)
    assert.ok(body.includes('#FF2D45'), `${name}: 演出が残る`)
    // 層は上で作ったもの（同じ入力なら同じ文字列）を、そのまま部屋に入れる
    const svg = sceneSvg(t, room, { layer: () => body, seamless: true })
    assert.ok(svg.length <= 131072, `${name}: 部屋こみ ${svg.length}`)
  }
  // ふつうのドットの Sonnet は、軽くしない演出のまま入る
  for (const phase of ['alert', 'think', 'tool', 'write', 'done'] as const) {
    const v = view({ look: 'sonnet', phase, effect: 4, tempo: 4, showEffect: true, dots: 'normal', subagents: 5, arrive: [4] })
    assert.ok(T5.clawdLayerInner(v).includes(effectFor(4, 'sonnet', false).back), phase)
  }
})

test('予算を超えると軽い版、それでも超えると演出なし', () => {
  const v = view({ look: 'haiku', phase: 'tool', effect: 4, tempo: 4, showEffect: true, subagents: 2 })
  const full = T5.clawdLayerInner(v, Infinity)
  assert.ok(full.includes(effectFor(4, 'haiku', true).back))
  const fullBody = T5.layerBody(full, { fine: true }).length
  const lite = T5.clawdLayerInner(v, fullBody - 1)
  assert.ok(lite.includes(effectFor(4, 'haiku', true, true).back))
  assert.ok(!lite.includes(effectFor(4, 'haiku', true).back))
  assert.ok(lite.includes('#E8102E'))
  const none = T5.clawdLayerInner(v, 1)
  assert.ok(!none.includes('#FF2D45') && !none.includes('#E8102E') && !none.includes(shakeAnim(1)))
})

test('演出は showEffect のときだけ', () => {
  for (const look of LOOKS5)
    for (const dots of ['normal', 'fine'] as const) {
      for (const effect of [1, 2, 3, 4] as const) {
        const off = T5.clawdLayerSvg(view({ look, dots, effect, tempo: effect, showEffect: false, subagents: 2 }))
        for (const bad of ['#FF2D45', '#E8102E', 'attributeName="fill"', '<path fill="#1FD16B"', shakeAnim(1), shakeAnim(0.5)])
          assert.ok(!off.includes(bad), `${look}/${dots}/${effect}: ${bad}`)
      }
      const zero = T5.clawdLayerSvg(view({ look, dots, effect: 0, showEffect: true }))
      for (const bad of ['#FF2D45', '#E8102E', 'attributeName="fill"', '<path fill="#1FD16B"']) assert.ok(!zero.includes(bad), `${look}/${dots}/0: ${bad}`)
      const on = (effect: 1 | 2 | 3 | 4) => T5.clawdLayerSvg(view({ look, dots, effect, tempo: effect, showEffect: true }))
      assert.ok(on(1).includes('<path fill="#1FD16B"'), `${look}/${dots}: 数字の雨`)
      assert.ok(on(3).includes('attributeName="fill"'), `${look}/${dots}: 虹色`)
      const max = on(4)
      assert.ok(max.includes('#FF2D45') && max.includes('#E8102E') && max.includes(shakeAnim(1)), `${look}/${dots}: 暴走`)
    }
})

test('ドット：細かいは fm0、ふつうは c0', () => {
  for (const look of LOOKS5) {
    const fine = T5.clawdLayerInner(view({ look, dots: 'fine', subagents: 2 }))
    const normal = T5.clawdLayerInner(view({ look, dots: 'normal', subagents: 2 }))
    assert.ok(fine.includes('url(#fm0)') && !fine.includes('url(#c0)'), look)
    assert.ok(normal.includes('url(#c0)') && !normal.includes('url(#fm0)'), look)
    assert.ok(!fine.includes('url(#c3)') && !normal.includes('url(#fm3)'), look)
  }
})

test('サブエージェント：5人まで（Haiku は本体3人＋2人）。4・5人目は奥の色。子に演出は付かない', () => {
  for (const dots of ['normal', 'fine'] as const) {
    const fine = dots === 'fine'
    for (const look of ['sonnet', 'opus', 'fable'] as const) {
      assert.equal(laptops(T5.clawdLayerInner(view({ look, dots, subagents: 0 })), fine), 0)
      assert.equal(laptops(T5.clawdLayerInner(view({ look, dots, subagents: 3 })), fine), 3)
      assert.equal(laptops(T5.clawdLayerInner(view({ look, dots, subagents: 7 })), fine), 5, `${look}/${dots}`)
      assert.ok(!T5.clawdLayerInner(view({ look, dots, subagents: 3 })).includes('#94492F'))
      assert.ok(T5.clawdLayerInner(view({ look, dots, subagents: 4 })).includes('#94492F'))
    }
    assert.equal(laptops(T5.clawdLayerInner(view({ look: 'haiku', dots, subagents: 0 })), fine), 3)
    assert.equal(laptops(T5.clawdLayerInner(view({ look: 'haiku', dots, subagents: 7 })), fine), 5)
    assert.ok(!T5.clawdLayerInner(view({ look: 'haiku', dots, subagents: 0 })).includes('#94492F'))
    assert.ok(T5.clawdLayerInner(view({ look: 'haiku', dots, subagents: 1 })).includes('#94492F'))
    // 場所
    const three = T5.clawdLayerInner(view({ dots, subagents: 3 }))
    for (const [x, y] of T5.SUB_SPOTS.slice(0, 3)) assert.ok(three.includes(`translate(${x} ${y})`), `${x},${y}`)
    const two = T5.clawdLayerInner(view({ look: 'haiku', dots, subagents: 2 }))
    for (const [x, y] of T5.HAIKU_SUB_SPOTS) assert.ok(two.includes(`translate(${x} ${y})`), `${x},${y}`)
    // 子は赤い目にならない（赤い目の数は、子がいてもいなくても同じ）
    for (const look of LOOKS5) {
      const o = { look, dots, effect: 4, tempo: 4, showEffect: true } as const
      const eyes = (n: number) => count(T5.clawdLayerInner(view({ ...o, subagents: n }), Infinity), '#E8102E')
      assert.ok(eyes(0) > 0)
      assert.equal(eyes(5), eyes(0), `${look}/${dots}`)
    }
  }
})

test('出入りのポン：来た子はけむりのあと打つ、帰った子は手をふってからけむりで消える（どちらも1回だけ）', () => {
  for (const dots of ['normal', 'fine'] as const) {
    const fine = dots === 'fine'
    const mini = fine ? paintMiniFine : paintMini
    const plain = T5.clawdLayerInner(view({ dots, subagents: 1 }))
    assert.ok(!plain.includes('repeatCount="1"'))
    // 来た：けむり2コマを1回だけ、そのあと打つ子とノートパソコンが出たまま
    const come = T5.clawdLayerInner(view({ dots, subagents: 1, arrive: [0] }))
    assert.ok(come.includes(ONCE))
    for (const puff of ['puff1', 'puff2'] as const) assert.ok(come.includes(mini(at({ hidden: true, over: [puff] })).svg()), puff)
    assert.equal(laptops(come, fine), 1)
    assert.ok(come.includes('<g opacity="0"><animate attributeName="opacity" values="0;1"'))
    // いない子の arrive は描かない
    assert.equal(T5.clawdLayerInner(view({ dots, subagents: 1, arrive: [3] })), plain)
    // 帰った：2人目の場所で、手をふる絵 → けむり、1回だけで、最後は消えている
    const gone = T5.clawdLayerInner(view({ dots, subagents: 1, leave: [1] }))
    assert.ok(gone.includes('translate(6 -7)') && !plain.includes('translate(6 -7)'))
    assert.ok(gone.includes(mini(at({ look: YOU, eyes: 'happy', mouth: 'grin', front: 'wave' })).svg()), '手をふる')
    for (const puff of ['puff1', 'puff2'] as const) assert.ok(gone.includes(mini(at({ hidden: true, over: [puff] })).svg()), puff)
    const leaving = T5.clawdLayerInner(view({ dots, subagents: 0, leave: [1] }))
    const anims = [...leaving.matchAll(/<animate attributeName="opacity" values="([^"]*)"[^>]*repeatCount="1" fill="freeze"\/>/g)].map(m => m[1]!)
    assert.ok(anims.length >= 3)
    for (const vals of anims) assert.ok(vals.endsWith('0'), `最後は消える: ${vals}`)
    assert.equal(laptops(leaving, fine), 1)
    // いる子の leave は無視（その場所は打っている子のまま）
    assert.equal(T5.clawdLayerInner(view({ dots, subagents: 2, leave: [1] })), T5.clawdLayerInner(view({ dots, subagents: 2 })))
  }
})

test('姿の小物：譜面台・黒板・ノートパソコン・小さい3人のマグ', () => {
  for (const dots of ['normal', 'fine'] as const) {
    const of = (look: (typeof LOOKS5)[number]) => T5.clawdLayerInner(view({ look, dots }))
    const opus = of('opus')
    const fable = of('fable')
    const sonnet = of('sonnet')
    const haiku = of('haiku')
    assert.ok(opus.includes('#3A3340') && !opus.includes('#8E95A8'), 'Opus は譜面台だけ')
    assert.ok(fable.includes('#2F4A3A') && fable.includes('#8E95A8'), 'Fable は黒板とノートパソコン')
    assert.ok(sonnet.includes('#8E95A8') && !sonnet.includes('#3A3340') && !sonnet.includes('#2F4A3A'), 'Sonnet はノートパソコン')
    assert.ok(sonnet.includes(T5.LAPTOP) && fable.includes(T5.LAPTOP) && opus.includes(T5.STAND) && fable.includes(T5.BOARD))
    assert.equal(laptops(haiku, dots === 'fine'), 3)
    assert.ok(haiku.includes('<rect x="27" y="11" width="5" height="6" class="f-mug"/>'), 'Haiku のマグ')
    // 湯気（f-puff がのぼる）はどの姿にもある
    for (const s of [opus, fable, sonnet, haiku]) assert.ok(s.includes('to="1 -6"'))
  }
})

test('使ってよい要素だけ・id は重ならない・同じ入力なら同じ文字列', () => {
  const t = new Date('2026-11-15T01:10:00Z')
  for (const look of LOOKS5)
    for (const dots of ['normal', 'fine'] as const)
      for (const phase of PHASES)
        for (const effect of [0, 4] as const) {
          const v = view({ look, dots, phase, effect, tempo: effect, showEffect: true, subagents: 2, arrive: [1], leave: [2] })
          const name = `${look}/${dots}/${phase}/${effect}`
          for (const svg of [T5.clawdLayerSvg(v)]) {
            for (const bad of ['<script', '<foreignObject', '@keyframes', 'animation:']) assert.ok(!svg.includes(bad), `${name}: ${bad}`)
            for (const tag of tags(svg)) assert.ok(ALLOWED.has(tag), `${name}: <${tag}>`)
            const all = ids(svg)
            assert.equal(new Set(all).size, all.length, `${name}: id が重なる`)
            assert.ok(svg.length <= 131072, name)
          }
          if (phase === 'write') {
            const scene = sceneSvg(t, undefined, { layer: () => T5.clawdLayerBody(v), seamless: true })
            const all = ids(scene)
            assert.equal(new Set(all).size, all.length, `${name}: 部屋と合わせて id が重なる`)
            assert.equal(T5.clawdLayerSvg(v), T5.clawdLayerSvg({ ...v, arrive: [...v.arrive], leave: [...v.leave] }))
          }
        }
  for (const effect of [1, 2, 3] as const) {
    const svg = T5.clawdLayerSvg(view({ look: 'fable', effect, tempo: effect, showEffect: true }))
    for (const tag of tags(svg)) assert.ok(ALLOWED.has(tag), `${effect}: <${tag}>`)
  }
})

test('cardPreviewSvg（大きな動く見本）は無くなった：見た目のタブは小さな止まった絵（tiles.ts）', () => {
  assert.equal('cardPreviewSvg' in T5, false)
  assert.equal('PREVIEW_W' in T5, false)
  assert.equal('PREVIEW_H' in T5, false)
})

// ---- 最後の手段：できた絵が Svg の上限（131,072 文字）を超えたら、今までの姿、それでも超えたら空の層で作り直す ----

test('fitScene：小さな上限で、収まる最初の層の絵を返す（収まれば1回だけ作る）。どれも収まらなければ最後（空の層）', () => {
  let made = 0
  const make = (layer: () => string) => {
    made += 1
    return `<svg>${layer()}</svg>`
  }
  const big = () => 'B'.repeat(100)
  const legacy = () => 'L'.repeat(20)
  const empty = () => ''
  assert.equal(T5.SVG_LIMIT, 131072)
  assert.equal(T5.fitScene(make, [big, legacy, empty], 200), `<svg>${'B'.repeat(100)}</svg>`)
  assert.equal(made, 1)
  assert.equal(T5.fitScene(make, [big, legacy, empty], 50), `<svg>${'L'.repeat(20)}</svg>`)
  assert.equal(T5.fitScene(make, [big, legacy, empty], 15), '<svg></svg>')
  assert.equal(T5.fitScene(make, [big, legacy, empty], 5), '<svg></svg>')
})

test('fitScene：本物の部屋に大きすぎる層を入れると、今までの姿の層で作り直して上限に収める', () => {
  const HUGE = '<rect width="1" height="1"/>'
  const huge = () => `<g>${HUGE.repeat(5000)}</g>`
  const legacy = () => T5.layerBody(legacyInner(), { fine: false })
  const make = (layer: () => string) => sceneSvg(new Date(), roomColors('紺', '夜'), { layer, seamless: true })
  assert.ok(make(huge).length > 131072)
  const fit = T5.fitScene(make, [huge, legacy, () => ''])
  assert.ok(fit.length <= 131072)
  assert.ok(!fit.includes(HUGE.repeat(10)))
  // 今までの姿（corner の中身）が、層の場所に入っている
  assert.ok(fit.includes('<g transform="translate(-520 -360)"><g transform="translate(276 205) scale(6)">'))
  assert.ok(fit.includes('mask="url(#c0)"'))
})
