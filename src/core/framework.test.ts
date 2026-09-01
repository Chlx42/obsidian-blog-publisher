import { describe, expect, test } from 'bun:test'

import { detectFramework, detectFrameworkAt, detectRuntimeFromManifest } from './framework'

/** 只声明存在的文件，其余一律不存在。 */
function probe(...present: string[]) {
  const set = new Set(present)
  return (relative: string) => set.has(relative)
}

describe('detectFramework', () => {
  test('认出 Astro 的 ts 配置', () => {
    const preset = detectFramework(probe('astro.config.ts'))
    expect(preset?.id).toBe('astro')
    expect(preset?.commands.sync).toEqual(['run', 'blog', '--json'])
  })

  test('认出 Astro 的 mjs 配置', () => {
    expect(detectFramework(probe('astro.config.mjs'))?.id).toBe('astro')
  })

  test('认出 Hugo', () => {
    const preset = detectFramework(probe('hugo.toml'))
    expect(preset?.id).toBe('hugo')
    expect(preset?.contentHint).toBe('content/posts/')
  })

  test('Hexo 靠 scaffolds 认出来，不靠共用的 _config.yml', () => {
    expect(detectFramework(probe('_config.yml', 'scaffolds'))?.id).toBe('hexo')
  })

  test('只有 _config.yml 和 Gemfile 时判为 Jekyll', () => {
    expect(detectFramework(probe('_config.yml', 'Gemfile'))?.id).toBe('jekyll')
  })

  test('裸 _config.yml 归 Jekyll，因为 Hexo 标志没命中', () => {
    expect(detectFramework(probe('_config.yml'))?.id).toBe('jekyll')
  })

  test('认不出来时返回 null，不瞎猜', () => {
    expect(detectFramework(probe('package.json'))).toBeNull()
  })

  test('预设的六条命令都非空', () => {
    for (const marker of ['astro.config.ts', 'hugo.toml', 'scaffolds', 'Gemfile']) {
      const preset = detectFramework(probe(marker))
      expect(preset).not.toBeNull()
      for (const args of Object.values(preset!.commands)) {
        expect(args.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('detectFrameworkAt', () => {
  test('路径为空时不探测', () => {
    expect(detectFrameworkAt('')).toBeNull()
    expect(detectFrameworkAt('   ')).toBeNull()
  })
})

describe('detectRuntimeFromManifest', () => {
  test('从 packageManager 取运行时并丢掉版本号', () => {
    expect(detectRuntimeFromManifest({ packageManager: 'pnpm@9.1.0' })).toBe('pnpm')
    expect(detectRuntimeFromManifest({ packageManager: 'bun@1.3.12' })).toBe('bun')
  })

  test('没有版本号也能认', () => {
    expect(detectRuntimeFromManifest({ packageManager: 'yarn' })).toBe('yarn')
  })

  test('字段缺失或不认识时返回 null', () => {
    expect(detectRuntimeFromManifest({})).toBeNull()
    expect(detectRuntimeFromManifest({ packageManager: 'deno@2' })).toBeNull()
    expect(detectRuntimeFromManifest(null)).toBeNull()
    expect(detectRuntimeFromManifest('pnpm')).toBeNull()
  })
})
