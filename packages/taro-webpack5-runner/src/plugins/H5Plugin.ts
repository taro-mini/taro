import { FRAMEWORK_MAP, SCRIPT_EXT } from '@tarojs/helper'
import { AppConfig } from '@tarojs/taro'
import { VirtualModule } from '@tarojs/webpack5-prebundle/dist/h5'
import { defaults } from 'lodash'
import path from 'path'
import webpack, { Compiler, LoaderContext } from 'webpack'

import H5AppInstance from '../utils/H5AppInstance'

const PLUGIN_NAME = 'H5Plugin'

interface IH5PluginOptions {
  appPath: string
  sourceDir: string
  routerConfig: any
  entryFileName: string
  framework: FRAMEWORK_MAP
  frameworkExts: string[]
  useHtmlComponents: boolean
  deviceRatio: any
  designWidth: number
  prebundle?: boolean
  loaderMeta?: Record<string, string>
}

export default class H5Plugin {
  options: IH5PluginOptions
  appEntry: string
  appConfig: AppConfig
  pagesConfigList = new Map<string, string>()
  pages = new Set<{name: string, path: string}>()
  inst: H5AppInstance

  constructor (options = {}) {
    this.options = defaults(options || {}, {
      appPath: '',
      sourceDir: '',
      routerConfig: {},
      entryFileName: 'app',
      framework: FRAMEWORK_MAP.NERV,
      frameworkExts: SCRIPT_EXT,
      useHtmlComponents: false,
      deviceRatio: {},
      designWidth: 750,
      prebundle: false
    })
  }

  tryAsync = fn => async (arg, callback) => {
    try {
      await fn(arg)
      callback()
    } catch (err) {
      callback(err)
    }
  }

  apply (compiler: Compiler) {
    const { entry } = compiler.options
    this.inst = new H5AppInstance(entry, this.options)
    compiler.hooks.run.tapAsync(
      PLUGIN_NAME,
      this.tryAsync(() => {
        this.run()
      })
    )
    compiler.hooks.watchRun.tapAsync(
      PLUGIN_NAME,
      this.tryAsync(() => {
        this.run()
      })
    )

    compiler.hooks.compilation.tap(PLUGIN_NAME, compilation => {
      webpack.NormalModule.getCompilationHooks(compilation).loader.tap(PLUGIN_NAME, (_loaderContext: LoaderContext<any>, module: webpack.NormalModule) => {
        const { framework, entryFileName, appPath, sourceDir, designWidth, deviceRatio, loaderMeta, prebundle, routerConfig } = this.options
        const { dir, name } = path.parse(module.resource)
        const suffixRgx = /\.(boot|config)/
        if (!suffixRgx.test(name)) return

        const filePath = path.join(dir, name)
        const pageName = filePath.replace(sourceDir + (process.platform === 'win32' ? '\\' : '/'), '').replace(suffixRgx, '')
        const routerMode = routerConfig?.mode || 'hash'
        const isMultiRouterMode = routerMode === 'multi'
        const isApp = !isMultiRouterMode && pageName === entryFileName
        const bootstrap = prebundle && !/\.boot$/.test(name)
        if (isApp || this.inst.pagesConfigList.has(pageName)) {
          if (bootstrap) {
            const bootPath = path.relative(appPath, path.join(sourceDir, `${isMultiRouterMode ? pageName : entryFileName}.boot.js`))
            VirtualModule.writeModule(bootPath, '/** bootstrap application code */')
          }

          module.loaders.push({
            loader: '@tarojs/taro-loader/lib/h5',
            options: {
              bootstrap,
              config: {
                router: this.options.routerConfig,
                ...this.inst.appConfig
              },
              entryFileName,
              filename: name.replace(suffixRgx, ''),
              framework,
              loaderMeta,
              pages: this.inst.pagesConfigList,
              pxTransformConfig: {
                designWidth,
                deviceRatio
              },
              sourceDir,
              useHtmlComponents: this.options.useHtmlComponents
            },
            ident: null,
            type: null
          })
        }
      })
    })
  }

  run () {
    delete this.inst.__appConfig
    delete this.inst.__pages
    delete this.inst.__pagesConfigList
  }
}
