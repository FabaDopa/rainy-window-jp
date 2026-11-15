// クロードくんの1コマの絵（ポーズ → 点）。純粋な関数だけ。
// 大きい子・小さい子・奥の小さい子・細かいドット版。
import * as E from './body'
import { Px, FinePx, upscale } from './px'
import { ARMS, STICK } from './pose'
import type { Mouth, Pose } from './pose'

// 小物の色（body.ts の EYE・BLUSH 以外はここだけで使う）
const EYE = E.EYE
const BLUSH = E.BLUSH
const SWEAT = '#8FC1F0'
const SPARK = '#FFD38A'
const GEAR = '#5E6372'
const INK = '#22202B' // 角帽・燕尾服・蝶ネクタイ
const WHITE = '#F4F1EA' // 指揮棒・シャツ・ひげ・紙
const GOLD = '#F2C14E'
const CAPE = '#6B2D7A'

// ---- 大きいクロードくん ----
// 大きいクロードくん1コマ（sheet.ts の paint と同じ並べ方に、新しい形と小物を足したもの）
export function paintBig(pose: Pose, px = new Px()): Px {
  if (pose.hidden) return px
  const put = (x: number, y: number, c: string) => px.put(x, y, c)
  const ox = 1
  const oy = 1 - pose.lift
  const dy = pose.dy
  const wear = new Set(pose.wear)
  const block = (x: number, y: number, c: string) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) put(ox + x * 2 + i, oy + y * 2 + j + dy, c)
  }
  // マント（体のうしろ）：両わきと、立った襟
  if (wear.has('cape')) {
    for (let y = 1; y <= 14; y++) for (const x of [2, 3, 4, 21, 22, 23]) if (!(y > 12 && (x === 2 || x === 23))) put(x, oy + y - 1 + dy, CAPE)
    for (const [x, y] of [[2, -1], [3, -1], [22, -1], [23, -1], [3, 0], [22, 0]] as [number, number][]) put(x, oy + y + dy, CAPE)
  }
  // 体（8×6 ブロック、奥の側に影の列）
  for (let y = 0; y < 6; y++) for (let x = 2; x < 10; x++) block(x, y, E.BODY)
  for (let y = 0; y < 12; y++) put(ox + 19, oy + y + dy, E.BODY_DARK)
  // 足：机に立ったまま、体が上がったぶんはのばす。浮いているときは、ぶら下がる
  for (const x of E.LEGS) {
    const c = x > 5 ? E.BODY_DARK : E.BODY
    for (let y = oy + 12 + Math.min(dy, 0); y < oy + 16; y++) for (let i = 0; i < 2; i++) put(ox + x * 2 + i, y, c)
  }
  // 燕尾服：おなかから下を黒く、まん中に白いシャツ、うしろに燕尾
  if (wear.has('tails')) {
    for (let y = 8; y <= 12; y++) for (let x = 5; x <= 20; x++) put(x, oy + y - 1 + dy, INK)
    for (let y = 8; y <= 12; y++) for (const x of [11, 12]) put(x, oy + y - 1 + dy, WHITE)
    for (const [x, y] of [[19, 13], [20, 13], [20, 14], [21, 14], [21, 15]] as [number, number][]) put(x, oy + y - 1 + dy, INK)
  }
  // 腕
  for (const [x, y] of ARMS[pose.front]) block(x, y, E.BODY)
  for (const [x, y] of ARMS[pose.back]) block(11 - x, y, E.BODY_DARK)

  // 顔：開いた目・閉じた目・笑顔・頬は body.ts の drawFace、ほかの形はここで足す
  const fine = (x: number, y: number, c: string) => put(ox + x - 1, oy + y + dy, c)
  const both = (pts: [number, number][], c = EYE, sx = 0, sy = 0) => {
    for (const [x, y] of pts) {
      fine(x + sx, y + sy, c)
      fine(E.W0 - 1 - x + sx, y + sy, c)
    }
  }
  const [dx, ly] = pose.look
  if (pose.eyes === 'open' || pose.eyes === 'closed') {
    E.drawFace(E.face(pose.eyes, pose.mouth === 'smile' ? 'smile' : 'none', { blush: pose.blush, look: { dx, dy: ly } }), fine)
  } else {
    if (pose.blush) both([[4, 5], [5, 5]], BLUSH)
    if (pose.eyes === 'happy') both([[5, 3], [6, 2], [7, 2], [8, 3]])
    if (pose.eyes === 'wide') both([[6, 1], [7, 1], [6, 2], [7, 2], [6, 3], [7, 3]], EYE, dx, Math.min(ly, 0))
    if (pose.eyes === 'half') {
      both([[6, 2], [7, 2]], E.BODY_DARK, dx)
      both([[6, 3], [7, 3]], EYE, dx)
    }
    if (pose.mouth === 'smile') for (const [x, y] of [[11, 6], [12, 6]] as [number, number][]) fine(x, y, EYE)
  }
  const mouthPx: Record<Mouth, [number, number][]> = {
    none: [],
    smile: [],
    grin: [[10, 5], [11, 6], [12, 6], [13, 5]],
    o: [[11, 6], [12, 6], [11, 7], [12, 7]],
    yawn: [[10, 6], [11, 6], [12, 6], [13, 6], [10, 7], [11, 7], [12, 7], [13, 7], [11, 8], [12, 8]],
    flat: [[10, 6], [11, 6], [12, 6], [13, 6]],
    wavy: [[10, 7], [11, 6], [12, 7], [13, 6]],
  }
  if (pose.mouth !== 'smile') for (const [x, y] of mouthPx[pose.mouth]) fine(x, y, EYE)

  // まるいめがね（目が動いても枠の中におさまる）
  if (wear.has('glasses')) {
    const ring = (x0: number) => {
      for (let i = 0; i < 5; i++) {
        put(x0 + i, oy + 1 + dy, GOLD)
        put(x0 + i, oy + 5 + dy, GOLD)
      }
      for (let j = 2; j <= 4; j++) {
        put(x0, oy + j + dy, GOLD)
        put(x0 + 4, oy + j + dy, GOLD)
      }
    }
    ring(4)
    ring(14)
    for (let x = 9; x <= 13; x++) put(x, oy + 2 + dy, GOLD)
  }
  // 白いひげ
  if (wear.has('beard')) {
    for (const [x0, x1, y] of [[8, 15, 8], [9, 14, 9], [11, 12, 10]] as [number, number, number][])
      for (let x = x0; x <= x1; x++) put(x, oy + y + dy, WHITE)
    for (const x of [9, 10, 13, 14]) put(x, oy + 7 + dy, WHITE)
  }
  // 蝶ネクタイ
  if (wear.has('bowtie')) {
    // 赤い蝶ネクタイ（ノートパソコンのふたの上に見える 8〜9 行目）
    for (const [x, y] of [[8, 7], [9, 7], [14, 7], [15, 7], [8, 8], [9, 8], [10, 8], [13, 8], [14, 8], [15, 8]] as [number, number][]) put(x, oy + y + dy, '#C8323C')
    for (const [x, y] of [[11, 8], [12, 8]] as [number, number][]) put(x, oy + y + dy, '#8E1F28')
  }
  // 白いふさふさの髪（指揮者）
  if (wear.has('hair')) {
    for (let x = 5; x <= 20; x++) put(x, oy - 1 + dy, WHITE)
    for (const x of [5, 6, 8, 9, 10, 12, 13, 15, 16, 18, 19]) put(x, oy - 2 + dy, WHITE)
    for (const x of [6, 9, 13, 16, 19]) put(x, oy - 3 + dy, WHITE)
    for (const [x, y] of [[4, 0], [4, 1], [4, 2], [3, 1], [21, 0], [21, 1], [21, 2], [22, 1]] as [number, number][]) put(x, oy + y + dy, WHITE)
  }
  // 角帽（学位帽）と金のふさ
  if (wear.has('cap')) {
    for (let x = 7; x <= 18; x++) put(x, oy - 1 + dy, INK)
    for (let x = 3; x <= 22; x++) put(x, oy - 2 + dy, INK)
    for (let x = 6; x <= 19; x++) put(x, oy - 3 + dy, INK)
    put(12, oy - 3 + dy, GOLD)
    for (const [x, y] of [[13, -3], [16, -3], [19, -2], [22, -1], [22, 0], [22, 1]] as [number, number][]) put(x, oy + y + dy, GOLD)
  }
  // 手前の手の指揮棒・指し棒
  const stick = STICK[pose.front]
  if (pose.hand !== 'none' && stick) {
    const n = pose.hand === 'baton' ? 4 : 6
    const [hx, hy] = stick.at
    for (let k = 1; k <= n; k++) {
      const c = pose.hand === 'baton' ? (k === 1 ? INK : WHITE) : '#8A5A3C'
      put(Math.round(hx + stick.dir[0] * k), Math.round(hy + stick.dir[1] * k) + dy - pose.lift, c)
    }
  }

  // マグ：机の上（scene.ts の corner と同じ形）か、手に持って口もと
  const mug = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, 'f-mug')
    for (let i = 0; i < w; i++) put(x + i, y + 2, '#F2A25C')
  }
  if (pose.mug === 'desk') {
    mug(27, 11, 5, 6)
    for (let i = 0; i < 5; i++) put(27 + i, 11, '#6B4630')
    put(32, 13, 'f-mug')
    put(32, 14, 'f-mug')
  } else if (pose.mug === 'held') {
    mug(16, 5 + dy - pose.lift, 4, 5)
    put(20, 6 + dy - pose.lift, 'f-mug')
    put(20, 7 + dy - pose.lift, 'f-mug')
  }
  overlays(pose, px, { bubble: [16, -11 - pose.lift], top: oy + dy })
  return px
}

// 頭の上のもの（大きい子・小さい子で共通。bubble は吹き出しの左上、top は頭のてっぺんの行）
function overlays(pose: Pose, px: Px, o: { bubble: [number, number]; top: number; small?: boolean }) {
  const put = (x: number, y: number, c: string) => px.put(x, y, c)
  const [bx, by] = o.bubble
  const bw = o.small ? 8 : 13
  const bh = o.small ? 5 : 7
  for (const ov of pose.over) {
    if (ov.startsWith('dots') || ov.startsWith('gear') || ov.startsWith('lines')) {
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const corner = (y === 0 || y === bh - 1) && (x === 0 || x === bw - 1)
          if (!corner) put(bx + x, by + y, 'f-mug')
        }
      if (o.small) put(bx, by + bh + 1, 'f-mug')
      else {
        put(bx + 1, by + 8, 'f-mug')
        put(bx + 2, by + 8, 'f-mug')
        put(bx - 1, by + 10, 'f-mug')
      }
      const cy = by + Math.floor(bh / 2)
      if (ov.startsWith('dots')) {
        const n = Number(ov.slice(4))
        const step = o.small ? 2 : 3
        for (let i = 0; i < n; i++) put(bx + (o.small ? 2 : 3) + i * step, cy, EYE)
      }
      if (ov === 'gear1' || ov === 'gear2') {
        const g = o.small
          ? ov === 'gear1' ? ['.#.', '###', '.#.'] : ['#.#', '.#.', '#.#']
          : ov === 'gear1' ? ['.#.#.', '#####', '##.##', '#####', '.#.#.'] : ['#.#.#', '.###.', '##.##', '.###.', '#.#.#']
        const gx = bx + Math.floor((bw - g.length) / 2)
        const gy = cy - Math.floor(g.length / 2)
        g.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && put(gx + i, gy + j, GEAR)))
      }
      if (ov.startsWith('lines')) {
        const n = Number(ov.slice(5))
        const rows: [number, number][] = n === 1 ? [[2, 4]] : n === 2 ? [[2, 9], [4, 4]] : [[2, 9], [4, 7]]
        for (const [y, len] of rows) for (let i = 0; i < Math.min(len, bw - 4); i++) put(bx + 2 + i, by + y, GEAR)
      }
    }
    if (ov === 'bang') {
      const x = o.small ? bx + 1 : 23
      const y0 = o.small ? o.top - 4 : -6
      for (let y = y0; y <= y0 + (o.small ? 1 : 3); y++) put(x, y, 'f-lamp')
      put(x, y0 + (o.small ? 3 : 5), 'f-lamp')
    }
    if (ov.startsWith('sweat')) {
      const k = Number(ov.slice(5))
      put(22, o.top + k, SWEAT)
      put(22, o.top + 1 + k, SWEAT)
    }
    if (ov === 'speed') for (const y of [5, 8, 11]) for (let x = -5; x <= -3; x++) put(x, y + o.top - 1, 'f-puff')
    if (ov === 'spark1' || ov === 'spark2') {
      const big = ov === 'spark1'
      const pts: [number, number][] = o.small ? [[bx - 4, o.top - 2], [bx + 4, o.top - 1]] : [[-2, -3], [25, -4], [27, 3]]
      for (const [cx, cy] of pts) {
        put(cx, cy, SPARK)
        if (big) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) put(cx + a, cy + b, SPARK)
      }
    }
    if (ov === 'glint') {
      // めがねがキラッ
      for (const [x, y] of [[5, 0], [4, -1], [6, -1], [5, -2], [16, 1]] as [number, number][]) put(x, o.top + y, SPARK)
    }
    if (ov === 'heart') {
      for (const [x, y] of [[23, -5], [25, -5], [22, -4], [23, -4], [24, -4], [25, -4], [26, -4], [23, -3], [24, -3], [25, -3], [24, -2]] as [number, number][]) put(x, y, '#F27A8A')
    }
    if (ov === 'paper') {
      // 頭の上に紙を持ち上げて運ぶ（小さい子）
      for (let x = 1; x <= 6; x++) for (let y = -4; y <= -2; y++) put(bx - 6 + x, o.top + y, WHITE)
      for (let x = 2; x <= 5; x++) put(bx - 6 + x, o.top - 3, '#9AA0B4')
    }
    if (ov === 'puff1' || ov === 'puff2') {
      // ポンと出る・消えるけむり
      const r = ov === 'puff1' ? 2 : 4
      const cx = bx - 2
      const cy = o.top + 3
      for (let a = 0; a < 8; a++) put(Math.round(cx + Math.cos((a * Math.PI) / 4) * r), Math.round(cy + Math.sin((a * Math.PI) / 4) * r), 'f-puff')
    }
  }
}

// ---- 小さいクロードくん（大きい子と同じ並べ方を、1マス＝1ブロックにしたもの） ---------------------
// 足の下が 7 行目。机に立たせるときは translate(x, 9)。
export function paintMini(pose: Pose, out = new Px()): Px {
  const px = pose.shift ? new Px() : out
  if (pose.shift) {
    paintMini({ ...pose, shift: 0 }, px)
    for (const [k, c] of px.m) {
      const [x, y] = k.split(',').map(Number) as [number, number]
      out.put(x + pose.shift, y, c)
    }
    return out
  }
  if (pose.hidden) {
    overlays({ ...pose, over: pose.over.filter(o => o.startsWith('puff')) }, px, { bubble: [6, -6], top: 0, small: true })
    return px
  }
  const put = (x: number, y: number, c: string) => px.put(x, y, c)
  const dy = pose.dy
  const top = 0 - pose.lift
  for (let y = 0; y < 6; y++) for (let x = 2; x < 10; x++) put(x, top + y + dy, E.BODY)
  for (let y = 0; y < 6; y++) put(9, top + y + dy, E.BODY_DARK)
  for (const x of E.LEGS) for (let y = top + 6 + Math.min(dy, 0); y < top + 8; y++) put(x, y, x > 5 ? E.BODY_DARK : E.BODY)
  for (const [x, y] of ARMS[pose.front]) put(x, top + y + dy, E.BODY)
  for (const [x, y] of ARMS[pose.back]) put(11 - x, top + y + dy, E.BODY_DARK)
  const lx = Math.max(-1, Math.min(1, pose.look[0]))
  const eyeY = top + 2 + dy + (pose.look[1] < 0 ? -1 : 0)
  if (pose.eyes === 'open' || pose.eyes === 'wide') {
    put(3 + lx + 1, eyeY, EYE)
    put(7 + lx + 1, eyeY, EYE)
  } else if (pose.eyes === 'closed' || pose.eyes === 'happy' || pose.eyes === 'half') {
    for (const x of [3, 4, 7, 8]) put(x + (lx < 0 ? -1 : 0) + (pose.eyes === 'happy' ? 0 : 0), eyeY, pose.eyes === 'half' ? EYE : E.BODY_DARK)
    if (pose.eyes === 'happy') for (const x of [3, 4, 7, 8]) put(x + (lx < 0 ? -1 : 0), eyeY, EYE)
  }
  if (pose.mouth === 'smile' || pose.mouth === 'grin' || pose.mouth === 'o') {
    put(5 + (lx < 0 ? -1 : 0), top + 3 + dy, EYE)
    put(6 + (lx < 0 ? -1 : 0), top + 3 + dy, EYE)
  }
  if (pose.blush) {
    put(2, top + 3 + dy, BLUSH)
    put(9, top + 3 + dy, BLUSH)
  }
  overlays(pose, px, { bubble: [6, top - 7 + dy], top: top + dy, small: true })
  return px
}

// 後ろの列の小さい子：体を一段暗くして、前の列と分ける
const darken = (px: Px): Px => {
  for (const [k, c] of px.m) px.m.set(k, c === E.BODY ? E.BODY_DARK : c === E.BODY_DARK ? '#94492F' : c)
  return px
}
export const paintMiniBack = (pose: Pose): Px => darken(paintMini(pose))

// ---- 細かいドット版 ----
// 大きい子（細かいドット）：今の絵を 2×2 に分けてから、細かくなったぶんだけ整える。
// 体の上の角を丸める・目を丸くして白い光・閉じた目と口を細いカーブ・めがねと棒を細い線に。
export function paintBigFine(pose: Pose): Px {
  if (pose.hidden) return new Px()
  const f = upscale(paintBig({ ...pose, wear: pose.wear.filter(w => w !== 'glasses'), hand: 'none' }))
  const get = (X: number, Y: number) => f.m.get(`${X},${Y}`)
  const set = (X: number, Y: number, c: string) => f.put(X, Y, c)
  const isBody = (c?: string) => c === E.BODY || c === E.BODY_DARK
  const top = 1 - pose.lift + pose.dy // 体のいちばん上の行（今のマス）
  const T = top * 2
  const [dx, ly] = pose.look
  // 体の上の角を丸める
  for (const [X, Y] of [[10, T], [11, T], [10, T + 1], [41, T], [40, T], [41, T + 1]] as [number, number][]) if (isBody(get(X, Y))) f.m.delete(`${X},${Y}`)
  // 左右の目（今のマスで x0 と、右は 23 - x で返す）
  const eyesAt = (fn: (x0: number, mirror: boolean) => void) => {
    fn(0, false)
    fn(0, true)
  }
  const round = (X: number, Y: number, w: number, h: number) => {
    for (const [a, b] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as [number, number][]) set(X + a, Y + b, E.BODY)
  }
  if (pose.eyes === 'open' || pose.eyes === 'wide') {
    const h = pose.eyes === 'wide' ? 6 : 4
    const y0 = pose.eyes === 'wide' ? top + 1 + Math.min(ly, 0) : top + 2 + ly
    eyesAt((_, mirror) => {
      const X = (mirror ? 16 : 6) * 2 + dx * 2
      const Y = y0 * 2
      round(X, Y, 4, h)
      set(X + 1, Y + 1, '#FFFFFF')
    })
  }
  if (pose.eyes === 'closed') {
    // ︶ のカーブ（閉じた目）
    for (const x0 of [10, 32]) {
      const Y = (top + 3) * 2
      for (let a = 0; a < 6; a++) for (let b = 0; b < 2; b++) set(x0 + a, Y + b, E.BODY)
      set(x0, Y, EYE)
      set(x0 + 5, Y, EYE)
      for (let a = 1; a < 5; a++) set(x0 + a, Y + 1, EYE)
    }
  }
  if (pose.eyes === 'happy') {
    // ^ のアーチを細い線に（各マスの上の段だけ残す）
    for (const [x, y] of [[5, 3], [6, 2], [7, 2], [8, 3], [18, 3], [17, 2], [16, 2], [15, 3]] as [number, number][])
      for (let a = 0; a < 2; a++) set(x * 2 + a, (top + y) * 2 + 1, E.BODY)
  }
  // 口
  const M = (top + 6) * 2
  if (pose.mouth === 'smile') {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) set(22 + a, M + b, E.BODY)
    set(22, M, EYE)
    set(25, M, EYE)
    set(23, M + 1, EYE)
    set(24, M + 1, EYE)
  }
  if (pose.mouth === 'grin' || pose.mouth === 'flat' || pose.mouth === 'wavy') {
    const pts: Record<string, [number, number][]> = {
      grin: [[10, 5], [11, 6], [12, 6], [13, 5]],
      flat: [[10, 6], [11, 6], [12, 6], [13, 6]],
      wavy: [[10, 7], [11, 6], [12, 7], [13, 6]],
    }
    for (const [x, y] of pts[pose.mouth]!) for (let a = 0; a < 2; a++) set(x * 2 + a, (top + y) * 2, E.BODY)
  }
  if (pose.mouth === 'o' || pose.mouth === 'yawn') round(22, M, 4, 4)
  // めがね：細い金の輪（角を落とす）と、細いブリッジ
  if (pose.wear.includes('glasses')) {
    for (const X0 of [8, 28]) {
      const Y0 = (top + 1) * 2
      for (let i = 1; i < 9; i++) {
        set(X0 + i, Y0, GOLD)
        set(X0 + i, Y0 + 9, GOLD)
        set(X0, Y0 + i, GOLD)
        set(X0 + 9, Y0 + i, GOLD)
      }
    }
    for (let X = 18; X <= 27; X++) set(X, (top + 2) * 2, GOLD)
  }
  // 指揮棒・指し棒：細い線
  const stick = STICK[pose.front]
  if (pose.hand !== 'none' && stick) {
    const n = (pose.hand === 'baton' ? 4 : 6) * 2
    const hx = stick.at[0] * 2 + 1
    const hy = (stick.at[1] + pose.dy - pose.lift) * 2 + 1
    for (let k = 1; k <= n; k++) {
      const c = pose.hand === 'baton' ? (k <= 2 ? INK : WHITE) : k > n - 2 ? '#E9DCC8' : '#8A5A3C'
      set(hx + Math.round(stick.dir[0] * k), hy + Math.round(stick.dir[1] * k), c)
    }
  }
  return f
}

// 小さい子（細かいドット）：大きい子の絵を、そのまま小さいマスで描く（顔も同じになる）
export function paintMiniFine(pose: Pose): Px {
  if (pose.hidden) return paintMini(pose)
  const base = paintBig({ ...pose, mug: 'none', wear: [], hand: 'none' })
  const f = new FinePx()
  for (const [k, c] of base.m) {
    const [x, y] = k.split(',').map(Number) as [number, number]
    f.put(x - 1, y - 1, c)
  }
  return f
}
export const paintMiniBackFine = (pose: Pose): Px => darken(paintMiniFine(pose))
