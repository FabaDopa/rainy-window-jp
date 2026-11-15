import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))

test('plugin.json：改造版の作者を元の作者と取り違えない。元の作者への帰属は説明に残す', () => {
  assert.equal(manifest.name, 'rainy-window-jp')
  assert.equal(manifest.license, 'MIT')
  assert.notEqual(manifest.author?.name, 'Ishu Agrawal')
  assert.equal(manifest.author?.name, 'rainy-window-jp contributors')
  // バグの報告が元の作者のリポジトリへ行かないように
  assert.equal(String(manifest.homepage ?? '').includes('ishuagrawal'), false)
  assert.equal(String(manifest.repository ?? '').includes('ishuagrawal'), false)
  assert.ok(String(manifest.description).includes('Ishu Agrawal'))
})
