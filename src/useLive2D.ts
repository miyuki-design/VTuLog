import { useRef, useState, useCallback, useEffect } from 'react'

export const LIVE2D_CANVAS_SIZE = 512

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface Live2DDiagnostics {
  fileCount: number
  model3Name: string | null
  mocFile: string | null
  textureCount: number
  physicsFile: string | null
  // NetworkError fields from pixi-live2d-display
  networkErrorUrl?: string
  networkErrorStatus?: number | null
  networkErrorAborted?: boolean
  networkErrorStack?: string
}

export type Live2DStatus = 'idle' | 'loading' | 'loaded' | 'error'

const EMPTY_DIAG: Live2DDiagnostics = {
  fileCount: 0,
  model3Name: null,
  mocFile: null,
  textureCount: 0,
  physicsFile: null,
}

// ──────────────────────────────────────────────
// Cubism Core dynamic loader
// ──────────────────────────────────────────────
async function loadCubismCore(): Promise<void> {
  if ((window as any).Live2DCubismCore) return

  const tryScript = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = url
      s.onload = () => resolve()
      s.onerror = () => { s.remove(); reject() }
      document.head.appendChild(s)
    })

  try {
    await tryScript('https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js')
  } catch {
    try {
      await tryScript('/live2dcubismcore.min.js')
    } catch {
      throw new Error(
        'Cubism Core が読み込めませんでした。\n' +
        'Live2D 公式サイトから SDK をダウンロードし、\n' +
        'live2dcubismcore.min.js を /public/ に配置してください。'
      )
    }
  }
}

// ──────────────────────────────────────────────
// Scan files for diagnostics (no blob URL creation)
// ──────────────────────────────────────────────
function scanFiles(files: File[]): Live2DDiagnostics {
  const diag: Live2DDiagnostics = { ...EMPTY_DIAG, fileCount: files.length }

  const model3File = files.find(f => f.name.endsWith('.model3.json'))
  diag.model3Name = model3File?.name ?? null

  diag.mocFile = files.find(f => f.name.endsWith('.moc3'))?.name ?? null
  diag.physicsFile = files.find(f => f.name.endsWith('physics3.json'))?.name ?? null
  diag.textureCount = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name)).length

  return diag
}

// ──────────────────────────────────────────────
// Parse NetworkError from pixi-live2d-display
// ──────────────────────────────────────────────
function parseNetworkError(e: unknown): {
  message: string
  url?: string
  status?: number | null
  aborted?: boolean
  stack?: string
} {
  if (!e || typeof e !== 'object') return { message: String(e) }
  const err = e as any
  return {
    message: err.message ?? 'Network error',
    url:     err.url     ?? undefined,
    status:  typeof err.status  === 'number' ? err.status  : undefined,
    aborted: typeof err.aborted === 'boolean' ? err.aborted : undefined,
    stack:   typeof err.stack   === 'string'  ? err.stack   : undefined,
  }
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useLive2D() {
  const pixiAppRef          = useRef<any>(null)
  const pixiCanvasRef       = useRef<HTMLCanvasElement | null>(null)
  const loadedRef           = useRef(false)
  const settingsObjectURLRef = useRef<string | null>(null)

  const [status,      setStatus]      = useState<Live2DStatus>('idle')
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)
  const [modelName,   setModelName]   = useState('')
  const [diagnostics, setDiagnostics] = useState<Live2DDiagnostics | null>(null)

  const cleanup = useCallback(() => {
    if (pixiAppRef.current) {
      try { pixiAppRef.current.destroy(true) } catch { /* ignore */ }
      pixiAppRef.current = null
    }
    if (settingsObjectURLRef.current) {
      try { URL.revokeObjectURL(settingsObjectURLRef.current) } catch { /* ignore */ }
      settingsObjectURLRef.current = null
    }
    pixiCanvasRef.current = null
    loadedRef.current = false
    setStatus('idle')
    setErrorMsg(null)
    setDiagnostics(null)
  }, [])

  const loadModel = useCallback(async (files: File[]) => {
    cleanup()
    setStatus('loading')

    // Show file inventory immediately
    const diag = scanFiles(files)
    setDiagnostics(diag)

    const initialName = diag.model3Name?.replace('.model3.json', '') ?? 'モデル'
    setModelName(initialName)

    if (!diag.model3Name) {
      setErrorMsg('.model3.json が見つかりません（フォルダごと選択されましたか？）')
      setStatus('error')
      return
    }

    try {
      // ── Cubism Core ──
      await loadCubismCore()

      // ── PixiJS v7 ──
      // pixi-live2d-display 0.4.x peer-deps: pixi.js ^7 (v8 incompatible)
      // window.PIXI must be set before importing the plugin.
      const PIXI = await import('pixi.js')
      ;(window as any).PIXI = PIXI
      await new Promise<void>(r => setTimeout(r, 0))

      const { Live2DModel, Cubism4ModelSettings } = await import('pixi-live2d-display/cubism4')

      // ── Build Cubism4ModelSettings manually ──
      // Bypasses FileLoader's findRuntime() / "Unknown settings JSON" check.
      // Attach the settings object to the file array so pixi-live2d-display
      // skips runtime auto-detection and uses Cubism4 directly.
      const model3File = files.find(f => f.name.endsWith('.model3.json'))!
      const json: any = JSON.parse(await model3File.text())
      json.url = model3File.webkitRelativePath || model3File.name
      const settings = new (Cubism4ModelSettings as any)(json)
      const settingsObjectURL = URL.createObjectURL(model3File)
      settings._objectURL = settingsObjectURL

      const canvas = document.createElement('canvas')
      canvas.width  = LIVE2D_CANVAS_SIZE
      canvas.height = LIVE2D_CANVAS_SIZE

      const app = new PIXI.Application({
        view: canvas,
        width: LIVE2D_CANVAS_SIZE,
        height: LIVE2D_CANVAS_SIZE,
        backgroundAlpha: 0,
        preserveDrawingBuffer: true,
        antialias: true,
        powerPreference: 'low-power',
        autoDensity: false,
        resolution: 1,
        forceCanvas: false,
      } as any)

      if (!app.renderer || !app.view) {
        URL.revokeObjectURL(settingsObjectURL)
        throw new Error('PixiJS renderer の初期化に失敗しました')
      }

      pixiAppRef.current    = app
      pixiCanvasRef.current = canvas
      settingsObjectURLRef.current = settingsObjectURL

      // Attach pre-built settings so FileLoader skips findRuntime()
      const fileArray = Array.from(files) as any
      fileArray.settings = settings
      const model = await (Live2DModel as any).from(fileArray, { autoInteract: false })
      app.stage.addChild(model)

      await new Promise<void>(r => requestAnimationFrame(() => r()))

      const mw = model.width  || LIVE2D_CANVAS_SIZE
      const mh = model.height || LIVE2D_CANVAS_SIZE
      const sc = Math.min(
        (LIVE2D_CANVAS_SIZE * 0.9) / mw,
        (LIVE2D_CANVAS_SIZE * 0.9) / mh,
      )
      model.scale.set(sc)
      model.position.set(
        (LIVE2D_CANVAS_SIZE - mw * sc) / 2,
        (LIVE2D_CANVAS_SIZE - mh * sc) / 2,
      )

      loadedRef.current = true
      setStatus('loaded')

    } catch (e) {
      const ne = parseNetworkError(e)

      let msg = ne.message
      if (ne.url)            msg += `\nURL: ${ne.url}`
      if (ne.status != null) msg += `\nHTTP status: ${ne.status}`
      if (ne.aborted)        msg += '\n(aborted)'

      setErrorMsg(msg)
      setDiagnostics(prev => prev ? {
        ...prev,
        networkErrorUrl:     ne.url,
        networkErrorStatus:  ne.status,
        networkErrorAborted: ne.aborted,
        networkErrorStack:   ne.stack,
      } : null)
      setStatus('error')

      if (pixiAppRef.current) {
        try { pixiAppRef.current.destroy(true) } catch { /* ignore */ }
        pixiAppRef.current = null
      }
      if (settingsObjectURLRef.current) {
        try { URL.revokeObjectURL(settingsObjectURLRef.current) } catch { /* ignore */ }
        settingsObjectURLRef.current = null
      }
      pixiCanvasRef.current = null
      loadedRef.current = false
    }
  }, [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  return {
    loadModel,
    cleanup,
    pixiCanvasRef,
    loadedRef,
    status,
    errorMsg,
    modelName,
    diagnostics,
  }
}
