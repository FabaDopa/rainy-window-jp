import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// 拡張子なしの import は test/setup.mjs（--import）で .ts を補って読む。
const { clawdSheet, buildSprite, FPS, ticks } = await import('../hooks/clawd/sheet.ts')
const { scriptsFor, subagentScript, TEMPO, BEAT, HAIKU_X, PHASES } = await import('../hooks/clawd/scripts.ts')
const { paintMini } = await import('../hooks/clawd/paint.ts')

const LOOKS = ['sonnet', 'haiku', 'opus', 'fable'] as const

test('今のクロードくんは変わらない', () => {
  // buildSprite を足す前の clawdSheet().body の sha256
  const sha = createHash('sha256').update(clawdSheet().body).digest('hex')
  assert.equal(sha, '029285940ce61884134b3cfc739b7994d5298b4afaae24442650af9113399e72')
})

test('どの姿・状態も台本がある：Haiku は3本、ほかは1本', () => {
  for (const look of LOOKS)
    for (const phase of PHASES) {
      const s = scriptsFor(look, phase, 2)
      assert.equal(s.length, look === 'haiku' ? 3 : 1, `${look}/${phase}`)
      for (const one of s) assert.ok(one.length > 0, `${look}/${phase}`)
    }
  assert.deepEqual(HAIKU_X, [-9, 3, 15])
})

test('Haiku の3人は、どの状態でも同じ長さ', () => {
  for (const phase of PHASES)
    for (const level of [0, 2, 4] as const) {
      const lens = scriptsFor('haiku', phase, level).map(s => s.reduce((n, [, secs]) => n + ticks(secs), 0))
      assert.equal(new Set(lens).size, 1, `${phase}/${level}: ${lens}`)
    }
})

test('速さ：打つコマと指揮の拍は effort の表のとおり', () => {
  assert.deepEqual(TEMPO, [0.3, 0.2, 0.15, 0.11, 0.083])
  assert.deepEqual(BEAT, [0.4, 0.32, 0.26, 0.2, 0.15])
  const typed = (level: 0 | 1 | 2 | 3 | 4, secs: number) =>
    scriptsFor('sonnet', 'write', level)[0]!.filter(([, s]) => s === secs).length
  assert.ok(typed(4, 0.083) >= 10)
  assert.ok(typed(0, 0.3) >= 10)
  assert.ok(scriptsFor('sonnet', 'tool', 4)[0]!.some(([, s]) => s === 0.083))
  const opus = scriptsFor('opus', 'write', 2)[0]!
  assert.ok(opus.length >= 8)
  assert.ok(opus.every(([, s]) => s === 0.26))
})

test('姿の中身：Opus・Fable・Sonnet', () => {
  for (const phase of PHASES)
    for (const [p] of scriptsFor('opus', phase, 2)[0]!) for (const w of ['hair', 'tails', 'bowtie']) assert.ok(p.wear.includes(w as never), `opus ${phase} ${w}`)
  const write = scriptsFor('opus', 'write', 2)[0]!
  assert.ok(write.every(([p]) => p.over.includes('notes') && p.hand === 'baton'))
  for (const phase of PHASES) {
    for (const [p] of scriptsFor('fable', phase, 2)[0]!) {
      assert.ok(p.wear.includes('cap') && p.wear.includes('glasses'), `fable ${phase}`)
      assert.ok(!p.wear.includes('cape') && !p.wear.includes('beard') && p.lift === 0 && p.mug !== 'none', `fable ${phase}`)
    }
  }
  const think = scriptsFor('fable', 'think', 2)[0]!
  assert.ok(think.some(([p]) => p.hand === 'pointer'))
  for (const phase of PHASES) if (phase !== 'think' && phase !== 'wait') assert.ok(scriptsFor('fable', phase, 2)[0]!.every(([p]) => p.hand !== 'pointer' || p.look[1] === -1), phase)
  assert.ok(scriptsFor('sonnet', 'wait', 2)[0]!.some(([p]) => p.mug === 'held'))
})

test('待っている間の姿ごとの動き：Haiku は跳ねる・Opus はお辞儀・Fable は黒板を見てキラッ', () => {
  for (const s of scriptsFor('haiku', 'wait', 2)) assert.ok(s.some(([p]) => p.dy <= -2 && p.front === 'up'))
  const opus = scriptsFor('opus', 'wait', 2)[0]!
  assert.ok(opus.some(([p]) => p.dy > 0 && p.eyes === 'closed'))
  const fable = scriptsFor('fable', 'wait', 2)[0]!
  assert.ok(fable.some(([p]) => p.look[0] === -1 && p.look[1] === -1))
  assert.ok(fable.some(([p]) => p.over.includes('glint')))
})

test('目：alert 以外のどの台本にも eyes: wide が無い（effort で目の形を変えない）', () => {
  for (const look of LOOKS)
    for (const phase of PHASES)
      for (const level of [0, 1, 2, 3, 4] as const)
        for (const s of scriptsFor(look, phase, level))
          for (const [p] of s) {
            if (phase === 'alert') continue
            assert.notEqual(p.eyes, 'wide', `${look}/${phase}/${level}`)
            if (phase === 'write' || phase === 'tool') assert.notEqual(p.eyes, 'half', `${look}/${phase}/${level}`)
          }
})

test('サブエージェントの子：打つ台本で、k で打ち始めがずれる', () => {
  const a = subagentScript(0)
  const b = subagentScript(2)
  assert.ok(a.length > 0 && b.length > 0)
  assert.notDeepEqual(a, b)
  assert.ok(a.every(([p]) => !p.hidden))
})

test('スプライト：コマの数・長さ・湯気・音符の層', () => {
  const s = buildSprite(scriptsFor('sonnet', 'wait', 2)[0]!)
  assert.ok(s.poses > 3 && s.body.includes('<animate') && s.dur > 3)
  assert.match(s.steamAnim, /<animate/)
  assert.equal(s.extra, '')
  const o = buildSprite(scriptsFor('opus', 'write', 2)[0]!)
  assert.ok(o.extra.includes('f-frame'))
  assert.equal(o.dur, scriptsFor('opus', 'write', 2)[0]!.reduce((n, [, secs]) => n + ticks(secs), 0) / FPS)
  const m = buildSprite(subagentScript(1), paintMini)
  assert.ok(m.body.length > 0)
  assert.doesNotMatch(s.body + s.extra, /<script|foreignObject|class="[^"]*animation/)
})

// 背景は最短 2 秒ごとにしか描き直さないので、「！」・やった・手をふるは1回だけ動いて、最後は静かな姿で止まる。
test('1回きりの状態：長さと、最後の静かな姿', () => {
  const secsOf = (s: [unknown, number][]) => s.reduce((n, [, x]) => n + ticks(x), 0) / FPS
  for (const look of LOOKS)
    for (const level of [0, 4] as const) {
      const need = { alert: 2.5, done: 2.5, wave: 3.5 }
      for (const phase of ['alert', 'done', 'wave'] as const)
        for (const s of scriptsFor(look, phase, level)) {
          assert.ok(secsOf(s) >= need[phase] - 1e-9, look + '/' + phase + '/' + level + ': ' + secsOf(s))
          if (phase === 'alert') {
            const flags = s.map(([p]) => p.over.includes('bang'))
            const runs = flags.filter((f, i) => f && !flags[i - 1]).length
            assert.equal(runs, 1, look + ' bang')
          }
          if (phase === 'done') {
            const last = s[s.length - 1]!
            assert.ok(ticks(last[1]) / FPS >= 0.8 - 1e-9, look + ' done last')
            assert.equal(last[0].over.length, 0)
          }
        }
    }
})
