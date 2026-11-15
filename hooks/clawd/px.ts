// 1コマの点（マス）を集めて path にする、純粋な道具。
// 色ごとに横の並びを1本の path にまとめる（sheet.ts と同じ書き方）。

export class Px {
  m = new Map<string, string>()
  put(x: number, y: number, c: string) {
    this.m.set(`${x},${y}`, c)
  }
  has(x: number, y: number) {
    return this.m.has(`${x},${y}`)
  }
  // sheet.ts と同じく、色ごとに横の並びを1本の path にまとめる
  svg(): string {
    const byColor = new Map<string, string[]>()
    const keys = [...this.m.keys()].map(k => k.split(',').map(Number) as [number, number])
    const ys = [...new Set(keys.map(([, y]) => y))].sort((a, b) => a - b)
    for (const y of ys) {
      const xs = keys.filter(([, yy]) => yy === y).map(([x]) => x).sort((a, b) => a - b)
      let i = 0
      while (i < xs.length) {
        const x = xs[i] as number
        const c = this.m.get(`${x},${y}`) as string
        let w = 1
        while (i + w < xs.length && xs[i + w] === x + w && this.m.get(`${x + w},${y}`) === c) w++
        const runs = byColor.get(c) ?? []
        runs.push(`M${x} ${y}h${w}v1h-${w}z`)
        byColor.set(c, runs)
        i += w
      }
    }
    return [...byColor].map(([c, d]) => `<path ${c.startsWith('f-') ? `class="${c}"` : `fill="${c}"`} d="${d.join('')}"/>`).join('')
  }
}

// ---- 細かいドット（点の間隔を半分：6px → 3px） ----
// 1マスを 2×2 の小さいマスに分けて描く。書き出すときは、2×2 が同じ色のところは1マスで書き、
// 違うところだけ小さいマス（scale(.5) の中）で書いて、文字数をおさえる。
export class FinePx extends Px {
  svg(): string {
    const coarse = new Px()
    const fine = new Px()
    const cells = new Set<string>()
    for (const k of this.m.keys()) {
      const [x, y] = k.split(',').map(Number) as [number, number]
      cells.add(`${Math.floor(x / 2)},${Math.floor(y / 2)}`)
    }
    for (const cell of cells) {
      const [cx, cy] = cell.split(',').map(Number) as [number, number]
      const subs = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => this.m.get(`${cx * 2 + a!},${cy * 2 + b!}`))
      if (subs.every(c => c !== undefined && c === subs[0])) coarse.put(cx, cy, subs[0]!)
      else subs.forEach((c, i) => c && fine.put(cx * 2 + (i % 2), cy * 2 + (i > 1 ? 1 : 0), c))
    }
    const f = fine.svg()
    return coarse.svg() + (f ? `<g transform="scale(.5)">${f}</g>` : '')
  }
}
export function upscale(px: Px): FinePx {
  const f = new FinePx()
  for (const [k, c] of px.m) {
    const [x, y] = k.split(',').map(Number) as [number, number]
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]] as [number, number][]) f.put(x * 2 + a, y * 2 + b, c)
  }
  return f
}
