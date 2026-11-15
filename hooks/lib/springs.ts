// ばねの動きを、絵を作るときに前もって計算する。純粋な関数だけ（同じ引数なら同じ数）。
// 式と刻みは、参考にした Morph tooltip の motion.js と同じ：1歩は a = -k·(x - t) - c·v; v += a·dt; x += v·dt。
// 1コマ（1/60 秒）を 4 つに分けて回し（dt = 1/240 秒）、コマごとの値を取る。

/** ばねの固さ k と、止める力 c。 */
export type SpringConf = { readonly k: number; readonly c: number }
/** 1本のばね：いまの値 x、速さ v（1秒あたり）、行き先 t。 */
export type Spring = { x: number; v: number; t: number; k: number; c: number }

/** 動く向きの側の端（かたいばね）。 */
export const LEAD: SpringConf = { k: 620, c: 36 }
/** 反対の側の端（やわらかいばね）。 */
export const TRAIL: SpringConf = { k: 190, c: 19 }
/** 吹き出しのしっぽ。 */
export const TAIL: SpringConf = { k: 300, c: 22 }
/** 言葉の出入り（0 〜 1）。 */
export const LABEL: SpringConf = { k: 420, c: 32 }

/** 1秒あたりのコマの数と、1コマを分ける数。 */
export const FPS = 60
export const SUBSTEPS = 4
/** 1歩の時間（秒）：1/60 秒を 4 つに分けたもの（= 1/240 秒）。 */
export const DT = 1 / FPS / SUBSTEPS
/** いちばん長くて 1.2 秒（72 コマ）で打ち切る。 */
export const CAP_FRAMES = 72
/** 止まったと見るのは、行き先まで 0.5 px より近く、速さが 1秒 5 px より遅いとき。 */
const NEAR_PX = 0.5
const STILL_PX = 5

/** 止まっている（速さ 0）ばねを、行き先 t へ向けて作る。 */
export function springOf(x: number, t: number, conf: SpringConf): Spring {
  return { x, v: 0, t, k: conf.k, c: conf.c }
}

/** ばねを1歩すすめる（motion.js の step と同じ式・同じ順）。 */
export function stepSpring(s: Spring, dt: number): void {
  const a = -s.k * (s.x - s.t) - s.c * s.v
  s.v += a * dt
  s.x += s.v * dt
}

/** 止まったか。scale は、値を px に直す倍率（0〜1 の値を、14 px のずれとして見るなら 14）。 */
export function isSettled(s: Spring, scale = 1): boolean {
  return Math.abs(s.x - s.t) * scale < NEAR_PX && Math.abs(s.v) * scale < STILL_PX
}

/**
 * いくつものばねを一緒に回し、コマごとの値を返す（frames[i] が i 本目のばねの、0 コマ目＝動く前からの値）。
 * ぜんぶのばねが止まった最初のコマで終わる（先に止まったばねも、そこまで回り続ける）。止まらなければ 1.2 秒で打ち切り、settled は false。
 * 渡したばねは変えない。
 */
export function simulate(springs: readonly Spring[], scales: readonly number[] = []): { frames: number[][]; settled: boolean } {
  const live = springs.map(s => ({ ...s }))
  const frames = live.map(s => [s.x])
  const done = () => live.every((s, i) => isSettled(s, scales[i] ?? 1))
  if (done()) return { frames, settled: true }
  for (let n = 1; n <= CAP_FRAMES; n++) {
    for (let k = 0; k < SUBSTEPS; k++) for (const s of live) stepSpring(s, DT)
    for (const [i, s] of live.entries()) frames[i]?.push(s.x)
    if (done()) return { frames, settled: true }
  }
  return { frames, settled: false }
}
