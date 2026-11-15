import { test } from 'node:test'
import assert from 'node:assert/strict'

import { bandOf, clockAngles, jstParts } from '../hooks/lib/time.ts'

// 日本時間の hh:mm:ss を、その瞬間の UTC の Date にする（日本は UTC+9、夏時間なし）。
function jst(h: number, m: number, s = 0): Date {
  return new Date(Date.UTC(2026, 10, 15, h - 9, m, s))
}

test('時間帯の境目（日本時間）', () => {
  const cases: [number, number, string][] = [
    [4, 59, '夜'], [5, 0, '朝'], [9, 59, '朝'], [10, 0, '昼'], [15, 59, '昼'],
    [16, 0, '夕方'], [18, 59, '夕方'], [19, 0, '夜'], [0, 0, '夜'], [23, 59, '夜'],
  ]
  for (const [h, m, band] of cases) assert.equal(bandOf(jst(h, m)), band, `${h}:${m}`)
})

test('日本の 10:10 は UTC の 01:10', () => {
  const d = new Date('2026-11-15T01:10:00Z')
  assert.deepEqual(jstParts(d), { hour: 10, minute: 10, second: 0 })
})

test('PC のタイムゾーンが日本以外でも、結果は日本時間', () => {
  const before = process.env.TZ
  const d = new Date('2026-11-15T01:10:30Z')
  try {
    process.env.TZ = 'Asia/Tokyo'
    const a = jstParts(d)
    const ba = bandOf(d)
    process.env.TZ = 'America/New_York'
    assert.notEqual(new Date(0).getTimezoneOffset(), -540, 'TZ が切り替わっていない')
    assert.deepEqual(jstParts(d), a)
    assert.equal(bandOf(d), ba)
    assert.deepEqual(a, { hour: 10, minute: 10, second: 30 })
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
})

test('針の角度', () => {
  assert.deepEqual(clockAngles(jst(10, 10, 0)), { hourDeg: 305, minuteDeg: 60, secondDeg: 0 })
  assert.deepEqual(clockAngles(jst(12, 0, 0)), { hourDeg: 0, minuteDeg: 0, secondDeg: 0 })
  assert.deepEqual(clockAngles(jst(0, 0, 0)), { hourDeg: 0, minuteDeg: 0, secondDeg: 0 })
  const late = clockAngles(jst(23, 59, 59))
  for (const v of Object.values(late)) assert.ok(v >= 0 && v < 360, String(v))
  assert.equal(late.secondDeg, 354)
})

test('絵の作り直しの判定：無い・古すぎる（1分より前）なら作り直す、新しければ同じ絵', async () => {
  const { SCENE_FRESH_MS, isSceneStale } = await import('../hooks/lib/time.ts')
  assert.equal(SCENE_FRESH_MS, 60_000)
  assert.equal(isSceneStale(undefined, 1_000_000), true)
  assert.equal(isSceneStale(1_000_000, 1_000_000), false)
  assert.equal(isSceneStale(1_000_000, 1_000_000 + 60_000), false)
  assert.equal(isSceneStale(1_000_000, 1_000_000 + 60_001), true)
  // PC の時計が戻ったとき（未来に作った絵）も作り直す
  assert.equal(isSceneStale(1_000_000, 999_000), true)
})
