import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, resolve } from 'node:path'

import type { BlogPublisherSettings, LogLevel, RuntimeType } from '../types'

/**
 * git 和 bun 都往 stderr 写进度，只按流分级会把「来自 github.com…」标成错误，
 * 「只看错误」就没意义了。所以按内容判断，命令真的失败时另有一行汇总日志兜底。
 */
// 中文没有空格分词，不能要求前后是词边界。
const CHINESE_ERROR_PATTERN = /失败|错误|无法|不能为空|冲突|找不到/
// 英文靠边界避免命中 errors.md 这类无关词。
const ASCII_ERROR_PATTERN = /(^|\s)(error|failed|fail|fatal|cannot|unexpected|✗)([:：\s]|$)/i

export function classifyLine(line: string): LogLevel {
  if (CHINESE_ERROR_PATTERN.test(line)) return 'error'
  return ASCII_ERROR_PATTERN.test(line) ? 'error' : 'info'
}

export interface RuntimeConfig {
  type: RuntimeType
  executable: string
  label: string
}

/** macOS 图形应用拿不到 shell 的 PATH，只能按常见位置探测。 */
const RUNTIME_CANDIDATES: Array<{ type: RuntimeType; label: string; paths: string[] }> = [
  {
    type: 'bun',
    label: 'Bun',
    paths: ['/opt/homebrew/bin/bun', '/usr/local/bin/bun', '/usr/bin/bun', '~/.bun/bin/bun']
  },
  {
    type: 'npm',
    label: 'npm',
    paths: ['/opt/homebrew/bin/npm', '/usr/local/bin/npm', '/usr/bin/npm']
  },
  {
    type: 'pnpm',
    label: 'pnpm',
    paths: ['/opt/homebrew/bin/pnpm', '/usr/local/bin/pnpm', '/usr/bin/pnpm']
  },
  {
    type: 'yarn',
    label: 'Yarn',
    paths: ['/opt/homebrew/bin/yarn', '/usr/local/bin/yarn', '/usr/bin/yarn']
  }
]

function getRuntimeCandidates(
  preferred: RuntimeType
): Array<{ type: RuntimeType; label: string; paths: string[] }> {
  if (preferred === 'bun') return RUNTIME_CANDIDATES
  const preferredEntry = RUNTIME_CANDIDATES.find((e) => e.type === preferred)
  const others = RUNTIME_CANDIDATES.filter((e) => e.type !== preferred)
  return preferredEntry ? [preferredEntry, ...others] : RUNTIME_CANDIDATES
}

/** 探测顺序：优先探测用户选择的运行时，其次按 Bun → npm → pnpm → yarn */
export function detectRuntime(settings: BlogPublisherSettings): RuntimeConfig | null {
  if (settings.runtime === 'custom') {
    const path = settings.customRuntimePath.trim()
    if (!path) return null
    return existsSync(path) ? { type: 'custom', executable: path, label: basename(path) } : null
  }

  const candidates = getRuntimeCandidates(settings.runtime)
  for (const { paths, type, label } of candidates) {
    for (const path of paths) {
      const resolved = path.startsWith('~') ? resolve(homedir(), path.slice(2)) : path
      const absolutePath = isAbsolute(resolved) ? resolved : resolve(homedir(), resolved)
      if (existsSync(absolutePath)) {
        return { type, executable: absolutePath, label }
      }
    }
  }
  return null
}

export interface SpawnOptions {
  cwd: string
  vaultRoot: string
  articlesFolder: string
  port?: number
  host?: string
  onLine: (line: string) => void
}

export function spawnCommand(
  runtime: RuntimeConfig,
  args: string[],
  options: SpawnOptions
): ChildProcess {
  // 替换占位符
  const resolvedArgs = args.map((arg) =>
    arg.replace('<port>', String(options.port ?? '')).replace('<host>', options.host ?? '')
  )

  // macOS 图形应用拿不到 shell 的 PATH，子进程里的 git、node 都得靠这里补齐。
  const path = [
    dirname(runtime.executable),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    process.env.PATH ?? ''
  ].join(':')

  const child = spawn(runtime.executable, resolvedArgs, {
    cwd: options.cwd,
    env: {
      ...process.env,
      PATH: path,
      // 插件设置是文章目录的唯一来源，避免发布器再维护一份。
      BLOG_VAULT_ROOT: options.vaultRoot,
      BLOG_ARTICLES_FOLDER: options.articlesFolder
    },
    // 单独一个进程组，停止预览时才能连 astro dev 的子进程一起杀掉。
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const capture = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) options.onLine(line)
    }
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  return child
}

export function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

/** 先 SIGTERM 整个进程组，2 秒内没退再 SIGKILL。 */
export async function terminateProcess(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']).once('exit', () => resolve())
    })
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }

  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000))
  ])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}
