// クロードくんのポーズ（型・初期値・腕の形・台本の小さな部品）。純粋なデータだけ。
import { ARM_BLOCKS } from './body'

export type Arm = 'out' | 'down' | 'mid' | 'up' | 'high' | 'wave' | 'reach' | 'hold'
export type Eyes = 'open' | 'closed' | 'half' | 'happy' | 'wide' | 'none'
export type Mouth = 'none' | 'smile' | 'grin' | 'o' | 'yawn' | 'flat' | 'wavy'
export type Over =
  | 'dots1' | 'dots2' | 'dots3' | 'gear1' | 'gear2' | 'lines1' | 'lines2' | 'lines3'
  | 'bang' | 'sweat1' | 'sweat2' | 'sweat3' | 'speed' | 'spark1' | 'spark2' | 'zzz' | 'heart' | 'notes' | 'glint' | 'paper' | 'puff1' | 'puff2'
export type Wear = 'bowtie' | 'hair' | 'tails' | 'cap' | 'glasses' | 'beard' | 'cape'
export type Hand = 'none' | 'baton' | 'pointer'
export type Pose = {
  eyes: Eyes
  mouth: Mouth
  blush: boolean
  look: [number, number]
  front: Arm
  back: Arm
  dy: number // 体の上下（負＝上）。足は机に立ったまま
  lift: number // 体ごと浮く（足ごと上がる）
  mug: 'desk' | 'held' | 'none'
  over: Over[]
  glow: number // 画面の光（0〜1）
  wear: Wear[]
  hand: Hand // 手前の手に持つもの
  hidden: boolean // 何も描かない（小さい子がいない時間）
  shift: number // 小さい子の横の位置（歩くとき）
}
export const P0: Pose = {
  eyes: 'open', mouth: 'none', blush: false, look: [-1, 1], front: 'down', back: 'down', dy: 0, lift: 0,
  mug: 'desk', over: [], glow: 0.7, wear: [], hand: 'none', hidden: false, shift: 0,
}
export type Frame = [Pose, number]
export const SCREEN: [number, number] = [-1, 1]
export const YOU: [number, number] = [-1, 0]
export const WINDOW: [number, number] = [1, -1]
export const UP: [number, number] = [0, -1]


// 左（手前）の腕のブロック。奥の腕は 11 - x で左右を返す。out と down は body.ts のまま。
export const ARMS: Record<Arm, [number, number][]> = {
  out: ARM_BLOCKS.out,
  down: ARM_BLOCKS.down,
  mid: [[0, 3], [1, 3], [0, 4], [1, 4]],
  up: [[1, 2], [0, 1], [0, 0], [-1, -1]],
  high: [[1, 1], [0, 0], [-1, -1]],
  wave: [[1, 2], [0, 1], [-1, 1], [-2, 0]],
  reach: [[0, 4], [-1, 5], [-2, 5]],
  hold: [[0, 4], [1, 4], [1, 3]],
}

// 指揮棒・指し棒：手前の手の位置（マス）と、そこから伸びる向き
export const STICK: Partial<Record<Arm, { at: [number, number]; dir: [number, number] }>> = {
  up: { at: [-1, -1], dir: [-1, -1] },
  high: { at: [-1, -1], dir: [-1, -1] },
  wave: { at: [-3, 1], dir: [-1, -1] },
  out: { at: [0, 6], dir: [-1, -0.5] },
  mid: { at: [0, 8], dir: [-1, 0.5] },
  down: { at: [0, 11], dir: [-1, 1] },
}

// ---- 台本の部品 ----
export const at = (o: Partial<Pose> = {}): Pose => ({ ...P0, ...o })
export const still = (o: Partial<Pose>, secs: number): Frame => [at({ front: 'down', back: 'down', ...o }), secs]
export const blink = (o: Partial<Pose> = {}): Frame => still({ ...o, eyes: 'closed' }, 0.17)
