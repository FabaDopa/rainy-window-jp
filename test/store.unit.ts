import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_CHOICE } from '../hooks/lib/choice.ts'
import { DEFAULT_CLAWD } from '../hooks/lib/clawd-choice.ts'
import { GLOBAL_KEY, mergeChoice, projectKeyOf, sessionKeyOf, sessionKeysToPrune, storeKeyFor } from '../hooks/lib/store.ts'

test('キーの形', () => {
  assert.equal(GLOBAL_KEY, 'global')
  assert.equal(sessionKeyOf('abc'), 'session:abc')
  assert.equal(sessionKeyOf(''), undefined)
  assert.equal(sessionKeyOf(undefined), undefined)
})

test('プロジェクトのキー：リポジトリの外はそのフォルダ、ワークツリーは元のフォルダ', () => {
  // Windows のパスは / で書いて、win() で区切りを Windows の形に直す
  const win = (p: string) => p.replaceAll('/', String.fromCharCode(92))
  assert.equal(projectKeyOf(win('C:/work/a'), null, false), 'project:C:/work/a')
  assert.equal(projectKeyOf(win('C:/work/a/'), null, false), 'project:C:/work/a')
  assert.equal(projectKeyOf('/home/me/app/', '/home/me/app', false), 'project:/home/me/app')
  // リンクされたワークツリー（.git がファイル）：元のフォルダと同じプロジェクト
  assert.equal(projectKeyOf(win('C:/work/a/.claude/worktrees/x'), win('C:/work/a'), true), 'project:C:/work/a')
  // リポジトリの中のただの下のフォルダは、そのフォルダ自身
  assert.equal(projectKeyOf(win('C:/work/a/pkg'), win('C:/work/a'), false), 'project:C:/work/a/pkg')
  // ドライブの根は削らない
  assert.equal(projectKeyOf(win('C:/'), null, false), 'project:C:/')
  assert.equal(projectKeyOf('C:/', null, false), 'project:C:/')
  assert.equal(projectKeyOf('/', null, false), 'project:/')
})

test('どの場所のキーに書くか', () => {
  const keys = { project: 'project:/p', session: 'session:1' }
  assert.equal(storeKeyFor('global', keys), 'global')
  assert.equal(storeKeyFor('project', keys), 'project:/p')
  assert.equal(storeKeyFor('session', keys), 'session:1')
  assert.equal(storeKeyFor('session', { project: 'project:/p', session: undefined }), undefined)
})

test('セッションのキーは古いものから消して、決まった数だけ残す', () => {
  const keys = ['global', 'session:a', 'project:/x', 'session:b', 'session:c']
  assert.deepEqual(sessionKeysToPrune(keys, 2), ['session:a'])
  assert.deepEqual(sessionKeysToPrune(keys, 3), [])
  assert.deepEqual(sessionKeysToPrune(keys, 0), ['session:a', 'session:b', 'session:c'])
})

test('未指定の項目は、その場所の今の値、無ければ標準から引き継ぐ', () => {
  const stored = { theme: '緑', time: { kind: 'auto' }, brightness: 'dark' }
  assert.deepEqual(mergeChoice(stored, { theme: '灰' }), { theme: '灰', time: { kind: 'auto' }, brightness: 'dark', clawd: DEFAULT_CLAWD })
  assert.deepEqual(mergeChoice(stored, { theme: '紺', brightness: 'system' }), { theme: '紺', time: { kind: 'auto' }, brightness: 'system', clawd: DEFAULT_CLAWD })
  assert.deepEqual(mergeChoice(undefined, { theme: '桜' }), { ...DEFAULT_CHOICE, theme: '桜' })
  assert.deepEqual(mergeChoice({ theme: 'x' }, { theme: '緑', time: { kind: 'fixed', band: '朝' } }), { theme: '緑', time: { kind: 'fixed', band: '朝' }, brightness: 'system', clawd: DEFAULT_CLAWD })
})

test('クロードくんの項目だけを変えても背景はそのまま、逆も同じ', () => {
  const stored = { theme: '緑', time: { kind: 'auto' }, brightness: 'dark', clawd: { look: 'opus', effect: 'auto', dots: 'fine' } }
  assert.deepEqual(mergeChoice(stored, { clawd: { effect: 'max' } }), { theme: '緑', time: { kind: 'auto' }, brightness: 'dark', clawd: { look: 'opus', effect: 'max', dots: 'fine' } })
  assert.deepEqual(mergeChoice(stored, { theme: '灰' }), { theme: '灰', time: { kind: 'auto' }, brightness: 'dark', clawd: { look: 'opus', effect: 'auto', dots: 'fine' } })
  assert.deepEqual(mergeChoice(undefined, { clawd: { dots: 'fine' } }), { ...DEFAULT_CHOICE, clawd: { ...DEFAULT_CLAWD, dots: 'fine' } })
  assert.deepEqual(mergeChoice({ theme: '緑' }, { clawd: { look: 'haiku' } }), { ...DEFAULT_CHOICE, clawd: { ...DEFAULT_CLAWD, look: 'haiku' } })
})

test('明示的な undefined は、クロードくんの項目を消さない', () => {
  const stored = { theme: '緑', time: { kind: 'auto' }, brightness: 'dark', clawd: { look: 'opus', effect: 'high', dots: 'fine' } }
  const got = mergeChoice(stored, { clawd: { look: undefined, effect: 'max' } })
  assert.deepEqual(got.clawd, { look: 'opus', effect: 'max', dots: 'fine' })
})

test('パスの書き方（区切り・ドライブの大文字小文字・末尾）が違っても、同じプロジェクトは同じキー', () => {
  const win = (p: string) => p.replaceAll('/', String.fromCharCode(92))
  const main = projectKeyOf(win('C:/work/a'), 'C:/work/a', false)
  assert.equal(projectKeyOf('C:/work/a', win('C:/work/a'), false), main)
  assert.equal(projectKeyOf(win('c:/work/a/'), 'C:/work/a', false), main)
  // git は / で、セッションの根は \ で答えるワークツリー
  assert.equal(projectKeyOf(win('C:/work/a/.claude/worktrees/x'), 'C:/work/a', true), main)
  assert.equal(projectKeyOf(win('c:/work/a/.claude/worktrees/x'), win('C:/work/a'), true), main)
  // 違うフォルダは違うキー
  assert.notEqual(projectKeyOf(win('C:/work/b'), null, false), main)
})
