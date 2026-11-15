import { test } from 'node:test'
import assert from 'node:assert/strict'

// 拡張子なしの import は test/setup.mjs（--import）で .ts を補って読む。
const { BODY, BODY_DARK, EYE } = await import('../hooks/clawd/body.ts')
const { Px } = await import('../hooks/clawd/px.ts')
const { at } = await import('../hooks/clawd/pose.ts')
const { paintBig, paintMini, paintMiniBack, paintBigFine, paintMiniFine } = await import('../hooks/clawd/paint.ts')

test('体と影：左上が体の色、奥の列が影の色', () => {
  const px = paintBig(at())
  assert.equal(px.m.get('5,1'), BODY)
  assert.equal(px.m.get('20,1'), BODY_DARK)
})

test('目の位置：look [-1, 1] のとき左右の目が決まった場所に出る', () => {
  const px = paintBig(at({ look: [-1, 1] }))
  for (const k of ['5,4', '6,5', '15,4', '16,5']) assert.equal(px.m.get(k), EYE, k)
})

test('めがね：金の輪が両目のまわりに出る', () => {
  const px = paintBig(at({ wear: ['glasses'] }))
  assert.equal(px.m.get('4,2'), '#F2C14E')
  assert.equal(px.m.get('14,2'), '#F2C14E')
})

test('細かいドットの目の光：白い光があり、目の角は体の色', () => {
  const px = paintBigFine(at({ look: [-1, 1] }))
  assert.equal(px.m.get('11,9'), '#FFFFFF')
  assert.equal(px.m.get('10,8'), BODY)
})

test('小さい子：体は x 2〜9・y 0〜5、細かい版は大きい子の絵を (-1,-1) ずらしたもの', () => {
  const mini = paintMini(at())
  for (let y = 0; y <= 5; y++)
    for (let x = 2; x <= 9; x++) assert.ok([BODY, BODY_DARK, EYE].includes(mini.m.get(`${x},${y}`) as string), `${x},${y}`)
  assert.equal(mini.m.get('2,6'), BODY) // 足は体の下
  const p = at({ look: [-1, 1], mug: 'held', wear: ['bowtie'], hand: 'baton' })
  const want = new Map<string, string>()
  for (const [k, c] of paintBig({ ...p, mug: 'none', wear: [], hand: 'none' }).m) {
    const [x, y] = k.split(',').map(Number) as [number, number]
    want.set(`${x - 1},${y - 1}`, c)
  }
  assert.deepEqual(paintMiniFine(p).m, want)
})

test('奥の小さい子：体の色（BODY）が一つもない', () => {
  const px = paintMiniBack(at())
  assert.ok(px.m.size > 0)
  assert.ok(![...px.m.values()].includes(BODY))
})

test('いない子：何も描かない', () => {
  assert.equal(paintBig(at({ hidden: true })).m.size, 0)
})

test('path の書き方：同じ色の横並びは1本にまとまる', () => {
  const px = new Px()
  px.put(0, 0, '#112233')
  px.put(1, 0, '#112233')
  assert.equal(px.svg(), '<path fill="#112233" d="M0 0h2v1h-2z"/>')
})
