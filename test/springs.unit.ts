import { test } from 'node:test'
import assert from 'node:assert/strict'

// springs.ts は拡張子なしの import を使うかもしれないので、test/setup.mjs（--import）で .ts を補って読む。
const { CAP_FRAMES, DT, FPS, LABEL, LEAD, SUBSTEPS, TAIL, TRAIL, isSettled, simulate, springOf, stepSpring } = await import('../hooks/lib/springs.ts')

// ---- 見本（参考にした Morph tooltip の motion.js）の、ばねの1歩と回し方を、そのまま写したもの ----
// const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c });
// const step = (s, dt) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; };
// loop: dt = 1/60（1コマ）を 4 つに分けて step し、そのあと描く。
type Ref = { x: number; v: number; t: number; k: number; c: number }
const S = (x: number, k = 400, c = 30): Ref => ({ x, v: 0, t: x, k, c })
const step = (s: Ref, dt: number) => {
  const a = -s.k * (s.x - s.t) - s.c * s.v
  s.v += a * dt
  s.x += s.v * dt
}
/** 見本の回し方で、1コマごとの x（0 コマ目は動く前）を total コマまで。止まったコマ（|x - t| < 0.5 かつ |v| < 5）も返す。 */
function reference(from: number, to: number, k: number, c: number, total = 600): { frames: number[]; settled: number } {
  const s = S(from, k, c)
  s.t = to
  const frames = [s.x]
  let settled = -1
  for (let n = 1; n <= total; n++) {
    for (let i = 0; i < 4; i++) step(s, 1 / 60 / 4)
    frames.push(s.x)
    if (settled < 0 && Math.abs(s.x - s.t) < 0.5 && Math.abs(s.v) < 5) settled = n
  }
  return { frames, settled }
}

test('ばねの定数：見本と同じ（LEAD 620/36、TRAIL 190/19、しっぽ 300/22、文字 420/32）。1コマ 1/60 秒を 4 つに分ける（1/240 秒）、上限 1.2 秒', () => {
  assert.deepEqual(LEAD, { k: 620, c: 36 })
  assert.deepEqual(TRAIL, { k: 190, c: 19 })
  assert.deepEqual(TAIL, { k: 300, c: 22 })
  assert.deepEqual(LABEL, { k: 420, c: 32 })
  assert.equal(FPS, 60)
  assert.equal(SUBSTEPS, 4)
  assert.equal(DT, 1 / 60 / 4)
  assert.equal(DT, 1 / 240)
  assert.equal(CAP_FRAMES, 72)
})

test('stepSpring：見本の step と同じ式（a = -k(x - t) - c v; v += a dt; x += v dt）で、同じ数になる', () => {
  const mine = springOf(0, 100, LEAD)
  const ref = S(0, 620, 36)
  ref.t = 100
  for (let i = 0; i < 500; i++) {
    stepSpring(mine, DT)
    step(ref, 1 / 60 / 4)
    assert.equal(mine.x, ref.x)
    assert.equal(mine.v, ref.v)
  }
})

test('simulate：LEAD 1本、0 → 100 px。見本の回し方と、1コマずつ同じ値・同じ行き過ぎ・同じ止まるコマ。100 を少し行き過ぎて（約 3.7%）、99 px より先まで行く', () => {
  const ref = reference(0, 100, 620, 36)
  const [frames] = simulate([springOf(0, 100, LEAD)]).frames
  assert.ok(frames !== undefined)
  assert.ok(ref.settled > 0)
  assert.equal(frames.length - 1, ref.settled)
  assert.deepEqual(frames, ref.frames.slice(0, ref.settled + 1))
  const peak = Math.max(...frames)
  assert.equal(peak, Math.max(...ref.frames))
  assert.ok(peak > 99, `peak ${peak}`)
  // 行き過ぎは約 2.8%（減衰比 ζ = 36 / (2√620) ≈ 0.72 の、なめらかな式の値 exp(-πζ/√(1-ζ²)) ≈ 3.7% より、1/240 秒の刻みで少し小さい）
  assert.ok(peak > 102 && peak < 104.5, `overshoot ${peak - 100}`)
  assert.ok(Math.abs((frames.at(-1) ?? 0) - 100) < 0.5)
  // 止まるまで 0.2〜0.5 秒
  assert.ok(ref.settled >= 12 && ref.settled <= 30, `settled at frame ${ref.settled}`)
})

test('simulate：TRAIL（やわらかい）は LEAD（かたい）より遅く着く。いくつものばねは、ぜんぶ止まったコマで一緒に終わる（先に止まったばねも回り続ける）', () => {
  const lead = reference(0, 100, 620, 36)
  const trail = reference(0, 100, 190, 19)
  assert.ok(trail.settled > lead.settled)
  // 100 ms（6 コマ）で、LEAD のほうが先へ進んでいる
  assert.ok((lead.frames[6] ?? 0) > (trail.frames[6] ?? 0))
  const run = simulate([springOf(0, 100, LEAD), springOf(0, 100, TRAIL)])
  assert.equal(run.frames.length, 2)
  assert.deepEqual(run.frames[0], lead.frames.slice(0, trail.settled + 1))
  assert.deepEqual(run.frames[1], trail.frames.slice(0, trail.settled + 1))
  assert.equal(run.settled, true)
})

test('isSettled：|x - t| < 0.5 かつ |v| < 5。scale で単位をそろえる（文字の 0〜1 は、ずれの 14 px に直して見る）', () => {
  assert.equal(isSettled({ ...springOf(99.6, 100, LEAD), v: 4.9 }), true)
  assert.equal(isSettled({ ...springOf(99.4, 100, LEAD), v: 0 }), false)
  assert.equal(isSettled({ ...springOf(100, 100, LEAD), v: 5.1 }), false)
  assert.equal(isSettled({ ...springOf(0.97, 1, LABEL), v: 0 }, 14), true)
  assert.equal(isSettled({ ...springOf(0.95, 1, LABEL), v: 0 }, 14), false)
})

test('simulate：上限は 1.2 秒（72 コマ）。止まらなければ 73 個の値で終わり、settled は false', () => {
  // とてもやわらかく、ほとんど止める力の無いばね
  const run = simulate([springOf(0, 1000, { k: 10, c: 0.1 })])
  assert.equal(run.frames[0]?.length, CAP_FRAMES + 1)
  assert.equal(run.settled, false)
})

test('simulate：同じ引数なら同じ数（決まった結果）。はじめから止まっていれば、動く前の1コマだけ', () => {
  const a = simulate([springOf(10, 200, LEAD), springOf(5, 300, TRAIL), springOf(0, 1, LABEL)], [1, 1, 14])
  const b = simulate([springOf(10, 200, LEAD), springOf(5, 300, TRAIL), springOf(0, 1, LABEL)], [1, 1, 14])
  assert.deepEqual(a, b)
  const still = simulate([springOf(50, 50, LEAD)])
  assert.deepEqual(still.frames, [[50]])
  assert.equal(still.settled, true)
})
