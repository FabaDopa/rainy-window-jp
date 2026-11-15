// mod の中の import は拡張子なし（mod の決まり）なので、Node でテストするときだけ .ts を補う。
// 使い方：node --experimental-strip-types --import ./test/setup.mjs --test "test/*.unit.ts"
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function resolve(spec, context, next) {' +
        ' try { return await next(spec, context) } catch (error) {' +
        ' if (spec.startsWith(".") && !/[.](ts|tsx|js|mjs|cjs)$/.test(spec)) return next(spec + ".ts", context);' +
        ' throw error } }',
    ),
)
