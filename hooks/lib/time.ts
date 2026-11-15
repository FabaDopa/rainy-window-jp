// 日本時間（Asia/Tokyo）の時・分・秒と、そこから決まる時間帯と時計の針の角度。
// PC のタイムゾーンに関係なく、いつも日本時間で答える。AI もネットワークも使わない。

export type Band = '朝' | '昼' | '夕方' | '夜'

export const BANDS: readonly Band[] = ['朝', '昼', '夕方', '夜']

const JST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** その瞬間の、日本時間の時（0〜23）・分・秒。 */
export function jstParts(date: Date): { hour: number; minute: number; second: number } {
  let hour = 0
  let minute = 0
  let second = 0
  for (const part of JST.formatToParts(date)) {
    if (part.type === 'hour') hour = Number(part.value) % 24
    else if (part.type === 'minute') minute = Number(part.value)
    else if (part.type === 'second') second = Number(part.value)
  }
  return { hour, minute, second }
}

/** 朝 5〜10時、昼 10〜16時、夕方 16〜19時、夜 19〜5時（開始を含み、終わりを含まない）。 */
export function bandOf(date: Date): Band {
  const { hour } = jstParts(date)
  if (hour >= 5 && hour < 10) return '朝'
  if (hour >= 10 && hour < 16) return '昼'
  if (hour >= 16 && hour < 19) return '夕方'
  return '夜'
}

/** 時計の針の角度（12時の向きが 0 度、時計回り）。どれも 0 以上 360 未満。 */
export function clockAngles(date: Date): { hourDeg: number; minuteDeg: number; secondDeg: number } {
  const { hour, minute, second } = jstParts(date)
  const wrap = (deg: number) => ((deg % 360) + 360) % 360
  return {
    hourDeg: wrap(((hour % 12) + minute / 60) * 30),
    minuteDeg: wrap((minute + second / 60) * 6),
    secondDeg: wrap(second * 6),
  }
}

/** 手元の絵をそのまま使ってよい長さ。これより古い絵は、出し直しを頼まれたときに今の時刻で作り直す。 */
export const SCENE_FRESH_MS = 60_000

/**
 * 時計の針は絵を作った時刻から動き出すので、古い絵をあとで出し直すと、その間の分だけ針が遅れる。
 * 作っていない・1分より古い・未来に作った（PC の時計が戻った）なら true。
 */
export function isSceneStale(madeAtMs: number | undefined, nowMs: number, maxAgeMs: number = SCENE_FRESH_MS): boolean {
  if (madeAtMs === undefined) return true
  const age = nowMs - madeAtMs
  return age < 0 || age > maxAgeMs
}
