import { useState, useEffect, useRef, useCallback } from 'react'
import { useLive2D, LIVE2D_CANVAS_SIZE, type Live2DDiagnostics, type NormalizedFileInfo } from './useLive2D'

type AppState = 'idle' | 'recording' | 'preview' | 'playing'

const PRESET_AVATARS = [
  { id: 'hana', name: 'ハナ', color: '#FF3FA4', hair: '#FF8BC8', eye: '#00E5FF' },
  { id: 'luna', name: 'ルナ', color: '#7B2FFF', hair: '#C9A0FF', eye: '#FFD700' },
  { id: 'sora', name: 'ソラ', color: '#00BFFF', hair: '#80DFFF', eye: '#FF69B4' },
]

function AvatarFace({ avatar, size = 80, animated = true }: {
  avatar: typeof PRESET_AVATARS[0]; size?: number; animated?: boolean
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
      className={animated ? 'animate-float-avatar' : ''}
      style={{ filter: `drop-shadow(0 0 8px ${avatar.color}88)` }}>
      <ellipse cx="50" cy="54" rx="30" ry="32" fill="#FFE0C8" />
      <ellipse cx="50" cy="42" rx="32" ry="28" fill={avatar.hair} />
      <path d="M20 42 Q22 18 50 16 Q78 18 80 42 Q70 30 50 28 Q30 30 20 42Z" fill={avatar.hair} />
      <ellipse cx="50" cy="56" rx="26" ry="28" fill="#FFE8D6" />
      <ellipse cx="40" cy="52" rx="6" ry="7" fill="white" />
      <ellipse cx="60" cy="52" rx="6" ry="7" fill="white" />
      <ellipse cx="40" cy="53" rx="4" ry="5" fill={avatar.eye} />
      <ellipse cx="60" cy="53" rx="4" ry="5" fill={avatar.eye} />
      <ellipse cx="41" cy="51" rx="1.5" ry="1.5" fill="white" />
      <ellipse cx="61" cy="51" rx="1.5" ry="1.5" fill="white" />
      <ellipse cx="34" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6" />
      <ellipse cx="66" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6" />
      <path d="M43 66 Q50 72 57 66" stroke="#E8968A" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="56" rx="5" ry="6" fill="#FFE0C8" />
      <ellipse cx="78" cy="56" rx="5" ry="6" fill="#FFE0C8" />
    </svg>
  )
}

function buildPresetSVG(av: typeof PRESET_AVATARS[0]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">
    <ellipse cx="50" cy="54" rx="30" ry="32" fill="#FFE0C8"/>
    <ellipse cx="50" cy="42" rx="32" ry="28" fill="${av.hair}"/>
    <path d="M20 42 Q22 18 50 16 Q78 18 80 42 Q70 30 50 28 Q30 30 20 42Z" fill="${av.hair}"/>
    <ellipse cx="50" cy="56" rx="26" ry="28" fill="#FFE8D6"/>
    <ellipse cx="40" cy="52" rx="6" ry="7" fill="white"/>
    <ellipse cx="60" cy="52" rx="6" ry="7" fill="white"/>
    <ellipse cx="40" cy="53" rx="4" ry="5" fill="${av.eye}"/>
    <ellipse cx="60" cy="53" rx="4" ry="5" fill="${av.eye}"/>
    <ellipse cx="41" cy="51" rx="1.5" ry="1.5" fill="white"/>
    <ellipse cx="61" cy="51" rx="1.5" ry="1.5" fill="white"/>
    <ellipse cx="34" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6"/>
    <ellipse cx="66" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6"/>
    <path d="M43 66 Q50 72 57 66" stroke="#E8968A" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="22" cy="56" rx="5" ry="6" fill="#FFE0C8"/>
    <ellipse cx="78" cy="56" rx="5" ry="6" fill="#FFE0C8"/>
  </svg>`
}

// ── Live2D Diagnostics Panel ──
const MONO: React.CSSProperties = { fontFamily: 'monospace', fontSize: '9px', wordBreak: 'break-all', lineHeight: 1.5 }
const MUTED = '#8B82B0'
const CYAN  = '#00E5FF'
const RED   = '#FF6B6B'
const RED2  = '#FF9999'

function DiagRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  const icon = ok === null ? '⋯' : ok ? '✓' : '✗'
  const col  = ok === null ? MUTED : ok ? CYAN : RED
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '11px', lineHeight: 1.7 }}>
      <span style={{ color: col, width: '14px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: MUTED, flex: 1 }}>{label}</span>
      {detail && <span style={{ color: col, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{detail}</span>}
    </div>
  )
}

function Live2DDiagPanel({
  diag, status, errorMsg,
}: {
  diag: Live2DDiagnostics | null
  status: string
  errorMsg: string | null
}) {
  if (!diag && status === 'idle') return null

  const isError = status === 'error'
  const border  = isError ? '1px solid rgba(255,107,107,0.5)' : '1px solid rgba(0,229,255,0.22)'

  return (
    <div className="rounded-2xl animate-fade-in" style={{ background: 'rgba(10,8,26,0.95)', border, marginTop: '10px', padding: '10px 12px', maxHeight: '55vh', overflowY: 'auto' }}>

      <p style={{ fontSize: '10px', color: isError ? RED2 : MUTED, fontFamily: 'var(--font-display)', marginBottom: '6px', letterSpacing: '0.05em' }}>
        {status === 'loading' ? '解析中…' : isError ? '読み込みエラー' : '診断ログ'}
      </p>

      {diag && (<>
