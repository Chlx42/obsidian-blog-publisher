import { build } from 'esbuild'

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron'],
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  outfile: 'main.js',
  sourcemap: false,
  logLevel: 'info'
})

// 校验器由插件在运行时 require()，必须单独编译成 CJS。
await build({
  entryPoints: ['src/validators/astro.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  outfile: 'validators/astro.js',
  sourcemap: false,
  logLevel: 'info'
})
