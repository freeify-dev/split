import fs from 'node:fs'
import { build } from 'esbuild'

fs.rmSync('dist', { recursive: true, force: true })

await build({
  entryPoints: { index: 'src/index.ts', backup: 'scripts/backup.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: 'dist',
  external: ['better-sqlite3'], // native module stays in node_modules
  banner: {
    // some bundled CJS deps call require() at runtime; give the ESM bundle one
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  sourcemap: true,
  logLevel: 'info',
})

fs.cpSync('drizzle', 'dist/drizzle', { recursive: true })
console.log('server built → dist/ (index.js, backup.js, drizzle/)')
