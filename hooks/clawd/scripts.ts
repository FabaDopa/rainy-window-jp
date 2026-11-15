// クロードくんの台本：姿（Look）× 状態（Phase）× 動きの速さ（effort の段階）ごとの、ポーズの並び。
// 純粋なデータだけ。絵にするのは paint.ts、スプライトにするのは sheet.ts の buildSprite。
// 見本（tmp-pick/gen の clawd-gen2.ts の *Story と clawd-gen6.ts）の動きを移したもの。
import { FPS, ticks } from './sheet'
import { at, still, blink, SCREEN, YOU, UP, type Arm, type Frame, type Over, type Pose } from './pose'

export type Look = 'sonnet' | 'haiku' | 'opus' | 'fable'
export type Phase = 'wait' | 'alert' | 'think' | 'tool' | 'write' | 'done' | 'wave'
export type Level = 0 | 1 | 2 | 3 | 4

// 台本の7つの区間の並び
export const PHASES: Phase[] = ['wait', 'alert', 'think', 'tool', 'write', 'done', 'wave']

// effort ごとの動きの速さ（low ほどのんびり）。打つ1打の秒と、指揮の1拍の秒。
export const TEMPO = [0.3, 0.2, 0.15, 0.11, 0.083]
export const BEAT = [0.4, 0.32, 0.26, 0.2, 0.15]
// 口だけ段階で変える。目の形は変えない（設計書 §3.3。見本の low の半目はやめた）。
const FACE: Partial<Pose>[] = [{ mouth: 'smile' }, {}, { mouth: 'flat' }, { mouth: 'flat' }, { mouth: 'flat' }]
const STYLE = ['one', 'plain', 'plain', 'bounce', 'bounce'] as const
// 小さい3人の横の並び（大きい子のマスで、小さい子の左上）
export const HAIKU_X = [-9, 3, 15]

// Opus：髪・燕尾服・蝶ネクタイ・指揮棒。机に譜面台なので、画面の光は無し。
const MAESTRO: Partial<Pose> = { wear: ['hair', 'tails', 'bowtie'], hand: 'baton', glow: 0 }
// Fable：角帽・めがね（マント・ひげ・浮くのは使わない）。
const PROF: Partial<Pose> = { wear: ['cap', 'glasses'] }

// ---- 部品 ----

const mini = (o: Partial<Pose> = {}): Pose => at({ look: SCREEN, ...o })
const dress = (script: Frame[], o: Partial<Pose>): Frame[] =>
  script.map(([p, s]) => [{ ...p, ...o, wear: [...p.wear, ...(o.wear ?? [])], over: [...p.over, ...(o.over ?? [])] }, s] as Frame)
const lenOf = (script: Frame[]) => script.reduce((n, [, s]) => n + ticks(s), 0)

// 打つ：1打ごとに腕を入れかえる。style で腕の出し方が変わる。
function typing(n: number, secs: number, o: Partial<Pose> = {}, style: 'plain' | 'bounce' | 'one' = 'plain'): Frame[] {
  return Array.from({ length: n }, (_, i) => {
    const a = i % 2 === 1
    const arms: Partial<Pose> =
      style === 'bounce'
        ? a ? { front: 'out', back: 'mid' } : { front: 'mid', back: 'out' }
        : style === 'one'
          ? { front: a ? 'out' : 'mid', back: 'down' }
          : a ? { front: 'out', back: 'down' } : { front: 'down', back: 'out' }
    return [at({ look: SCREEN, ...arms, dy: style === 'bounce' && a ? -1 : 0, ...o }), secs] as Frame
  })
}
// ゆっくりの呼吸（体が1マス上下）を重ねる
function breathe(script: Frame[], period = 3): Frame[] {
  const out: Frame[] = []
  let t = 0
  for (const [pose, secs] of script) {
    let left = secs
    while (left > 1e-6) {
      const phase = t % period
      const edge = phase < period / 2 ? period / 2 - phase : period - phase
      const step = Math.min(left, edge)
      out.push([{ ...pose, dy: pose.dy + (phase >= period / 2 ? -1 : 0) }, step])
      t += step
      left -= step
    }
  }
  return out
}
// 台本を、ちょうど n コマの長さにのばす（最後のコマを長くする）／切る
function fit(script: Frame[], n: number): Frame[] {
  const out: Frame[] = []
  let t = 0
  for (const [p, s] of script) {
    const k = ticks(s)
    if (t + k >= n) {
      if (n - t > 0) out.push([p, (n - t) / FPS])
      return out
    }
    out.push([p, k / FPS])
    t += k
  }
  if (t < n) out.push([out[out.length - 1]?.[0] ?? at(), (n - t) / FPS])
  return out
}
// 輪になる台本を、始まりの位置だけずらす（長さは変わらない）
const rotate = (script: Frame[], n: number): Frame[] => {
  const k = script.length ? n % script.length : 0
  return [...script.slice(k), ...script.slice(0, k)]
}

// マグを持ち上げて一口
const sip = (): Frame[] => [
  still({ back: 'reach', look: [1, 1] }, 0.4),
  [at({ mug: 'held', back: 'hold', eyes: 'closed', blush: true }), 1.3],
  [at({ mug: 'held', back: 'hold', eyes: 'happy', mouth: 'smile', blush: true }), 0.6],
  still({ back: 'reach', look: [1, 1] }, 0.3),
]
const wave = (): Frame[] => [
  still({ look: YOU, mouth: 'smile' }, 0.4),
  ...Array.from({ length: 3 }, () => [
    [at({ look: YOU, eyes: 'happy', mouth: 'grin', front: 'up' }), 0.25] as Frame,
    [at({ look: YOU, eyes: 'happy', mouth: 'grin', front: 'wave' }), 0.25] as Frame,
  ]).flat(),
  still({ look: YOU, mouth: 'smile', blush: true }, 0.5),
]
const think = (secs = 0.45): Frame[] => [
  still({ look: UP, mouth: 'flat', over: ['dots1'], glow: 0.45 }, secs),
  still({ look: UP, mouth: 'flat', over: ['dots2'], glow: 0.45, front: 'mid' }, secs),
  still({ look: [1, -1], mouth: 'flat', over: ['dots3'], glow: 0.45 }, secs),
  still({ look: [1, -1], mouth: 'flat', over: ['dots3'], glow: 0.45, front: 'mid' }, secs),
]
// 道具：歯車の吹き出し、カタカタ打つ。打つ1打は effort の速さ。
const tool = (L: Level, n = 3): Frame[] =>
  Array.from({ length: n }, (_, k) => [
    ...typing(2, TEMPO[L]!, { over: [k % 2 ? 'gear2' : 'gear1'], glow: 0.9 }),
    ...typing(2, TEMPO[L]!, { over: [k % 2 ? 'gear1' : 'gear2'], glow: 0.6 }),
    still({ look: SCREEN, over: [k % 2 ? 'gear1' : 'gear2'], glow: 0.9, front: 'out', back: 'out' }, 0.35),
  ]).flat()
// 書く：弾んで打つ。打つ1打は effort の速さ、吹き出しの行が1本ずつ増える。
const LINES: Over[] = ['lines1', 'lines2', 'lines3']
const writing = (L: Level): Frame[] => {
  const rows = (n: number, i: 0 | 1 | 2): Frame[] => typing(n, TEMPO[L]!, { ...FACE[L], over: [LINES[i]!], glow: 0.95 }, STYLE[L])
  return [...rows(8, 0), blink({ glow: 0.95 }), ...rows(8, 1), ...rows(8, 2)]
}
// 見本の typingLoop（行の吹き出し無し）。Haiku の3人が使う。
const plainLoop = (L: Level): Frame[] => [...typing(14, TEMPO[L]!, FACE[L], STYLE[L]), blink(), ...typing(10, TEMPO[L]!, FACE[L], STYLE[L])]
const banzai = (): Frame[] => [
  still({ eyes: 'closed', dy: 1 }, 0.15),
  [at({ eyes: 'happy', mouth: 'grin', front: 'high', back: 'high', dy: -2, over: ['spark1'] }), 0.25],
  [at({ eyes: 'happy', mouth: 'grin', front: 'high', back: 'high', dy: -2, over: ['spark2'] }), 0.25],
  [at({ eyes: 'happy', mouth: 'grin', front: 'high', back: 'high', dy: -2, over: ['spark1'] }), 0.25],
  still({ eyes: 'happy', mouth: 'smile', dy: 1 }, 0.15),
]
const bow = (): Frame[] => [
  still({ eyes: 'happy', mouth: 'smile', front: 'mid' }, 0.3),
  still({ eyes: 'closed', mouth: 'smile', front: 'mid', dy: 2 }, 0.9),
  still({ eyes: 'happy', mouth: 'smile', front: 'mid' }, 0.4),
]
// やったのあと：キラキラ無しで、にこにこのまま止まる
const calm = (o: Partial<Pose> = {}, secs = 1.5): Frame => still({ eyes: 'happy', mouth: 'smile', blush: true, ...o }, secs)
// 指揮：4拍子（1 下・2 内・3 外・4 上）。奥の手は強い拍で開く。音符が流れる。
function conduct(L: Level): Frame[] {
  const front: Arm[] = ['down', 'mid', 'out', 'up']
  const back: Arm[] = ['out', 'mid', 'down', 'mid']
  const face: Partial<Pose> = L === 0 ? { mouth: 'smile' } : L === 4 ? { mouth: 'grin' } : { mouth: L >= 2 ? 'flat' : 'none' }
  return Array.from({ length: 16 }, (_, i) => [at({ look: SCREEN, front: front[i % 4], back: back[i % 4], dy: i % 4 === 3 ? -1 : 0, over: ['notes'], glow: 0, ...face }), BEAT[L]!] as Frame)
}
// 指し棒で黒板をトントン（指し棒を持つのは、このコマだけ）
const point = (n: number, o: Partial<Pose> = {}): Frame[] =>
  Array.from({ length: n }, (_, i) => still({ look: [-1, -1], front: i % 2 ? 'wave' : 'up', hand: 'pointer', glow: 0.5, ...o }, 0.3))
// 「！」：びっくりして、体が少し上がる
const alertFrames = (o: Partial<Pose> = {}): Frame[] => [[at({ eyes: 'wide', mouth: 'o', dy: -1, over: ['bang'], front: 'out', back: 'out', ...o }), 0.6], still({ look: SCREEN, ...o }, 0.3), still({ look: SCREEN, ...o }, 1.7)]
// 手をふったあと、こちらを見て呼吸
const idle = (): Frame[] => breathe([still({ look: YOU, mouth: 'smile', glow: 0.35 }, 1.2), blink({ look: YOU, glow: 0.35 })])

// ---- 姿ごとの7つの状態 ----

function sonnet(L: Level): Frame[][] {
  return [
    breathe([still({ look: YOU, mouth: 'smile', glow: 0.35 }, 1.6), blink({ look: YOU, glow: 0.35 }), still({ look: YOU, mouth: 'smile', glow: 0.35 }, 0.8), ...sip().map(([p, s]) => [{ ...p, glow: 0.35 }, s] as Frame)]),
    alertFrames(),
    [...think(), ...think(0.4)],
    tool(L),
    writing(L),
    [...banzai(), calm()],
    [...wave(), ...idle()],
  ]
}

function opus(L: Level): Frame[][] {
  // 待っている間：指揮棒は下ろしたまま、ときどき小さくお辞儀
  const smallBow = (): Frame[] => [
    still({ eyes: 'happy', mouth: 'smile', look: YOU, glow: 0.35 }, 0.3),
    still({ eyes: 'closed', mouth: 'smile', look: YOU, dy: 1, glow: 0.35 }, 0.6),
    still({ eyes: 'happy', mouth: 'smile', look: YOU, glow: 0.35 }, 0.3),
  ]
  const T = TEMPO[L]!
  const gears = Array.from({ length: 3 }, (_, k) => [
    still({ look: SCREEN, front: 'out', over: [k % 2 ? 'gear2' : 'gear1'], glow: 0.9 }, T),
    still({ look: SCREEN, front: 'mid', over: [k % 2 ? 'gear1' : 'gear2'], glow: 0.6 }, T),
    still({ look: SCREEN, front: 'out', over: [k % 2 ? 'gear2' : 'gear1'], glow: 0.9 }, T),
    still({ look: SCREEN, front: 'mid', over: [k % 2 ? 'gear1' : 'gear2'], glow: 0.6 }, T * 2),
  ]).flat()
  return ([
    [...breathe([still({ look: YOU, mouth: 'smile', glow: 0.35 }, 1.6), blink({ look: YOU, glow: 0.35 })]), ...smallBow(), ...breathe([still({ look: YOU, mouth: 'smile', glow: 0.35 }, 1.2)])],
    alertFrames({ front: 'up', back: 'out' }),
    [...think(), ...think(0.4)].map(([p, s]) => [{ ...p, front: 'mid' }, s] as Frame),
    gears,
    conduct(L),
    // やった：両手を振り上げてから深くお辞儀（目は笑い目か閉じる。見開かない）
    [[at({ eyes: 'happy', mouth: 'grin', front: 'high', back: 'high', dy: -1, over: ['spark1'] }), 0.35], ...bow(), calm({ front: 'mid' }, 1.2)],
    [...wave(), ...idle()],
  ] as Frame[][]).map(seg => dress(seg, MAESTRO))
}

function fable(L: Level): Frame[][] {
  const board = (o: Partial<Pose> = {}, secs = 0.4): Frame => still({ look: [-1, -1], mouth: 'smile', glow: 0.35, ...o }, secs)
  return ([
    // 待っている間：黒板を見て、めがねがキラッ
    [board({}, 1.4), board({ over: ['glint'] }, 0.3), board({}, 1.0), blink({ look: [-1, -1], glow: 0.35 }), board({}, 0.8)],
    alertFrames(),
    [...point(4, { over: ['dots2'] }), ...point(4, { over: ['dots3'] }), still({ look: [-1, -1], eyes: 'closed', dy: 1, over: ['dots3'] }, 0.4)],
    tool(L),
    writing(L),
    [still({ eyes: 'happy', mouth: 'grin', over: ['glint'], front: 'mid' }, 0.4), [at({ eyes: 'happy', mouth: 'grin', front: 'high', back: 'high', over: ['spark1'] }), 0.4], [at({ eyes: 'happy', mouth: 'grin', front: 'high', back: 'high', over: ['spark2'] }), 0.4], calm()],
    [...wave(), still({ look: YOU, mouth: 'smile', glow: 0.35, over: ['glint'] }, 0.3), ...breathe([still({ look: YOU, mouth: 'smile', glow: 0.35 }, 0.9), blink({ look: YOU, glow: 0.35 })])],
  ] as Frame[][]).map(seg => dress(seg, PROF))
}

// 区間の長さ（コマ数）を、全員でそろえる
function align(stories: Frame[][][]): Frame[][][] {
  const n = PHASES.map((_, i) => Math.max(...stories.map(s => lenOf(s[i]!))))
  return stories.map(s => s.map((seg, i) => fit(seg, n[i]!)))
}

// Haiku：小さい子3人。区間ごとに3人それぞれの台本（k＝何人目）。長さは3人そろえる。
function haiku(L: Level): Frame[][][] {
  const hop = (): Frame => [mini({ eyes: 'happy', mouth: 'smile', dy: -2, front: 'up', back: 'up' }), 0.3]
  // [秒（0 なら輪の長さのまま）, 台本]
  const segs: [number, (k: number) => Frame[]][] = [
    // 3人がこちらを見て、ときどき跳ねる（見る長さを人ごとにずらす）
    [3.6, k => [...breathe([still({ look: YOU, mouth: 'smile', glow: 0.35 }, 0.6 + k * 0.3), blink({ look: YOU }), still({ look: YOU, mouth: 'smile' }, 1.0)], 2 + k * 0.4), hop(), still({ eyes: 'happy', mouth: 'smile', dy: 1 }, 0.12), still({ look: YOU, mouth: 'smile' }, 1.5)]],
    [2.6, k => [still({ look: SCREEN }, k * 0.15 + 0.01), [mini({ eyes: 'wide', dy: -1, over: ['bang'], front: 'out', back: 'out' }), 0.5], still({ look: SCREEN }, 0.4), still({ look: SCREEN }, 2)]],
    [3.4, k => (k === 1 ? [...think(0.42), ...think(0.42)] : [still({ look: [1, -1] }, 1.2), blink({ look: [k === 0 ? 1 : -1, -1] }), still({ look: [k === 0 ? 1 : -1, -1] }, 2.2)])],
    [0, k => rotate(tool(L), k * 5)],
    [0, k => rotate(plainLoop(L), k * 8)],
    [2.8, k => [still({}, k * 0.2 + 0.01), ...banzai(), calm({}, 3)]],
    [4.0, k => [still({ look: YOU, mouth: 'smile' }, k * 0.15 + 0.01), ...wave(), ...breathe([still({ look: YOU, mouth: 'smile', glow: 0.35 }, 1.5)])]],
  ]
  return align([0, 1, 2].map(k => segs.map(([secs, f]) => (secs ? fit(f(k), ticks(secs)) : f(k)))))
}

// ---- 外に出すもの ----

export function scriptsFor(look: Look, phase: Phase, tempo: Level): Frame[][] {
  const i = PHASES.indexOf(phase)
  if (look === 'haiku') return haiku(tempo).map(s => s[i] as Frame[])
  const story = look === 'opus' ? opus(tempo) : look === 'fable' ? fable(tempo) : sonnet(tempo)
  return [story[i] as Frame[]]
}

// サブエージェントの小さい子：机で打つ。k（何人目）で打ち始めと速さをずらす。登場・退場のけむりは別。
export function subagentScript(k: number): Frame[] {
  const secs = 0.12 + k * 0.03
  return rotate([...typing(14, secs), blink(), ...typing(10, secs)], k * 6)
}
