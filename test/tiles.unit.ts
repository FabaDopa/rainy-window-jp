import { test } from 'node:test'
import assert from 'node:assert/strict'

// 見た目のタブの小さな絵（hooks/clawd/tiles.ts）と、SVG を t = 0 で止める関数（freezeSvg）。
// 拡張子なしの import は test/setup.mjs（--import）で .ts を補って読む。
const T = await import('../hooks/clawd/tiles.ts')
const L = await import('../hooks/clawd/layer.ts')
const { styleOf } = await import('../hooks/scene.ts')
const { roomColors } = await import('../hooks/lib/palette.ts')
const { buildSprite } = await import('../hooks/clawd/sheet.ts')
const { paintBig, paintBigFine, paintMini, paintMiniFine } = await import('../hooks/clawd/paint.ts')
const { scriptsFor } = await import('../hooks/clawd/scripts.ts')
const { PAL } = await import('../hooks/clawd/fx.ts')
const { YOU } = await import('../hooks/clawd/pose.ts')

const LOOKS = ['sonnet', 'haiku', 'opus', 'fable'] as const
const LEVELS = [0, 1, 2, 3, 4] as const
const DOTS = ['normal', 'fine'] as const
const RAINBOW = ['#FF4D4D', '#FF9F1A', '#FFE14D', '#4DE07A', '#4DC9FF', '#6B6BFF', '#C25BFF']
const ROOM = roomColors('紺', '夜')
const ids = (s: string) => [...s.matchAll(/ id="([^"]+)"/g)].map(m => m[1]!)
const count = (s: string, sub: string) => s.split(sub).length - 1
const tags = (s: string) => new Set([...s.matchAll(/<([A-Za-z]+)/g)].map(m => m[1]!))
const ALLOWED = new Set(['svg', 'style', 'defs', 'pattern', 'mask', 'linearGradient', 'stop', 'circle', 'rect', 'path', 'g'])

// ---- freezeSvg：SMIL の絵を、文書の時刻 0 の姿のまま止める ----

test('freezeSvg：animate は、その属性を最初の値（values の1つ目、無ければ from）にして消える', () => {
  assert.equal(
    T.freezeSvg('<svg><g opacity="1"><animate attributeName="opacity" values="0.4;1" dur="1s" repeatCount="indefinite"/><rect x="0" y="0" width="1" height="1"/></g></svg>'),
    '<svg><g opacity="0.4"><rect x="0" y="0" width="1" height="1"/></g></svg>',
  )
  assert.equal(T.freezeSvg('<svg><rect x="0" width="1"><animate attributeName="x" from="5" to="9" dur="1s"/></rect></svg>'), '<svg><rect x="5" width="1"/></svg>')
  // 無い属性は、うしろに足す（色の切りかえ：discrete）
  assert.equal(
    T.freezeSvg('<svg><path d="M0 0h1v1h-1z"><animate attributeName="fill" values="#FF4D4D;#FF9F1A" calcMode="discrete" dur="1.2s" repeatCount="indefinite"/></path></svg>'),
    '<svg><path d="M0 0h1v1h-1z" fill="#FF4D4D"/></svg>',
  )
})

test('freezeSvg：animateTransform は type（translate・rotate・scale）の transform にする。元の transform は SMIL のとおり（標準は置きかえ、sum は続ける）', () => {
  assert.equal(
    T.freezeSvg('<svg><g><animateTransform attributeName="transform" type="translate" from="0 0" to="1 -6" dur="2s" repeatCount="indefinite"/><rect/></g></svg>'),
    '<svg><g transform="translate(0 0)"><rect/></g></svg>',
  )
  assert.equal(
    T.freezeSvg('<svg><g opacity=".7"><animateTransform attributeName="transform" type="rotate" from="0 12.5 5.5" to="360 12.5 5.5" dur="9s" repeatCount="indefinite"/><path d="M0 0"/></g></svg>'),
    '<svg><g opacity=".7" transform="rotate(0 12.5 5.5)"><path d="M0 0"/></g></svg>',
  )
  // 元の transform がある：標準（additive="replace"）は、動いている間の値が元の値の代わりになる
  assert.equal(
    T.freezeSvg('<svg><g transform="translate(3 4)"><animateTransform attributeName="transform" type="scale" values="0.3;1.08;1" keyTimes="0;0.7;1" dur="0.2s" repeatCount="1" fill="freeze"/><rect/></g></svg>'),
    '<svg><g transform="scale(0.3)"><rect/></g></svg>',
  )
  // additive="sum" は、元の transform のあとに続ける
  assert.equal(
    T.freezeSvg('<svg><g transform="translate(3 4)"><animateTransform attributeName="transform" type="scale" values="2;1" dur="1s" additive="sum"/><rect/></g></svg>'),
    '<svg><g transform="translate(3 4) scale(2)"><rect/></g></svg>',
  )
})

test('freezeSvg：begin がずれているものは、文書の時刻 0 での値（負の begin＝もう動いている。正の begin＝まだ元の値）', () => {
  assert.equal(
    T.freezeSvg('<svg><g><animate attributeName="opacity" from="1" to="0" dur="2s" begin="-1.00s" repeatCount="indefinite"/><rect/></g></svg>'),
    '<svg><g opacity="0.5"><rect/></g></svg>',
  )
  assert.equal(
    T.freezeSvg('<svg><g><animateTransform attributeName="transform" type="translate" values="0 -18;0 14" dur="2s" begin="-0.50s" repeatCount="indefinite"/><rect/></g></svg>'),
    '<svg><g transform="translate(0 -10)"><rect/></g></svg>',
  )
  assert.equal(
    T.freezeSvg('<svg><g opacity="0"><animate attributeName="opacity" values="0;1" keyTimes="0;0.5" calcMode="discrete" dur="1s" begin="-0.6s" repeatCount="indefinite"/><rect/></g></svg>'),
    '<svg><g opacity="1"><rect/></g></svg>',
  )
  assert.equal(T.freezeSvg('<svg><g opacity="0.3"><animate attributeName="opacity" values="1;0.5" dur="1s" begin="0.5s"/><rect/></g></svg>'), '<svg><g opacity="0.3"><rect/></g></svg>')
  // 1回だけで、もう終わったもの：fill="freeze" は最後の値、そうでなければ元の値
  assert.equal(T.freezeSvg('<svg><g opacity="0.3"><animate attributeName="opacity" values="1;0.6" dur="1s" begin="-2s" fill="freeze"/><rect/></g></svg>'), '<svg><g opacity="0.6"><rect/></g></svg>')
  assert.equal(T.freezeSvg('<svg><g opacity="0.3"><animate attributeName="opacity" values="1;0.6" dur="1s" begin="-2s"/><rect/></g></svg>'), '<svg><g opacity="0.3"><rect/></g></svg>')
})

test('freezeSvg：見えないもの（opacity 0・display none）は、子ごと落とす。空になった g も落とす', () => {
  assert.equal(
    T.freezeSvg(
      '<svg><g opacity="0"><rect/></g><g display="none"><rect/></g>' +
        '<g opacity="1"><animate attributeName="opacity" values="0;1" dur="1s"/><rect/></g>' +
        '<g><animate attributeName="opacity" values="1;0" dur="1s"/></g><g><rect x="1"/></g></svg>',
    ),
    '<svg><g><rect x="1"/></g></svg>',
  )
})

test('freezeSvg：コマ送りのスプライトは最初のコマだけが残る。animate は1つも残らず、もう一度止めても同じ', () => {
  const [script] = scriptsFor('sonnet', 'write', 2)
  const sprite = buildSprite(script!, paintBig)
  assert.equal(T.freezeSvg(`<svg>${sprite.body}</svg>`), `<svg><g opacity="1">${paintBig(script![0]![0]).svg()}</g></svg>`)
  for (const look of LOOKS)
    for (const dots of DOTS) {
      const v = { look, phase: 'write', effect: 4, tempo: 4, showEffect: true, dots, subagents: 2, arrive: [1], leave: [2] } as const
      const frozen = T.freezeSvg(L.clawdLayerSvg({ ...v, arrive: [...v.arrive], leave: [...v.leave] }))
      assert.ok(!frozen.includes('<animate') && !frozen.includes('<set'), `${look}/${dots}`)
      assert.equal(T.freezeSvg(frozen), frozen)
    }
})

// ---- 絵の外・薄いものを落とす（cropSvg）と、見た目の変わらない書き直し（compactSvg） ----

test('cropSvg：絵の外の形と、とても薄いもの（opacity を重ねて 0.1 未満）を落とす。path は M ごとに。読めないものは残す', () => {
  const view = { x: 0, y: 0, w: 10, h: 10 }
  assert.equal(T.cropSvg('<rect x="20" y="0" width="1" height="1"/><rect x="5" y="5" width="1" height="1"/>', view), '<rect x="5" y="5" width="1" height="1"/>')
  // transform をたどる（平行移動・拡大・回転）
  assert.equal(T.cropSvg('<g transform="translate(15 0)"><rect x="0" y="0" width="1" height="1"/></g>', view), '')
  assert.equal(T.cropSvg('<g transform="translate(15 0) scale(.5)"><rect x="-20" y="0" width="1" height="1"/></g>', view), '<rect x="-20" y="0" width="1" height="1" transform="translate(15 0) scale(.5)"/>')
  assert.equal(T.cropSvg('<g transform="rotate(180 0 0)"><circle cx="-5" cy="-5" r="1"/></g>', view), '<circle cx="-5" cy="-5" r="1" transform="rotate(180 0 0)"/>')
  // path：外の部分だけ落とす
  assert.equal(T.cropSvg('<path fill="#000" d="M1 1h1v1h-1zM30 1h1v1h-1zM2 3L4 5"/>', view), '<path fill="#000" d="M1 1h1v1h-1zM2 3L4 5"/>')
  assert.equal(T.cropSvg('<path fill="#000" d="M30 1h1v1h-1z"/>', view), '')
  // 薄いもの
  assert.equal(T.cropSvg('<g opacity="0.3"><rect x="1" y="1" width="1" height="1" opacity="0.3"/><rect x="3" y="3" width="1" height="1"/></g>', view), '<rect x="3" y="3" width="1" height="1" opacity="0.3"/>')
  // 読めない transform・形の分からないものは残す
  assert.equal(T.cropSvg('<g transform="skewX(10)"><rect x="50" y="0" width="1" height="1"/></g>', view), '<rect x="50" y="0" width="1" height="1" transform="skewX(10)"/>')
  assert.equal(T.cropSvg('<path d="M50 50C60 60 70 70 80 80"/>', view), '<path d="M50 50C60 60 70 70 80 80"/>')
})

test('compactSvg：長方形の path は縦につながるものをまとめる（塗る場所は同じ）。何もしない transform・属性の無い g をほどき、子1つの g は子に移す', () => {
  assert.equal(T.compactSvg('<path fill="#000" d="M1 0h2v1h-2zM1 1h2v1h-2zM0 2h0.5v0.5h-0.5zM1 2h2v1h-2z"/>'), '<path fill="#000" d="M1 0h2v3h-2zM0 2h.5v.5h-.5z"/>')
  // 横はばの違うものはまとめない・長方形でない path はそのまま
  assert.equal(T.compactSvg('<path d="M0 0h2v1h-2zM0 1h3v1h-3z"/>'), '<path d="M0 0h2v1h-2zM0 1h3v1h-3z"/>')
  assert.equal(T.compactSvg('<path d="M0 0L1 1"/>'), '<path d="M0 0L1 1"/>')
  assert.equal(T.compactSvg('<g transform="translate(0 0)"><rect/><rect/></g>'), '<rect/><rect/>')
  assert.equal(T.compactSvg('<g opacity="1"><rect opacity="1.00"/><rect/></g>'), '<rect/><rect/>')
  assert.equal(T.compactSvg('<g opacity="0.5"><g opacity="0.5"><rect x="1" y="1"/></g></g>'), '<rect x="1" y="1" opacity="0.25"/>')
  assert.equal(T.compactSvg('<g transform="translate(2 3)" opacity="0.5"><rect x="1" y="1"/></g>'), '<rect x="3" y="4" opacity="0.5"/>')
  assert.equal(T.compactSvg('<g transform="scale(2)"><path d="M0 0L1 1"/></g>'), '<path d="M0 0L1 1" transform="scale(2)"/>')
  // mask の付いた g・子が2つの g は、そのまま
  assert.equal(T.compactSvg('<g mask="url(#c0)"><rect/></g>'), '<g mask="url(#c0)"><rect/></g>')
  assert.equal(T.compactSvg('<g opacity="0.5"><rect/><rect/></g>'), '<g opacity="0.5"><rect/><rect/></g>')
})

// ---- 小さな絵（タイル） ----

test('タイル：横 96・縦 72、クロードくんのまわりを切り出した viewBox、自分の style とマスク', () => {
  assert.equal(T.TILE_W, 96)
  assert.equal(T.TILE_H, 72)
  for (const dots of DOTS) {
    const svg = T.lookTileSvg('fable', dots, ROOM)
    const head = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="96" height="72" viewBox="([-\d. ]+)">/.exec(svg)
    assert.ok(head !== null, svg.slice(0, 120))
    const [x, y, w, h] = head[1]!.split(' ').map(Number) as [number, number, number, number]
    assert.ok(Math.abs(w / h - 96 / 72) < 1e-9)
    // 黒板（左上 -10, -12）からマグの取っ手（右 33）まで、足もと（17）まで入る
    assert.ok(x <= -10 && x + w >= 33 && y <= -12 && y + h >= 17, head[1])
    assert.ok(svg.includes('<style>') && svg.includes(dots === 'fine' ? 'id="fm0"' : 'id="c0"'))
    assert.ok(!svg.includes(dots === 'fine' ? 'id="c0"' : 'id="fm0"'))
  }
})

test('姿のタイル：落ち着いて机に（待つの最初のコマを、こちらを見てにっこり）。小物つき。動きなし・12,000 文字以下・id は重ならない', () => {
  for (const look of LOOKS)
    for (const dots of DOTS) {
      const name = `${look}/${dots}`
      const svg = T.lookTileSvg(look, dots, ROOM)
      assert.ok(!svg.includes('<animate') && !svg.includes('<set'), name)
      assert.ok(svg.length <= 12_000, `${name}: ${svg.length}`)
      const all = ids(svg)
      assert.equal(new Set(all).size, all.length, `${name}: id が重なる`)
      for (const [, id] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(all.includes(id!), `${name}: #${id} が無い`)
      for (const tag of tags(svg)) assert.ok(ALLOWED.has(tag), `${name}: <${tag}>`)
      // 小物
      if (look === 'opus') assert.ok(svg.includes('#3A3340') && !svg.includes('#8E95A8'), `${name}: 譜面台だけ`)
      if (look === 'fable') assert.ok(svg.includes('#2F4A3A') && svg.includes('#8E95A8'), `${name}: 黒板とノートパソコン`)
      if (look === 'sonnet') assert.ok(svg.includes(L.LAPTOP) && !svg.includes('#3A3340'), `${name}: ノートパソコン`)
      // Haiku：小さいノートパソコン3つ（細かいドットの小さいノートパソコンは、大きいものを半分にした絵）
      if (look === 'haiku') assert.equal(count(svg, '#8E95A8'), 3, `${name}: 小さいノートパソコン3つ`)
      if (look === 'haiku' && dots === 'normal') assert.ok(!svg.includes(L.LAPTOP), `${name}: 大きいノートパソコンは無い`)
      // 待つの最初のコマを、こちらを見てにっこり（Fable の待つは黒板を見ているが、タイルではこちらを見る）
      const big = dots === 'fine' ? paintBigFine : paintBig
      const mini = dots === 'fine' ? paintMiniFine : paintMini
      const paint = look === 'haiku' ? mini : big
      for (const s of scriptsFor(look, 'wait', 1)) {
        const first = s[0]![0]
        const pose = { ...first, look: YOU, mouth: 'smile' as const }
        // タイルの path は、同じ場所を塗るまま短く書き直してあるので（compactSvg）、同じ書き直しをして探す
        assert.ok(svg.includes(T.compactSvg(paint(pose).svg())), `${name}: 待つの最初のコマ`)
        if (look === 'fable') assert.ok(!svg.includes(T.compactSvg(big(first).svg())), `${name}: 黒板を見ているコマではない`)
      }
      // 演出は無い
      for (const bad of ['#1FD16B', '#FF2D45', '#E8102E', ...RAINBOW]) assert.ok(!svg.includes(bad), `${name}: ${bad}`)
    }
})

test('演出のタイル：書いているところに、その演出の最初のコマ。動きなし・12,000 文字以下・id は重ならない・演出の印', () => {
  for (const look of LOOKS)
    for (const dots of DOTS)
      for (const level of LEVELS) {
        const name = `${look}/${dots}/${level}`
        const svg = T.effectTileSvg(look, level, dots, ROOM)
        assert.ok(!svg.includes('<animate') && !svg.includes('<set'), name)
        assert.ok(svg.length <= 12_000, `${name}: ${svg.length}`)
        const all = ids(svg)
        assert.equal(new Set(all).size, all.length, `${name}: id が重なる`)
        for (const [, id] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(all.includes(id!), `${name}: #${id} が無い`)
        for (const tag of tags(svg)) assert.ok(ALLOWED.has(tag), `${name}: <${tag}>`)
        // 姿の小物
        assert.ok(svg.includes(look === 'opus' ? '#3A3340' : '#8E95A8'), `${name}: 小物`)
        if (look === 'fable') assert.ok(svg.includes('#2F4A3A'), `${name}: 黒板`)
        // 演出の印
        const has = (c: string) => svg.includes(c)
        if (level === 0) for (const bad of ['#1FD16B', '#FF2D45', '#E8102E', PAL[look].outer, ...RAINBOW]) assert.ok(!has(bad), `${name}: ${bad}`)
        if (level === 1) assert.ok(has('#1FD16B'), `${name}: 数字の雨`)
        if (level === 2) assert.ok(has(PAL[look].outer), `${name}: 炎の色`)
        if (level === 3) assert.ok(RAINBOW.some(has), `${name}: 虹色`)
        if (level === 4) assert.ok(has('#FF2D45') && has('#E8102E'), `${name}: 暴走`)
      }
  // 演出なしは、書くの最初のコマ（吹き出しの行1本。動きの速さは、カードで「なし」を選んだときと同じふつう）
  for (const look of ['sonnet', 'opus', 'fable'] as const) {
    const first = scriptsFor(look, 'write', 1)[0]![0]![0]
    assert.ok(T.effectTileSvg(look, 0, 'normal', ROOM).includes(T.compactSvg(paintBig(first).svg())), look)
  }
})

test('タイルの style：使う class だけ。色は部屋の styleOf と同じ値', () => {
  for (const room of [ROOM, roomColors('緑', '朝'), undefined]) {
    const full = styleOf(room)
    for (const svg of [T.lookTileSvg('opus', 'fine', room), T.effectTileSvg('haiku', 4, 'normal', room), T.effectTileSvg('fable', 1, 'fine', room)]) {
      const style = /<style>([^<]*)<\/style>/.exec(svg)![1]!
      assert.ok(style.length < full.length / 2, `${style.length}`)
      const used = new Set([...svg.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1]!.split(' ')))
      for (const cls of used) assert.ok(style.includes(`.${cls}{`), `.${cls} の決まりが無い`)
      const head = /^svg\{([^}]*)\}/.exec(style)![1]!
      for (const decl of head.split(';')) assert.ok(full.includes(decl), `styleOf と違う：${decl.slice(0, 40)}`)
      for (const [, name] of style.matchAll(/var\(--([A-Za-z0-9]+)\)/g)) assert.ok(head.includes(`--${name}:`), `--${name} が無い`)
    }
  }
})

test('clawdTiles：姿は 自動（いまのモデルの姿）と4つ、演出は 自動（いまの effort、分からなければなし）となし〜max。全部で 80,000 文字以下', () => {
  let worst = 0
  const levels = { none: 0, medium: 1, high: 2, xhigh: 3, max: 4 } as const
  for (const autoLook of LOOKS)
    for (const look of LOOKS)
      for (const dots of DOTS)
        for (const autoLevel of [0, 4] as const) {
          const t = T.clawdTiles({ autoLook, look, autoLevel, dots, room: ROOM })
          assert.deepEqual(Object.keys(t.looks), ['auto', 'sonnet', 'haiku', 'opus', 'fable'])
          assert.deepEqual(Object.keys(t.effects), ['auto', 'none', 'medium', 'high', 'xhigh', 'max'])
          assert.equal(t.looks.auto, T.lookTileSvg(autoLook, dots, ROOM))
          for (const l of LOOKS) assert.equal(t.looks[l], T.lookTileSvg(l, dots, ROOM))
          assert.equal(t.effects.auto, T.effectTileSvg(look, autoLevel, dots, ROOM))
          for (const [k, level] of Object.entries(levels)) assert.equal(t.effects[k as keyof typeof levels], T.effectTileSvg(look, level, dots, ROOM))
          const total = [...Object.values(t.looks), ...Object.values(t.effects)].reduce((n, s) => n + s.length, 0)
          worst = Math.max(worst, total)
        }
  assert.ok(worst <= 80_000, `${worst}`)
})

test('タイル：同じ入力なら同じ文字列（カードを描き直しても変わらない）', () => {
  for (const look of LOOKS) {
    assert.equal(T.lookTileSvg(look, 'normal', ROOM), T.lookTileSvg(look, 'normal', roomColors('紺', '夜')))
    assert.equal(T.effectTileSvg(look, 3, 'fine', ROOM), T.effectTileSvg(look, 3, 'fine', roomColors('紺', '夜')))
  }
})
