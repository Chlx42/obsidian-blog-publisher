import { App, Notice, PluginSettingTab, Setting, type Plugin } from 'obsidian'

import { loadValidatorResult } from '../core/article-status'
import { detectFrameworkAt } from '../core/framework'
import { DEFAULT_COMMANDS, type BlogPublisherSettings, type RuntimeType } from '../types'

/** 插件主类需要暴露给设置页的部分，避免设置页依赖整个插件类型。 */
export interface SettingsHost extends Plugin {
  settings: BlogPublisherSettings
  saveSettings(): Promise<void>
  detectedRuntimePath(): string | null
  articleCount(): number
}

export class BlogPublisherSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private host: SettingsHost
  ) {
    super(app, host)
  }

  display() {
    const { containerEl } = this
    containerEl.empty()
    new Setting(containerEl).setName('Blog Publisher').setHeading()

    // 基础配置
    const detectedFramework = detectFrameworkAt(this.host.settings.blogRepository)
    new Setting(containerEl)
      .setName('博客仓库路径')
      .setDesc(
        detectedFramework
          ? `已识别为 ${detectedFramework.label} 项目，文章将同步到 ${detectedFramework.contentHint}`
          : '包含 package.json 的本地目录，填好后会自动识别框架'
      )
      .addText((text) =>
        text
          .setPlaceholder('/path/to/blog')
          .setValue(this.host.settings.blogRepository)
          .onChange(async (value) => {
            this.host.settings.blogRepository = value.trim()
            await this.host.saveSettings()
            // 路径变了，框架提示和「一键配置」的可用性都要跟着变。
            this.display()
          })
      )

    if (detectedFramework) {
      const matchesPreset =
        JSON.stringify(this.host.settings.commands) ===
        JSON.stringify(detectedFramework.commands)
      new Setting(containerEl)
        .setName('一键配置命令')
        .setDesc(
          matchesPreset
            ? `命令已是 ${detectedFramework.label} 预设，无需改动`
            : `把六条命令一次填成 ${detectedFramework.label} 预设`
        )
        .addButton((button) => {
          button
            .setButtonText(matchesPreset ? '已配置' : `套用 ${detectedFramework.label} 预设`)
            .onClick(async () => {
              this.host.settings.commands = { ...detectedFramework.commands }
              await this.host.saveSettings()
              new Notice(`已套用 ${detectedFramework.label} 预设`)
              this.display()
            })
          button.setDisabled(matchesPreset)
          if (!matchesPreset) button.setCta()
        })
    }

    new Setting(containerEl)
      .setName('文章文件夹')
      .setDesc(`相对于当前 Vault 的博客笔记目录，当前识别到 ${this.host.articleCount()} 篇`)
      .addText((text) =>
        text.setValue(this.host.settings.articlesFolder).onChange(async (value) => {
          this.host.settings.articlesFolder = value.trim().replace(/^\/+|\/+$/g, '')
          await this.host.saveSettings()
          this.display()
        })
      )

    new Setting(containerEl).setName('预览端口').addText((text) =>
      text.setValue(String(this.host.settings.previewPort)).onChange(async (value) => {
        const port = Number(value)
        if (Number.isInteger(port) && port > 0 && port <= 65_535) {
          this.host.settings.previewPort = port
          await this.host.saveSettings()
        }
      })
    )

    new Setting(containerEl)
      .setName('预览模式')
      .setDesc('开发预览显示草稿并支持自动刷新；生产预览与线上构建一致')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('development', '开发预览')
          .addOption('production', '生产预览')
          .setValue(this.host.settings.previewMode)
          .onChange(async (value) => {
            if (value !== 'development' && value !== 'production') return
            this.host.settings.previewMode = value
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('保存后自动同步')
      .setDesc('仅在开发预览运行时生效')
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.autoSyncOnSave).onChange(async (value) => {
          this.host.settings.autoSyncOnSave = value
          await this.host.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('博客地址')
      .setDesc('用于「复制博客地址」功能')
      .addText((text) =>
        text
          .setPlaceholder('https://example.com')
          .setValue(this.host.settings.siteUrl)
          .onChange(async (value) => {
            this.host.settings.siteUrl = value.trim()
            await this.host.saveSettings()
          })
      )

    // 探测成功就不必打扰用户，只在探测失败时留在顶层 —— 那种情况必须手动处理。
    const detectedRuntime = this.host.detectedRuntimePath()
    const runtimeHost = detectedRuntime
      ? containerEl.createEl('details', { cls: 'blog-publisher-advanced' })
      : containerEl
    if (runtimeHost !== containerEl) {
      runtimeHost.createEl('summary', { text: `运行时（已找到 ${detectedRuntime}）` })
    } else {
      new Setting(containerEl).setName('运行时').setHeading()
    }

    new Setting(runtimeHost)
      .setName('包管理器')
      .setDesc(
        detectedRuntime
          ? `自动探测到：${detectedRuntime}`
          : '未探测到，请手动选择或填写自定义路径'
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption('bun', 'Bun')
          .addOption('npm', 'npm')
          .addOption('pnpm', 'pnpm')
          .addOption('yarn', 'Yarn')
          .addOption('custom', '自定义路径')
          .setValue(this.host.settings.runtime)
          .onChange(async (value) => {
            this.host.settings.runtime = value as RuntimeType
            await this.host.saveSettings()
            this.display()
          })
      )

    if (this.host.settings.runtime === 'custom') {
      new Setting(runtimeHost)
        .setName('可执行文件路径')
        .setDesc('完整的运行时路径（如 /usr/local/bin/node）')
        .addText((text) =>
          text
            .setPlaceholder('/usr/local/bin/bun')
            .setValue(this.host.settings.customRuntimePath)
            .onChange(async (value) => {
              this.host.settings.customRuntimePath = value.trim()
              await this.host.saveSettings()
            })
        )
    }

    // 高级项默认折叠：识别到框架后套一次预设就够了，日常不用看这些。
    const advanced = containerEl.createEl('details', { cls: 'blog-publisher-advanced' })
    advanced.createEl('summary', { text: '高级设置' })

    new Setting(advanced).setName('命令配置').setHeading()
    new Setting(advanced).setDesc(
      '用空格分隔参数。<port> 和 <host> 会被替换为实际值。留空则使用默认命令。'
    )

    const commandLabels: Record<keyof typeof DEFAULT_COMMANDS, string> = {
      install: '安装依赖',
      sync: '同步文章',
      build: '构建博客',
      publish: '发布博客',
      devPreview: '开发预览',
      prodPreview: '生产预览'
    }

    for (const key of Object.keys(DEFAULT_COMMANDS) as Array<keyof typeof DEFAULT_COMMANDS>) {
      new Setting(advanced).setName(commandLabels[key]).addText((text) =>
        text
          .setPlaceholder(DEFAULT_COMMANDS[key].join(' '))
          .setValue(this.host.settings.commands[key].join(' '))
          .onChange(async (value) => {
            this.host.settings.commands[key] = value.trim().split(/\s+/).filter(Boolean)
            await this.host.saveSettings()
          })
      )
    }

    new Setting(advanced)
      .setName('恢复默认命令')
      .setDesc('把命令配置重置为 Astro + Bun 预设')
      .addButton((button) =>
        button.setButtonText('重置').onClick(async () => {
          this.host.settings.commands = { ...DEFAULT_COMMANDS }
          await this.host.saveSettings()
          this.display()
        })
      )

    new Setting(advanced)
      .setName('结果行前缀')
      .setDesc('构建脚本输出结构化结果时使用的前缀，留空则不解析')
      .addText((text) =>
        text
          .setPlaceholder('__BLOG_RESULT__')
          .setValue(this.host.settings.resultLinePrefix)
          .onChange(async (value) => {
            this.host.settings.resultLinePrefix = value.trim()
            await this.host.saveSettings()
          })
      )

    const validatorSetting = new Setting(advanced)
      .setName('文章校验器')
      .setDesc('可选。指向导出 collectArticleIssues 的 JS 文件，留空则只检查 publish 字段')

    // 路径填错时校验会静默跳过，所有文章都显示「可发布」。把失败原因摆出来。
    const validatorStatus = advanced.createDiv({ cls: 'blog-publisher-validator-status' })
    const renderValidatorStatus = () => {
      const { error } = loadValidatorResult(this.host.settings.customValidatorPath)
      const configured = this.host.settings.customValidatorPath.trim().length > 0
      validatorStatus.empty()
      if (error) {
        validatorStatus.addClass('is-error')
        validatorStatus.setText(`校验器未生效：${error}。当前只检查 publish 字段。`)
      } else if (configured) {
        validatorStatus.removeClass('is-error')
        validatorStatus.setText('校验器已加载。')
      }
    }

    validatorSetting.addText((text) =>
      text
        .setPlaceholder('/path/to/validator.js')
        .setValue(this.host.settings.customValidatorPath)
        .onChange(async (value) => {
          this.host.settings.customValidatorPath = value.trim()
          await this.host.saveSettings()
          renderValidatorStatus()
        })
    )
    renderValidatorStatus()
  }
}
