import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_CLAWD, describeClawd, levelOfEffort, lookOfModel, normalizeClawd, viewOf } from '../hooks/lib/clawd-choice.ts'
import type { ClawdChoice } from '../hooks/lib/clawd-choice.ts'

test('標準は 姿 自動・演出 自動・ドット ふつう', () => {
  assert.deepEqual(DEFAULT_CLAWD, { look: 'auto', effect: 'auto', dots: 'normal' })
})

test('normalizeClawd：項目ごとに、正しくなければ標準。例外を投げない', () => {
  assert.deepEqual(normalizeClawd(undefined), DEFAULT_CLAWD)
  assert.deepEqual(normalizeClawd({ look: 'x', effect: 'max' }), { look: 'auto', effect: 'max', dots: 'normal' })
  assert.deepEqual(normalizeClawd({ look: 'opus', effect: 'low', dots: 'fine', extra: 1 }), { look: 'opus', effect: 'low', dots: 'fine' })
  // 前の版の「なし」（none）は、low として読む（演出なし・打つ速さはふつうで、同じ見た目）
  assert.deepEqual(normalizeClawd({ look: 'opus', effect: 'none', dots: 'fine' }), { look: 'opus', effect: 'low', dots: 'fine' })
  for (const bad of [null, 'x', 42, [], { look: 3, effect: {}, dots: null }]) assert.deepEqual(normalizeClawd(bad), DEFAULT_CLAWD, JSON.stringify(bad))
  assert.deepEqual(normalizeClawd({ look: 'toString', effect: 'toString', dots: 'constructor' }), DEFAULT_CLAWD)
})

test('lookOfModel：モデル名に haiku sonnet opus fable を含むか（大文字小文字を区別しない）', () => {
  assert.equal(lookOfModel('claude-opus-5-5'), 'opus')
  assert.equal(lookOfModel('Claude-Haiku-5-5'), 'haiku')
  assert.equal(lookOfModel('claude-sonnet-5-5'), 'sonnet')
  assert.equal(lookOfModel('FABLE'), 'fable')
  assert.equal(lookOfModel(undefined), 'sonnet')
  assert.equal(lookOfModel('gpt-x'), 'sonnet')
  assert.equal(lookOfModel(''), 'sonnet')
})

test('levelOfEffort：low→0 … max→4、それ以外は undefined', () => {
  assert.equal(levelOfEffort('low'), 0)
  assert.equal(levelOfEffort('medium'), 1)
  assert.equal(levelOfEffort('high'), 2)
  assert.equal(levelOfEffort('xhigh'), 3)
  assert.equal(levelOfEffort('max'), 4)
  for (const bad of [42, 'auto', 'LOW', '', null, undefined, {}, 'toString']) assert.equal(levelOfEffort(bad), undefined, String(bad))
})

const base = { phase: 'wait' as const, subagents: 0, cardOpen: false }
const c = (o: Partial<ClawdChoice>): ClawdChoice => ({ ...DEFAULT_CLAWD, ...o })

test('viewOf：姿は 自動ならモデル、固定ならその姿', () => {
  assert.equal(viewOf({ ...base, choice: c({}), model: 'claude-opus-5' }).look, 'opus')
  assert.equal(viewOf({ ...base, choice: c({}) }).look, 'sonnet')
  assert.equal(viewOf({ ...base, choice: c({ look: 'haiku' }), model: 'claude-opus-5' }).look, 'haiku')
})

test('viewOf：演出と速さ', () => {
  const v = (choice: ClawdChoice, effort?: unknown) => viewOf({ ...base, choice, effort })
  const pick = (x: ReturnType<typeof viewOf>) => [x.effect, x.tempo]
  assert.deepEqual(pick(v(c({}))), [0, 1]) // 自動＋effort 不明
  assert.deepEqual(pick(v(c({}), 42)), [0, 1])
  assert.deepEqual(pick(v(c({}), 'high')), [2, 2])
  assert.deepEqual(pick(v(c({}), 'low')), [0, 0])
  assert.deepEqual(pick(v(c({}), 'max')), [4, 4])
  // low は演出なし。打つ速さは今までの「なし」と同じ、ふつう（low は速さを表すものではない）
  assert.deepEqual(pick(v(c({ effect: 'low' }), 'max')), [0, 1])
  assert.deepEqual(pick(v(c({ effect: 'low' }))), [0, 1])
  assert.deepEqual(pick(v(c({ effect: 'max' }))), [4, 4])
  assert.deepEqual(pick(v(c({ effect: 'medium' }), 'max')), [1, 1])
  assert.deepEqual(pick(v(c({ effect: 'high' }))), [2, 2])
  assert.deepEqual(pick(v(c({ effect: 'xhigh' }))), [3, 3])
})

test('viewOf：showEffect はカードを開いているか、動いている状態のとき', () => {
  for (const phase of ['alert', 'think', 'tool', 'write', 'done'] as const) assert.equal(viewOf({ ...base, choice: c({}), phase }).showEffect, true, phase)
  for (const phase of ['wait', 'wave'] as const) assert.equal(viewOf({ ...base, choice: c({}), phase }).showEffect, false, phase)
  assert.equal(viewOf({ ...base, choice: c({}), phase: 'wait', cardOpen: true }).showEffect, true)
})

test('viewOf：ドット・子の数・来た子と帰った子を引き継ぐ（無ければ空）', () => {
  const v = viewOf({ ...base, choice: c({ dots: 'fine' }), subagents: 2, arrive: [1], leave: [0] })
  assert.equal(v.dots, 'fine')
  assert.equal(v.subagents, 2)
  assert.deepEqual(v.arrive, [1])
  assert.deepEqual(v.leave, [0])
  assert.equal(v.phase, 'wait')
  const w = viewOf({ ...base, choice: c({}) })
  assert.deepEqual(w.arrive, [])
  assert.deepEqual(w.leave, [])
})

test('describeClawd', () => {
  assert.equal(describeClawd(c({ effect: 'max' })), '姿 自動・演出 max・ドット ふつう')
  assert.equal(describeClawd({ look: 'opus', effect: 'low', dots: 'fine' }), '姿 opus・演出 low・ドット 細かい')
  assert.equal(describeClawd(DEFAULT_CLAWD), '姿 自動・演出 自動・ドット ふつう')
})
