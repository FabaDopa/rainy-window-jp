import { test } from 'node:test'
import assert from 'node:assert/strict'

// 拡張子なしの import は test/setup.mjs（--import）で .ts を補って読む。
const { effectFor, targetsOf, fxPainter, shakeAnim, PAL } = await import('../hooks/clawd/fx.ts')
const { paintBig, paintMini, paintBigFine, paintMiniFine } = await import('../hooks/clawd/paint.ts')
const { P0 } = await import('../hooks/clawd/pose.ts')
const { HAIKU_X } = await import('../hooks/clawd/scripts.ts')
const { EYE } = await import('../hooks/clawd/body.ts')

const LOOKS = ['sonnet', 'haiku', 'opus', 'fable'] as const
const LEVELS = [0, 1, 2, 3, 4] as const

test('targetsOf：Haiku は3人（HAIKU_X・半分の大きさ）、ほかは1人', () => {
  const h = targetsOf('haiku')
  assert.equal(h.length, 3)
  assert.deepEqual(h.map(t => t.s), [0.5, 0.5, 0.5])
  assert.equal(h.length, HAIKU_X.length)
  assert.deepEqual(targetsOf('sonnet'), [{ x0: 5, x1: 20, y0: 1, y1: 12, s: 1 }])
  assert.deepEqual(targetsOf('opus'), [{ x0: 5, x1: 20, y0: -1, y1: 12, s: 1 }])
  assert.deepEqual(targetsOf('fable'), [{ x0: 5, x1: 20, y0: -1, y1: 12, s: 1 }])
})

test('low は何もない', () => {
  for (const look of LOOKS)
    for (const fine of [true, false]) {
      const fx = effectFor(0, look, fine)
      assert.equal(fx.back, '')
      assert.equal(fx.front, '')
      assert.deepEqual(fx.glows, [])
      assert.equal(fx.shake, 0)
    }
})

test('medium は数字の雨：緑の字が 0 -18;0 14 を降りる。字の単位は fine で 0.5 / 1', () => {
  const coarse = effectFor(1, 'sonnet', false)
  const fine = effectFor(1, 'sonnet', true)
  for (const fx of [coarse, fine]) {
    assert.match(fx.back, /<path fill="#1FD16B" d="/)
    assert.ok(fx.back.includes('values="0 -18;0 14"'))
    assert.ok(fx.back.includes('attributeName="transform"'))
  }
  assert.ok(coarse.back.includes('h1v1h-1z'))
  assert.ok(!coarse.back.includes('h0.5v0.5h-0.5z'))
  assert.ok(fine.back.includes('h0.5v0.5h-0.5z'))
  assert.ok(!fine.back.includes('h1v1h-1z'))
})

test('high は炎の柱で、色はモデルごと。揺れは 1', () => {
  const colors = { sonnet: '#F5A623', haiku: '#1FB57A', opus: '#D92F4C', fable: '#5A47E6' }
  for (const look of LOOKS) {
    const fx = effectFor(2, look, true)
    assert.ok((fx.back + fx.front).includes(colors[look]), look)
    assert.equal(PAL[look].outer, colors[look])
    assert.equal(fx.shake, 1)
    assert.ok(fx.glows.length >= 1)
  }
})

test('xhigh は虹色：fill が 7 色を順に変わる', () => {
  const fx = effectFor(3, 'sonnet', true)
  const rainbow = ['#FF4D4D', '#FF9F1A', '#FFE14D', '#4DE07A', '#4DC9FF', '#6B6BFF', '#C25BFF']
  assert.ok(fx.back.includes('attributeName="fill"'))
  assert.ok(fx.back.includes(`values="${rainbow.join(';')}"`))
  assert.equal(fx.eyes, undefined)
})

test('max はくっきり暴走：赤い目、赤い縁と白い芯、揺れ 1、稲妻は体の外', () => {
  for (const look of LOOKS) {
    const fx = effectFor(4, look, true)
    const all = fx.back + fx.front
    assert.equal(fx.eyes, '#E8102E')
    assert.ok(all.includes('#FF2D45'))
    assert.ok(all.includes('#FFFFFF'))
    assert.equal(fx.shake, 1)
  }
  // 床の稲妻（白い芯）のいちばん下の1点は、体の左右の外
  const fx = effectFor(4, 'sonnet', true)
  const cores = [...fx.front.matchAll(/<path fill="#FFFFFF" d="([^"]*)"\/>/g)].map(m => m[1]!)
  assert.ok(cores.length > 0)
  const bottoms: number[] = []
  for (const d of cores)
    for (const m of d.matchAll(/M(-?\d+) (-?\d+)h(\d+)v1/g)) if (Number(m[2]) === 15) bottoms.push(Number(m[1]))
  assert.ok(bottoms.length > 0)
  for (const x of bottoms) assert.ok(x < 5 || x > 20, `x=${x}`)
})

test('使ってよい要素だけ：script・foreignObject・CSS アニメーションが無い', () => {
  for (const look of LOOKS)
    for (const level of LEVELS)
      for (const fine of [true, false]) {
        const fx = effectFor(level, look, fine)
        const all = fx.back + fx.front + fx.glows.map(g => g.anim ?? '').join('') + (fx.screen ?? '')
        for (const bad of ['<script', '<foreignObject', '@keyframes', 'animation:']) assert.ok(!all.includes(bad), `${look}/${level}: ${bad}`)
      }
  assert.ok(!shakeAnim(1).includes('animation:'))
  assert.equal(shakeAnim(0), '')
})

test('同じ入力なら同じ文字列（乱数・時刻に頼らない）', () => {
  for (const look of LOOKS)
    for (const level of LEVELS) assert.deepEqual(effectFor(level, look, true), effectFor(level, look, true))
})

test('fxPainter：本物の絵で、目だけ赤くなり口は EYE の色のまま', () => {
  const fx = effectFor(4, 'sonnet', true)
  assert.equal(fxPainter(paintBig, 'big', effectFor(2, 'sonnet', true)), paintBig)
  const cases = [
    ['big', false, paintBig],
    ['mini', false, paintMini],
    ['big', true, paintBigFine],
    ['mini', true, paintMiniFine],
  ] as const
  const eyes = ['open', 'wide', 'happy', 'half', 'closed'] as const
  const mouths = ['smile', 'grin', 'o', 'flat', 'wavy'] as const
  for (const [kind, fine, paint] of cases) {
    const painted = fxPainter(paint, kind, fx, fine)
    let n = 0
    let ne = 0
    for (const dy of [-2, -1, 0, 1])
      for (const lift of [0, 1])
        for (const e of eyes)
          for (const look of [[-1, 1], [0, 0], [1, -1]] as [number, number][]) {
            const pose = { ...P0, eyes: e, mouth: 'none' as const, dy, lift, look }
            const noMouth = paint(pose)
            const eyePx = [...noMouth.m].filter(([, c]) => c === EYE).map(([k]) => k)
            ne += eyePx.length
            const out0 = painted(pose)
            for (const k of eyePx) assert.equal(out0.m.get(k), '#E8102E', `${kind}/${fine}/${e}/${k}: 目は赤`)
            for (const mouth of mouths) {
              const p2 = { ...pose, mouth }
              const out = painted(p2)
              const mouthPx = [...paint(p2).m].filter(([k, c]) => c === EYE && !eyePx.includes(k)).map(([k]) => k)
              for (const k of mouthPx) assert.equal(out.m.get(k), EYE, `${kind}/${fine}/${e}/${mouth}/${k}: 口はそのまま`)
              n += mouthPx.length
            }
          }
    assert.ok(n > 0 && ne > 0, `${kind}/${fine}: 目と口の点を調べた`)
  }
})

test('lite：同じ色・要素のまま、full の 55% 以下。決まった結果', () => {
  const sign: Record<number, (look: (typeof LOOKS)[number]) => string[]> = {
    1: () => ['<path fill="#1FD16B" d="'],
    2: look => [PAL[look].outer],
    3: () => ['attributeName="fill"', '#FF4D4D', '#C25BFF'],
    4: () => ['#FF2D45', '#FFFFFF'],
  }
  for (const look of LOOKS)
    for (const level of [1, 2, 3, 4] as const)
      for (const fine of [true, false]) {
        const full = effectFor(level, look, fine)
        const lite = effectFor(level, look, fine, true)
        const size = (x: typeof full) => x.back.length + x.front.length
        assert.ok(size(lite) <= size(full) * 0.55, `${look}/${level}/${fine}: ${size(lite)} / ${size(full)}`)
        for (const s of sign[level]!(look)) assert.ok(lite.back.includes(s) || lite.front.includes(s), `${look}/${level}: ${s}`)
        assert.equal(lite.shake, full.shake)
        assert.equal(lite.eyes, full.eyes)
        assert.deepEqual(lite, effectFor(level, look, fine, true))
        assert.deepEqual(full, effectFor(level, look, fine, false))
        for (const bad of ['<script', '<foreignObject', '@keyframes', 'animation:']) assert.ok(!(lite.back + lite.front).includes(bad))
      }
})

test('数字の雨（ふつうのドット）：同じ列の字は上下に1マス以上あき、列どうしも横に1マス以上あく。字は1マスの格子にそろう', () => {
  for (const look of LOOKS)
    for (const lite of [false, true]) {
      const name = `${look}/${lite ? 'lite' : 'full'}`
      const back = effectFor(1, look, false, lite).back
      const cols = back.split('<g opacity="0"><animateTransform').slice(1)
      assert.ok(cols.length >= 3, `${name}: 列の数 ${cols.length}`)
      const spans: [number, number][] = []
      for (const col of cols) {
        assert.ok(col.includes('values="0 -18;0 14"'), `${name}: 同じ落ち方`)
        const boxes = [...col.matchAll(/<path fill="[^"]+" d="([^"]*)"\/>/g)].map(m => {
          const d = m[1]!
          assert.equal(d.replace(/M-?\d+ -?\d+h1v1h-1z/g, ''), '', `${name}: 1マスの点で、整数の位置`)
          const pts = [...d.matchAll(/M(-?\d+) (-?\d+)h1v1h-1z/g)].map(p => [Number(p[1]), Number(p[2])] as [number, number])
          assert.ok(pts.length > 0)
          return { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])) + 1, y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) + 1 }
        })
        assert.ok(boxes.length >= 1, `${name}: 字がある`)
        boxes.sort((a, b) => a.y0 - b.y0)
        for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i]!.y0 - boxes[i - 1]!.y1 >= 1, `${name}: 上下の字が重なる（${boxes[i - 1]!.y1} → ${boxes[i]!.y0}）`)
        spans.push([Math.min(...boxes.map(b => b.x0)), Math.max(...boxes.map(b => b.x1))])
      }
      spans.sort((a, b) => a[0] - b[0])
      for (let i = 1; i < spans.length; i++) assert.ok(spans[i]![0] - spans[i - 1]![1] >= 1, `${name}: 列がくっつく（${spans[i - 1]} と ${spans[i]}）`)
      // 見た目は同じ：先頭は白く光る字、緑、しっぽは暗い緑
      for (const c of ['#E3FFEE', '#1FD16B', '#0B7A3B']) assert.ok(back.includes(`<path fill="${c}" d="`), `${name}: ${c}`)
    }
})

test('数字の雨（細かいドット）は見本のまま：full も lite も文字列が変わらない', async () => {
  const { createHash } = await import('node:crypto')
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  const big = ['82c3372f44951fa6256e9268141fdfb2fe4a769fcf9597a9a82d8ad3a8c9dab6', 'e6fd37b7de3b7278b2b967e89ef42de36e571f9453c0d579875e0c0300d96a88']
  const want: Record<(typeof LOOKS)[number], string[]> = {
    sonnet: big,
    opus: big,
    fable: big,
    haiku: ['07da4774c430f216a8d5fe849a53fd292c95579f13cddd40d1bbabd73a0b8e0e', 'e8220a53f7bd80e997dd597f977060b6681cd221f72628691a207d3873317d38'],
  }
  for (const look of LOOKS) assert.deepEqual([sha(effectFor(1, look, true).back), sha(effectFor(1, look, true, true).back)], want[look], look)
})
