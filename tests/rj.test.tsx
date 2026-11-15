// register.tsx を Claude Code 自身のテスト道具で動かす（claude plugin test）。
// ストアは偽物（mock.store）、テーマの設定（theme.set / theme.clear）は記録するだけ。

import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { CommandRunInput, On, PromptSubmitInput, ThemeSetArgs } from 'claude-code'

import { TILE_H, TILE_W, clawdTiles, effectTileSvg, lookTileSvg } from '../hooks/clawd/tiles'
import { roomColors } from '../hooks/lib/palette'
import { TIP_H, TIP_TEXT, tabRuleText, tabStripSvg, tabTipSvg } from '../hooks/lib/tabs'
import { bandOf, clockAngles, jstParts } from '../hooks/lib/time'

type World = { sets: ThemeSetArgs[]; clears: number; toasts: string[]; places: number; store: Map<string, unknown>; logs: { text: string; to?: string }[] }

function world(
  on: On,
  store: Record<string, unknown> = {},
  where: { root?: string; repo?: string | null; gitIsFile?: boolean; canPlace?: boolean } = {},
): World {
  // The mod's store, in memory, in insertion order as the engine keeps it.
  const kept = new Map<string, unknown>(Object.entries(store).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]))
  const w: World = { sets: [], clears: 0, toasts: [], places: 0, store: kept, logs: [] }
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    kept.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...kept.keys()] }))
  mock.env(on, { CLAUDE_CODE_HOST_SESSION_ID: 'S1' })
  on('command.register', () => ({ value: { command: 'rj' } }))
  on('session.root', () => ({ value: where.root ?? 'C:/work/a' }))
  on('session.repo', () => ({
    value: where.repo === undefined || where.repo === null ? null : { root: where.repo, remote: null, internal: false, name: null },
  }))
  on('fs.stat', () => {
    if (where.gitIsFile !== true) throw new Error('no such file')
    return { value: { kind: 'file', size: 10, mtimeMs: 0, isLink: false } }
  })
  on('theme.set', (_, e) => {
    w.sets.push(e)
    return { value: { isDrawn: true, requestId: 'r1' } }
  })
  on('theme.clear', () => {
    w.clears += 1
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    w.logs.push(e as never)
    return { value: undefined }
  })
  on('ui.place', () => {
    w.places += 1
    return where.canPlace === false ? { value: { isPlaced: false, reason: 'no placed rows here' } } : { value: { isPlaced: true, requestId: 'p1' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  return w
}

// The kit fills in the fields a session stamps (origin and the like); only what matters here is written.
const rj = (args: string) => ({ command: 'rj', args }) as CommandRunInput
const say = (text: string) => ({ text }) as PromptSubmitInput

const start = { cwd: 'C:/work/a', surface: 'desktop', isInteractive: true } as const
// 入力欄の上の帯（カードはいつもここに出る）。
const BAND = { hasSurvey: false, isCollapsed: false } as never
const labelOf = (set: ThemeSetArgs | undefined) => set?.colors?.label


test('何も保存していなければ、紺（元の rainy-window と同じ色と背景の名前）が付く', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  expect(w.sets.length).toBe(1)
  expect(labelOf(w.sets[0])).toBe('Rainy window')
  expect(w.sets[0]?.backdrop).toEqual({ scene: 'rainy-window-jp', glass: { blur: 18, opacity: 0.62 } })
  expect(w.sets[0]?.overrideColorScheme).toBe(undefined)
  expect(w.clears).toBe(0)
})

test('壊れた保存値は無視して、次の層（ここでは標準）へ', async ($, on) => {
  const w = world(on, { global: { theme: 'x' }, 'project:C:/work/a': '緑', 'session:S1': null })
  await $.session.start(start)
  expect(labelOf(w.sets[0])).toBe('Rainy window')
})

test('優先順位：セッション ＞ プロジェクト ＞ 全体', async ($, on) => {
  const forest = { theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const ink = { theme: '灰', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const grape = { theme: '桜', time: { kind: 'fixed', band: '夜' }, brightness: 'dark' }
  const w = world(on, { global: forest, 'project:C:/work/a': ink, 'session:S1': grape })
  await $.session.start(start)
  expect(labelOf(w.sets[0])).toBe('Rainy window JP 桜')
  expect(w.sets[0]?.overrideColorScheme).toBe('dark')
})

test('ワークツリーは元のフォルダのプロジェクトの設定を読む', async ($, on) => {
  const ink = { theme: '灰', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const w = world(on, { 'project:C:/work/a': ink }, { root: 'C:/work/a/.claude/worktrees/x', repo: 'C:/work/a', gitIsFile: true })
  await $.session.start({ ...start, cwd: 'C:/work/a/.claude/worktrees/x' })
  expect(labelOf(w.sets[0])).toBe('Rainy window JP 灰')
})

test('/rj 緑 s はセッションに保存して、すぐ付け直す', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  const answer = await $.command.run(rj('緑 s'))
  expect(answer.text).toContain('この会話だけ')
  expect(answer.text).toContain('緑・夜')
  expect(w.store.get('session:S1')).toEqual({ theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system', clawd: { look: 'auto', effect: 'auto', dots: 'normal' } })
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
})

test('未指定の項目は、その場所の今の値を引き継ぐ', async ($, on) => {
  const w = world(on, { global: { theme: '緑', time: { kind: 'auto' }, brightness: 'dark' } })
  await $.session.start(start)
  await $.command.run(rj('灰'))
  expect(w.store.get('global')).toEqual({ theme: '灰', time: { kind: 'auto' }, brightness: 'dark', clawd: { look: 'auto', effect: 'auto', dots: 'normal' } })
})

const GREEN = { theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
const AUTO_CLAWD = { look: 'auto', effect: 'auto', dots: 'normal' }

test('/rj 演出 max：背景はそのまま、クロードくんだけ保存し、返事に演出を書く', async ($, on) => {
  const w = world(on, { global: GREEN })
  await $.session.start(start)
  const before = w.sets.length
  const answer = await $.command.run(rj('演出 max'))
  expect(w.store.get('global')).toEqual({ ...GREEN, clawd: { ...AUTO_CLAWD, effect: 'max' } })
  expect(w.sets.length).toBe(before)
  expect(answer.text).toContain('「演出 max」')
  expect(answer.text).not.toContain('緑・夜')
})

test('/rj 演出 max p：狭い場所に保存しても、見えている背景（全体の緑）のまま', async ($, on) => {
  const w = world(on, { global: GREEN })
  await $.session.start(start)
  const before = w.sets.length
  await $.command.run(rj('演出 max p'))
  expect(w.store.get('project:C:/work/a')).toEqual({ ...GREEN, clawd: { ...AUTO_CLAWD, effect: 'max' } })
  expect(w.sets.length).toBe(before)
})

test('/rj 緑 演出 max：返事に背景とクロードくんの両方', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  const answer = await $.command.run(rj('緑 演出 max'))
  expect(w.store.get('global')).toEqual({ ...GREEN, clawd: { ...AUTO_CLAWD, effect: 'max' } })
  expect(answer.text).toContain('緑・夜')
  expect(answer.text).toContain('演出 max')
})

test('カード：保存して閉じるは、その場所に保存してあるクロードくんの設定を消さない', async ($, on) => {
  const stored = { ...GREEN, clawd: { look: 'opus', effect: 'max', dots: 'fine' } }
  const w = world(on, { global: stored })
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'rj-color-灰' })
  await ui.press({ key: 'rj-save' })
  expect(w.store.get('global')).toEqual({ ...stored, theme: '灰' })
  await ui.unmount()
})

test('カード：保存先に値が無ければ、いま効いているクロードくんの設定を引き継ぐ', async ($, on) => {
  const global = { ...GREEN, clawd: { look: 'opus', effect: 'max', dots: 'fine' } }
  const w = world(on, { global })
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'rj-scope-project' })
  await ui.press({ key: 'rj-color-灰' })
  await ui.press({ key: 'rj-save' })
  expect(w.store.get('project:C:/work/a')).toEqual({ ...global, theme: '灰' })
  await ui.unmount()
})

test('狭い場所の設定があると、広い場所に保存しても見た目は変わらないと伝える', async ($, on) => {
  const grape = { theme: '桜', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  world(on, { 'session:S1': grape })
  await $.session.start(start)
  const answer = await $.command.run(rj('緑'))
  expect(answer.text).toContain('優先されている')
})

test('変わっていなければ、メッセージを送っても付け直さない（雨のアニメを止めない）', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.prompt.submit(say('こんにちは'))
  await $.prompt.submit(say('もう一度'))
  expect(w.sets.length).toBe(1)
})

test('オフ：最初からオフなら何も消さない。付けていた見た目は消す', async ($, on) => {
  const none = { theme: 'なし', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const w = world(on, { global: none })
  await $.session.start(start)
  expect(w.sets.length).toBe(0)
  expect(w.clears).toBe(0)
  await $.command.run(rj('紺'))
  expect(w.sets.length).toBe(1)
  await $.command.run(rj('なし'))
  expect(w.clears).toBe(1)
})

test('/rj reset p はプロジェクトの設定だけを消す', async ($, on) => {
  const ink = { theme: '灰', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const w = world(on, { 'project:C:/work/a': ink })
  await $.session.start(start)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 灰')
  const answer = await $.command.run(rj('reset p'))
  expect(answer.text).toContain('このフォルダの設定を消しました')
  expect(w.store.get('project:C:/work/a')).toBe(undefined)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window')
})

test('意味不明な引数は、何も変えずに使い方を返す', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  const answer = await $.command.run(rj('ほげ'))
  expect(answer.text).toContain('分かりませんでした')
  expect(answer.text).toContain('/rj <背景色>')
  expect([...w.store.keys()]).toEqual([])
  expect(w.sets.length).toBe(1)
})

test('セッションのキーは増え続けない（200件まで）', async ($, on) => {
  const old: Record<string, unknown> = {}
  for (let i = 0; i < 205; i++) old[`session:old${i}`] = { theme: '紺', time: { kind: 'auto' }, brightness: 'system' }
  const w = world(on, old)
  await $.session.start(start)
  await $.command.run(rj('緑 s'))
  const keys = [...w.store.keys()].filter(key => key.startsWith('session:'))
  expect(keys.length).toBe(200)
  expect(keys.includes('session:S1')).toBe(true)
  expect(keys.includes('session:old0')).toBe(false)
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`カード（${surface}）：選んで「保存して閉じる」で保存し、カードを閉じる`, async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    const answer = await $.command.run(rj(''))
    expect(answer.text).toContain('カード')
    // 会話の中には置かない（入力欄の上に固定）
    expect(w.places).toBe(0)
    const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface, component: 'AbovePrompt', props: BAND })
    expect((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text).toContain('紺・夜')
    expect((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text).toContain('標準')
    await ui.press({ key: 'rj-color-緑' })
    // 押した時点で見た目が変わる。まだ保存はしない
    expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
    expect((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text).toContain('まだ保存していません')
    await ui.press({ key: 'rj-time-自動' })
    await ui.press({ key: 'rj-scope-project' })
    expect([...w.store.keys()]).toEqual([])
    await ui.press({ key: 'rj-save' })
    expect(w.store.get('project:C:/work/a')).toEqual({ theme: '緑', time: { kind: 'auto' }, brightness: 'system', clawd: { look: 'auto', effect: 'auto', dots: 'normal' } })
    expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
    // 閉じたカードは何も描かない
    expect(await ui.find({ type: 'Text', text: /保存してある設定：/ })).toBe(undefined)
    await ui.unmount()
  })
}

test('カード：押した項目に ✓ が移る', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ key: 'rj-color-紺' }))?.props.label).toBe('🟦 紺 ✓')
  expect((await ui.find({ key: 'rj-time-夜' }))?.props.label).toBe('夜 ✓')
  await ui.press({ key: 'rj-color-灰' })
  expect((await ui.find({ key: 'rj-color-紺' }))?.props.label).toBe('🟦 紺')
  expect((await ui.find({ key: 'rj-color-灰' }))?.props.label).toBe('⬜ 灰 ✓')
  // 時間帯は1つの行：自動を押すと、夜の ✓ が自動へ移る
  await ui.press({ key: 'rj-time-自動' })
  const auto = (await ui.find({ key: 'rj-time-自動' }))?.props.label as string | undefined
  // 自動のボタンには、いまの時間帯が出る（例：自動（いま夕方） ✓）
  expect(/^自動（いま(朝|昼|夕方|夜)） ✓$/.test(String(auto))).toBe(true)
  expect((await ui.find({ key: 'rj-time-夜' }))?.props.label).toBe('夜')
  // 明るさの行は無い。行は 背景色・時間帯・保存先 の3つだけ
  expect(await ui.find({ key: 'rj-bright-dark' })).toBe(undefined)
  for (const key of ['rj-color-緑', 'rj-color-桜', 'rj-color-橙', 'rj-off', 'rj-time-朝', 'rj-time-昼', 'rj-time-夕方', 'rj-scope-global', 'rj-scope-project', 'rj-scope-session', 'rj-save', 'rj-clear', 'rj-close']) {
    expect((await ui.find({ key }))?.props.label === undefined).toBe(false)
  }
  await ui.unmount()
})

test('別のセッションが全体の設定を変えたら、次のメッセージで取り込む', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  expect(w.sets.length).toBe(1)
  // 別のセッションが保存した（同じストアを共有している）
  w.store.set('global', { theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system' })
  await $.prompt.submit(say('つぎ'))
  expect(w.sets.length).toBe(2)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
})

test('カード：テンポよく押すと、そのたびに見た目が変わり、「閉じる」で保存した設定に戻る', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  for (const [key, label] of [['rj-color-緑', '緑'], ['rj-color-灰', '灰'], ['rj-color-桜', '桜']] as const) {
    await ui.press({ key })
    expect(labelOf(w.sets.at(-1))).toBe(`Rainy window JP ${label}`)
  }
  // 時間帯を変えても、そのとき見える色が変わる（同じテーマで付け直し）
  const before = w.sets.length
  await ui.press({ key: 'rj-time-朝' })
  expect(w.sets.length).toBe(before + 1)
  // 効かせる場所だけを変えても、見た目は同じなので付け直さない
  await ui.press({ key: 'rj-scope-session' })
  expect(w.sets.length).toBe(before + 1)
  expect([...w.store.keys()]).toEqual([])
  await ui.press({ key: 'rj-close' })
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window')
  expect([...w.store.keys()]).toEqual([])
  await ui.unmount()
})

test('カード：「オフにする」を押すと見た目が外れ、色を押すとまた付く', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'rj-off' })
  expect(w.clears).toBe(1)
  await ui.press({ key: 'rj-color-緑' })
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  await ui.unmount()
})

test('カード：見ている途中にメッセージを送っても、勝手に戻さない', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'rj-color-緑' })
  await $.prompt.submit(say('この色どう？'))
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  await ui.unmount()
})

test('カード：「試す」ボタンは無い', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ key: 'rj-preview' })).toBe(undefined)
  await ui.unmount()
})

test('部屋の色：色ごとに背景の名前が変わり（アプリが必ず描き直す）、その名前で描くと部屋の色が変わる', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  // 描かれる背景は、最後に付けた見た目の名前で頼まれる
  const sourceNow = async () => {
    const scene = (w.sets.at(-1)?.backdrop as { scene?: string } | undefined)?.scene
    const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'Backdrop', props: { plugin: 'rainy-window-jp', scene } } as never)
    const source = (await ui.find({ type: 'Svg' }))?.props.source as string | undefined
    await ui.unmount()
    return { scene, source: source ?? '' }
  }
  const topOf = (svg: string) => svg.match(/--top:([^;}]*)/)?.[1]
  const navy = await sourceNow()
  expect(navy.scene).toBe('rainy-window-jp')
  const sceneName = /^[A-Za-z0-9_-]{1,64}$/
  const seen = new Set([navy.scene])
  const tops = new Set([topOf(navy.source)])
  for (const color of ['緑', '桜', '橙', '灰']) {
    await $.command.run(rj(`${color} s`))
    const now = await sourceNow()
    expect(seen.has(now.scene)).toBe(false)
    expect(sceneName.test(String(now.scene))).toBe(true)
    expect(tops.has(topOf(now.source))).toBe(false)
    seen.add(now.scene)
    tops.add(topOf(now.source))
  }
  // 時間帯を変えても、名前と部屋の色が変わる
  await $.command.run(rj('灰 昼 s'))
  const day = await sourceNow()
  expect(seen.has(day.scene)).toBe(false)
  expect(tops.has(topOf(day.source))).toBe(false)
  // 紺の夜に戻すと、元の名前・元の部屋
  await $.command.run(rj('紺 夜 s'))
  const back = await sourceNow()
  expect(back.scene).toBe('rainy-window-jp')
  expect(topOf(back.source)).toBe(topOf(navy.source))
})

test('部屋の色：ほかの mod の背景の名前や、知らない名前には描かない', async ($, on) => {
  world(on)
  await $.session.start(start)
  for (const props of [
    { plugin: 'other-mod', scene: 'rainy-window-jp' },
    { plugin: 'rainy-window-jp', scene: 'something-else' },
    { plugin: 'rainy-window-jp', scene: 'rainy-window-jp-purple-night' },
    { plugin: 'rainy-window-jp', scene: 'rainy-window-jp-green-night-x' },
  ]) {
    // 背景の情報には、アプリと同じく、すりガラスの値も付ける
    const full = { ...props, glass: { blur: 18, opacity: 0.62 } }
    const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'Backdrop', props: full } as never)
    expect(await ui.find({ type: 'Svg' })).toBe(undefined)
    await ui.unmount()
  }
})

test('カードは入力欄の上に出て、会話の中には出ない', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  expect(w.places).toBe(0)
  const placed = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'Placed', props: { id: 'rj-card', plugin: 'rainy-window-jp' } })
  expect(await placed.find({ type: 'Text', text: /保存してある設定：/ })).toBe(undefined)
  await placed.unmount()
  const band = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.find({ type: 'Text', text: /保存してある設定：/ }))?.text).toContain('標準')
  await band.press({ key: 'rj-close' })
  expect(await band.find({ type: 'Text', text: /保存してある設定：/ })).toBe(undefined)
  await band.unmount()
})

test('/rj をもう一度打つとカードが閉じ、試していた見た目も保存した設定に戻る', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const band = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await band.press({ key: 'rj-color-緑' })
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  const answer = await $.command.run(rj(''))
  expect(answer.text).toContain('閉じました')
  expect(await band.find({ type: 'Text', text: /保存してある設定：/ })).toBe(undefined)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window')
  await band.unmount()
  // もう一度打つと、また開く
  await $.command.run(rj(''))
  const again = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await again.find({ type: 'Text', text: /保存してある設定：/ }))?.text).toContain('紺・夜')
  await again.unmount()
})

test('アンケートが帯を使っているあいだは、カードを出さない', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const band = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: true, isCollapsed: false } as never })
  expect(await band.find({ type: 'Text', text: /保存してある設定：/ })).toBe(undefined)
  await band.unmount()
})

test('カード：色の印・やさしい言葉・オフは下の列・明るさの案内', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const label = async (key: string) => (await ui.find({ key }))?.props.label
  expect(await label('rj-color-緑')).toBe('🟩 緑')
  expect(await label('rj-color-桜')).toBe('🌸 桜')
  expect(await label('rj-color-橙')).toBe('🟧 橙')
  expect(await label('rj-scope-global')).toBe('すべての会話 ✓')
  expect(await label('rj-scope-project')).toBe('このフォルダ')
  expect(await label('rj-scope-session')).toBe('この会話だけ')
  expect(await label('rj-save')).toBe('保存して閉じる')
  expect(await label('rj-off')).toBe('オフにする')
  // オフは色の列には無い
  expect(await ui.find({ key: 'rj-color-オフ' })).toBe(undefined)
  // 明るさ（アプリの外観）の案内
  const hint = (await ui.find({ type: 'Text', text: /外観/ }))?.text
  expect(String(hint)).toContain('設定 → 外観 → テーマ')
  await ui.press({ key: 'rj-off' })
  expect(await label('rj-off')).toBe('オフにする ✓')
  await ui.unmount()
})
test('Windows：セッションは c:\…、git は C:/… と答えても、ワークツリーは元のプロジェクトの設定を読む', async ($, on) => {
  const win = (p: string) => p.replaceAll('/', String.fromCharCode(92))
  const ink = { theme: '灰', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const w = world(on, { 'project:C:/work/a': ink }, { root: win('c:/work/a/.claude/worktrees/x'), repo: 'C:/work/a', gitIsFile: true })
  await $.session.start({ ...start, cwd: win('c:/work/a/.claude/worktrees/x') })
  expect(labelOf(w.sets[0])).toBe('Rainy window JP 灰')
})

test('Windows：元のフォルダのセッションが区切りに逆スラッシュで答えても、git の C:/… と同じプロジェクトになる', async ($, on) => {
  const win = (p: string) => p.replaceAll('/', String.fromCharCode(92))
  const ink = { theme: '灰', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const w = world(on, { 'project:C:/work/a': ink }, { root: win('C:/work/a'), repo: 'C:/work/a', gitIsFile: false })
  await $.session.start({ ...start, cwd: win('C:/work/a') })
  expect(labelOf(w.sets[0])).toBe('Rainy window JP 灰')
  await $.command.run(rj('緑 p'))
  expect(w.store.get('project:C:/work/a')).toEqual({ theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system', clawd: { look: 'auto', effect: 'auto', dots: 'normal' } })
})

test('mod の実行環境でも、日本時間・時間帯・針の角度が正しい（Intl の Asia/Tokyo）', () => {
  const at = new Date('2026-11-15T01:10:30Z') // 日本 10:10:30
  expect(jstParts(at)).toEqual({ hour: 10, minute: 10, second: 30 })
  expect(bandOf(at)).toBe('昼')
  expect(bandOf(new Date('2026-11-15T10:00:00Z'))).toBe('夜') // 日本 19:00
  expect(bandOf(new Date('2026-11-14T20:00:00Z'))).toBe('朝') // 日本 5:00
  expect(clockAngles(new Date('2026-11-15T03:00:00Z'))).toEqual({ hourDeg: 0, minuteDeg: 0, secondDeg: 0 }) // 日本 12:00
})

test('部屋の絵：続けて描くよう頼まれても同じ絵を返し（雨を止めない）、時計は今の日本時間', async ($, on) => {
  world(on)
  await $.session.start(start)
  const target = { plugin: 'rainy-window-jp', surface: 'desktop', component: 'Backdrop', props: { plugin: 'rainy-window-jp', scene: 'rainy-window-jp' } } as const
  const first = await $.ui.mount(target as never)
  const a = (await first.find({ type: 'Svg' }))?.props.source as string | undefined
  await first.unmount()
  const second = await $.ui.mount(target as never)
  const b = (await second.find({ type: 'Svg' }))?.props.source as string | undefined
  await second.unmount()
  expect(typeof a).toBe('string')
  expect(b).toBe(a)
  const hour = Math.round(clockAngles(new Date()).hourDeg * 100) / 100
  // 短針の角度は12分ごとにしか変わらないので、テストの間に変わることはほぼない
  expect(String(a).includes(`<g transform="translate(-380 178) rotate(${hour})">`)).toBe(true)
})

test('言葉：返事に古い言葉（セッション・プロジェクト・場所）を使わない', async ($, on) => {
  const grape = { theme: '桜', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  world(on, { 'session:S1': grape })
  await $.session.start(start)
  const replies = [
    (await $.command.run(rj('緑'))).text ?? '',
    (await $.command.run(rj('緑 p'))).text ?? '',
    (await $.command.run(rj('reset p'))).text ?? '',
    (await $.command.run(rj('ほげ'))).text ?? '',
    (await $.command.run(rj('緑 緑'))).text ?? '',
  ]
  for (const text of replies) {
    for (const old of ['セッション', 'プロジェクト', '場所', 'テーマ']) expect(text.includes(old)).toBe(false)
  }
  // 狭い保存先が勝つときの返事
  expect(replies[0]).toContain('この会話では')
  expect(replies[0]).toContain('優先されている')
})

test('カード：状態の行は「保存してある設定」と「表示中」を分けて書く', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const status = async () => String((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text)
  expect(await status()).toContain('保存してある設定：紺・夜（標準）')
  expect((await status()).includes('いま：')).toBe(false)
  await ui.press({ key: 'rj-color-緑' })
  expect(await status()).toContain('表示中：緑・夜（まだ保存していません）')
  await ui.unmount()
})

test('カードを開いたまま /rj 緑 と打つと、カードも緑に合わせる（あとで保存しても打った設定を戻さない）', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'rj-color-桜' })
  await $.command.run(rj('緑'))
  const status = String((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text)
  expect(status).toContain('保存してある設定：緑・夜（すべての会話）')
  expect(status.includes('まだ保存していません')).toBe(false)
  expect((await ui.find({ key: 'rj-color-緑' }))?.props.label).toBe('🟩 緑 ✓')
  expect((await ui.find({ key: 'rj-color-桜' }))?.props.label).toBe('🌸 桜')
  await ui.press({ key: 'rj-save' })
  expect(w.store.get('global')).toEqual({ theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system', clawd: { look: 'auto', effect: 'auto', dots: 'normal' } })
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  await ui.unmount()
})

test('カードを開いたまま /rj reset と打っても、カードを新しい設定に合わせる', async ($, on) => {
  const green = { theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  world(on, { global: green })
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.command.run(rj('reset'))
  expect(String((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text)).toContain('紺・夜（標準）')
  expect((await ui.find({ key: 'rj-color-紺' }))?.props.label).toBe('🟦 紺 ✓')
  await ui.unmount()
})

test('カード：「保存先の設定を消す」は、選んだ保存先だけを消して、1つ広い設定に戻す', async ($, on) => {
  const green = { theme: '緑', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const pink = { theme: '桜', time: { kind: 'fixed', band: '夜' }, brightness: 'system' }
  const w = world(on, { global: green, 'project:C:/work/a': pink })
  await $.session.start(start)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 桜')
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  // 開いたときの保存先は、いま効いている保存先（このフォルダ）
  expect((await ui.find({ key: 'rj-scope-project' }))?.props.label).toBe('このフォルダ ✓')
  await ui.press({ key: 'rj-clear' })
  expect(w.store.get('project:C:/work/a')).toBe(undefined)
  expect(w.store.get('global')).toEqual(green)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  expect(String((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text)).toContain('緑・夜（すべての会話）')
  expect((await ui.find({ key: 'rj-color-緑' }))?.props.label).toBe('🟩 緑 ✓')
  // 保存先の選択はそのまま
  expect((await ui.find({ key: 'rj-scope-project' }))?.props.label).toBe('このフォルダ ✓')
  await ui.unmount()
})

const BACKDROP = { plugin: 'rainy-window-jp', surface: 'desktop', component: 'Backdrop', props: { plugin: 'rainy-window-jp', scene: 'rainy-window-jp' } } as const

test('Backdrop は1枚の Svg（部屋にクロードくんを入れた絵）を返す', async ($, on) => {
  world(on)
  await $.session.start(start)
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BACKDROP, surface } as never)
    const all = await ui.findAll({ type: 'Svg' })
    expect(all.length).toBe(1)
    expect(await ui.find({ type: 'Box' })).toBe(undefined)
    const source = String(all[0]?.props.source)
    expect(source.includes('translate(-520 -360)')).toBe(true)
    expect(source.includes('translate(276 205) scale(6)')).toBe(true)
    expect(source.includes('class="corner"')).toBe(false)
    expect(source.length <= 131072).toBe(true)
    await ui.unmount()
  }
})

test('/rj 試す・probe は、ほかの分からない語と同じく使い方を返す（確かめは外した）', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(start)
  const setsBefore = w.sets.length
  for (const word of ['試す', 'probe']) {
    const said = await $.command.run(rj(word))
    expect(said.text).toContain('分かりませんでした')
    expect(said.text).toContain('/rj <背景色>')
  }
  await clock.advance(6000)
  expect(w.sets.length).toBe(setsBefore)
  expect([...w.store.keys()]).toEqual([])
})

test('クロードくんの atom の書き込みは、最後の書き込みから 2 秒あける（まとめて1回）', async ($, on) => {
  world(on)
  let model = 'm0'
  on('session.model', () => ({ value: model }))
  const clock = mock.clock(on)
  const writes: { model?: string }[] = []
  on('state.set', (_, e, next) => {
    if ((e as { key?: string }).key === 'clawd') writes.push((e as { value: { value: { model?: string } } }).value.value)
    return next(e)
  })
  const seen = async () => writes.at(-1)?.model ?? ''
  await $.session.start(start)
  await clock.advance(1500) // m0 を最初に読む（変化ではないので書かない）
  expect(await seen()).toBe('')
  model = 'm1'
  await clock.advance(1500) // 変化 → すぐ書く
  expect(await seen()).toBe('m1')
  model = 'm2'
  await clock.advance(1500) // 前の書き込みから 1.5 秒：まだ書かない
  expect(await seen()).toBe('m1')
  await clock.advance(500) // 前の書き込みから 2 秒：書く
  expect(await seen()).toBe('m2')
  model = 'm3'
  await clock.advance(1500) // 前の書き込みから 1 秒：待たせる
  expect(await seen()).toBe('m2')
  await clock.advance(1000)
  expect(await seen()).toBe('m3')
  expect(writes.length).toBe(3)
})

test('Backdrop：クロードくんの atom が読めなくても、部屋は描く（1枚）', async ($, on) => {
  world(on)
  on('state.get', () => {
    throw new Error('read failed')
  })
  await $.session.start(start)
  const ui = await $.ui.mount(BACKDROP as never)
  const all = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  expect(all.length).toBe(1)
  expect(String(all[0]?.props.source).includes('rainNear')).toBe(true)
})

test('モデルの見張り：失敗しても会話に出さず、デバッグの記録に1回だけ書く', async ($, on) => {
  const { logs } = world(on)
  on('session.model', () => {
    throw new Error('no model')
  })
  const clock = mock.clock(on)
  await $.session.start(start)
  await clock.advance(6000)
  const watch = logs.filter(l => String(l.text).includes('model watch failed'))
  expect(watch.length).toBe(1)
  expect(watch.every(l => l.to === 'debug')).toBe(true)
  expect(logs.every(l => !String(l.text).includes('うまくいかなかった'))).toBe(true)
})

// ---- クロードくん：アプリのイベントをつなぐ（Task 8） ----
// atom の書き込みは、最後の書き込みから 2 秒あける（まとめて1回）。下の時刻はそれを数えに入れてある。

type ClawdSeen = { phase: string; model: string; effort: string; subagents: number; arrive: number[]; leave: number[]; at?: number }
type AgentRow = { id: string; status: string }

/** クロードくんの atom に書いた値を、書いた順に集める（いちばん後ろが今の様子）。clock があれば、書いた時刻も at に。 */
function clawdWrites(on: On, clock?: MockClock): ClawdSeen[] {
  const writes: ClawdSeen[] = []
  on('state.set', (_, e, next) => {
    const value = (e as { value: { value: ClawdSeen } }).value.value
    if ((e as { key?: string }).key === 'clawd') writes.push(clock === undefined ? value : { ...value, at: clock.now() })
    return next(e)
  })
  return writes
}

/** エンジンの代わり：turn の始まり・終わり、ツール、サブエージェントの起動と一覧（Error なら一覧が読めない）。 */
function engineTurns(on: On, agents: { list: AgentRow[] | Error } = { list: [] }): void {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('agent.spawn', () => ({ model: 'claude-sonnet-4-5', agentId: 'a-new' }))
  on('agent.list', () => {
    if (agents.list instanceof Error) throw agents.list
    return { value: agents.list.map(a => ({ description: 'しらべる', type: 'general-purpose', ...a })) } as never
  })
}

/** 下の turn.step：かけらを順に流して（pauses の番号の前では、時計でその分待つ）、最後に result を返す。 */
function bottomStep(on: On, chunks: readonly unknown[], result: unknown, pauses: ReadonlyMap<number, number> = new Map(), clock?: MockClock): void {
  on('turn.step', async function* () {
    for (const [i, chunk] of chunks.entries()) {
      const pause = pauses.get(i)
      if (pause !== undefined && clock !== undefined) await clock.sleep(pause)
      yield chunk as never
    }
    return result as never
  })
}

/** turn.step の流れを最後まで読む：上に届いたかけらと、最後に返った結果。 */
async function readStep<C, R>(stream: AsyncGenerator<C, R>) {
  const chunks: C[] = []
  for (;;) {
    const got = await stream.next()
    if (got.done === true) return { chunks, result: got.value }
    chunks.push(got.value)
  }
}

/** いまの Backdrop を描いてもらう：Svg の数と、その source。 */
async function backdropNow($: Engine, scene = 'rainy-window-jp'): Promise<{ count: number; source: string }> {
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'Backdrop', props: { plugin: 'rainy-window-jp', scene } } as never)
  const all = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  return { count: all.length, source: String(all[0]?.props.source) }
}

/** 層（部屋の SVG の中で translate(-520 -360) の後ろ）だけ。 */
const layerPart = (svg: string) => svg.slice(svg.indexOf('translate(-520 -360)'))

const MAIN = { text: 'やあ', turnId: 't1' } as never
const childStart = (agentId: string) => ({ text: '', turnId: `t-${agentId}`, agentId }) as never
const ended = (o: Record<string, unknown> = {}) => ({ answer: 'おわり', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer', ...o }) as never
const stepOf = (o: Record<string, unknown> = {}) => ({ turnId: 't1', index: 0, model: 'claude-sonnet-4-5', messageCount: 1, ...o }) as never
const SPAWN = {
  tool_use_id: 'tu-a',
  prompt: 'しらべて',
  description: 'しらべる',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-sonnet-4-5',
  background: true,
  fork: false,
} as never

// 考える → 書く → 道具（引数のかけら）→ 終わり。
const CHUNKS = [
  { kind: 'thinking', index: 0, text: 'ふむ' },
  { kind: 'thinking', index: 0, text: '……' },
  { kind: 'text', index: 1, text: 'こんにちは' },
  { kind: 'text', index: 1, text: '。' },
  { kind: 'tool', index: 2, id: 'tu1', name: 'Read' },
  { kind: 'input', index: 2, json: '{"file_path":' },
  { kind: 'input', index: 2, json: '"a.txt"}' },
  { kind: 'stop', stopReason: 'tool_use', usage: null },
]
const RESULT = { turnId: 't1', index: 0, answer: 'こんにちは。', toolUses: [{ name: 'Read', input: { file_path: 'a.txt' } }], stopReason: 'tool_use', usage: null }

test('送ると「！」、0.9秒で考え中（atom には、前の書き込みから2秒あけて書く）', async ($, on) => {
  world(on)
  const writes = clawdWrites(on)
  engineTurns(on)
  const clock = mock.clock(on)
  await $.session.start(start)
  await $.turn.start(MAIN)
  await clock.settle()
  expect(writes.at(-1)?.phase).toBe('alert')
  await clock.advance(900) // 機械は考え中に移る。書き込みは「！」から2秒まで待つ
  expect(writes.at(-1)?.phase).toBe('alert')
  await clock.advance(1099)
  expect(writes.at(-1)?.phase).toBe('alert')
  await clock.advance(1)
  expect(writes.at(-1)?.phase).toBe('think')
  expect(writes.map(w => w.phase)).toEqual(['alert', 'think'])
})

test('turn.step：かけらを1つも変えず順番どおりに上へ流し、最後の結果もそのまま（途中で 考え中 → 書く → 道具）', async ($, on) => {
  world(on)
  const writes = clawdWrites(on)
  engineTurns(on)
  const clock = mock.clock(on)
  // 書くのかけらは 2.5 秒、道具のかけらは 5 秒に来る
  bottomStep(on, CHUNKS, RESULT, new Map([[2, 2500], [4, 2500]]), clock)
  await $.session.start(start)
  await $.turn.start(MAIN)
  await clock.settle()
  const reading = readStep($.turn.step(stepOf()))
  await clock.settle()
  // 0.9：考え中（2 に書く）。2.5：書く（4 に書く）。5：道具（6 に書く）
  for (const ms of [900, 1100, 500, 1500, 1000, 1000, 1000]) await clock.advance(ms)
  const { chunks, result } = await reading
  expect(chunks).toEqual(CHUNKS)
  expect(result).toEqual(RESULT)
  expect(writes.map(w => w.phase)).toEqual(['alert', 'think', 'write', 'tool'])
})

for (const how of ['atom に書けない', '時計が無い'] as const) {
  test(`turn.step：見張りが失敗しても（${how}）、かけらと結果はそのまま届き、部屋は描ける`, async ($, on) => {
    const { logs } = world(on)
    engineTurns(on, { list: new Error('no list') })
    if (how === 'atom に書けない') {
      mock.clock(on)
      // 投げた例外ではテストの道具が下（本物の state）へ進むので、断る（deny）ことで書き込みを失敗させる
      on('state.set', (_, e, next) => ((e as { key?: string }).key === 'clawd' ? ({ deny: 'write failed' } as never) : next(e)))
    }
    // 下は待たずに流す。上で時計を進めなくても最後まで読める（見張りは時計で待たせない）
    bottomStep(on, CHUNKS, RESULT)
    await $.session.start(start)
    await $.turn.start(MAIN)
    const { chunks, result } = await readStep($.turn.step(stepOf({ effort: 'max', model: 'claude-opus-5-5' })))
    expect(chunks).toEqual(CHUNKS)
    expect(result).toEqual(RESULT)
    await $.turn.complete(ended())
    const drawn = await backdropNow($)
    expect(drawn.count).toBe(1)
    expect(drawn.source.includes('rainNear')).toBe(true)
    // クロードくんの失敗は、会話には出さない（デバッグの記録だけ）。失敗は本当に起きている
    expect(logs.every(l => l.to === 'debug' || !String(l.text).includes('うまくいかなかった'))).toBe(true)
    const failed = how === 'atom に書けない' ? /rainy-window-jp: clawd \w+ failed \(.*write failed.*\)/ : /rainy-window-jp: clawd \w+ failed/
    expect(logs.some(l => l.to === 'debug' && failed.test(String(l.text)))).toBe(true)
  })
}

test('サブエージェントの子（agentId 付き）の turn・ツールは状態を動かさず、メインのツールは「道具」', async ($, on) => {
  world(on)
  const writes = clawdWrites(on)
  engineTurns(on)
  const clock = mock.clock(on)
  bottomStep(on, CHUNKS, RESULT)
  await $.session.start(start)
  await $.turn.start(childStart('a1'))
  const child = await readStep($.turn.step(stepOf({ agentId: 'a1', effort: 'max', model: 'claude-opus-5-5' })))
  expect(child.chunks).toEqual(CHUNKS)
  expect(child.result).toEqual(RESULT)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' } as never)
  await $.turn.complete(ended({ agentId: 'a1', turnId: 't-a1' }))
  await clock.advance(5000)
  // 子のモデルや effort も覚えない
  expect(writes).toEqual([])
  await $.turn.start(MAIN) // 5：！ → 5.9：考え中（7 に書く）
  await clock.advance(4500)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await clock.settle()
  expect(writes.map(w => w.phase)).toEqual(['alert', 'think', 'tool'])
})

test('終わり：返事が終わると やった → 手をふる → 待つ。止めたらすぐ待つ（あとで時計が動かさない）', async ($, on) => {
  world(on)
  const writes = clawdWrites(on)
  engineTurns(on)
  const clock = mock.clock(on)
  await $.session.start(start)
  await $.turn.start(MAIN)
  await clock.advance(4000) // 0：！、0.9：考え中（2 に書く）
  await $.turn.complete(ended())
  await clock.settle()
  expect(writes.at(-1)?.phase).toBe('done')
  await clock.advance(2000) // 5.5：手をふる（6 に書く）
  expect(writes.at(-1)?.phase).toBe('wave')
  await clock.advance(2500) // 8.5：待つ
  expect(writes.at(-1)?.phase).toBe('wait')
  expect(writes.map(w => w.phase)).toEqual(['alert', 'think', 'done', 'wave', 'wait'])
  // 止めたとき
  await clock.advance(2000)
  await $.turn.start(MAIN)
  await clock.advance(4500)
  expect(writes.at(-1)?.phase).toBe('think')
  const count = writes.length
  await $.turn.complete(ended({ isAborted: true, reason: 'aborted' }))
  await clock.settle()
  expect(writes.at(-1)?.phase).toBe('wait')
  expect(writes.length).toBe(count + 1)
  await clock.advance(10000)
  expect(writes.length).toBe(count + 1)
})

test('サブエージェントの数：running と pending だけ数え（5人まで）、増えた場所に arrive、減った場所に leave', async ($, on) => {
  world(on)
  const writes = clawdWrites(on)
  const agents: { list: AgentRow[] | Error } = { list: [{ id: 'a1', status: 'running' }] }
  engineTurns(on, agents)
  const clock = mock.clock(on)
  await $.session.start(start)
  expect(writes.at(-1)).toMatchObject({ subagents: 1, arrive: [0], leave: [] })
  // agent.spawn のあとで数え直す
  agents.list = [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }]
  await clock.advance(2000)
  await $.agent.spawn(SPAWN)
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ subagents: 2, arrive: [1], leave: [] })
  // 子の turn.complete：終わった子（a2）は数えない
  agents.list = [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'completed' }]
  await clock.advance(2000)
  await $.turn.complete(ended({ agentId: 'a2', turnId: 't-a2' }))
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ subagents: 1, arrive: [], leave: [1] })
  // failed・killed・completed・idle・waiting は数えない（子の turn.start で数え直す）
  agents.list = ['failed', 'killed', 'completed', 'idle', 'waiting'].map((status, i) => ({ id: `b${i}`, status }))
  await clock.advance(2000)
  await $.turn.start(childStart('b9'))
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ subagents: 0, arrive: [], leave: [0] })
  // pending は数える
  agents.list = [{ id: 'c1', status: 'pending' }, { id: 'c2', status: 'failed' }]
  await clock.advance(2000)
  await $.turn.start(childStart('c1'))
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ subagents: 1, arrive: [0], leave: [] })
  // 7人でも 5人まで
  agents.list = Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, status: 'running' }))
  await clock.advance(2000)
  await $.turn.complete(ended({ agentId: 'zz', turnId: 't-zz' }))
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ subagents: 5, arrive: [1, 2, 3, 4], leave: [] })
  // 一覧が読めないときは、前の数のまま（書かない）
  agents.list = new Error('no list')
  const count = writes.length
  await clock.advance(2000)
  await $.turn.complete(ended({ agentId: 'd0', turnId: 't-d0' }))
  await clock.settle()
  expect(writes.length).toBe(count)
  // 子の出入りでは、状態は待つのまま
  expect(writes.every(w => w.phase === 'wait')).toBe(true)
})

test('サブエージェントの出入りのけむりは1回だけ：同じ絵は同じまま、部屋ごと描き直しても、次の書き込みでも出し直さない', async ($, on) => {
  world(on)
  const writes = clawdWrites(on)
  const agents: { list: AgentRow[] } = { list: [] }
  engineTurns(on, agents)
  let model = 'claude-sonnet-4-5'
  on('session.model', () => ({ value: model }))
  const clock = mock.clock(on)
  await $.session.start(start)
  agents.list = [{ id: 'a1', status: 'running' }]
  await $.agent.spawn(SPAWN)
  await clock.settle()
  const puffed = layerPart((await backdropNow($)).source)
  expect(puffed.includes('fill="freeze"')).toBe(true)
  // 同じ様子をもう一度描いても、同じ絵（けむりの途中で描き直さない）
  expect(layerPart((await backdropNow($)).source)).toBe(puffed)
  // 背景の色を変えて部屋ごと描き直しても、けむりは出し直さない（子はいる）
  await $.command.run(rj('緑 s'))
  const green = layerPart((await backdropNow($, 'rainy-window-jp-green-night')).source)
  expect(green.includes('fill="freeze"')).toBe(false)
  // 別の理由（モデルが変わった）の次の書き込みで、arrive は空になる
  model = 'claude-opus-5-5'
  await clock.advance(3000)
  expect(writes.at(-1)).toMatchObject({ model: 'claude-opus-5-5', subagents: 1, arrive: [], leave: [] })
  expect(layerPart((await backdropNow($, 'rainy-window-jp-green-night')).source).includes('fill="freeze"')).toBe(false)
})

test('モデルの見張り：アプリでモデルを変えると、送らなくても1.5秒で姿が変わる（テーマは付け直さない）', async ($, on) => {
  const w = world(on)
  let model = 'claude-sonnet-4-5'
  on('session.model', () => ({ value: model }))
  const clock = mock.clock(on)
  await $.session.start(start)
  expect((await backdropNow($)).source.includes('#3A3340')).toBe(false)
  const sets = w.sets.length
  model = 'claude-opus-5-5'
  await clock.advance(1500)
  expect((await backdropNow($)).source.includes('#3A3340')).toBe(true)
  expect(w.sets.length).toBe(sets)
})

test('会話の始めのモデルで、最初の絵から姿が決まる（Opus なら譜面台）', async ($, on) => {
  world(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  mock.clock(on)
  await $.session.start(start)
  expect((await backdropNow($)).source.includes('#3A3340')).toBe(true)
})

test('effort：turn.step の effort（max）とモデルを覚え、動いている間だけ層に max の演出（待つと消える）', async ($, on) => {
  world(on)
  const writes = clawdWrites(on)
  engineTurns(on)
  const clock = mock.clock(on)
  bottomStep(on, CHUNKS.slice(0, 4), { ...RESULT, toolUses: [], stopReason: 'end_turn' })
  await $.session.start(start)
  expect((await backdropNow($)).source.includes('#FF2D45')).toBe(false)
  await $.turn.start(MAIN)
  await readStep($.turn.step(stepOf({ effort: 'max', model: 'claude-opus-5-5' })))
  await clock.advance(2000) // 0.9：書く（2 に書く）
  expect(writes.at(-1)).toMatchObject({ phase: 'write', effort: 'max', model: 'claude-opus-5-5' })
  const busy = (await backdropNow($)).source
  expect(busy.includes('#FF2D45')).toBe(true)
  expect(busy.includes('#3A3340')).toBe(true)
  await clock.advance(2000)
  await $.turn.complete(ended())
  await clock.advance(4500)
  expect(writes.at(-1)).toMatchObject({ phase: 'wait', effort: 'max' })
  expect((await backdropNow($)).source.includes('#FF2D45')).toBe(false)
})

test('保存した演出（/rj 演出 max）：待っている間は出さず、カードを開いている間は見せる', async ($, on) => {
  world(on)
  const clock = mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj('演出 max'))
  await clock.settle()
  expect((await backdropNow($)).source.includes('#FF2D45')).toBe(false)
  await $.command.run(rj('')) // カードを開く
  expect((await backdropNow($)).source.includes('#FF2D45')).toBe(true)
  await $.command.run(rj('')) // 閉じる
  expect((await backdropNow($)).source.includes('#FF2D45')).toBe(false)
})

test('クロードくんが変わっても1枚の Svg のまま、テーマは付け直さず、部屋の絵は seamless のずれ（begin）だけが違う', async ($, on) => {
  const w = world(on)
  let model = 'claude-sonnet-4-5'
  on('session.model', () => ({ value: model }))
  const agents: { list: AgentRow[] } = { list: [] }
  engineTurns(on, agents)
  const clock = mock.clock(on)
  bottomStep(on, CHUNKS.slice(0, 4), { ...RESULT, toolUses: [], stopReason: 'end_turn' })
  await $.session.start(start)
  const sets = w.sets.length
  const drawings = [await backdropNow($)]
  await $.turn.start(MAIN) // ！
  await clock.settle()
  drawings.push(await backdropNow($))
  await readStep($.turn.step(stepOf({ effort: 'max' }))) // 書く・max
  await clock.advance(2000)
  drawings.push(await backdropNow($))
  model = 'claude-opus-5-5' // Opus
  await clock.advance(2000)
  drawings.push(await backdropNow($))
  agents.list = [{ id: 'a1', status: 'running' }] // 子
  await $.agent.spawn(SPAWN)
  await clock.advance(2000)
  drawings.push(await backdropNow($))
  await $.turn.complete(ended()) // やった → 手をふる → 待つ
  await clock.advance(10000)
  drawings.push(await backdropNow($))
  expect(w.sets.length).toBe(sets)
  expect(drawings.every(d => d.count === 1)).toBe(true)
  // クロードくんは毎回ちがう絵
  expect(new Set(drawings.map(d => layerPart(d.source))).size).toBe(drawings.length)
  // 部屋（層の前まで）は、SMIL の begin（seamless のずれ）と時計の針の向き（描いた時刻）を除けば同じ。ほかの rotate はそのまま比べる
  const room = (svg: string) =>
    svg
      .slice(0, svg.indexOf('translate(-520 -360)'))
      .replace(/ begin="[^"]*"/g, '')
      .replace(/translate\(-380 178\) rotate\(-?[\d.]+\)/g, 'translate(-380 178) rotate()')
  const first = room(drawings[0]?.source ?? '')
  expect(first.length > 1000).toBe(true)
  for (const d of drawings) expect(room(d.source)).toBe(first)
})

// ---- Fix round 1：「！」と「やった」は必ず1回描く、/clear・resume、読み直し、流れの閉じ方 ----

for (const ms of [1900, 200] as const) {
  test(`「やった」は必ず1回描く：前の書き込みの ${ms / 1000} 秒あとに終わっても、やった → 手をふる（2秒あと）→ 待つ`, async ($, on) => {
    world(on)
    const clock = mock.clock(on)
    const writes = clawdWrites(on, clock)
    engineTurns(on)
    await $.session.start(start)
    await $.turn.start(MAIN)
    await clock.advance(2000) // 0：！、0.9：考え中（2 に書く）
    expect(writes.map(w => w.phase)).toEqual(['alert', 'think'])
    await clock.advance(ms)
    await $.turn.complete(ended())
    await clock.advance(10000)
    const after = writes.slice(2)
    expect(after.map(w => w.phase)).toEqual(['done', 'wave', 'wait'])
    expect((after[1]?.at ?? 0) - (after[0]?.at ?? 0)).toBe(2000)
  })
}

test('「！」は必ず1回描く：手をふっている途中、書き込みのすぐあとに送っても、！ → 考え中（2秒あと）', async ($, on) => {
  world(on)
  const clock = mock.clock(on)
  const writes = clawdWrites(on, clock)
  engineTurns(on)
  await $.session.start(start)
  await $.turn.start(MAIN)
  await clock.advance(3900) // 0：！、2：考え中
  await $.turn.complete(ended()) // 3.9：やった（4 に書く）、5.4：手をふる（6 に書く）
  await clock.advance(2100)
  expect(writes.at(-1)?.phase).toBe('wave')
  await clock.advance(200)
  await $.turn.start(MAIN) // 6.2：！（8 に書く）、7.1：考え中（10 に書く）
  await clock.advance(6000)
  expect(writes.map(w => w.phase)).toEqual(['alert', 'think', 'done', 'wave', 'alert', 'think'])
  const tail = writes.slice(-2)
  expect((tail[1]?.at ?? 0) - (tail[0]?.at ?? 0)).toBe(2000)
})

for (const reason of ['clear', 'resume'] as const) {
  test(`session.end（${reason}）：同じ窓で続くので、待つに戻し、待っていたモデルの変化も落とさず、モデルの見張りも続ける`, async ($, on) => {
    world(on)
    const clock = mock.clock(on)
    const writes = clawdWrites(on, clock)
    engineTurns(on)
    on('session.end', (_, e) => ({ sessionId: e.sessionId }))
    let model = 'claude-sonnet-4-5'
    on('session.model', () => ({ value: model }))
    await $.session.start(start)
    await $.turn.start(MAIN)
    await clock.advance(2000) // 0：！、2：考え中
    expect(writes.at(-1)?.phase).toBe('think')
    model = 'claude-opus-5-5'
    await clock.advance(1000) // 3：見張りが Opus を見る（4 に書く）
    await $.session.end({ reason, sessionId: 'S1', resume: { id: 'S1' } } as never)
    await clock.advance(1000)
    expect(writes.at(-1)).toMatchObject({ phase: 'wait', model: 'claude-opus-5-5' })
    // 見張りは続いている
    model = 'claude-haiku-4-5'
    await clock.advance(2000)
    expect(writes.at(-1)).toMatchObject({ phase: 'wait', model: 'claude-haiku-4-5' })
    await clock.advance(10000)
    expect(writes.every(w => w.phase === 'alert' || w.phase === 'think' || w.phase === 'wait')).toBe(true)
  })
}

test('もう一度 session.start（読み直し）：待つに戻して、サブエージェントを数え直す', async ($, on) => {
  world(on)
  const clock = mock.clock(on)
  const writes = clawdWrites(on, clock)
  const agents: { list: AgentRow[] } = { list: [] }
  engineTurns(on, agents)
  await $.session.start(start)
  await $.turn.start(MAIN)
  await clock.advance(2000)
  expect(writes.at(-1)?.phase).toBe('think')
  agents.list = [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'pending' }]
  await $.session.start(start)
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ phase: 'wait', subagents: 2, arrive: [0, 1], leave: [] })
})

test('メインの返事が終わったときも数え直す（子の終わりのとき一覧が遅れていても、子が残らない）', async ($, on) => {
  world(on)
  const clock = mock.clock(on)
  const writes = clawdWrites(on, clock)
  const agents: { list: AgentRow[] } = { list: [{ id: 'a1', status: 'running' }] }
  engineTurns(on, agents)
  await $.session.start(start)
  expect(writes.at(-1)).toMatchObject({ subagents: 1 })
  await $.turn.start(MAIN)
  agents.list = [{ id: 'a1', status: 'completed' }]
  await clock.advance(4000)
  await $.turn.complete(ended())
  await clock.advance(10000)
  expect(writes.at(-1)).toMatchObject({ phase: 'wait', subagents: 0 })
  expect(writes.some(w => w.subagents === 0 && w.leave.length === 1 && w.leave[0] === 0)).toBe(true)
})

test('turn.step：上が途中でやめると（return）下の流れも閉じ、下が失敗するとその失敗がそのまま上に届く（前のかけらはそのまま）', async ($, on) => {
  world(on)
  engineTurns(on)
  mock.clock(on)
  let closed = 0
  let pulled = 0
  let broken = false
  on('turn.step', async function* () {
    try {
      pulled += 1
      yield CHUNKS[0] as never
      if (broken) throw new Error('下の流れが切れた')
      pulled += 1
      yield CHUNKS[2] as never
      pulled += 1
      yield CHUNKS[3] as never
      return RESULT as never
    } finally {
      closed += 1
    }
  })
  await $.session.start(start)
  await $.turn.start(MAIN)
  const stopped = $.turn.step(stepOf())
  expect((await stopped.next()).value).toEqual(CHUNKS[0])
  await stopped.return(undefined as never)
  expect(closed).toBe(1)
  // 1つずつ取り出す：上が1つ読んでやめたら、下からも1つしか取り出していない（先読みしない）
  expect(pulled).toBe(1)
  broken = true
  const failing = $.turn.step(stepOf({ index: 1 }))
  expect((await failing.next()).value).toEqual(CHUNKS[0])
  let error: unknown
  try {
    await failing.next()
  } catch (err) {
    error = err
  }
  // テストの道具は、途中で失敗した下のフックを外して、その下（道具の底）から続ける。mod は下から来た失敗をそのまま上へ渡す
  expect(String(error instanceof Error ? error.message : error)).toContain('no implementation for turn.step')
  expect(closed).toBe(2)
  // 失敗のあとは何も届かない
  expect((await failing.next()).done).toBe(true)
})

// ---- Task 9：カードの2つのタブ（🎨 背景・🐾 クロードくんの見た目）と、切りかわりのアニメーション ----

const TAB_ROOM = 'rj-tab-room'
const TAB_CLAWD = 'rj-tab-clawd'
const cardOn = (surface: 'desktop' | 'terminal' | 'mobile') => ({ plugin: 'rainy-window-jp', surface, component: 'AbovePrompt', props: BAND }) as const

/** カードの atom に書いた値を、書いた順に集める。 */
function cardWrites(on: On): Record<string, unknown>[] {
  const writes: Record<string, unknown>[] = []
  on('state.set', (_, e, next) => {
    if ((e as { key?: string }).key === 'card') writes.push((e as { value: { value: Record<string, unknown> } }).value.value)
    return next(e)
  })
  return writes
}

/** svg の中の、open で始まる <g> のまとまり（閉じる </g> まで）をすべて。 */
function groupsAt(svg: string, open: string): string[] {
  const out: string[] = []
  for (let at = svg.indexOf(open); at >= 0; at = svg.indexOf(open, at + 1)) {
    let depth = 0
    const tags = /<g[\s>]|<\/g>/g
    tags.lastIndex = at
    for (let m = tags.exec(svg); m !== null; m = tags.exec(svg)) {
      depth += m[0] === '</g>' ? -1 : 1
      if (depth === 0) {
        out.push(svg.slice(at, m.index + 4))
        break
      }
    }
  }
  return out
}

test('タブ（desktop）：開くと背景のタブ（上の吹き出しと下の帯は止まった絵）。見た目のタブを押すと、吹き出しと帯がばねで動き、小さな見本（今の様子）が出る。ほかのボタンでは動き直さない', async ($, on) => {
  world(on)
  const cards = cardWrites(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  const sources = async () => (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
  // 開いたときは背景のタブ：選んだタブのボタンは primary で、ラベルは ✓ で終わる（ほかのボタンと同じ）
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'room', tabFrom: 'room', tabMoving: false })
  expect((await ui.find({ key: TAB_ROOM }))?.props.label).toBe('🎨 背景 ✓')
  expect((await ui.find({ key: TAB_ROOM }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: TAB_CLAWD }))?.props.label).toBe('🐾 クロードくんの見た目')
  expect((await ui.find({ key: TAB_CLAWD }))?.props.variant).toBe(undefined)
  // 背景のタブ：タブのボタンの上の吹き出しと、下の帯の2つ。開いたときは動かない（止まった絵）。背景の行があり、見た目の行は無い
  expect(await sources()).toEqual([tabTipSvg('room', 'room', 600, false), tabStripSvg('room', 'room', 600, false)])
  expect((await sources()).some(s => s.includes('<animate'))).toBe(false)
  expect((await ui.findAll({ type: 'Svg' })).map(s => s.props.alt)).toEqual([TIP_TEXT.room, '選んでいるタブ：🎨 背景'])
  expect((await ui.find({ key: 'rj-color-緑' }))?.props.label).toBe('🟩 緑')
  expect(await ui.find({ key: 'rj-look-opus' })).toBe(undefined)
  await ui.press({ key: TAB_CLAWD })
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'clawd', tabFrom: 'room', tabMoving: true })
  expect((await ui.find({ key: TAB_CLAWD }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: TAB_CLAWD }))?.props.label).toBe('🐾 クロードくんの見た目 ✓')
  expect((await ui.find({ key: TAB_ROOM }))?.props.variant).toBe(undefined)
  expect((await ui.find({ key: TAB_ROOM }))?.props.label).toBe('🎨 背景')
  // 見た目のタブ：吹き出しと帯（背景 → 見た目へ、ばねで動く）と、小さな止まった絵（姿 5つ・演出 6つ）。大きな動く見本も、タブの名前の帯も無い
  const svgs = await sources()
  expect(svgs.length).toBe(13)
  expect(svgs[0]).toBe(tabTipSvg('room', 'clawd', 600, true))
  expect(svgs[1]).toBe(tabStripSvg('room', 'clawd', 600, true))
  expect(svgs[0]?.includes('<animate')).toBe(true)
  expect(svgs[1]?.includes('<animate')).toBe(true)
  expect((await ui.findAll({ type: 'Svg' }))[0]?.props.alt).toBe(TIP_TEXT.clawd)
  // 絵は、今のモデルの姿（自動＝Sonnet）・今の effort（分からない＝なし）・カードで選んでいるドット・今の部屋の色で描く
  const tiles = clawdTiles({ autoLook: 'sonnet', look: 'sonnet', autoLevel: 0, dots: 'normal', room: roomColors('紺', '夜') })
  expect(svgs.slice(2)).toEqual([...Object.values(tiles.looks), ...Object.values(tiles.effects)])
  // 背景の行は無く、見た目の行と、両方のタブで共通の保存先・ボタンがある
  expect(await ui.find({ key: 'rj-color-緑' })).toBe(undefined)
  expect(await ui.find({ key: 'rj-time-朝' })).toBe(undefined)
  for (const key of ['rj-look-auto', 'rj-look-sonnet', 'rj-look-haiku', 'rj-look-opus', 'rj-look-fable', 'rj-effect-auto', 'rj-effect-none', 'rj-effect-medium', 'rj-effect-high', 'rj-effect-xhigh', 'rj-effect-max', 'rj-dots-normal', 'rj-dots-fine', 'rj-scope-global', 'rj-scope-project', 'rj-scope-session', 'rj-save', 'rj-clear', 'rj-close']) {
    expect((await ui.find({ key }))?.props.label === undefined).toBe(false)
  }
  expect((await ui.find({ key: 'rj-look-sonnet' }))?.props.label).toBe('Sonnet')
  expect((await ui.find({ key: 'rj-effect-none' }))?.props.label).toBe('なし')
  expect((await ui.find({ key: 'rj-dots-normal' }))?.props.label).toBe('ふつう ✓')
  expect((await ui.find({ key: 'rj-dots-fine' }))?.props.label).toBe('細かい')
  // ほかのボタンを押しても、吹き出しと帯の source は同じ（動き直さない）。姿の絵もそのまま、演出の絵は押した姿になる
  await ui.press({ key: 'rj-look-opus' })
  await ui.press({ key: 'rj-scope-project' })
  const after = await sources()
  expect(after[0]).toBe(svgs[0])
  expect(after[1]).toBe(svgs[1])
  expect(after.slice(2, 7)).toEqual(svgs.slice(2, 7))
  expect(after.slice(7).every(s => s.includes('#3A3340'))).toBe(true)
  // 同じタブをもう一度押しても何も変えない
  const count = cards.length
  await ui.press({ key: TAB_CLAWD })
  expect(cards.length).toBe(count)
  expect((await sources())[0]).toBe(svgs[0])
  // 背景のタブに戻ると、吹き出しと帯は見た目 → 背景へ動く。選んだものはそのまま
  await ui.press({ key: TAB_ROOM })
  expect(cards.at(-1)).toMatchObject({ tab: 'room', tabFrom: 'clawd', tabMoving: true })
  expect(await sources()).toEqual([tabTipSvg('clawd', 'room', 600, true), tabStripSvg('clawd', 'room', 600, true)])
  expect((await ui.find({ key: 'rj-scope-project' }))?.props.label).toBe('このフォルダ ✓')
  await ui.press({ key: TAB_CLAWD })
  expect((await ui.find({ key: 'rj-look-opus' }))?.props.label).toBe('Opus ✓')
  await ui.unmount()
  // 閉じて開き直すと、また背景のタブから（動かない）
  await $.command.run(rj(''))
  await $.command.run(rj(''))
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'room', tabFrom: 'room', tabMoving: false })
})

test('タブの動き：押してから 1 秒だけ動く絵、そのあとは止まった絵（印はカードの atom）。1 秒のうちに切りかえ直すと、そこから動き直す（前の時計は取り消す）', async ($, on) => {
  world(on)
  const cards = cardWrites(on)
  const clock = mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  const strips = async () => (await ui.findAll({ type: 'Svg' })).slice(0, 2).map(s => String(s.props.source))
  const moving = (from: 'room' | 'clawd', to: 'room' | 'clawd') => [tabTipSvg(from, to, 600, true), tabStripSvg(from, to, 600, true)]
  const still = (to: 'room' | 'clawd') => [tabTipSvg(to, to, 600, false), tabStripSvg(to, to, 600, false)]
  // 開いたときは動かない
  expect(await strips()).toEqual(still('room'))
  await ui.press({ key: TAB_CLAWD })
  expect(await strips()).toEqual(moving('room', 'clawd'))
  await clock.advance(999)
  expect(await strips()).toEqual(moving('room', 'clawd'))
  await clock.advance(1)
  // 押してから 1 秒：印が消えて、止まった絵（見た目のタブの形）。カードの描き直しで、出だしの動きがくり返されない
  expect(cards.at(-1)).toMatchObject({ tab: 'clawd', tabFrom: 'room', tabMoving: false })
  expect(await strips()).toEqual(still('clawd'))
  expect((await strips()).some(s => s.includes('<animate'))).toBe(false)
  expect(tabTipSvg('room', 'clawd', 600, false)).toBe(still('clawd')[0])
  // ほかのボタンを押しても、止まったまま
  await ui.press({ key: 'rj-look-opus' })
  expect(await strips()).toEqual(still('clawd'))
  // 背景へ切りかえて、1 秒のうちに（0.6 秒で）見た目へ切りかえ直す：そこから動き直し、前の時計は取り消す
  const before = cards.length
  await ui.press({ key: TAB_ROOM })
  expect(await strips()).toEqual(moving('clawd', 'room'))
  await clock.advance(600)
  await ui.press({ key: TAB_CLAWD })
  expect(await strips()).toEqual(moving('room', 'clawd'))
  await clock.advance(600) // 背景を押してから 1.2 秒：その時計は取り消したので、まだ動く絵
  expect(await strips()).toEqual(moving('room', 'clawd'))
  await clock.advance(400) // 見た目を押し直してから 1 秒
  expect(await strips()).toEqual(still('clawd'))
  // 印を消す書き込みは1回だけ（取り消した時計は書かない）
  expect(cards.slice(before).map(c => c.tabMoving)).toEqual([true, true, false])
  await clock.advance(5000)
  expect(cards.slice(before).map(c => c.tabMoving)).toEqual([true, true, false])
  await ui.unmount()
})

test('タブの動き：session.end で時計を止める（/clear・resume では、すぐ止まった絵に戻す）。次の session.start でも印は消える', async ($, on) => {
  world(on)
  const cards = cardWrites(on)
  const clock = mock.clock(on)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  // 会話が終わる：時計は止める（あとで書かない）
  await ui.press({ key: TAB_CLAWD })
  expect(cards.at(-1)).toMatchObject({ tabMoving: true })
  await $.session.end({ reason: 'other', sessionId: 'S1' } as never)
  const ended = cards.length
  await clock.advance(2000)
  expect(cards.length).toBe(ended)
  // 次の session.start で、印は消える（止まった絵）
  await $.session.start(start)
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'clawd', tabMoving: false })
  expect((await ui.findAll({ type: 'Svg' })).slice(0, 2).map(s => String(s.props.source))).toEqual([tabTipSvg('clawd', 'clawd', 600, false), tabStripSvg('clawd', 'clawd', 600, false)])
  // /clear：同じ窓で続くので、時計を止めて、すぐ止まった絵に戻す
  await ui.press({ key: TAB_ROOM })
  expect(cards.at(-1)).toMatchObject({ tab: 'room', tabMoving: true })
  await $.session.end({ reason: 'clear', sessionId: 'S1', resume: { id: 'S1' } } as never)
  await clock.settle()
  expect(cards.at(-1)).toMatchObject({ tab: 'room', tabMoving: false })
  const cleared = cards.length
  await clock.advance(2000)
  expect(cards.length).toBe(cleared)
  await ui.unmount()
})

test('タブ（mobile）：吹き出し・帯は狭い横幅で、小さな絵はデスクトップと同じ大きさで描く', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('mobile'))
  await ui.press({ key: TAB_CLAWD })
  const svgs = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
  expect(svgs.length).toBe(13)
  expect(svgs[0]).toBe(tabTipSvg('room', 'clawd', 320, true))
  expect(svgs[1]).toBe(tabStripSvg('room', 'clawd', 320, true))
  expect(svgs.slice(2).every(s => s.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"'))).toBe(true)
  await ui.unmount()
})

test('タブ（terminal）：Svg は無く、選んだタブのボタンに ✓、下に ━ の線', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('terminal'))
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  expect((await ui.find({ key: TAB_ROOM }))?.props.label).toBe('🎨 背景 ✓')
  expect((await ui.find({ key: TAB_ROOM }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: TAB_CLAWD }))?.props.label).toBe('🐾 クロードくんの見た目')
  expect((await ui.find({ type: 'Text', text: /━/ }))?.text).toBe(tabRuleText('room'))
  await ui.press({ key: TAB_CLAWD })
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  expect((await ui.find({ key: TAB_CLAWD }))?.props.label).toBe('🐾 クロードくんの見た目 ✓')
  expect((await ui.find({ key: TAB_ROOM }))?.props.label).toBe('🎨 背景')
  expect((await ui.find({ type: 'Text', text: /━/ }))?.text).toBe(tabRuleText('clawd'))
  // 見た目の行はターミナルでも押せる
  await ui.press({ key: 'rj-look-opus' })
  expect((await ui.find({ key: 'rj-look-opus' }))?.props.label).toBe('Opus ✓')
  await ui.unmount()
})

test('見た目のタブ：姿・演出・ドットを押すと、保存せずにすぐ部屋のクロードくんが変わり（テーマは付け直さない）、「閉じる」で保存してある設定に戻る', async ($, on) => {
  const w = world(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  const sets = w.sets.length
  const layerNow = async () => layerPart((await backdropNow($)).source)
  expect((await layerNow()).includes('#3A3340')).toBe(false)
  await ui.press({ key: 'rj-look-opus' })
  expect((await ui.find({ key: 'rj-look-opus' }))?.props.label).toBe('Opus ✓')
  expect((await ui.find({ key: 'rj-look-auto' }))?.props.label).toBe('自動（いま Sonnet）')
  // 譜面台（Opus の姿）
  expect((await layerNow()).includes('#3A3340')).toBe(true)
  // 演出 max：待っている間でも、カードを開いている間は見せる
  expect((await layerNow()).includes('#FF2D45')).toBe(false)
  await ui.press({ key: 'rj-effect-max' })
  expect((await layerNow()).includes('#FF2D45')).toBe(true)
  // ドット 細かい：細かい点のマスク
  expect((await backdropNow($)).source.includes('id="fm0"')).toBe(false)
  await ui.press({ key: 'rj-dots-fine' })
  expect((await backdropNow($)).source.includes('id="fm0"')).toBe(true)
  // 保存はしない。テーマも付け直さない
  expect(w.sets.length).toBe(sets)
  expect([...w.store.keys()]).toEqual([])
  // 閉じる：保存してある設定（自動・自動・ふつう）に戻り、待っている間は演出が消える
  await ui.press({ key: 'rj-close' })
  const back = (await backdropNow($)).source
  expect(layerPart(back).includes('#3A3340')).toBe(false)
  expect(layerPart(back).includes('#FF2D45')).toBe(false)
  expect(back.includes('id="fm0"')).toBe(false)
  expect(w.sets.length).toBe(sets)
  expect([...w.store.keys()]).toEqual([])
  await ui.unmount()
})

test('保存：見た目のタブで演出 max、背景のタブで緑を選んで「保存して閉じる」→ 選んだ保存先に、背景とクロードくんをまとめて保存', async ($, on) => {
  const w = world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  await ui.press({ key: 'rj-effect-max' })
  await ui.press({ key: TAB_ROOM })
  await ui.press({ key: 'rj-color-緑' })
  await ui.press({ key: 'rj-save' })
  expect(w.store.get('global')).toEqual({ ...GREEN, clawd: { look: 'auto', effect: 'max', dots: 'normal' } })
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  expect(w.toasts.at(-1)).toContain('「緑・夜」')
  expect(w.toasts.at(-1)).toContain('演出 max')
  // 閉じたので、待っている間は演出を出さない（保存した max は動く間だけ）
  expect((await backdropNow($, 'rainy-window-jp-green-night')).source.includes('#FF2D45')).toBe(false)
  await ui.unmount()
  // 開き直すと、保存した max が選ばれていて、カードを開いている間は見せる
  await $.command.run(rj(''))
  const again = await $.ui.mount(cardOn('desktop'))
  await again.press({ key: TAB_CLAWD })
  expect((await again.find({ key: 'rj-effect-max' }))?.props.label).toBe('max ✓')
  expect((await backdropNow($, 'rainy-window-jp-green-night')).source.includes('#FF2D45')).toBe(true)
  await again.unmount()
})

test('保存：狭い保存先にも、カードで選んだクロードくんの設定を保存する（その場所に前からあった設定ではなく）', async ($, on) => {
  const w = world(on, { global: { ...GREEN, clawd: { look: 'opus', effect: 'max', dots: 'fine' } }, 'project:C:/work/a': { ...GREEN, clawd: { look: 'haiku', effect: 'none', dots: 'normal' } } })
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  // 開いたときは、いま効いている（このフォルダの）設定
  expect((await ui.find({ key: 'rj-look-haiku' }))?.props.label).toBe('Haiku ✓')
  await ui.press({ key: 'rj-look-fable' })
  await ui.press({ key: 'rj-dots-fine' })
  await ui.press({ key: 'rj-save' })
  expect(w.store.get('project:C:/work/a')).toEqual({ ...GREEN, clawd: { look: 'fable', effect: 'none', dots: 'fine' } })
  expect(w.store.get('global')).toEqual({ ...GREEN, clawd: { look: 'opus', effect: 'max', dots: 'fine' } })
  // カードを閉じたあとすぐの部屋の絵も、保存した姿（Fable の黒板）と細かいドット（前の Haiku・ふつうに戻らない）
  const saved = (await backdropNow($, 'rainy-window-jp-green-night')).source
  expect(layerPart(saved).includes('#2F4A3A')).toBe(true)
  expect(saved.includes('id="fm0"')).toBe(true)
  await ui.unmount()
})

test('自動の表示：姿の「自動」には今のモデルの姿、演出の「自動」には最後の effort（分からないときは「自動」だけ）', async ($, on) => {
  world(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  engineTurns(on)
  const clock = mock.clock(on)
  bottomStep(on, CHUNKS.slice(0, 4), { ...RESULT, toolUses: [], stopReason: 'end_turn' })
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  const label = async (key: string) => String((await ui.find({ key }))?.props.label)
  expect(await label('rj-look-auto')).toBe('自動（いま Opus） ✓')
  expect(await label('rj-effect-auto')).toBe('自動 ✓')
  await $.turn.start(MAIN)
  await readStep($.turn.step(stepOf({ effort: 'max', model: 'claude-opus-5-5' })))
  await clock.advance(2000)
  expect(await label('rj-effect-auto')).toBe('自動（いま max） ✓')
  // 姿を決めても、自動のボタンには今のモデルの姿が出たまま（✓ は決めた姿へ）
  await ui.press({ key: 'rj-look-fable' })
  expect(await label('rj-look-auto')).toBe('自動（いま Opus）')
  expect(await label('rj-look-fable')).toBe('Fable ✓')
  // 「自動＝…」の薄い行は無い（自動が今なにかは、ボタンの名前に書く）
  expect((await ui.findAll({ type: 'Text' })).some(t => String(t.text).startsWith('自動＝'))).toBe(false)
  await ui.unmount()
})

test('サブエージェントの子に演出は付かない：effort が max で動いている間も、子に赤い目（#E8102E）は無い', async ($, on) => {
  world(on)
  engineTurns(on, { list: [{ id: 'a1', status: 'running' }] })
  const clock = mock.clock(on)
  bottomStep(on, CHUNKS.slice(0, 4), { ...RESULT, toolUses: [], stopReason: 'end_turn' })
  await $.session.start(start)
  await $.turn.start(MAIN)
  await readStep($.turn.step(stepOf({ effort: 'max' })))
  await clock.advance(2000)
  const layer = layerPart((await backdropNow($)).source)
  // 本体は max の赤い目
  expect(layer.includes('#E8102E')).toBe(true)
  // 1人目の子（机の左 (-12, 9)）のまとまりには、赤い目が無い
  const kid = groupsAt(layer, '<g transform="translate(-12 9)">')
  expect(kid.length > 0).toBe(true)
  expect(kid.every(g => !g.includes('#E8102E'))).toBe(true)
})

// ---- 変更 8：見た目のタブは、小さな止まった絵の一覧（大きな動く見本と、そのポンは無くなった） ----

/** 見た目のタブの Svg のうち、小さな絵（吹き出し・帯のあと）の source。 */
async function tilesOf(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }): Promise<string[]> {
  return (await ui.findAll({ type: 'Svg' })).slice(2).map(s => String(s.props.source))
}

test('見た目のタブの絵は止まった絵：animate が無い。Claude の状態が変わってカードが描き直されても、姿の絵は同じ文字列（演出の「自動」だけが今の effort に）', async ($, on) => {
  world(on)
  engineTurns(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  const clock = mock.clock(on)
  bottomStep(on, CHUNKS.slice(0, 4), { ...RESULT, toolUses: [], stopReason: 'end_turn' })
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  const first = await tilesOf(ui)
  expect(first.length).toBe(11)
  expect(first.every(s => !s.includes('<animate') && !s.includes('<set'))).toBe(true)
  // 大きな見本（横 240・縦 150）は無い
  expect((await ui.findAll({ type: 'Svg' })).some(s => s.props.width === 240 || s.props.height === 150)).toBe(false)
  // 送った（！→ 考え中 → 書く）、effort は max：クロードくんの atom が変わり、カードが描き直される
  await $.turn.start(MAIN)
  await readStep($.turn.step(stepOf({ effort: 'max', model: 'claude-sonnet-4-5' })))
  await clock.advance(2000)
  const busy = await tilesOf(ui)
  expect(busy.slice(0, 5)).toEqual(first.slice(0, 5))
  expect(busy[5]).toBe(effectTileSvg('sonnet', 4, 'normal', roomColors('紺', '夜')))
  expect(busy[5]).not.toBe(first[5])
  expect(busy.slice(6)).toEqual(first.slice(6))
  // やった → 手をふる → 待つ：姿の絵は、ずっと同じ
  await $.turn.complete(ended())
  await clock.advance(10000)
  expect((await tilesOf(ui)).slice(0, 5)).toEqual(first.slice(0, 5))
  await ui.unmount()
})

test('見た目のタブ：絵の一つ一つの枠（Box）に key があり、11 枚ぜんぶ重ならない（描き直しで絵が作り直されない）', async ($, on) => {
  world(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  const keys = (await ui.findAll({ type: 'Box' })).map(b => String(b.props.key ?? '')).filter(k => k.startsWith('rj-tile-'))
  expect(keys.length).toBe(11)
  expect(new Set(keys).size).toBe(11)
  await ui.unmount()
})

test('見た目のタブ：絵の下にそのボタン。Opus を押すと演出の絵が Opus（譜面台）になり、部屋のクロードくんもすぐ譜面台に（テーマは付け直さない）。細かいドットは絵も細かい', async ($, on) => {
  const w = world(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  const room = roomColors('紺', '夜')
  const sets = w.sets.length
  const before = await tilesOf(ui)
  expect(before.slice(0, 5)).toEqual([lookTileSvg('sonnet', 'normal', room), ...(['sonnet', 'haiku', 'opus', 'fable'] as const).map(l => lookTileSvg(l, 'normal', room))])
  expect(before.slice(5).some(s => s.includes('#3A3340'))).toBe(false)
  // 絵の説明（alt）は、その絵のボタンと同じ名前
  const alts = (await ui.findAll({ type: 'Svg' })).slice(2).map(s => String(s.props.alt))
  expect(alts.slice(0, 5)).toEqual(['自動（いま Sonnet）', 'Sonnet', 'Haiku', 'Opus', 'Fable'].map(n => `クロードくんの絵：姿 ${n}`))
  expect(alts.slice(5)).toEqual(['自動', 'なし', 'medium', 'high', 'xhigh', 'max'].map(n => `クロードくんの絵：Sonnet・演出 ${n}`))
  // 1つずつ、縦の Box に「絵 → その絵のボタン」の順
  type Drawn = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }
  const columns = ((await ui.findAll({ type: 'Box' })) as Drawn[]).filter(b => b.props?.flexDirection === 'column' && b.children?.length === 2)
  const pairs = columns.map(b => b.children as Drawn[]).map(([a, b]) => [a?.type, `${b?.type}:${b?.key ?? b?.props?.key}`])
  const keys = ['auto', 'sonnet', 'haiku', 'opus', 'fable'].map(v => `rj-look-${v}`).concat(['auto', 'none', 'medium', 'high', 'xhigh', 'max'].map(v => `rj-effect-${v}`))
  expect(pairs).toEqual(keys.map(k => ['Svg', `Button:${k}`]))
  // 絵とボタンは重ねない（位置の基準の Box・重ねる Box は無い）。ボタンに hover も付けない
  const boxes = (await ui.findAll({ type: 'Box' })) as Drawn[]
  expect(boxes.some(b => b.props?.position !== undefined)).toBe(false)
  const buttons = (await ui.findAll({ type: 'Button' })) as { hover?: unknown; props?: Record<string, unknown> }[]
  expect(buttons.some(b => b.hover !== undefined || b.props?.hover !== undefined)).toBe(false)
  // ボタンは今までのまま（✓ は選んだもの）
  expect((await ui.find({ key: 'rj-look-auto' }))?.props.label).toBe('自動（いま Sonnet） ✓')
  expect((await ui.find({ key: 'rj-effect-auto' }))?.props.label).toBe('自動 ✓')
  await ui.press({ key: 'rj-look-opus' })
  const after = await tilesOf(ui)
  expect(after.slice(0, 5)).toEqual(before.slice(0, 5))
  expect(after.slice(5)).toEqual([0, 0, 1, 2, 3, 4].map(l => effectTileSvg('opus', l as 0 | 1 | 2 | 3 | 4, 'normal', room)))
  expect((await ui.find({ key: 'rj-look-opus' }))?.props.label).toBe('Opus ✓')
  expect(layerPart((await backdropNow($)).source).includes('#3A3340')).toBe(true)
  expect(w.sets.length).toBe(sets)
  // ドット 細かい：絵も細かいドット
  await ui.press({ key: 'rj-dots-fine' })
  const fine = await tilesOf(ui)
  expect(fine[0]).toBe(lookTileSvg('sonnet', 'fine', room))
  expect(fine.every(s => s.includes('id="fm0"') && !s.includes('id="c0"'))).toBe(true)
  expect(w.sets.length).toBe(sets)
  await ui.unmount()
})

test('カードの atom は card-5：前の版（card-4、タブの動きの印なし）で書かれた値は、閉じたカードとして読む', async ($, on) => {
  world(on)
  mock.clock(on)
  // 前の版が書いた値（card-4：開いたカード・見た目のタブ。動きの印は無い）が残っている。カードに1回書かれるまでは、それを読む
  const OLD = { shape: 'card-4', value: { isOpen: true, inBand: true, draft: null, nowLine: '', previewing: false, tab: 'clawd', tabFrom: 'room' } }
  let old = true
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value?: unknown; version: number } }
    return (old && (e as { key?: string }).key === 'card' ? { value: { ...real.value, value: OLD } } : real) as never
  })
  on('state.set', (_, e, next) => {
    if ((e as { key?: string }).key === 'card') old = false
    return next(e)
  })
  await $.session.start(start)
  const ui = await $.ui.mount(cardOn('desktop'))
  expect(await ui.find({ key: 'rj-close' })).toBe(undefined)
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  await ui.unmount()
  // /rj でいつもどおり開く（背景のタブから）
  await $.command.run(rj(''))
  const again = await $.ui.mount(cardOn('desktop'))
  expect((await again.find({ key: TAB_ROOM }))?.props.label).toBe('🎨 背景 ✓')
  expect((await again.findAll({ type: 'Svg' })).length).toBe(2)
  await again.unmount()
})

// ---- 最後のレビューの直し：カードの Svg が動く、子の数が戻らない ----

test('カードの Svg：吹き出し・帯・小さな絵のどれにも isInteractive は付けず（枠にするとスクロールが詰まる）、大きさを持つ。部屋の Svg は何も持たない', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const shape = (s: { props: Record<string, unknown> } | undefined) => [s?.props.isInteractive, s?.props.width, s?.props.height]
  for (const [surface, width] of [['desktop', 600], ['mobile', 320]] as const) {
    const ui = await $.ui.mount(cardOn(surface))
    // 背景のタブ：吹き出し（横 W・縦 46）と帯（横 W・縦 10）
    expect((await ui.findAll({ type: 'Svg' })).map(shape)).toEqual([[undefined, width, TIP_H], [undefined, width, 10]])
    // 見た目のタブ：それと、小さな絵 11 枚（姿 5・演出 6。横 80・縦 60、isInteractive なし）。動いている間も isInteractive は付けない
    await ui.press({ key: TAB_CLAWD })
    const tile = [undefined, TILE_W, TILE_H]
    expect([TILE_W, TILE_H]).toEqual([80, 60])
    expect((await ui.findAll({ type: 'Svg' })).map(shape)).toEqual([[undefined, width, TIP_H], [undefined, width, 10], ...Array.from({ length: 11 }, () => tile)])
    await ui.press({ key: TAB_ROOM })
    await ui.unmount()
  }
  // 部屋（Backdrop）の1枚は、今までどおり何も足さない（このままで動くと、本物のアプリで確かめてある）
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BACKDROP, surface } as never)
    const all = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    expect(all.length).toBe(1)
    expect(shape(all[0])).toEqual([undefined, undefined, undefined])
  }
})

test('サブエージェントの数：子の turn が終わったのに一覧がまだ running と言っても数えず、メインの終わりの数え直しでも戻らない。一覧がその子を落としたら、覚えを捨てる', async ($, on) => {
  world(on)
  const clock = mock.clock(on)
  const writes = clawdWrites(on, clock)
  const agents: { list: AgentRow[] } = { list: [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }] }
  engineTurns(on, agents)
  await $.session.start(start)
  expect(writes.at(-1)).toMatchObject({ subagents: 2 })
  // a2 の turn が終わった。一覧はまだ a2 を running と言う（遅れている）
  await clock.advance(2000)
  await $.turn.complete(ended({ agentId: 'a2', turnId: 't-a2' }))
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ subagents: 1, leave: [1] })
  const dropped = writes.length
  // メインの turn の始まりと終わり（終わりで数え直す）。一覧はまだ遅れている → 1 のまま
  await clock.advance(2000)
  await $.turn.start(MAIN)
  await clock.advance(4000)
  await $.turn.complete(ended())
  await clock.advance(10000)
  expect(writes.at(-1)).toMatchObject({ phase: 'wait', subagents: 1 })
  expect(writes.slice(dropped - 1).every(w => w.subagents === 1)).toBe(true)
  // 一覧がやっと a2 を落とした（completed）：数え直し（a1 の turn の始まり）で、a2 の覚えを捨てる。数は 1 のまま
  agents.list = [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'completed' }]
  const before = writes.length
  await $.turn.start(childStart('a1'))
  await clock.advance(2000)
  expect(writes.length).toBe(before)
  // 覚えを捨てたので、同じ a2 がまた動いていると一覧が言えば、数える
  agents.list = [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }]
  await $.agent.spawn(SPAWN)
  await clock.settle()
  expect(writes.at(-1)).toMatchObject({ subagents: 2, arrive: [1], leave: [] })
})
