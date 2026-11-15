import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

// tabs.ts は拡張子なしの import を使うかもしれないので、test/setup.mjs（--import）で .ts を補って読む。
const tabs = await import('../hooks/lib/tabs.ts')
const { TABS, TAB_LABEL, isTab } = tabs

test('タブ：2つ、名前は 背景 と クロードくん（絵文字は付けない）', () => {
  assert.deepEqual([...TABS], ['room', 'clawd'])
  assert.deepEqual(TAB_LABEL, { room: '背景', clawd: 'クロードくん' })
  assert.equal(isTab('room'), true)
  assert.equal(isTab('clawd'), true)
  assert.equal(isTab('x'), false)
  assert.equal(isTab(undefined), false)
})

test('変更 11：タブはボタンだけ。吹き出し・帯の絵、ばねの動き、ターミナルの線の文字は無い（springs.ts も無い）', () => {
  assert.deepEqual(Object.keys(tabs).sort(), ['TABS', 'TAB_LABEL', 'isTab'])
  assert.equal(existsSync(new URL('../hooks/lib/springs.ts', import.meta.url)), false)
})
