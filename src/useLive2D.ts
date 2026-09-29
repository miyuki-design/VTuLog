import { useRef, useState, useCallback, useEffect } from 'react'

export const LIVE2D_CANVAS_SIZE = 512

// ── Cubism Core dynamic loader ──
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

  // 1st: official Live2D CDN, 2nd: /public/ fallback
  try {
    await tryScript('https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js')
  } catch {
    try {
      await tryScript('/live2dcubismcore.min.js')
    } catch {
      throw new Error(
        'Cubism Core が読み込めませんでした。\n' +
        'Live2D の公式サイトから SDK をダウンロードし、\n' +
        'live2dcubismcore.min.js を /public/ に配置してください。'
      )
    }
  }
}

// ── Patch model3.json so every relative path becomes an absolute blob URL ──
async function prepareModel(files: File[]): Promise<{ model3Url: string; allUrls: string[] }> {
  const model3File = files.find(f => f.name.endsWith('.model3.json'))
  if (!model3File) throw new Error('.model3.json が見つかりません')

  // Build name → blob URL map
  const fileMap = new Map<string, string>()
  for (const f of files) {
    const url = URL.createObjectURL(f)
    fileMap.set(f.name, url)
    if (f.webkitRelativePath) {
      // "ModelFolder/textures/foo.png" → "textures/foo.png"
      const rel = f.webkitRelativePath.split('/').slice(1).join('/')
      fileMap.set(rel, url)
    }
  }

  const resolve = (p: string): string => {
    if (!p) return p
    return fileMap.get(p) ?? fileMap.get(p.split('/').pop()!) ?? p
  }

  const model3 = JSON.parse(await model3File.text()) as any
  const fr: any = model3.FileReferences ?? {}

  if (fr.Moc) fr.Moc = resolve(fr.Moc)
  if (Array.isArray(fr.Textures)) fr.Textures = fr.Textures.map(resolve)
  if (fr.Physics) fr.Physics = resolve(fr.Physics)
  if (fr.Pose) fr.Pose = resolve(fr.Pose)
  if (fr.UserData) fr.UserData = resolve(fr.UserData)
  if (Array.isArray(fr.Expressions)) {
    fr.Expressions = fr.Expressions.map((e: any) => ({ ...e, File: resolve(e.File ?? '') }))
  }
  if (fr.Motions && typeof fr.Motions === 'object') {
    for (const group of Object.values(fr.Motions) as any[][]) {
      if (!Array.isArray(group)) continue
      for (const m of group) {
        if (m.File) m.File = resolve(m.File)
      }
    }
  }

  const patchedBlob = new Blob([JSON.stringify(model3)], { type: 'application/json' })
  const model3Url = URL.createObjectURL(patchedBlob)

  return { model3Url, allUrls: [model3Url, ...fileMap.values()] }
}

export type Live2DStatus = 'idle' | 'loading' | 'loaded' | 'error'

export function useLive2D() {
  // PixiJS app + canvas (stable refs for use inside rAF)
  const pixiAppRef = useRef<any>(null)
  const pixiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedRef = useRef(false)
  const allUrlsRef = useRef<string[]>([])

  const [status, setStatus] = useState<Live2DStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [modelName, setModelName] = useState('')

  const cleanup = useCallback(() => {
    if (pixiAppRef.current) {
      try { pixiAppRef.current.destroy(true) } catch { /* ignore */ }
      pixiAppRef.current = null
    }
    pixiCanvasRef.current = null
    loadedRef.current = false
    allUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch { /* ignore */ } })
    allUrlsRef.current = []
    setStatus('idle')
    setErrorMsg(null)
  }, [])

  const loadModel = useCallback(async (files: File[]) => {
    cleanup()
    setStatus('loading')

    const name = files.find(f => f.name.endsWith('.model3.json'))?.name.replace('.model3.json', '') ?? 'モデル'
    setModelName(name)

    try {
      await loadCubismCore()

      // Dynamic import AFTER core is globally available
      const PIXI = await import('pixi.js')
      ;(window as any).PIXI = PIXI
      const { Live2DModel } = await import('pixi-live2d-display/cubism4')

      const { model3Url, allUrls } = await prepareModel(files)
      allUrlsRef.current = allUrls

      const app = new PIXI.Application({
        width: LIVE2D_CANVAS_SIZE,
        height: LIVE2D_CANVAS_SIZE,
        backgroundAlpha: 0,
        preserveDrawingBuffer: true,
        antialias: true,
        powerPreference: 'low-power',
      })
      pixiAppRef.current = app
      pixiCanvasRef.current = app.view as HTMLCanvasElement

      const model = await (Live2DModel as any).from(model3Url)
      app.stage.addChild(model)

      // Scale model to fill the internal canvas at 90%
      const sc = Math.min(
        (LIVE2D_CANVAS_SIZE * 0.9) / model.width,
        (LIVE2D_CANVAS_SIZE * 0.9) / model.height,
      )
      model.scale.set(sc)
      model.position.set(
        (LIVE2D_CANVAS_SIZE - model.width * sc) / 2,
        (LIVE2D_CANVAS_SIZE - model.height * sc) / 2,
      )

      loadedRef.current = true
      setStatus('loaded')
    } catch (e) {
      const msg = (e as Error).message ?? 'モデルの読み込みに失敗しました'
      setErrorMsg(msg)
      setStatus('error')
      cleanup()
    }
  }, [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  return { loadModel, cleanup, pixiCanvasRef, loadedRef, status, errorMsg, modelName }
}
