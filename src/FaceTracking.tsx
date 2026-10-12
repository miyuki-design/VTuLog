import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

type PixiRef = MutableRefObject<any>
type Scores = { mouth: number; smile: number; leftEye: number; rightEye: number }
const DEFAULT: Scores = { mouth: 0, smile: 0, leftEye: 1, rightEye: 1 }

function score(categories: { categoryName: string; score: number }[], key: string) {
  return categories.find(item => item.categoryName === key)?.score ?? 0
}

/** An opt-in front-camera face tracker. No selfie image is rendered or recorded. */
export function FaceTracking({ pixiAppRef, rearStreamRef }: {
  pixiAppRef: PixiRef
  rearStreamRef: MutableRefObject<MediaStream | null>
}) {
  const [state, setState] = useState<'off' | 'starting' | 'on'>('off')
  const [message, setMessage] = useState('')
  const scoresRef = useRef<Scores>({ ...DEFAULT })
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastAnalyzedRef = useRef(0)
  const generationRef = useRef(0)
  const runningRef = useRef(false)

  const stop = () => {
    generationRef.current++
    runningRef.current = false
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
      videoRef.current = null
    }
    landmarkerRef.current?.close()
    landmarkerRef.current = null
    scoresRef.current = { ...DEFAULT }
    setState('off')
  }

  useEffect(() => {
    // Apply parameters after the Live2D animation updates each frame.
    const app = pixiAppRef.current
    if (!app?.ticker) return
    let smooth = { ...DEFAULT }
    const tick = () => {
      if (!runningRef.current) return
      const model: any = app.stage?.children?.find((child: any) => child?.internalModel?.coreModel)
      const core = model?.internalModel?.coreModel
      if (!core) return
      const next = scoresRef.current
      smooth = {
        mouth: smooth.mouth + (next.mouth - smooth.mouth) * 0.8,
        smile: smooth.smile + (next.smile - smooth.smile) * 0.45,
        leftEye: smooth.leftEye + (next.leftEye - smooth.leftEye) * 0.9,
        rightEye: smooth.rightEye + (next.rightEye - smooth.rightEye) * 0.9,
      }
      try {
        core.setParameterValueById('ParamMouthOpenY', smooth.mouth)
        core.setParameterValueById('ParamMouthForm', smooth.smile)
        core.setParameterValueById('ParamEyeLOpen', smooth.leftEye)
        core.setParameterValueById('ParamEyeROpen', smooth.rightEye)
      } catch (error) { console.warn('Live2D tracking parameters:', error) }
    }
    app.ticker.add(tick, undefined, -50)
    return () => { try { app.ticker.remove(tick) } catch { /* already destroyed */ } }
  }, [pixiAppRef, state])

  useEffect(() => () => {
    generationRef.current++
    runningRef.current = false
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    landmarkerRef.current?.close()
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null }
  }, [])

  const start = async () => {
    setState('starting')
    setMessage('表情認識を準備中…')
    const generation = ++generationRef.current
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
      )
      const opts = {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU' as const,
        },
        runningMode: 'VIDEO' as const,
        numFaces: 1,
        outputFaceBlendshapes: true,
      }
      const landmarker = await FaceLandmarker.createFromOptions(vision, opts)
      if (generation !== generationRef.current) { landmarker.close(); return }
      landmarkerRef.current = landmarker

      const rearTrack = rearStreamRef.current?.getVideoTracks()[0]
      if (!rearTrack || rearTrack.readyState !== 'live') throw new Error('背面カメラの起動後に試してください')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
        audio: false,
      })
      if (generation !== generationRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream

      // iOS browsers may replace the back-camera stream when the front camera opens.
      if (rearTrack.readyState !== 'live' || rearTrack.muted) {
        throw new Error('このブラウザでは前後カメラの同時利用ができません。表情追跡を停止しました。背面映像が止まった場合はページを再読み込みしてください。')
      }

      const video = document.createElement('video')
      video.muted = true
      video.autoplay = true
      video.playsInline = true
      video.srcObject = stream
      videoRef.current = video
      await video.play()
      if (generation !== generationRef.current) return
      runningRef.current = true
      setState('on')
      setMessage('表情追跡中（顔の映像は表示・保存しません）')

      const loop = () => {
        if (!runningRef.current || generation !== generationRef.current) return
        const now = performance.now()
        if (rearTrack.readyState !== 'live' || rearTrack.muted) {
          stop()
          setMessage('背面カメラが停止しました。同時利用非対応の可能性があります。ページを再読み込みしてください。')
          return
        }
        if (video.readyState >= 2 && now - lastAnalyzedRef.current >= 80) {
          lastAnalyzedRef.current = now
          try {
            const result = landmarker.detectForVideo(video, now)
            const categories = result.faceBlendshapes?.[0]?.categories
            if (categories) {
              const blinkLeft = score(categories, 'eyeBlinkLeft')
              const blinkRight = score(categories, 'eyeBlinkRight')
              const smileLeft = score(categories, 'mouthSmileLeft')
              const smileRight = score(categories, 'mouthSmileRight')
              scoresRef.current = {
                mouth: Math.max(0, Math.min(1, score(categories, 'jawOpen') * 1.5)),
                smile: Math.max(-1, Math.min(1, ((smileLeft + smileRight) / 2) * 2)),
                leftEye: 1 - blinkLeft,
                rightEye: 1 - blinkRight,
              }
            }
          } catch (error) { console.warn('Face tracking frame:', error) }
        }
        frameRef.current = requestAnimationFrame(loop)
      }
      frameRef.current = requestAnimationFrame(loop)
    } catch (error) {
      stop()
      setMessage(`表情追跡を開始できません: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <button type="button" disabled={state === 'starting'} onClick={state === 'on' ? () => { stop(); setMessage('表情追跡を停止しました') } : start}
        style={{ padding: '7px 10px', borderRadius: 12, background: '#35214c', color: '#fff', fontSize: 12, border: '1px solid #aa89d6' }}>
        {state === 'on' ? '表情追跡を停止' : state === 'starting' ? '準備中…' : '表情追跡を開始'}
      </button>
      {message && <span role="status" style={{ fontSize: 10, color: '#d8c8f2', maxWidth: 280 }}>{message}</span>}
    </div>
  )
}
