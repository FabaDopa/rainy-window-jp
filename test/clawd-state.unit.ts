import { test } from 'node:test'
import assert from 'node:assert/strict'

import { advance, startMachine, type Machine } from '../hooks/lib/clawd-state.ts'

// 出来事を順に流して、最後の結果を返す（[出来事, 時刻] の並び）
function run(m: Machine, steps: [Parameters<typeof advance>[1], number][]) {
  let r: ReturnType<typeof advance> = { machine: m }
  for (const [ev, t] of steps) r = advance(r.machine, ev, t)
  return r
}

test('送ると！、0.9秒たつと考える', () => {
  const a = advance(startMachine(0), 'submit', 0)
  assert.equal(a.machine.phase, 'alert')
  assert.equal(a.wakeAt, 900)
  const b = advance(a.machine, 'tick', 900)
  assert.equal(b.machine.phase, 'think')
  assert.equal(b.wakeAt, undefined)
})

test('！の間に来た出来事は覚えておく', () => {
  const a = run(startMachine(0), [['submit', 0], ['text', 300]])
  assert.equal(a.machine.phase, 'alert')
  assert.equal(advance(a.machine, 'tick', 900).machine.phase, 'write')
})

test('最低1.5秒、後のものが勝つ', () => {
  const m: Machine = { phase: 'think', since: 900 }
  const a = advance(m, 'tool', 1000)
  assert.equal(a.machine.phase, 'think')
  assert.equal(a.wakeAt, 2400)
  const b = advance(a.machine, 'text', 1100)
  assert.equal(b.machine.phase, 'think')
  assert.equal(b.machine.pending, 'write')
  assert.equal(b.wakeAt, 2400)
  const c = advance(b.machine, 'tick', 2400)
  assert.equal(c.machine.phase, 'write')
  assert.equal(c.machine.pending, undefined)
})

test('速く続いても1.5秒まではそのまま', () => {
  let m: Machine = { phase: 'write', since: 0 }
  for (let i = 1; i <= 10; i++) {
    m = advance(m, i % 2 ? 'tool' : 'text', i * 140).machine
    assert.equal(m.phase, 'write')
  }
})

test('1.5秒たっていれば、すぐ移る', () => {
  const r = advance({ phase: 'write', since: 0 }, 'tool', 1500)
  assert.equal(r.machine.phase, 'tool')
  assert.equal(r.machine.since, 1500)
  assert.equal(r.wakeAt, undefined)
})

test('終わり：やった、手をふる、待つ', () => {
  const a = advance({ phase: 'write', since: 0 }, 'complete', 2000)
  assert.equal(a.machine.phase, 'done')
  assert.equal(a.wakeAt, 3500)
  const b = advance(a.machine, 'tick', 3500)
  assert.equal(b.machine.phase, 'wave')
  assert.equal(b.wakeAt, 6500)
  const c = advance(b.machine, 'tick', 6500)
  assert.equal(c.machine.phase, 'wait')
  assert.equal(c.wakeAt, undefined)
})

test('完了も最低1.5秒を守る', () => {
  const a = advance({ phase: 'write', since: 1000 }, 'complete', 1200)
  assert.equal(a.machine.phase, 'write')
  assert.equal(a.machine.pending, 'done')
  assert.equal(a.wakeAt, 2500)
})

test('！の間に完了が来たら、！のあとにやった', () => {
  const a = run(startMachine(0), [['submit', 0], ['complete', 100]])
  assert.equal(a.machine.phase, 'alert')
  const b = advance(a.machine, 'tick', 900)
  assert.equal(b.machine.phase, 'done')
  assert.equal(b.wakeAt, 2400)
})

test('やったを待っている間（1.5秒の最低）に来た think/tool/text は無視：働く姿のまま止まらず、やった → 手をふる', () => {
  // 見つかった例：道具（2 秒から）の 3 秒に終わり、3.1 秒にまた道具のかけら → 前は phase tool・wakeAt なしで止まった
  const a = advance({ phase: 'tool', since: 2000 }, 'complete', 3000)
  assert.equal(a.machine.pending, 'done')
  const b = advance(a.machine, 'tool', 3100)
  assert.equal(b.machine.phase, 'tool')
  assert.equal(b.machine.pending, 'done')
  assert.equal(b.wakeAt, 3500)
  const c = advance(b.machine, 'tick', 3500)
  assert.equal(c.machine.phase, 'done')
  assert.equal(c.wakeAt, 5000)
  // 働く姿のどれでも、どのかけらでも同じ
  for (const phase of ['think', 'tool', 'write'] as const) {
    for (const ev of ['think', 'tool', 'text'] as const) {
      const r = run({ phase, since: 2000 }, [['complete', 3000], [ev, 3100], [ev, 3400]])
      assert.deepEqual(r.machine, { phase, since: 2000, pending: 'done' })
      assert.equal(r.wakeAt, 3500)
      assert.equal(advance(r.machine, 'tick', 3500).machine.phase, 'done')
    }
  }
  // ！の間に終わったときも同じ：あとのかけらで やった を消さない
  const d = run(startMachine(0), [['submit', 0], ['complete', 100], ['think', 200], ['text', 300]])
  assert.equal(d.machine.pending, 'done')
  assert.equal(d.wakeAt, 900)
  assert.equal(advance(d.machine, 'tick', 900).machine.phase, 'done')
})

test('やった・手をふるの途中で送ると！', () => {
  for (const phase of ['done', 'wave'] as const) {
    const r = advance({ phase, since: 0 }, 'submit', 500)
    assert.equal(r.machine.phase, 'alert')
    assert.equal(r.wakeAt, 1400)
  }
})

test('中断はどこからでも待つ', () => {
  for (const phase of ['wait', 'alert', 'think', 'tool', 'write', 'done', 'wave'] as const) {
    const r = advance({ phase, since: 0, pending: 'write' }, 'abort', 100)
    assert.deepEqual(r.machine, { phase: 'wait', since: 100 })
    assert.equal(r.wakeAt, undefined)
  }
})

test('待っている間の think/tool/text/complete は無視', () => {
  for (const ev of ['think', 'tool', 'text', 'complete'] as const) {
    const m = startMachine(0)
    const r = advance(m, ev, 50)
    assert.deepEqual(r.machine, m)
    assert.equal(r.wakeAt, undefined)
  }
})

test('早すぎる tick は害がなく、待つ時刻をそのまま返す', () => {
  const a = advance({ phase: 'alert', since: 0 }, 'tick', 300)
  assert.equal(a.machine.phase, 'alert')
  assert.equal(a.wakeAt, 900)
  const b = advance({ phase: 'think', since: 0, pending: 'write' }, 'tick', 500)
  assert.equal(b.machine.pending, 'write')
  assert.equal(b.wakeAt, 1500)
  const c = advance({ phase: 'done', since: 0 }, 'tick', 100)
  assert.equal(c.wakeAt, 1500)
})

test('用のない tick は何も起こさず、wakeAt もない', () => {
  const m: Machine = { phase: 'write', since: 0 }
  const r = advance(m, 'tick', 5000)
  assert.deepEqual(r.machine, m)
  assert.equal(r.wakeAt, undefined)
})
