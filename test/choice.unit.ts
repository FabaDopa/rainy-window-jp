import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_CLAWD } from '../hooks/lib/clawd-choice.ts'
import { DEFAULT_CHOICE, SOURCE_LABEL, describeChoice, effectiveBand, normalizeChoice, resolveChoice } from '../hooks/lib/choice.ts'
import type { Choice } from '../hooks/lib/choice.ts'

const green: Choice = { theme: '緑', time: { kind: 'auto' }, brightness: 'dark', clawd: DEFAULT_CLAWD }
const gray: Choice = { theme: '灰', time: { kind: 'fixed', band: '朝' }, brightness: 'light', clawd: DEFAULT_CLAWD }
const off: Choice = { theme: 'なし', time: { kind: 'fixed', band: '夜' }, brightness: 'system', clawd: DEFAULT_CLAWD }

test('何も無ければ標準（紺＝元の色・夜・システム）', () => {
  assert.deepEqual(DEFAULT_CHOICE, { theme: '紺', time: { kind: 'fixed', band: '夜' }, brightness: 'system', clawd: DEFAULT_CLAWD })
  assert.deepEqual(resolveChoice({}), { choice: DEFAULT_CHOICE, source: 'default' })
})

test('セッション ＞ プロジェクト ＞ 全体', () => {
  assert.deepEqual(resolveChoice({ session: green, project: gray, global: off }), { choice: green, source: 'session' })
  assert.deepEqual(resolveChoice({ project: gray, global: off }), { choice: gray, source: 'project' })
  assert.deepEqual(resolveChoice({ global: off }), { choice: off, source: 'global' })
})

test('5色とオフ（なし）を受け付ける', () => {
  for (const theme of ['紺', '緑', '桜', '橙', '灰', 'なし'] as const) {
    const c: Choice = { theme, time: { kind: 'auto' }, brightness: 'system', clawd: DEFAULT_CLAWD }
    assert.deepEqual(normalizeChoice(c), c)
  }
})

test('前の版で保存した名前は、近い色として読む（雨→紺、森→緑、墨→灰、葡萄→桜）', () => {
  const old = (theme: string) => ({ theme, time: { kind: 'fixed', band: '夜' }, brightness: 'system' })
  assert.equal(normalizeChoice(old('雨'))?.theme, '紺')
  assert.equal(normalizeChoice(old('森'))?.theme, '緑')
  assert.equal(normalizeChoice(old('墨'))?.theme, '灰')
  assert.equal(normalizeChoice(old('葡萄'))?.theme, '桜')
})

test('壊れた値はその層が無いものとして次へ進み、例外を投げない', () => {
  const broken = [null, '緑', { theme: 'x' }, { theme: '紺' }, 42, [], { theme: '紺', time: { kind: 'fixed', band: '深夜' }, brightness: 'system' },
    { theme: '紺', time: { kind: 'auto' }, brightness: 'blue' }, { theme: '紺', time: 'auto', brightness: 'dark' }]
  for (const bad of broken) {
    assert.equal(normalizeChoice(bad), undefined, JSON.stringify(bad))
    assert.deepEqual(resolveChoice({ session: bad, project: gray }), { choice: gray, source: 'project' })
    assert.deepEqual(resolveChoice({ session: bad, project: bad, global: bad }), { choice: DEFAULT_CHOICE, source: 'default' })
  }
})

test('正しい値はそのまま返す（余分な項目は落とす）', () => {
  for (const c of [green, gray, off, DEFAULT_CHOICE]) assert.deepEqual(normalizeChoice(c), c)
  assert.deepEqual(normalizeChoice({ ...green, extra: 1 }), green)
  assert.deepEqual(normalizeChoice({ ...gray, time: { kind: 'fixed', band: '朝', x: 1 } }), gray)
})

test('時間帯：自動は時刻で決まり、固定は時刻を無視する', () => {
  const noonJst = new Date('2026-11-15T03:00:00Z') // 日本 12:00
  const eveningJst = new Date('2026-11-15T08:00:00Z') // 日本 17:00
  assert.equal(effectiveBand(green, noonJst), '昼')
  assert.equal(effectiveBand(green, eveningJst), '夕方')
  assert.equal(effectiveBand(DEFAULT_CHOICE, noonJst), '夜')
  assert.equal(effectiveBand(gray, eveningJst), '朝')
})

test('設定と場所の説明（カードの「いま」の行・コマンドの返事）', () => {
  assert.equal(describeChoice(DEFAULT_CHOICE), '紺・夜')
  assert.equal(describeChoice({ ...green, brightness: 'system' }), '緑・時間帯で自動')
  assert.equal(describeChoice(green), '緑・時間帯で自動・黒')
  assert.equal(describeChoice(gray), '灰・朝・白')
  assert.equal(describeChoice(off), 'オフ')
  assert.deepEqual(SOURCE_LABEL, { session: 'この会話だけ', project: 'このフォルダ', global: 'すべての会話', default: '標準' })
})

test('clawd の無い今までの保存は、背景そのままで clawd は標準になる', () => {
  const old = { theme: '緑', time: { kind: 'auto' }, brightness: 'system' }
  assert.deepEqual(normalizeChoice(old), { theme: '緑', time: { kind: 'auto' }, brightness: 'system', clawd: DEFAULT_CLAWD })
  assert.deepEqual(resolveChoice({ global: old }), { choice: { theme: '緑', time: { kind: 'auto' }, brightness: 'system', clawd: DEFAULT_CLAWD }, source: 'global' })
})

test('clawd だけ壊れていても背景はそのまま。項目ごとに標準へ戻る', () => {
  const bg = { theme: '桜', time: { kind: 'fixed', band: '朝' }, brightness: 'dark' }
  for (const bad of [null, 'x', 42, [], { look: 'zzz' }]) {
    assert.deepEqual(normalizeChoice({ ...bg, clawd: bad }), { ...bg, clawd: DEFAULT_CLAWD }, JSON.stringify(bad))
  }
  assert.deepEqual(normalizeChoice({ ...bg, clawd: { look: 'opus', effect: 'bad', dots: 'fine' } }), { ...bg, clawd: { look: 'opus', effect: 'auto', dots: 'fine' } })
})

test('describeChoice は今までどおり背景だけを説明する', () => {
  assert.equal(describeChoice({ ...green, clawd: { look: 'opus', effect: 'max', dots: 'fine' } }), '緑・時間帯で自動・黒')
})

test('標準の clawd は DEFAULT_CLAWD と別のオブジェクト（書き換えが伝わらない）', () => {
  assert.notEqual(DEFAULT_CHOICE.clawd, DEFAULT_CLAWD)
  assert.deepEqual(DEFAULT_CHOICE.clawd, DEFAULT_CLAWD)
})

test('層の重なりは Choice まるごと：clawd の無いセッションは、全体の clawd を引き継がない', () => {
  const session = { theme: '緑', time: { kind: 'auto' }, brightness: 'system' }
  const global = { theme: '灰', time: { kind: 'auto' }, brightness: 'system', clawd: { look: 'opus', effect: 'max', dots: 'fine' } }
  assert.deepEqual(resolveChoice({ session, global }), { choice: { ...session, clawd: DEFAULT_CLAWD }, source: 'session' })
})
