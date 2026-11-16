// register.tsx を Claude Code 自身のテスト道具で動かす（claude plugin test）。
// ストアは偽物（mock.store）、テーマの設定（theme.set / theme.clear）は記録するだけ。

import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { CommandRunInput, On, PromptSubmitInput, ThemeSetArgs } from 'claude-code'

import { effectTileSvg } from '../hooks/clawd/tiles'
import { CLAWD_PICTURE_H, CLAWD_PICTURE_W, ROOM_TILE_H, ROOM_TILE_W } from '../hooks/register'
import { roomTileSvg } from '../hooks/room-tile'
import { roomColors } from '../hooks/lib/palette'
import { bandOf, clockAngles, jstParts } from '../hooks/lib/time'
import type { Band } from '../hooks/lib/time'

type World = { sets: ThemeSetArgs[]; clears: number; toasts: string[]; places: number; store: Map<string, unknown>; logs: { text: string; to?: string }[] }

function world(
  on: On,
  store: Record<string, unknown> = {},
  // hostId：デスクトップアプリが渡す会話の id。null は「無い」（ターミナルなど。Claude Code の会話の id を使う）。
  where: { root?: string; repo?: string | null; gitIsFile?: boolean; canPlace?: boolean; hostId?: string | null } = {},
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
  mock.env(on, where.hostId === null ? {} : { CLAUDE_CODE_HOST_SESSION_ID: where.hostId ?? 'S1' })
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
type Finder = { find: (q: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }
/** 選んでいるボタン（濃いボタン。デスクトップ・スマホでは ✓ は付けない）か。 */
const isPicked = async (ui: Finder, key: string) => (await ui.find({ key }))?.props.variant === 'primary'
/** 押すたびに切りかわるボタン（保存先・ドット）の、今の値。ラベルは「保存先：すべての会話 ▸」の形。 */
const SHOWN: Record<string, Record<string, string>> = {
  'rj-scope': { すべての会話: 'global', このフォルダ: 'project', この会話だけ: 'session' },
  'rj-dots': { ふつう: 'normal', 細かい: 'fine' },
}
const valueOf = async (ui: Finder, key: string) => {
  const label = String((await ui.find({ key }))?.props.label ?? '')
  const word = /：(.+) ▸$/.exec(label)?.[1] ?? ''
  return SHOWN[key]?.[word]
}
type Presser = Finder & { press: (q: { key: string }) => Promise<unknown> }
/** 切りかわるボタンを、その値になるまで押す（多くても3回）。 */
const pressUntil = async (ui: Presser, key: string, value: string) => {
  for (let i = 0; i < 3 && (await valueOf(ui, key)) !== value; i++) await ui.press({ key })
  expect(await valueOf(ui, key)).toBe(value)
}


test('何も保存していなければ、紺（元の rainy-window と同じ色と背景の名前）が付く', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  expect(w.sets.length).toBe(1)
  expect(labelOf(w.sets[0])).toBe('Rainy window')
  expect(w.sets[0]?.backdrop).toEqual({ scene: 'rainy-window-jp', glass: { blur: 0, opacity: 0.5 } })
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
  await pressUntil(ui, 'rj-scope', 'project')
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
    // 開け閉めでは文を返さない（デスクトップは、返した文を「ここでは使用できないコマンド」に置きかえて出すので）
    const answer = await $.command.run(rj(''))
    expect(answer.text).toBe(undefined)
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
    await pressUntil(ui, 'rj-scope', 'project')
    expect([...w.store.keys()]).toEqual([])
    await ui.press({ key: 'rj-save' })
    expect(w.store.get('project:C:/work/a')).toEqual({ theme: '緑', time: { kind: 'auto' }, brightness: 'system', clawd: { look: 'auto', effect: 'auto', dots: 'normal' } })
    expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
    // 閉じたカードは何も描かない
    expect(await ui.find({ type: 'Text', text: /保存してある設定：/ })).toBe(undefined)
    await ui.unmount()
  })
}

test('カード：押した項目が濃いボタンになる（デスクトップでは ✓ は付けない）', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ key: 'rj-color-紺' }))?.props.label).toBe('紺')
  expect(await isPicked(ui, 'rj-color-紺')).toBe(true)
  expect(await isPicked(ui, 'rj-time-夜')).toBe(true)
  await ui.press({ key: 'rj-color-灰' })
  expect(await isPicked(ui, 'rj-color-紺')).toBe(false)
  expect(await isPicked(ui, 'rj-color-灰')).toBe(true)
  // 時間帯は1つの行：自動を押すと、夜の印が自動へ移る
  await ui.press({ key: 'rj-time-自動' })
  // 自動のボタンには、いまの時間帯が出る（例：自動（いま夕方））
  expect(/^自動（いま(朝|昼|夕方|夜)）$/.test(String((await ui.find({ key: 'rj-time-自動' }))?.props.label))).toBe(true)
  expect(await isPicked(ui, 'rj-time-自動')).toBe(true)
  expect(await isPicked(ui, 'rj-time-夜')).toBe(false)
  // 明るさの行は無い
  expect(await ui.find({ key: 'rj-bright-dark' })).toBe(undefined)
  for (const key of ['rj-color-緑', 'rj-color-桜', 'rj-color-橙', 'rj-off', 'rj-time-朝', 'rj-time-昼', 'rj-time-夕方', 'rj-save', 'rj-clear', 'rj-close']) {
    expect((await ui.find({ key }))?.props.label === undefined).toBe(false)
  }
  // 保存先は選ぶ欄
  expect(await valueOf(ui, 'rj-scope')).toBe('global')
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
  await pressUntil(ui, 'rj-scope', 'session')
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
  expect(answer.text).toBe(undefined)
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

test('カード：色の名前（絵文字なし）・保存先は切りかわるボタン・背景を使わないは下の列・明るさの道順', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const label = async (key: string) => (await ui.find({ key }))?.props.label
  expect(await label('rj-color-緑')).toBe('緑')
  expect(await label('rj-color-桜')).toBe('桜')
  expect(await label('rj-color-橙')).toBe('橙')
  // 保存先は、押すたびに すべての会話 → このフォルダ → この会話だけ → すべての会話 と切りかわるボタン（まだ保存はしない）
  expect(await label('rj-scope')).toBe('保存先：すべての会話 ▸')
  await ui.press({ key: 'rj-scope' })
  expect(await label('rj-scope')).toBe('保存先：このフォルダ ▸')
  await ui.press({ key: 'rj-scope' })
  expect(await label('rj-scope')).toBe('保存先：この会話だけ ▸')
  await ui.press({ key: 'rj-scope' })
  expect(await label('rj-scope')).toBe('保存先：すべての会話 ▸')
  // 選ぶ欄（Select）は使わない（本物のアプリで、選ぶ欄の入ったカードが出なかったため）
  expect((await ui.findAll({ type: 'Select' })).length).toBe(0)
  expect(await label('rj-save')).toBe('保存して閉じる')
  expect(await label('rj-off')).toBe('背景を使わない')
  // オフは色の列には無い
  expect(await ui.find({ key: 'rj-color-オフ' })).toBe(undefined)
  // 部屋が昼か夜かは、アプリの設定で決まる：その道順
  expect((await ui.find({ type: 'Text', text: /「設定」→「外観」→「テーマ」/ }))?.text).toBe('「設定」→「外観」→「テーマ」')
  expect(String((await ui.find({ type: 'Text', text: /部屋が昼/ }))?.text)).toContain('Claude アプリの')
  await ui.press({ key: 'rj-off' })
  expect(await isPicked(ui, 'rj-off')).toBe(true)
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
  const hourAt = (d: Date) => Math.round(clockAngles(d).hourDeg * 100) / 100
  const hourBefore = hourAt(new Date())
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
  // 短針の角度は1分ごとに 0.5 度進む。絵を作る前とあとの時刻のどちらかと合えばよい（テストの間に分が変わっても落ちない）
  const hours = [hourBefore, hourAt(new Date())]
  expect(hours.some(hour => String(a).includes(`<g transform="translate(-380 178) rotate(${hour})">`))).toBe(true)
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

test('カード：状態の行は「保存してある設定」と、まだ保存していないことを書く', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const status = async () => String((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text)
  expect(await status()).toContain('保存してある設定：紺・夜（標準）')
  expect((await status()).includes('いま：')).toBe(false)
  await ui.press({ key: 'rj-color-緑' })
  expect(await status()).toContain('まだ保存していません')
  expect(await status()).toContain('保存してある設定：紺・夜（標準）')
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
  expect(await isPicked(ui, 'rj-color-緑')).toBe(true)
  expect(await isPicked(ui, 'rj-color-桜')).toBe(false)
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
  expect(await isPicked(ui, 'rj-color-紺')).toBe(true)
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
  expect(await valueOf(ui, 'rj-scope')).toBe('project')
  await ui.press({ key: 'rj-clear' })
  expect(w.store.get('project:C:/work/a')).toBe(undefined)
  expect(w.store.get('global')).toEqual(green)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  expect(String((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text)).toContain('緑・夜（すべての会話）')
  expect(await isPicked(ui, 'rj-color-緑')).toBe(true)
  // 保存先の選択はそのまま
  expect(await valueOf(ui, 'rj-scope')).toBe('project')
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
  // 投げた例外ではテストの道具が下（本物の state）へ進んで読めてしまうので、断る（deny）ことで読み込みを失敗させる
  on('state.get', () => ({ deny: 'read failed' }) as never)
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

// ---- カードの2つのタブ（背景・クロードくん）。背景のタブは部屋の絵の下にボタン、クロードくんのタブは左に大きな絵1枚 ----

const TAB_ROOM = 'rj-tab-room'
const TAB_CLAWD = 'rj-tab-clawd'
/** 背景のタブの部屋の絵（5色。時間帯は、いま選んでいるもの）。 */
const roomTiles = (band: Band) => (['紺', '緑', '桜', '橙', '灰'] as const).map(c => roomTileSvg(roomColors(c, band), ROOM_TILE_W, ROOM_TILE_H))
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

test('タブ（desktop）：タブはボタンだけ。背景のタブは部屋の絵5枚、クロードくんのタブは、いま選んでいる姿と演出の大きな絵1枚', async ($, on) => {
  world(on)
  const cards = cardWrites(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  const sources = async () => (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
  // 開いたときは背景のタブ：選んだタブのボタンは濃いボタン（✓ は付けない）。動きの印は持たない
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'room' })
  expect(Object.keys(cards.at(-1) ?? {}).some(k => k === 'tabFrom' || k === 'tabMoving')).toBe(false)
  expect((await ui.find({ key: TAB_ROOM }))?.props.label).toBe('背景')
  expect(await isPicked(ui, TAB_ROOM)).toBe(true)
  expect((await ui.find({ key: TAB_CLAWD }))?.props.label).toBe('クロードくん')
  expect(await isPicked(ui, TAB_CLAWD)).toBe(false)
  // 背景のタブ：部屋の絵が5枚（暗い画面と明るい画面を1枚に。時間帯は、いま選んでいる夜）。クロードくんの行は無い
  expect(await sources()).toEqual(roomTiles('夜'))
  expect((await sources()).every(s => !s.includes('<animate'))).toBe(true)
  expect((await ui.find({ key: 'rj-color-緑' }))?.props.label).toBe('緑')
  expect(await ui.find({ key: 'rj-look-opus' })).toBe(undefined)
  await ui.press({ key: TAB_CLAWD })
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'clawd' })
  expect(await isPicked(ui, TAB_CLAWD)).toBe(true)
  expect(await isPicked(ui, TAB_ROOM)).toBe(false)
  // クロードくんのタブ：大きな絵1枚。今のモデルの姿（自動＝Sonnet）が書いているところ、今の effort（分からない＝演出なし）
  expect(await sources()).toEqual([effectTileSvg('sonnet', 0, 'normal', roomColors('紺', '夜'))])
  // 背景の行は無く、クロードくんの行と、両方のタブで共通の下の行がある
  expect(await ui.find({ key: 'rj-color-緑' })).toBe(undefined)
  expect(await ui.find({ key: 'rj-time-朝' })).toBe(undefined)
  for (const key of ['rj-look-auto', 'rj-look-sonnet', 'rj-look-haiku', 'rj-look-opus', 'rj-look-fable', 'rj-effect-auto', 'rj-effect-low', 'rj-effect-medium', 'rj-effect-high', 'rj-effect-xhigh', 'rj-effect-max', 'rj-save', 'rj-clear', 'rj-close']) {
    expect((await ui.find({ key }))?.props.label === undefined).toBe(false)
  }
  expect((await ui.find({ key: 'rj-look-sonnet' }))?.props.label).toBe('Sonnet')
  expect((await ui.find({ key: 'rj-effect-low' }))?.props.label).toBe('low')
  expect(String((await ui.find({ type: 'Text', text: /low は/ }))?.text)).toContain('演出は出ません')
  // ドットと保存先は、押すたびに切りかわるボタン
  expect((await ui.find({ key: 'rj-dots' }))?.props.label).toBe('ドット：ふつう ▸')
  expect(await valueOf(ui, 'rj-dots')).toBe('normal')
  expect(await valueOf(ui, 'rj-scope')).toBe('global')
  // 姿を押すと、大きな絵がその姿（Opus の譜面台）になる
  await ui.press({ key: 'rj-look-opus' })
  await pressUntil(ui, 'rj-scope', 'project')
  expect(await sources()).toEqual([effectTileSvg('opus', 0, 'normal', roomColors('紺', '夜'))])
  // 同じタブをもう一度押しても何も変えない
  const count = cards.length
  await ui.press({ key: TAB_CLAWD })
  expect(cards.length).toBe(count)
  // 背景のタブに戻ると、また部屋の絵5枚。選んだものはそのまま
  await ui.press({ key: TAB_ROOM })
  expect(cards.at(-1)).toMatchObject({ tab: 'room' })
  expect(await sources()).toEqual(roomTiles('夜'))
  expect(await valueOf(ui, 'rj-scope')).toBe('project')
  await ui.press({ key: TAB_CLAWD })
  expect(await isPicked(ui, 'rj-look-opus')).toBe(true)
  await ui.unmount()
  // 閉じて開き直すと、また背景のタブから
  await $.command.run(rj(''))
  await $.command.run(rj(''))
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'room' })
})

test('タブ：タブを押しても時計は使わず、あとからカードに書かない（約1秒後に止まった絵へ戻す動きは無い）', async ($, on) => {
  world(on)
  const cards = cardWrites(on)
  const clock = mock.clock(on)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  await ui.press({ key: TAB_CLAWD })
  const pressed = cards.length
  await clock.advance(5000)
  expect(cards.length).toBe(pressed)
  // /clear で続いても、タブのためにカードへ書かない
  await $.session.end({ reason: 'clear', sessionId: 'S1', resume: { id: 'S1' } } as never)
  await clock.settle()
  await clock.advance(2000)
  expect(cards.length).toBe(pressed)
  expect(cards.at(-1)).toMatchObject({ isOpen: true, tab: 'clawd' })
  await ui.unmount()
})

test('タブ（mobile）：絵はデスクトップと同じ大きさで描く', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('mobile'))
  expect((await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))).toEqual(roomTiles('夜'))
  await ui.press({ key: TAB_CLAWD })
  const svgs = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
  expect(svgs.length).toBe(1)
  expect(svgs[0]).toBe(effectTileSvg('sonnet', 0, 'normal', roomColors('紺', '夜')))
  await ui.unmount()
})

test('タブ（terminal）：Svg は無く、選んだボタンは濃いボタンに ✓ も付ける（下の線の文字は無い）', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('terminal'))
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  expect((await ui.find({ key: TAB_ROOM }))?.props.label).toBe('背景 ✓')
  expect(await isPicked(ui, TAB_ROOM)).toBe(true)
  expect((await ui.find({ key: TAB_CLAWD }))?.props.label).toBe('クロードくん')
  expect((await ui.find({ key: 'rj-color-紺' }))?.props.label).toBe('紺 ✓')
  expect(await ui.find({ type: 'Text', text: /[━─]/ })).toBe(undefined)
  await ui.press({ key: TAB_CLAWD })
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  expect((await ui.find({ key: TAB_CLAWD }))?.props.label).toBe('クロードくん ✓')
  expect((await ui.find({ key: TAB_ROOM }))?.props.label).toBe('背景')
  expect(await ui.find({ type: 'Text', text: /[━─]/ })).toBe(undefined)
  // クロードくんの行はターミナルでも押せる
  await ui.press({ key: 'rj-look-opus' })
  expect((await ui.find({ key: 'rj-look-opus' }))?.props.label).toBe('Opus ✓')
  await ui.unmount()
})

test('クロードくんのタブ：姿・演出・ドットを押すと、保存せずにすぐ部屋のクロードくんが変わり（テーマは付け直さない）、「閉じる」で保存してある設定に戻る', async ($, on) => {
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
  expect(await isPicked(ui, 'rj-look-opus')).toBe(true)
  expect((await ui.find({ key: 'rj-look-auto' }))?.props.label).toBe('自動（いま Sonnet）')
  // 譜面台（Opus の姿）
  expect((await layerNow()).includes('#3A3340')).toBe(true)
  // 演出 max：待っている間でも、カードを開いている間は見せる
  expect((await layerNow()).includes('#FF2D45')).toBe(false)
  await ui.press({ key: 'rj-effect-max' })
  expect((await layerNow()).includes('#FF2D45')).toBe(true)
  // ドット 細かい：細かい点のマスク
  expect((await backdropNow($)).source.includes('id="fm0"')).toBe(false)
  await pressUntil(ui, 'rj-dots', 'fine')
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

test('保存：クロードくんのタブで演出 max、背景のタブで緑を選んで「保存して閉じる」→ 選んだ保存先に、背景とクロードくんをまとめて保存', async ($, on) => {
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
  expect(await isPicked(again, 'rj-effect-max')).toBe(true)
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
  expect(await isPicked(ui, 'rj-look-haiku')).toBe(true)
  await ui.press({ key: 'rj-look-fable' })
  await pressUntil(ui, 'rj-dots', 'fine')
  await ui.press({ key: 'rj-save' })
  // 前の版の「なし」（none）で保存されていた演出は、low として保存し直す
  expect(w.store.get('project:C:/work/a')).toEqual({ ...GREEN, clawd: { look: 'fable', effect: 'low', dots: 'fine' } })
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
  expect(await label('rj-look-auto')).toBe('自動（いま Opus）')
  expect(await isPicked(ui, 'rj-look-auto')).toBe(true)
  expect(await label('rj-effect-auto')).toBe('自動')
  await $.turn.start(MAIN)
  await readStep($.turn.step(stepOf({ effort: 'max', model: 'claude-opus-5-5' })))
  await clock.advance(2000)
  expect(await label('rj-effect-auto')).toBe('自動（いま max）')
  // 姿を決めても、自動のボタンには今のモデルの姿が出たまま（濃いボタンは決めた姿へ）
  await ui.press({ key: 'rj-look-fable' })
  expect(await label('rj-look-auto')).toBe('自動（いま Opus）')
  expect(await isPicked(ui, 'rj-look-fable')).toBe(true)
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

// ---- 変更 8 のあと：カードの絵は止まった絵（動く見本と、そのポンは無くなった）。今は背景のタブに部屋の絵5枚、クロードくんのタブに大きな絵1枚 ----

/** 見た目のタブの Svg（小さな絵だけ）の source。 */
async function tilesOf(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }): Promise<string[]> {
  return (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
}

test('クロードくんのタブの絵は止まった絵：animate が無い。演出が「自動」なら、Claude の effort が分かったとき、その演出の絵になる', async ($, on) => {
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
  expect(first).toEqual([effectTileSvg('sonnet', 0, 'normal', roomColors('紺', '夜'))])
  expect(first.every(s => !s.includes('<animate') && !s.includes('<set'))).toBe(true)
  // 送った（！→ 考え中 → 書く）、effort は max：クロードくんの atom が変わり、カードが描き直される
  await $.turn.start(MAIN)
  await readStep($.turn.step(stepOf({ effort: 'max', model: 'claude-sonnet-4-5' })))
  await clock.advance(2000)
  expect(await tilesOf(ui)).toEqual([effectTileSvg('sonnet', 4, 'normal', roomColors('紺', '夜'))])
  await ui.unmount()
})

test('カードの絵の枠（Box）に key がある（描き直しで絵が作り直されない）：部屋の絵5枚は重ならない key、クロードくんの絵は rj-picture', async ($, on) => {
  world(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  const keys = async () => (await ui.findAll({ type: 'Box' })).map(b => String(b.props.key ?? '')).filter(k => k.startsWith('rj-tile-') || k === 'rj-picture')
  expect(await keys()).toEqual(['紺', '緑', '桜', '橙', '灰'].map(c => `rj-tile-color-${c}`))
  await ui.press({ key: TAB_CLAWD })
  expect(await keys()).toEqual(['rj-picture'])
  await ui.unmount()
})

test('背景のタブ：部屋の絵の下にそのボタン。時間帯を変えると絵もその時間帯に。クロードくんのタブ：Opus を押すと大きな絵が譜面台になり、部屋のクロードくんもすぐ譜面台に（テーマは付け直さない）。細かいドットは絵も細かい', async ($, on) => {
  const w = world(on)
  on('session.model', () => ({ value: 'claude-sonnet-4-5' }))
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  const room = roomColors('紺', '夜')
  // 1つずつ、縦の Box に「絵 → その絵のボタン」の順。絵の説明（alt）に、色と、左上・右下の意味
  type Drawn = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }
  const columns = ((await ui.findAll({ type: 'Box' })) as Drawn[]).filter(b => b.props?.flexDirection === 'column' && b.children?.length === 2 && (b.children[0] as Drawn)?.type === 'Svg')
  const pairs = columns.map(b => b.children as Drawn[]).map(([a, b]) => [a?.type, `${b?.type}:${b?.key ?? b?.props?.key}`])
  expect(pairs).toEqual(['紺', '緑', '桜', '橙', '灰'].map(c => ['Svg', `Button:rj-color-${c}`]))
  const alts = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts).toEqual(['紺', '緑', '桜', '橙', '灰'].map(c => `部屋の絵：${c}（左上は暗い画面、右下は明るい画面）`))
  // 絵とボタンは重ねない（位置の基準の Box・重ねる Box は無い）。ボタンに hover も付けない
  const boxes = (await ui.findAll({ type: 'Box' })) as Drawn[]
  expect(boxes.some(b => b.props?.position !== undefined)).toBe(false)
  const buttons = (await ui.findAll({ type: 'Button' })) as { hover?: unknown; props?: Record<string, unknown> }[]
  expect(buttons.some(b => b.hover !== undefined || b.props?.hover !== undefined)).toBe(false)
  // 時間帯を朝にすると、部屋の絵も朝の部屋（テーマは付け直す：見た目が変わるので）
  await ui.press({ key: 'rj-time-朝' })
  expect((await tilesOf(ui))).toEqual(roomTiles('朝'))
  await ui.press({ key: 'rj-time-夜' })
  // クロードくんのタブ
  await ui.press({ key: TAB_CLAWD })
  const sets = w.sets.length
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toBe('クロードくんの絵：Sonnet・演出 なし')
  await ui.press({ key: 'rj-look-opus' })
  expect(await tilesOf(ui)).toEqual([effectTileSvg('opus', 0, 'normal', room)])
  expect(await isPicked(ui, 'rj-look-opus')).toBe(true)
  expect(layerPart((await backdropNow($)).source).includes('#3A3340')).toBe(true)
  await ui.press({ key: 'rj-effect-max' })
  expect(await tilesOf(ui)).toEqual([effectTileSvg('opus', 4, 'normal', room)])
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toBe('クロードくんの絵：Opus・演出 max')
  expect(w.sets.length).toBe(sets)
  // ドット 細かい：絵も細かいドット
  await pressUntil(ui, 'rj-dots', 'fine')
  const fine = await tilesOf(ui)
  expect(fine).toEqual([effectTileSvg('opus', 4, 'fine', room)])
  expect(fine.every(s => s.includes('id="fm0"') && !s.includes('id="c0"'))).toBe(true)
  expect(w.sets.length).toBe(sets)
  await ui.unmount()
})

test('カードの atom は card-6：前の版（card-5、タブの動きの印 tabFrom・tabMoving あり）で書かれた値は、閉じたカードとして読む（壊れない）', async ($, on) => {
  world(on)
  mock.clock(on)
  // 前の版が書いた値（card-5：開いたカード・見た目のタブ・動いている印つき）が残っている。カードに1回書かれるまでは、それを読む
  const OLD = { shape: 'card-5', value: { isOpen: true, inBand: true, draft: null, nowLine: '', previewing: false, tab: 'clawd', tabFrom: 'room', tabMoving: true } }
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
  expect(await isPicked(again, TAB_ROOM)).toBe(true)
  expect((await again.findAll({ type: 'Svg' })).length).toBe(5)
  await again.unmount()
})

// ---- 最後のレビューの直し：カードの Svg（動く枠にするのは、あとでやめた）、子の数が戻らない ----

test('カードの Svg：絵には isInteractive は付けず（枠にするとスクロールが詰まる）、大きさを持つ。部屋の Svg は何も持たない', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const shape = (s: { props: Record<string, unknown> } | undefined) => [s?.props.isInteractive, s?.props.width, s?.props.height]
  expect([ROOM_TILE_W, ROOM_TILE_H, CLAWD_PICTURE_W, CLAWD_PICTURE_H]).toEqual([104, 65, 200, 150])
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount(cardOn(surface))
    // 背景のタブ：部屋の絵5枚（横 104・縦 65）
    expect((await ui.findAll({ type: 'Svg' })).map(shape)).toEqual(Array.from({ length: 5 }, () => [undefined, ROOM_TILE_W, ROOM_TILE_H]))
    // クロードくんのタブ：大きな絵1枚（横 200・縦 150）
    await ui.press({ key: TAB_CLAWD })
    expect((await ui.findAll({ type: 'Svg' })).map(shape)).toEqual([[undefined, CLAWD_PICTURE_W, CLAWD_PICTURE_H]])
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

// ---- カードの見た目（行の揃い・折り返し・行の間・明るさの道順） ----

type Drawn = string | { type: string; props?: Record<string, unknown>; children?: Drawn[] }
const textOf = (n: Drawn): string => (typeof n === 'string' ? n : (n.children ?? []).map(textOf).join(''))
/** 見出しの文字（全角の空白は除く）で、見出しとボタンの行（横並びの Box）を探す。 */
function rowWithHead(n: Drawn, head: string): Exclude<Drawn, string> | undefined {
  if (typeof n === 'string') return undefined
  const first = n.children?.[0]
  if (n.type === 'Box' && n.props?.flexDirection === 'row' && first !== undefined && typeof first !== 'string') {
    const t = first.type === 'Text' ? first : first.type === 'Box' && first.children?.length === 1 ? first.children[0] : undefined
    if (t !== undefined && typeof t !== 'string' && t.type === 'Text' && textOf(t).replace(/　/g, '').trim() === head) return n
  }
  for (const c of n.children ?? []) {
    const found = rowWithHead(c, head)
    if (found !== undefined) return found
  }
  return undefined
}
/** 木の中で、key のボタンを持つ横並びの Box（ボタンの親）。 */
function parentOf(n: Drawn, key: string): Exclude<Drawn, string> | undefined {
  if (typeof n === 'string') return undefined
  if ((n.children ?? []).some(c => typeof c !== 'string' && c.props?.key === key)) return n
  for (const c of n.children ?? []) {
    const found = parentOf(c, key)
    if (found !== undefined) return found
  }
  return undefined
}

for (const surface of ['desktop', 'mobile', 'terminal'] as const) {
  test(`カード（${surface}）：見出しとボタンの行は、見出しを縮めず、ボタンの真ん中に揃え、ボタンは狭い画面で見出しの右に折り返す。下の行（保存先・保存して閉じる…）も折り返す`, async ($, on) => {
    world(on)
    await $.session.start(start)
    await $.command.run(rj(''))
    const ui = await $.ui.mount(cardOn(surface))
    const check = (tree: Drawn, head: string, firstKey: string, inner = false) => {
      const row = rowWithHead(tree, head)
      expect(row === undefined ? `${head} の行が無い` : 'ok').toBe('ok')
      if (row === undefined) return
      expect(`${head}:${String(row.props?.alignItems)}`).toBe(`${head}:center`)
      const [headBox, right] = row.children ?? []
      // 背景色の絵の組は、縦の箱（上に絵の組の並び、下に昼か夜かの道順）の上の段
      const buttons = inner && typeof right !== 'string' && right?.props?.flexDirection === 'column' ? right.children?.[0] : right
      // 見出しは縮まない箱の中（狭い画面で「背景／色」のように折れない）
      expect(typeof headBox !== 'string' && headBox?.type === 'Box' && headBox.props?.flexShrink === 0).toBe(true)
      // ボタン（絵の下にボタンのときは、絵とボタンの組）は、折り返す箱にまとめる（折り返しても見出しの下にもぐらない）
      expect(typeof buttons !== 'string' && buttons?.type === 'Box' && buttons.props?.flexWrap === 'wrap').toBe(true)
      const parent = parentOf(tree, firstKey)
      expect(inner ? parent !== undefined && typeof buttons !== 'string' && (buttons?.children ?? []).includes(parent) : parent === buttons).toBe(true)
    }
    let tree = (await ui.drawn()) as Drawn
    // 背景色の行：デスクトップ・スマホは、絵とボタンの組が折り返す（ボタンは組の中）
    check(tree, '背景色', 'rj-color-紺', surface !== 'terminal')
    check(tree, '時間帯', 'rj-time-自動')
    expect(parentOf(tree, 'rj-save')?.props?.flexWrap).toBe('wrap')
    expect(parentOf(tree, 'rj-scope')).toBe(parentOf(tree, 'rj-save'))
    await ui.press({ key: TAB_CLAWD })
    tree = (await ui.drawn()) as Drawn
    check(tree, '姿', 'rj-look-auto')
    check(tree, '演出', 'rj-effect-auto')
    expect(parentOf(tree, 'rj-save')?.props?.flexWrap).toBe('wrap')
    expect(parentOf(tree, 'rj-dots')).toBe(parentOf(tree, 'rj-save'))
    await ui.unmount()
  })
}

test('カード：行の間は小さく（xs）。窓が低いときも、帯の高さに収めるため', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  for (const tab of [TAB_ROOM, TAB_CLAWD]) {
    await ui.press({ key: tab })
    const tree = (await ui.drawn()) as Drawn
    expect(typeof tree !== 'string' && tree.props?.gap).toBe('xs')
    // タブのボタンの行の下だけ、少し空ける（xs）
    expect(parentOf(tree, TAB_ROOM)?.props?.marginBottom).toBe('xs')
    // 下の行の上は、ほかの行と同じ（前は sm 空けていた）
    expect(parentOf(tree, 'rj-save')?.props?.marginTop).toBe(undefined)
  }
  await ui.unmount()
})

test('カード：部屋が昼か夜かは、アプリの設定で決まる。その道順を、太字で、☀️ と 🌙 を1回ずつ（絵文字の形で）書く', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  const texts = (await ui.findAll({ type: 'Text' })).map(t => ({ text: String(t.text), bold: t.props.bold === true }))
  const path = texts.find(t => t.text.includes('「設定」→「外観」→「テーマ」'))
  expect(path).toEqual({ text: '「設定」→「外観」→「テーマ」', bold: true })
  const all = texts.map(t => t.text).join('')
  for (const icon of ['☀️', '🌙']) expect(`${icon}:${all.split(icon).length - 1}`).toBe(`${icon}:1`)
  // 文字の形の ☀（後ろに U+FE0F が無いもの）は使わない
  expect(/☀(?!️)/u.test(all)).toBe(false)
  await ui.unmount()
})

test('カード：昼か夜かの道順は、枠なしの薄い字で、部屋の絵のすぐ下に置く（背景のタブを低くして、スクロールを出さない）', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  const tree = (await ui.drawn()) as Drawn
  const texts = await ui.findAll({ type: 'Text' })
  const pathText = texts.find(t => String(t.text).includes('「設定」→「外観」→「テーマ」'))!
  expect(pathText.props.dimColor).toBe(true)
  const up = (n: Drawn, hit: (c: Drawn) => boolean): Exclude<Drawn, string> | undefined => {
    if (typeof n === 'string') return undefined
    if ((n.children ?? []).some(hit)) return n
    for (const c of n.children ?? []) {
      const found = up(c, hit)
      if (found !== undefined) return found
    }
    return undefined
  }
  const line = up(tree, c => typeof c !== 'string' && c.type === 'Text' && textOf(c).includes('「設定」→「外観」→「テーマ」'))
  expect(line?.props?.borderStyle).toBe(undefined)
  // 部屋の絵の並びと同じ列（絵の下）にいる
  const column = up(tree, c => c === line)
  expect(column?.props?.flexDirection).toBe('column')
  expect(JSON.stringify(column).includes('rj-tile-color-紺')).toBe(true)
  await ui.unmount()
})

test('カード（mobile）：下のボタンの行（保存して閉じる…）も、狭い画面で折り返す', async ($, on) => {
  world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('mobile'))
  for (const tab of [TAB_ROOM, TAB_CLAWD]) {
    await ui.press({ key: tab })
    const tree = (await ui.drawn()) as Drawn
    expect(parentOf(tree, 'rj-save')?.props?.flexWrap).toBe('wrap')
  }
  await ui.unmount()
})

// ---- 失敗したとき、試している見た目を勝手に戻さない ----
// 偽物のストアの、その操作だけを失敗させる（world の store.set / store.delete は、この Map を呼ぶ）。
// テストの道具の中では組み込みの Map.prototype を書きかえられないので、この Map 自身に同じ名前の関数を置く。
const breakStore = (w: World, op: 'set' | 'delete') => {
  Object.defineProperty(w.store, op, {
    value: () => {
      throw new Error('disk full')
    },
  })
}

for (const [name, op, key, toast] of [
  ['「保存して閉じる」', 'set', 'rj-save', '保存できませんでした'],
  ['「保存先の設定を消す」', 'delete', 'rj-clear', '消せませんでした'],
] as const) {
  test(`カード：${name}に失敗したら、カードは開いたまま。試している見た目は、次のメッセージでも勝手に戻さない`, async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.command.run(rj(''))
    const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await ui.press({ key: 'rj-color-緑' })
    expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
    breakStore(w, op)
    await ui.press({ key })
    expect(w.toasts.some(t => t.includes(toast))).toBe(true)
    // カードは開いたままで、まだ保存していないと言っている
    expect((await ui.find({ type: 'Text', text: /保存してある設定：/ }))?.text).toContain('まだ保存していません')
    const before = w.sets.length
    await $.prompt.submit(say('つぎ'))
    expect(w.sets.length).toBe(before)
    expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
    await ui.unmount()
  })
}

test('/rj を打って保存に失敗したら、カードで試している見た目は、次のメッセージでも勝手に戻さない', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount({ plugin: 'rainy-window-jp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'rj-color-緑' })
  breakStore(w, 'set')
  const answer = await $.command.run(rj('桜'))
  expect(answer.text).toContain('設定は変えていません')
  const before = w.sets.length
  await $.prompt.submit(say('つぎ'))
  expect(w.sets.length).toBe(before)
  expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
  await ui.unmount()
})

// ---- 会話の id が変わったあとの「この会話だけ」 ----
for (const reason of ['clear', 'resume'] as const) {
  test(`session.end（${reason}）：デスクトップの会話の id が無いとき、「この会話だけ」は新しい会話の id で読み書きする（前の会話のキーを使い続けない）`, async ($, on) => {
    const w = world(on, {}, { hostId: null })
    let id = 'A'
    on('session.id', () => ({ value: id }))
    on('session.end', (_, e) => ({ sessionId: e.sessionId }))
    await $.session.start(start)
    await $.command.run(rj('緑 s'))
    expect([...w.store.keys()]).toEqual(['session:A'])
    expect(labelOf(w.sets.at(-1))).toBe('Rainy window JP 緑')
    // 同じ窓のまま、別の会話（別の id）として続く。session.start は来ない
    await $.session.end({ reason, sessionId: 'A', resume: { id: 'A' } } as never)
    id = 'B'
    // 新しい会話には「この会話だけ」の設定が無いので、標準（紺）に戻る
    await $.prompt.submit(say('つぎ'))
    expect(labelOf(w.sets.at(-1))).toBe('Rainy window')
    // 新しい会話で保存すると、新しい会話のキーに入る。前の会話の設定は、そのまま残る
    await $.command.run(rj('桜 s'))
    expect((w.store.get('session:B') as { theme?: string } | undefined)?.theme).toBe('桜')
    expect((w.store.get('session:A') as { theme?: string } | undefined)?.theme).toBe('緑')
  })
}

// ---- カード全体の大きさ ----
// 2026-11-15：部屋の絵（1枚 92,000 字）5枚と選ぶ欄を入れたカードが、本物のアプリで出なかった（背景だけ変わった）。
// 前の版のカードは、絵の合計 約 77,000 字で描けていた。どの背景色・時間帯・姿・演出・ドットでも、カード全体をそれより小さくする。
test('カード全体（部品の木を文字にしたもの）は、どのタブ・どの組み合わせでも 77,000 字より小さい', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(start)
  await $.command.run(rj(''))
  const ui = await $.ui.mount(cardOn('desktop'))
  let worst = 0
  let at = ''
  const measure = async (name: string) => {
    const size = JSON.stringify(await ui.drawn()).length
    if (size > worst) [worst, at] = [size, name]
  }
  for (const time of ['朝', '昼', '夕方', '夜']) {
    await ui.press({ key: TAB_ROOM })
    await ui.press({ key: `rj-time-${time}` })
    for (const color of ['紺', '緑', '桜', '橙', '灰']) {
      await ui.press({ key: `rj-color-${color}` })
      await measure(`背景 ${color}・${time}`)
    }
  }
  await ui.press({ key: TAB_CLAWD })
  for (const look of ['sonnet', 'haiku', 'opus', 'fable'])
    for (const effect of ['low', 'medium', 'high', 'xhigh', 'max']) {
      await ui.press({ key: `rj-look-${look}` })
      await ui.press({ key: `rj-effect-${effect}` })
      for (const dots of ['normal', 'fine']) {
        await pressUntil(ui, 'rj-dots', dots)
        await measure(`クロードくん ${look}・${effect}・${dots}`)
      }
    }
  expect(`${at}：${worst}`).toBe(worst < 77_000 ? `${at}：${worst}` : `${at}：77,000 字以上`)
  await ui.unmount()
})
