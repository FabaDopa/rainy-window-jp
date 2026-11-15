// rainy-window-jp の $.state の約束。画面に出すための値（カードと、クロードくんの今の様子）だけを置く（保存する設定は $.store）。

/** カードで選んでいる項目。押すとすぐ見た目が変わり、「保存して閉じる」で保存する。 */
export type RjDraft = {
  /** 背景色。なし＝オフ。 */
  theme: '紺' | '緑' | '桜' | '橙' | '灰' | 'なし'
  /** 時間帯：自動、または決めた時間帯。 */
  time: '自動' | '朝' | '昼' | '夕方' | '夜'
  /** 明るさ（カードには出さない。保存されていた値を引き継ぐ）。 */
  brightness: 'system' | 'dark' | 'light'
  /** 保存先。 */
  scope: 'global' | 'project' | 'session'
  /** クロードくんの姿：自動（モデルに合わせる）、または決めた姿。 */
  look: 'auto' | 'sonnet' | 'haiku' | 'opus' | 'fable'
  /** クロードくんの演出：自動（effort に合わせる）、または決めた段階（low は演出なし）。 */
  effect: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** クロードくんのドット：ふつう・細かい。 */
  dots: 'normal' | 'fine'
}

/** 入力欄の上のカード（shape は card-6。card-5 までで書かれた古い値（タブの動きの印 tabFrom・tabMoving つきなど）は、初期値＝閉じたカードとして読む）。 */
export type RjCard = {
  /** カードが出ている。 */
  isOpen: boolean
  /** 入力欄の上に出す（会話の中に置けない画面）。 */
  inBand: boolean
  draft: RjDraft | null
  /** 「保存してある設定：…」の行。 */
  nowLine: string
  /** 押して見ている選択が、まだ保存されていない。 */
  previewing: boolean
  /** いま開いているタブ：背景（room）・クロードくん（clawd）。開いたときは room。 */
  tab: 'room' | 'clawd'
}

/** クロードくんの今の様子。Backdrop の1枚の絵は、これが変わると描き直される（shape は clawd-3）。 */
export type RjClawd = {
  /** 状態：待つ・！・考え中・道具・書く・やった・手をふる。 */
  phase: 'wait' | 'alert' | 'think' | 'tool' | 'write' | 'done' | 'wave'
  /** いまのモデル（モデルの見張りと、メインの turn.step から）。'' のあいだは、会話の始めに読んだモデル。 */
  model: string
  /** いまの effort（メインの turn.step でしか分からない。ステップのはじめごとに置き直し、そのステップに effort が無ければ ''＝分からない・無い）。 */
  effort: string
  /** 動いているサブエージェントの数（status が running・pending のもの、5人まで）。 */
  subagents: number
  /** いま来た・帰ったサブエージェントの子の場所。前の書き込みからの増減だけで、次の書き込みで空になる。 */
  arrive: number[]
  leave: number[]
  /** 保存してあるクロードくんの設定（姿・演出・ドット）。 */
  choice: {
    look: 'auto' | 'sonnet' | 'haiku' | 'opus' | 'fable'
    effect: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    dots: 'normal' | 'fine'
  }
}

declare module 'claude-code' {
  interface PluginState {
    'rainy-window-jp': { card: Shaped<RjCard>; clawd: Shaped<RjClawd> }
  }
}
