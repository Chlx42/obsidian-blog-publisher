import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { BlogPublisherSettings, BlogRunnerState, SyncSummary } from '../types'
import { classifyLine, detectRuntime, isPortOpen, spawnCommand, terminateProcess } from './runtime'
import type { BlogStore } from './store'

const PREVIEW_HOST = '127.0.0.1'
const PREVIEW_TIMEOUT_MS = 30_000

/** 预览、同步、发布三个流程的状态机。不碰任何 UI，只写 store。 */
export class TaskRunner {
  private previewProcess: ChildProcess | null = null
  private previewSync: Promise<void> | null = null

  constructor(
    private settings: BlogPublisherSettings,
    private store: BlogStore,
    /** Vault 绝对路径，作为 BLOG_VAULT_ROOT 传给发布器。 */
    private vaultRoot: string
  ) {}

  updateSettings(settings: BlogPublisherSettings) {
    this.settings = settings
  }

  setVaultRoot(vaultRoot: string) {
    this.vaultRoot = vaultRoot
  }

  detectedRuntimePath(): string | null {
    const runtime = detectRuntime(this.settings)
    return runtime?.executable ?? null
  }

  getPreviewUrl(): string {
    return `http://${PREVIEW_HOST}:${this.settings.previewPort}/`
  }

  canAutoSync(): boolean {
    return (
      this.settings.previewMode === 'development' &&
      this.previewProcess !== null &&
      this.previewProcess.exitCode === null
    )
  }

  isPreviewing(): boolean {
    return this.previewProcess !== null && this.previewProcess.exitCode === null
  }

  async togglePreview(): Promise<boolean> {
    if (this.isPreviewing()) {
      await this.stopPreview()
      return false
    }

    this.assertIdle()
    this.assertRepository()
    this.store.clearLogs()
    this.store.setResult(null)
    await this.ensureDependencies()

    try {
      if (this.settings.previewMode === 'development') {
        this.setState('syncing')
        await this.runCommand(this.settings.commands.sync)
      } else {
        this.setState('building')
        await this.runCommand(this.settings.commands.build)
        await this.runCommand(this.settings.commands.build)
      }
    } catch (error) {
      this.setState('idle')
      throw error
    }

    if (await isPortOpen(PREVIEW_HOST, this.settings.previewPort)) {
      this.setState('idle')
      throw new Error(`预览端口 ${this.settings.previewPort} 已被占用`)
    }

    this.setState('starting-preview')
    const previewCommand =
      this.settings.previewMode === 'development'
        ? this.settings.commands.devPreview
        : this.settings.commands.prodPreview
    this.previewProcess = this.spawn(previewCommand)
    const preview = this.previewProcess
    const logStart = this.store.getState().logs.length

    preview.once('exit', (code, signal) => {
      // 旧进程的退出事件不该覆盖新进程的状态。
      if (this.previewProcess !== preview) return
      this.previewProcess = null
      this.store.setPreviewUrl(null)
      if (['previewing', 'starting-preview', 'syncing'].includes(this.store.getState().task)) {
        this.log(
          `预览服务已退出 (${signal ?? code ?? 'unknown'})`,
          code === 0 || signal ? 'info' : 'error'
        )
        this.setState('idle')
      }
    })

    try {
      await this.waitForPreview(preview, logStart)
      this.store.setPreviewUrl(this.getPreviewUrl())
      this.setState('previewing')
      return true
    } catch (error) {
      await terminateProcess(preview)
      if (this.previewProcess === preview) this.previewProcess = null
      this.setState('idle')
      throw error
    }
  }

  async syncPreviewContent(): Promise<void> {
    if (!this.canAutoSync()) return
    if (this.previewSync) return this.previewSync

    const preview = this.previewProcess
    this.setState('syncing')
    const sync = this.runCommand(this.settings.commands.sync)
    this.previewSync = sync
    try {
      await sync
    } finally {
      this.previewSync = null
      if (this.previewProcess === preview && preview?.exitCode === null) {
        this.setState('previewing')
      } else {
        this.setState('idle')
      }
    }
  }

  async publish(): Promise<void> {
    if (this.isPreviewing()) await this.stopPreview()
    this.assertIdle()
    this.assertRepository()
    this.store.clearLogs()
    this.store.setResult(null)
    await this.ensureDependencies()

    this.setState('publishing')
    try {
      await this.runCommand(this.settings.commands.publish)
    } finally {
      this.setState('idle')
    }
  }

  async stopPreview(): Promise<void> {
    const preview = this.previewProcess
    if (!preview || preview.exitCode !== null) {
      this.previewProcess = null
      this.store.setPreviewUrl(null)
      this.setState('idle')
      return
    }

    this.setState('stopping-preview')
    await terminateProcess(preview)
    if (this.previewProcess === preview) this.previewProcess = null
    this.store.setPreviewUrl(null)
    this.setState('idle')
  }

  private assertIdle() {
    if (this.store.getState().task !== 'idle') throw new Error('博客任务正在运行，请稍候')
  }

  private assertRepository() {
    if (!this.settings.blogRepository.trim()) {
      throw new Error('请先在插件设置中填写博客仓库路径')
    }
    if (!existsSync(join(this.settings.blogRepository, 'package.json'))) {
      throw new Error('博客仓库路径无效：找不到 package.json')
    }
    if (!this.vaultRoot) throw new Error('无法确定 Vault 路径，请重新加载插件')
    const runtime = detectRuntime(this.settings)
    if (!runtime) {
      throw new Error(`找不到 ${this.settings.runtime}，请在插件设置中填写完整路径`)
    }
  }

  private async ensureDependencies() {
    if (existsSync(join(this.settings.blogRepository, 'node_modules'))) return
    this.setState('installing')
    await this.runCommand(this.settings.commands.install)
  }

  private runCommand(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = this.spawn(args)
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0) return resolve()
        // 退出码是失败的权威来源，单独记一行确保「只看错误」一定有东西可看。
        const message = `命令执行失败 (${signal ?? code ?? 'unknown'})`
        this.log(message, 'error')
        reject(new Error(message))
      })
    })
  }

  private spawn(args: string[]): ChildProcess {
    const runtime = detectRuntime(this.settings)
    if (!runtime) {
      throw new Error(`找不到 ${this.settings.runtime}，请在插件设置中填写完整路径`)
    }

    this.log(`$ ${runtime.label} ${args.join(' ')}`, 'info')
    return spawnCommand(runtime, args, {
      cwd: this.settings.blogRepository,
      vaultRoot: this.vaultRoot,
      articlesFolder: this.settings.articlesFolder,
      port: this.settings.previewPort,
      host: PREVIEW_HOST,
      onLine: (line) => this.handleLine(line)
    })
  }

  /** 结果行只喂给 store，不进日志，否则日志里会出现一坨 JSON。 */
  private handleLine(line: string) {
    const trimmed = line.trim()
    const prefix = this.settings.resultLinePrefix
    if (prefix && trimmed.startsWith(prefix)) {
      const payload = trimmed.slice(prefix.length)
      try {
        this.store.setResult(JSON.parse(payload) as SyncSummary)
      } catch {
        // 结果行解析失败不该让整个任务挂掉，退化成普通日志。
        this.log(line, classifyLine(line))
      }
      return
    }
    this.log(line, classifyLine(line))
  }

  private log(text: string, level: 'info' | 'error') {
    this.store.appendLog(text, level)
  }

  private setState(state: BlogRunnerState) {
    this.store.setTask(state)
  }

  /** 日志里出现预览地址、或端口通了，都算启动成功。 */
  private async waitForPreview(preview: ChildProcess, logStart: number) {
    const deadline = Date.now() + PREVIEW_TIMEOUT_MS
    const url = this.getPreviewUrl()
    while (Date.now() < deadline) {
      if (preview.exitCode !== null) throw new Error('预览服务启动失败，请查看日志')
      if (this.store.getState().logs.slice(logStart).some((entry) => entry.text.includes(url))) {
        return
      }
      if (await isPortOpen(PREVIEW_HOST, this.settings.previewPort)) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`预览服务启动超时：端口 ${this.settings.previewPort}`)
  }
}
