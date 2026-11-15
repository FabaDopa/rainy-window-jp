// /rj のカードの2つのタブ（背景・クロードくん）。純粋な関数だけ。
// タブはボタンだけ：選んだタブのボタンは濃いボタン（primary。ターミナルはラベルの終わりに ✓ も。register.tsx の markerFor）。

export type Tab = 'room' | 'clawd'

export const TABS: readonly Tab[] = ['room', 'clawd']

export const TAB_LABEL: Record<Tab, string> = { room: '背景', clawd: 'クロードくん' }

export function isTab(value: unknown): value is Tab {
  return (TABS as readonly unknown[]).includes(value)
}
