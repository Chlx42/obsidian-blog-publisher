import { lstat } from 'node:fs/promises'
import { relative } from 'node:path'

import { loadBlogConfig, repositoryRoot, type BlogSyncConfig } from './config'
import { syncBlog, type SyncResult } from './core'

type Command = 'sync' | 'build' | 'publish'

/**
 * Obsidian 插件解析这一行拿结构化结果，人类可读的输出保持原样。
 * 前缀要和 obsidian-plugin/src/types.ts 的 RESULT_LINE_PREFIX 一致。
 */
const RESULT_LINE_PREFIX = '__BLOG_RESULT__'

type PublishOutcome = {
  committed: boolean
  pushed: boolean
}

/** 只认 --json，其余位置参数留给命令名。 */
function parseArgs(argv: string[]): { command: Command; json: boolean } {
  const positional = argv.filter((arg) => !arg.startsWith('-'))
  const command = (positional[0] ?? 'sync') as Command
  if (!['sync', 'build', 'publish'].includes(command)) {
    throw new Error(`未知命令: ${command}`)
  }
  return { command, json: argv.includes('--json') }
}

function printResultLine(
  command: Command,
  result: SyncResult,
  outcome?: PublishOutcome
): void {
  // slug 取自 manifest 而不是 frontmatter，manifest 才是实际生成结果。
  const slugs: Record<string, string> = {}
  for (const [source, entry] of Object.entries(result.manifest.entries)) {
    slugs[source] = entry.slug
  }
  const payload = {
    command,
    initialized: result.initialized,
    published: result.published,
    removed: result.removed,
    slugs,
    ...outcome
  }
  console.log(`${RESULT_LINE_PREFIX}${JSON.stringify(payload)}`)
}

async function run(command: string, args: string[], options?: { stdout?: 'inherit' | 'pipe' }) {
  const shouldCaptureOutput = options?.stdout === 'pipe'
  const child = Bun.spawn([command, ...args], {
    cwd: repositoryRoot,
    stdin: 'inherit',
    stdout: shouldCaptureOutput ? 'pipe' : 'inherit',
    stderr: 'inherit'
  })
  const output = shouldCaptureOutput && child.stdout ? await new Response(child.stdout).text() : ''
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败`)
  return output.trim()
}

async function currentBranch(): Promise<string> {
  return run('git', ['branch', '--show-current'], { stdout: 'pipe' })
}

async function ensurePublishBase(): Promise<void> {
  await run('git', ['fetch', 'origin', 'main'])
  const ancestorCheck = await Bun.spawn(
    ['git', 'merge-base', '--is-ancestor', 'origin/main', 'HEAD'],
    {
      cwd: repositoryRoot,
      stdout: 'ignore',
      stderr: 'inherit'
    }
  ).exited
  if (ancestorCheck !== 0) throw new Error('本地 main 已落后或分叉，请先同步 origin/main')

  const aheadSubjects = await run('git', ['log', '--format=%s', 'origin/main..HEAD'], {
    stdout: 'pipe'
  })
  if (
    aheadSubjects &&
    aheadSubjects.split('\n').some((subject) => subject !== 'content: sync obsidian blog')
  ) {
    throw new Error('本地 main 存在尚未推送的非博客提交，请先单独推送这些提交')
  }
}

function printResult(result: Awaited<ReturnType<typeof syncBlog>>) {
  if (result.initialized.length) {
    console.log(`已补齐模板: ${result.initialized.length} 篇`)
    for (const file of result.initialized) console.log(`  + ${file}`)
  }
  console.log(`已同步文章: ${result.published.length} 篇`)
  for (const file of result.published) console.log(`  → ${file}`)
  if (result.removed.length) {
    console.log(`已移除生成文章: ${result.removed.length} 篇`)
    for (const slug of result.removed) console.log(`  - ${slug}`)
  }
}

async function sync(config: BlogSyncConfig) {
  const result = await syncBlog(config)
  printResult(result)
  return result
}

async function build(config: BlogSyncConfig) {
  const result = await sync(config)
  await run('bun', ['run', 'build'])
  return result
}

async function publish(
  config: BlogSyncConfig
): Promise<{ result: SyncResult; outcome: PublishOutcome }> {
  const branch = await currentBranch()
  if (branch !== 'main') throw new Error(`blog:publish 只能在 main 分支运行，当前分支为 ${branch}`)
  await ensurePublishBase()

  const result = await build(config)
  const candidatePathspecs = [
    relative(repositoryRoot, config.manifestPath),
    ...result.touchedOutputPaths.map((path) => relative(repositoryRoot, path))
  ]
  const trackedOutput = await run('git', ['ls-files', '--', ...candidatePathspecs], {
    stdout: 'pipe'
  })
  const trackedPathspecs = trackedOutput ? trackedOutput.split('\n') : []
  const existingPathspecs = (
    await Promise.all(
      candidatePathspecs.map(async (path) => {
        try {
          await lstat(`${repositoryRoot}/${path}`)
          return path
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw error
        }
      })
    )
  ).filter((path): path is string => path !== null)
  const pathspecs = [...new Set([...trackedPathspecs, ...existingPathspecs])]

  await run('git', ['add', '-A', '--', ...pathspecs])
  const changed = await Bun.spawn(['git', 'diff', '--cached', '--quiet', '--', ...pathspecs], {
    cwd: repositoryRoot,
    stdout: 'ignore',
    stderr: 'inherit'
  }).exited

  let committed = false
  let pushed = false

  if (changed === 0) {
    console.log('生成内容没有变化，无需提交。')
    await run('git', ['push', 'origin', 'main'])
    pushed = true
    return { result, outcome: { committed, pushed } }
  }
  if (changed !== 1) throw new Error('无法检查待提交的博客内容')

  await run('git', ['commit', '--only', '-m', 'content: sync obsidian blog', '--', ...pathspecs])
  committed = true
  await run('git', ['push', 'origin', 'main'])
  pushed = true
  return { result, outcome: { committed, pushed } }
}

const { command, json } = parseArgs(process.argv.slice(2))

try {
  const config = loadBlogConfig()
  if (command === 'sync') {
    const result = await sync(config)
    if (json) printResultLine(command, result)
  }
  if (command === 'build') {
    const result = await build(config)
    if (json) printResultLine(command, result)
  }
  if (command === 'publish') {
    const { result, outcome } = await publish(config)
    if (json) printResultLine(command, result, outcome)
  }
} catch (error) {
  console.error(error instanceof Error ? `发布失败: ${error.message}` : error)
  process.exitCode = 1
}
