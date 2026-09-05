// stamp a build id into the served shell before upload. the deploy workflow
// runs this with the short commit sha; locally the shell stays on 'dev'.
//
//   node tools/stamp-build.mjs <build-id> [dir]
//
// two rewrites, and both must land or this exits 1: the sw cache name (a new
// name per deploy is what makes a content-only deploy reach a returning
// player without anyone remembering to bump it) and the build id in the
// about dialog (so a phone can say which build it runs, and so index.html
// itself changes per deploy, which is what the update banner compares).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REWRITES = [
  { file: 'sw.js', pattern: /const CACHE = 'shootit-[\w-]+'/, to: id => `const CACHE = 'shootit-${id}'` },
  { file: 'index.html', pattern: /<span id="build">[\w-]+<\/span>/, to: id => `<span id="build">${id}</span>` },
]

export function stamp(id, dir = '.') {
  if (!/^[\w-]{1,40}$/.test(id)) throw new Error(`bad build id: ${JSON.stringify(id)}`)
  for (const { file, pattern, to } of REWRITES) {
    const path = join(dir, file)
    const text = readFileSync(path, 'utf8')
    if (!pattern.test(text)) throw new Error(`${file}: no build id to stamp (expected ${pattern})`)
    writeFileSync(path, text.replace(pattern, to(id)))
  }
  return REWRITES.map(r => r.file)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [id, dir] = process.argv.slice(2)
  if (!id) {
    console.error('usage: node tools/stamp-build.mjs <build-id> [dir]')
    process.exit(1)
  }
  try {
    console.log(`stamped ${id} into ${stamp(id, dir).join(', ')}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
