import { test } from 'node:test'
import assert from 'node:assert/strict'

import { RJ_USAGE, parseRj } from '../hooks/lib/command.ts'

test('空は カード', () => {
  assert.deepEqual(parseRj(''), { kind: 'card' })
  assert.deepEqual(parseRj('   '), { kind: 'card' })
})

test('色だけ → 全体、時間と明るさは未指定', () => {
  assert.deepEqual(parseRj('緑'), { kind: 'apply', scope: 'global', theme: '緑' })
  for (const [word, theme] of [['紺', '紺'], ['桜', '桜'], ['橙', '橙'], ['灰', '灰'], ['オフ', 'なし'], ['なし', 'なし'], ['off', 'なし'],
    ['navy', '紺'], ['green', '緑'], ['pink', '桜'], ['orange', '橙'], ['gray', '灰'], ['grey', '灰']] as const) {
    assert.deepEqual(parseRj(word), { kind: 'apply', scope: 'global', theme }, word)
  }
})

test('前の版の名前も通る（雨→紺、森→緑、墨→灰、葡萄→桜）', () => {
  assert.deepEqual(parseRj('森'), { kind: 'apply', scope: 'global', theme: '緑' })
  assert.deepEqual(parseRj('rain'), { kind: 'apply', scope: 'global', theme: '紺' })
  assert.deepEqual(parseRj('墨'), { kind: 'apply', scope: 'global', theme: '灰' })
  assert.deepEqual(parseRj('grape'), { kind: 'apply', scope: 'global', theme: '桜' })
})

test('時間・明るさ・場所', () => {
  assert.deepEqual(parseRj('緑 自動 p'), { kind: 'apply', scope: 'project', theme: '緑', time: { kind: 'auto' } })
  assert.deepEqual(parseRj('紺 夜 s'), { kind: 'apply', scope: 'session', theme: '紺', time: { kind: 'fixed', band: '夜' } })
  assert.deepEqual(parseRj('紺 固定 夕方'), { kind: 'apply', scope: 'global', theme: '紺', time: { kind: 'fixed', band: '夕方' } })
  assert.deepEqual(parseRj('green dark s'), { kind: 'apply', scope: 'session', theme: '緑', brightness: 'dark' })
  assert.deepEqual(parseRj('pink morning light'), { kind: 'apply', scope: 'global', theme: '桜', time: { kind: 'fixed', band: '朝' }, brightness: 'light' })
  assert.deepEqual(parseRj('gray auto system'), { kind: 'apply', scope: 'global', theme: '灰', time: { kind: 'auto' }, brightness: 'system' })
  assert.deepEqual(parseRj('Navy  Night  P'), { kind: 'apply', scope: 'project', theme: '紺', time: { kind: 'fixed', band: '夜' } })
})

test('reset と場所', () => {
  assert.deepEqual(parseRj('reset p'), { kind: 'reset', scope: 'project' })
  assert.deepEqual(parseRj('reset s'), { kind: 'reset', scope: 'session' })
  assert.deepEqual(parseRj('reset'), { kind: 'reset', scope: 'global' })
  assert.deepEqual(parseRj('p reset'), { kind: 'reset', scope: 'project' })
})

test('順番は自由', () => {
  assert.deepEqual(parseRj('p 緑'), parseRj('緑 p'))
  assert.deepEqual(parseRj('s 黒 自動 緑'), parseRj('緑 自動 黒 s'))
})

test('意味不明は help で、理由が入る（例外を投げない）', () => {
  for (const bad of ['ほげ', '緑 緑', '緑 森', 'reset 緑', '緑 夜 朝', '緑 p s', '固定', '緑 固定', '自動 夜 緑', 'reset reset', 'p', '緑 黒 白', '緑 固定 朝 夜']) {
    const r = parseRj(bad)
    assert.equal(r.kind, 'help', bad)
    if (r.kind === 'help') assert.ok(r.reason.length > 0, bad)
  }
})

test('使い方と理由の言葉は、カードと同じ（背景色・時間帯・保存先）', async () => {
  const { RJ_USAGE } = await import('../hooks/lib/command.ts')
  for (const old of ['セッション', 'プロジェクト', '場所', 'テーマ', '時間：']) assert.equal(RJ_USAGE.includes(old), false, old)
  for (const word of ['背景色', '時間帯', '保存先', 'すべての会話', 'このフォルダ', 'この会話だけ']) assert.ok(RJ_USAGE.includes(word), word)
  for (const bad of ['緑 p s', 'reset 緑']) {
    const r = parseRj(bad)
    assert.equal(r.kind, 'help')
    if (r.kind === 'help') for (const old of ['場所', 'セッション', 'プロジェクト']) assert.equal(r.reason.includes(old), false, r.reason)
  }
})

test('/rj 試す・probe は、確かめを外したので分からない語（使い方）', () => {
  assert.equal(parseRj('試す').kind, 'help')
  assert.equal(parseRj('probe').kind, 'help')
  assert.equal(parseRj('試す 緑').kind, 'help')
  assert.equal(parseRj('probe p').kind, 'help')
})

test('クロードくんの語：演出・姿・ドット（背景色なしでも通る）', () => {
  assert.deepEqual(parseRj('演出 max'), { kind: 'apply', scope: 'global', clawd: { effect: 'max' } })
  assert.deepEqual(parseRj('effect high'), { kind: 'apply', scope: 'global', clawd: { effect: 'high' } })
  assert.deepEqual(parseRj('演出 low'), { kind: 'apply', scope: 'global', clawd: { effect: 'low' } })
  // 前の版の書き方（なし・none）も、low として通る
  assert.deepEqual(parseRj('演出 なし'), { kind: 'apply', scope: 'global', clawd: { effect: 'low' } })
  assert.deepEqual(parseRj('effect none'), { kind: 'apply', scope: 'global', clawd: { effect: 'low' } })
  assert.deepEqual(parseRj('演出 自動'), { kind: 'apply', scope: 'global', clawd: { effect: 'auto' } })
  assert.deepEqual(parseRj('演出 medium'), { kind: 'apply', scope: 'global', clawd: { effect: 'medium' } })
  assert.deepEqual(parseRj('演出 xhigh'), { kind: 'apply', scope: 'global', clawd: { effect: 'xhigh' } })
  assert.deepEqual(parseRj('姿 opus ドット 細かい p'), { kind: 'apply', scope: 'project', clawd: { look: 'opus', dots: 'fine' } })
  assert.deepEqual(parseRj('look Fable dots FINE'), { kind: 'apply', scope: 'global', clawd: { look: 'fable', dots: 'fine' } })
  assert.deepEqual(parseRj('姿 自動'), { kind: 'apply', scope: 'global', clawd: { look: 'auto' } })
  assert.deepEqual(parseRj('ドット ふつう s'), { kind: 'apply', scope: 'session', clawd: { dots: 'normal' } })
  for (const look of ['sonnet', 'haiku', 'opus', 'fable', 'auto']) assert.deepEqual(parseRj('look ' + look), { kind: 'apply', scope: 'global', clawd: { look } })
})

test('背景の語とクロードくんの語は、順番自由で混ぜられる', () => {
  assert.deepEqual(parseRj('緑 演出 max'), { kind: 'apply', scope: 'global', theme: '緑', clawd: { effect: 'max' } })
  assert.deepEqual(parseRj('p 姿 haiku 紺 夜'), { kind: 'apply', scope: 'project', theme: '紺', time: { kind: 'fixed', band: '夜' }, clawd: { look: 'haiku' } })
  assert.deepEqual(parseRj('演出 自動 緑 自動'), { kind: 'apply', scope: 'global', theme: '緑', time: { kind: 'auto' }, clawd: { effect: 'auto' } })
})

test('なし だけは今までどおり背景のオフ、演出のあとの なし は演出なし', () => {
  assert.deepEqual(parseRj('なし'), { kind: 'apply', scope: 'global', theme: 'なし' })
  assert.deepEqual(parseRj('なし 演出 なし'), { kind: 'apply', scope: 'global', theme: 'なし', clawd: { effect: 'low' } })
})

test('クロードくんの語の間違いは使い方を返す', () => {
  for (const bad of ['演出', '姿', 'ドット', '演出 低い', '姿 gpt', 'ドット 大きい', '演出 max high', '姿 opus haiku', 'dots fine normal', '演出 緑', '演出 max reset', 'reset 演出 max', '試す 演出 max', '演出 p', '姿 s']) {
    assert.equal(parseRj(bad).kind, 'help', bad)
  }
})

test('使い方に、クロードくんの語が載っている', () => {
  for (const word of ['姿', '演出', 'ドット']) assert.ok(RJ_USAGE.includes(word), word)
})
