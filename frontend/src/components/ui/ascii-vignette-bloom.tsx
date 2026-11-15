"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"

export type RenderMode =
  | "mosaic"
  | "characters"
  | "dither"
  | "pixel"
  | "dots"
  | "cross"
  | "diamond"
  | "voxel"
  | "lego"
  | "mixed"
  | "lines"
  | "diagonal"
  | "braille"
  | "disco"
  | "hexdump"
  | "matrix"
  | "rings"
  | "hearts"
  | "stars"
  | "hexagons"
  | "triangles"
  | "bubbles"
  | "hatch"
  | "contour"
  | "halfblocks"

export type BgMode = "solid" | "blur" | "photo" | "off" | "none"
export type AnimStyle = "wave" | "pulse" | "shimmer" | "ripple" | "flicker"
export type BlurType = "off" | "gaussian" | "directional" | "tilt" | "lens" | "progressive"
export type BlendMode = "multiply" | "screen" | "overlay" | "source-over" | "soft-light" | "color-dodge"

export interface LightPoint {
  x: number // 0..1
  y: number // 0..1
  radius: number
  intensity: number // 0..100
  color?: string
}

export interface MaskConfig {
  enabled: boolean
  tool?: string
  brushSize?: number
  showOverlay?: boolean
  invert?: boolean
  dataUrl?: string | null
  shapes?: any[]
}

export interface PfxConfig {
  vignette: { enabled: boolean; intensity: number }
  scanLines: { enabled: boolean; intensity: number }
  chromatic: { enabled: boolean; intensity: number }
  bloom: { enabled: boolean; intensity: number }
  filmGrain: { enabled: boolean; intensity: number }
  glitch: { enabled: boolean; intensity: number }
  pixelate: { enabled: boolean; intensity: number }
  halftone: { enabled: boolean; intensity: number }
  filmDust: { enabled: boolean; intensity: number }
}

export interface AsciiVignetteParams {
  renderMode: RenderMode
  bgMode: BgMode
  bgBlur: number
  bgOpacity: number
  cellSize: number
  coverage: number
  invert: boolean
  styleBlend: string
  charSet: string
  customChars: string
  brightness: number
  contrast: number
  edgeEmphasis: number
  density: number
  toneCurve: { x: number; y: number }[]
  tint: string
  tintOpacity: number
  overlayBlend: BlendMode
  saturation: number
  grayscale: number
  blurType: BlurType
  blurAmount: number
  blurAngle: number
  directionalBothSides: boolean
  tiltFocus: number
  tiltPosition: number
  tiltFeather: number
  lensFocus: number
  blurCenterX: number
  blurCenterY: number
  progressivePosition: number
  progressiveReverse: boolean
  pfx: PfxConfig
  animated: boolean
  animStyle: AnimStyle
  animSpeed: { enabled: boolean; intensity: number }
  animIntensity: { enabled: boolean; intensity: number }
  lights: { enabled: boolean; points: LightPoint[] }
  mask: MaskConfig
}

export const DEFAULT_ASCII_PARAMS: AsciiVignetteParams = {
  renderMode: "mosaic",
  bgMode: "solid",
  bgBlur: 12,
  bgOpacity: 90,
  cellSize: 16,
  coverage: 100,
  invert: false,
  styleBlend: "source-over",
  charSet: "standard",
  customChars: "",
  brightness: 12,
  contrast: 115,
  edgeEmphasis: 0,
  density: 0,
  toneCurve: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  tint: "#3ca6ff",
  tintOpacity: 0,
  overlayBlend: "multiply",
  saturation: 100,
  grayscale: 0,
  blurType: "off",
  blurAmount: 35,
  blurAngle: 0,
  directionalBothSides: false,
  tiltFocus: 35,
  tiltPosition: 50,
  tiltFeather: 15,
  lensFocus: 40,
  blurCenterX: 50,
  blurCenterY: 50,
  progressivePosition: 55,
  progressiveReverse: false,
  pfx: {
    vignette: { enabled: true, intensity: 38 },
    scanLines: { enabled: false, intensity: 40 },
    chromatic: { enabled: false, intensity: 15 },
    bloom: { enabled: true, intensity: 25 },
    filmGrain: { enabled: false, intensity: 30 },
    glitch: { enabled: false, intensity: 20 },
    pixelate: { enabled: false, intensity: 15 },
    halftone: { enabled: false, intensity: 20 },
    filmDust: { enabled: false, intensity: 20 },
  },
  animated: true,
  animStyle: "wave",
  animSpeed: { enabled: true, intensity: 100 },
  animIntensity: { enabled: true, intensity: 60 },
  lights: { enabled: false, points: [] },
  mask: {
    enabled: false,
    tool: "freehand",
    brushSize: 30,
    showOverlay: false,
    invert: false,
    dataUrl: null,
    shapes: [],
  },
}

export interface AsciiVignetteBloomProps {
  src?: string
  width?: number | string
  height?: number | string
  params?: Partial<AsciiVignetteParams>
  className?: string
  style?: React.CSSProperties
  interactive?: boolean
  showControls?: boolean
  onParamChange?: (newParams: AsciiVignetteParams) => void
}

// Built-in character sets
const CHAR_SETS: Record<string, string> = {
  standard: " .:-=+*#%@",
  matrix: " ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ9876543210",
  blocks: " ░▒▓█",
  binary: " 01",
  minimal: " .oO@",
  slashes: " /\\|",
  alphanumeric: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
}

export function AsciiVignetteBloom({
  src = "/ascii-editor/demos/generated/ref-008.webp",
  width = "100%",
  height = "100%",
  params: customParams,
  className = "",
  style,
  interactive = false,
  showControls = false,
  onParamChange,
}: AsciiVignetteBloomProps) {
  const [params, setParams] = useState<AsciiVignetteParams>(() => ({
    ...DEFAULT_ASCII_PARAMS,
    ...customParams,
    pfx: { ...DEFAULT_ASCII_PARAMS.pfx, ...customParams?.pfx },
    animSpeed: { ...DEFAULT_ASCII_PARAMS.animSpeed, ...customParams?.animSpeed },
    animIntensity: { ...DEFAULT_ASCII_PARAMS.animIntensity, ...customParams?.animIntensity },
    lights: { ...DEFAULT_ASCII_PARAMS.lights, ...customParams?.lights },
    mask: { ...DEFAULT_ASCII_PARAMS.mask, ...customParams?.mask },
  }))

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const maskImgRef = useRef<HTMLImageElement | null>(null)
  const animationFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(performance.now())
  const [imageLoaded, setImageLoaded] = useState(false)

  // Sync external prop params if changed
  useEffect(() => {
    if (customParams) {
      setParams((prev) => ({
        ...prev,
        ...customParams,
        pfx: { ...prev.pfx, ...customParams.pfx },
        animSpeed: { ...prev.animSpeed, ...customParams.animSpeed },
        animIntensity: { ...prev.animIntensity, ...customParams.animIntensity },
        lights: { ...prev.lights, ...customParams.lights },
        mask: { ...prev.mask, ...customParams.mask },
      }))
    }
  }, [customParams])

  // Load source photo with high quality procedural fallback
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = src

    img.onload = () => {
      imageRef.current = img
      setImageLoaded(true)
    }

    img.onerror = () => {
      // Create procedural luxury fallback image so it never fails
      const fallbackCanvas = document.createElement("canvas")
      fallbackCanvas.width = 640
      fallbackCanvas.height = 640
      const fctx = fallbackCanvas.getContext("2d")!

      // Deep dark apple obsidian gradient
      const bgGrad = fctx.createLinearGradient(0, 0, 640, 640)
      bgGrad.addColorStop(0, "#08101e")
      bgGrad.addColorStop(0.5, "#0d1b32")
      bgGrad.addColorStop(1, "#030712")
      fctx.fillStyle = bgGrad
      fctx.fillRect(0, 0, 640, 640)

      // Ambient glowing orbs
      const glow = fctx.createRadialGradient(320, 260, 20, 320, 260, 280)
      glow.addColorStop(0, "rgba(60, 166, 255, 0.95)")
      glow.addColorStop(0.4, "rgba(22, 120, 255, 0.5)")
      glow.addColorStop(0.8, "rgba(10, 40, 110, 0.2)")
      glow.addColorStop(1, "transparent")
      fctx.fillStyle = glow
      fctx.beginPath()
      fctx.arc(320, 260, 280, 0, Math.PI * 2)
      fctx.fill()

      // Radial auction pedestal rings
      fctx.strokeStyle = "rgba(56, 189, 248, 0.5)"
      fctx.lineWidth = 3
      fctx.beginPath()
      fctx.arc(320, 260, 140, 0, Math.PI * 2)
      fctx.stroke()
      fctx.beginPath()
      fctx.arc(320, 260, 180, 0, Math.PI * 2)
      fctx.stroke()

      const fallbackImg = new Image()
      fallbackImg.src = fallbackCanvas.toDataURL("image/png")
      fallbackImg.onload = () => {
        imageRef.current = fallbackImg
        setImageLoaded(true)
      }
    }
  }, [src])

  // Load mask dataUrl if provided
  useEffect(() => {
    if (params.mask.enabled && params.mask.dataUrl) {
      const m = new Image()
      m.src = params.mask.dataUrl
      m.onload = () => {
        maskImgRef.current = m
      }
    } else {
      maskImgRef.current = null
    }
  }, [params.mask.enabled, params.mask.dataUrl])

  // Core render pipeline
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    const sourceImg = imageRef.current
    if (!canvas || !sourceImg) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    const targetW = Math.max(120, Math.round(rect.width * dpr || canvas.width))
    const targetH = Math.max(120, Math.round(rect.height * dpr || canvas.height))

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    const W = canvas.width
    const H = canvas.height

    // Elapsed animation clock
    const now = performance.now()
    const elapsed = (now - startTimeRef.current) * 0.001
    const speedFactor = params.animSpeed.enabled ? params.animSpeed.intensity / 100 : 0
    const animIntensityFactor = params.animIntensity.enabled ? params.animIntensity.intensity / 100 : 0
    const t = elapsed * speedFactor * 2.5

    // Stage A: Offscreen buffer for source sampling
    const offCanvas = document.createElement("canvas")
    offCanvas.width = W
    offCanvas.height = H
    const offCtx = offCanvas.getContext("2d")!

    // Draw source photo fitted with cover aspect
    const imgAspect = sourceImg.width / (sourceImg.height || 1)
    const canvasAspect = W / H
    let dw = W,
      dh = H,
      dx = 0,
      dy = 0
    if (canvasAspect > imgAspect) {
      dh = W / imgAspect
      dy = (H - dh) / 2
    } else {
      dw = H * imgAspect
      dx = (W - dw) / 2
    }
    offCtx.drawImage(sourceImg, dx, dy, dw, dh)

    const srcData = offCtx.getImageData(0, 0, W, H)
    const pixels = srcData.data

    // Stage 1: Render background layer per bgMode
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const bgAlpha = Math.max(0, Math.min(1, params.bgOpacity / 100))
    if (params.bgMode === "solid") {
      ctx.fillStyle = `rgba(8, 16, 26, ${bgAlpha})`
      ctx.fillRect(0, 0, W, H)
    } else if (params.bgMode === "blur") {
      ctx.save()
      ctx.globalAlpha = bgAlpha
      ctx.filter = `blur(${Math.max(1, params.bgBlur * (dpr * 0.75))}px)`
      ctx.drawImage(offCanvas, 0, 0)
      ctx.restore()
    } else if (params.bgMode === "photo") {
      ctx.save()
      ctx.globalAlpha = bgAlpha
      ctx.drawImage(offCanvas, 0, 0)
      ctx.restore()
    }

    // Stage 2 & 3: Sample grid and draw shapes per renderMode
    const cellSize = Math.max(4, Math.round(params.cellSize * dpr))
    const cols = Math.ceil(W / cellSize)
    const rows = Math.ceil(H / cellSize)

    // Tone curve mapping
    const mapTone = (lum: number) => {
      if (!params.toneCurve || params.toneCurve.length < 2) return lum
      const tc = params.toneCurve
      if (lum <= tc[0].x) return tc[0].y
      if (lum >= tc[tc.length - 1].x) return tc[tc.length - 1].y
      for (let i = 0; i < tc.length - 1; i++) {
        if (lum >= tc[i].x && lum <= tc[i + 1].x) {
          const ratio = (lum - tc[i].x) / (tc[i + 1].x - tc[i].x || 1e-5)
          return tc[i].y + ratio * (tc[i + 1].y - tc[i].y)
        }
      }
      return lum
    }

    // Color adjustment multipliers
    const brightFactor = params.brightness // -100..100
    const contrastRatio = Math.max(0, params.contrast / 100)
    const satRatio = Math.max(0, params.saturation / 100)
    const grayRatio = Math.max(0, Math.min(1, params.grayscale / 100))

    // Select character set
    const glyphs = params.customChars && params.customChars.length > 0
      ? params.customChars
      : CHAR_SETS[params.charSet] || CHAR_SETS.standard

    ctx.save()
    if (params.styleBlend && params.styleBlend !== "source-over") {
      ctx.globalCompositeOperation = params.styleBlend as GlobalCompositeOperation
    }

    // Precalculate luminance grid for edge emphasis and matrix state
    const lumGrid = new Float32Array(cols * rows)
    const rGrid = new Uint8ClampedArray(cols * rows)
    const gGrid = new Uint8ClampedArray(cols * rows)
    const bGrid = new Uint8ClampedArray(cols * rows)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = Math.min(W - 1, c * cellSize + Math.floor(cellSize / 2))
        const cy = Math.min(H - 1, r * cellSize + Math.floor(cellSize / 2))
        const pIndex = (cy * W + cx) * 4

        let red = pixels[pIndex]
        let green = pixels[pIndex + 1]
        let blue = pixels[pIndex + 2]

        // Brightness & contrast
        red = Math.min(255, Math.max(0, (red - 128) * contrastRatio + 128 + brightFactor * 1.2))
        green = Math.min(255, Math.max(0, (green - 128) * contrastRatio + 128 + brightFactor * 1.2))
        blue = Math.min(255, Math.max(0, (blue - 128) * contrastRatio + 128 + brightFactor * 1.2))

        // Saturation & Grayscale
        let rawLum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
        if (satRatio !== 1 || grayRatio > 0) {
          const effectiveGray = Math.max(grayRatio, 1 - satRatio)
          red = red * (1 - effectiveGray) + rawLum * 255 * effectiveGray
          green = green * (1 - effectiveGray) + rawLum * 255 * effectiveGray
          blue = blue * (1 - effectiveGray) + rawLum * 255 * effectiveGray
        }

        const idx = r * cols + c
        rGrid[idx] = red
        gGrid[idx] = green
        bGrid[idx] = blue

        let lum = mapTone(rawLum)
        if (params.invert) lum = 1 - lum
        lumGrid[idx] = lum
      }
    }

    // Edge emphasis pass (Sobel operator)
    const edgeBoost = params.edgeEmphasis / 100

    // Render cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Coverage check
        if (params.coverage < 100) {
          const pseudoRand = ((c * 199 + r * 317 + 13) % 100)
          if (pseudoRand >= params.coverage) continue
        }

        const idx = r * cols + c
        let lum = lumGrid[idx]
        const red = rGrid[idx]
        const green = gGrid[idx]
        const blue = bGrid[idx]

        // Sobel edge computation if edgeEmphasis > 0
        if (edgeBoost > 0 && c > 0 && c < cols - 1 && r > 0 && r < rows - 1) {
          const gx =
            -lumGrid[(r - 1) * cols + (c - 1)] +
            lumGrid[(r - 1) * cols + (c + 1)] -
            2 * lumGrid[r * cols + (c - 1)] +
            2 * lumGrid[r * cols + (c + 1)] -
            lumGrid[(r + 1) * cols + (c - 1)] +
            lumGrid[(r + 1) * cols + (c + 1)]
          const gy =
            -lumGrid[(r - 1) * cols + (c - 1)] -
            2 * lumGrid[(r - 1) * cols + c] -
            lumGrid[(r - 1) * cols + (c + 1)] +
            lumGrid[(r + 1) * cols + (c - 1)] +
            2 * lumGrid[(r + 1) * cols + c] +
            lumGrid[(r + 1) * cols + (c + 1)]
          const grad = Math.hypot(gx, gy)
          lum = Math.min(1, lum + grad * edgeBoost)
        }

        // Animation wave/pulse/shimmer/ripple/flicker
        if (params.animated && animIntensityFactor > 0) {
          let wave = 0
          switch (params.animStyle) {
            case "wave":
              wave = Math.sin(c * 0.18 + r * 0.18 + t * 2.5) * 0.28
              break
            case "pulse":
              wave = Math.sin(t * 3) * 0.25
              break
            case "shimmer":
              wave = Math.sin(c * 0.4 + t * 3) * Math.cos(r * 0.4 - t * 2) * 0.28
              break
            case "ripple": {
              const d = Math.hypot(c - cols / 2, r - rows / 2)
              wave = Math.sin(d * 0.35 - t * 3.5) * 0.3
              break
            }
            case "flicker":
              wave = (((c * 73 + r * 97 + Math.floor(t * 12)) % 37) / 37 - 0.5) * 0.35
              break
          }
          lum = Math.max(0, Math.min(1, lum + wave * animIntensityFactor))
        }

        const x = c * cellSize
        const y = r * cellSize
        const centerX = x + cellSize / 2
        const centerY = y + cellSize / 2

        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`
        ctx.strokeStyle = `rgb(${red}, ${green}, ${blue})`

        // Execute Shape per renderMode
        switch (params.renderMode) {
          case "characters": {
            const charIdx = Math.min(
              glyphs.length - 1,
              Math.max(0, Math.floor(lum * glyphs.length))
            )
            const char = glyphs[charIdx] || " "
            ctx.font = `${Math.round(cellSize * 1.15)}px monospace`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(char, centerX, centerY)
            break
          }
          case "dither": {
            const bayer4 = [
              [0, 8, 2, 10],
              [12, 4, 14, 6],
              [3, 11, 1, 9],
              [15, 7, 13, 5],
            ]
            const threshold = bayer4[r % 4][c % 4] / 16
            if (lum > threshold) {
              const size = cellSize * 0.85
              ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size)
            }
            break
          }
          case "mosaic": {
            const pad = Math.max(1, cellSize * 0.1)
            const sz = cellSize - pad * 2
            const radius = Math.max(1, sz * 0.22)
            ctx.beginPath()
            ctx.roundRect(x + pad, y + pad, sz, sz, radius)
            ctx.fill()
            // Subtle specular edge
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + lum * 0.25})`
            ctx.lineWidth = 1
            ctx.stroke()
            break
          }
          case "pixel": {
            ctx.fillRect(x, y, cellSize, cellSize)
            break
          }
          case "dots": {
            const rad = (cellSize / 2) * Math.max(0.12, lum)
            ctx.beginPath()
            ctx.arc(centerX, centerY, rad, 0, Math.PI * 2)
            ctx.fill()
            break
          }
          case "cross": {
            const len = (cellSize / 2) * Math.max(0.2, lum)
            ctx.lineWidth = Math.max(1, cellSize * 0.2)
            ctx.beginPath()
            ctx.moveTo(centerX - len, centerY)
            ctx.lineTo(centerX + len, centerY)
            ctx.moveTo(centerX, centerY - len)
            ctx.lineTo(centerX, centerY + len)
            ctx.stroke()
            break
          }
          case "diamond": {
            const dSize = (cellSize / 2) * Math.max(0.15, lum)
            ctx.beginPath()
            ctx.moveTo(centerX, centerY - dSize)
            ctx.lineTo(centerX + dSize, centerY)
            ctx.lineTo(centerX, centerY + dSize)
            ctx.lineTo(centerX - dSize, centerY)
            ctx.closePath()
            ctx.fill()
            break
          }
          case "voxel": {
            const vh = cellSize * 0.7 * Math.max(0.2, lum)
            ctx.beginPath()
            // Top face
            ctx.moveTo(centerX, centerY - vh)
            ctx.lineTo(centerX + cellSize * 0.45, centerY - vh * 0.5)
            ctx.lineTo(centerX, centerY)
            ctx.lineTo(centerX - cellSize * 0.45, centerY - vh * 0.5)
            ctx.closePath()
            ctx.fillStyle = `rgb(${Math.min(255, red + 45)}, ${Math.min(255, green + 45)}, ${Math.min(255, blue + 45)})`
            ctx.fill()
            // Right face
            ctx.beginPath()
            ctx.moveTo(centerX, centerY)
            ctx.lineTo(centerX + cellSize * 0.45, centerY - vh * 0.5)
            ctx.lineTo(centerX + cellSize * 0.45, centerY + vh * 0.5)
            ctx.lineTo(centerX, centerY + vh)
            ctx.closePath()
            ctx.fillStyle = `rgb(${Math.max(0, red - 35)}, ${Math.max(0, green - 35)}, ${Math.max(0, blue - 35)})`
            ctx.fill()
            break
          }
          case "lego": {
            const pad = cellSize * 0.12
            const w = cellSize - pad * 2
            ctx.fillRect(x + pad, y + pad, w, w)
            // Stud on top
            ctx.beginPath()
            ctx.arc(centerX, centerY, w * 0.28, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(255,255,255,0.3)`
            ctx.fill()
            break
          }
          case "mixed": {
            const selector = (c + r) % 4
            if (selector === 0) {
              ctx.beginPath()
              ctx.arc(centerX, centerY, (cellSize / 2) * lum, 0, Math.PI * 2)
              ctx.fill()
            } else if (selector === 1) {
              const sz = cellSize * 0.75 * lum
              ctx.fillRect(centerX - sz / 2, centerY - sz / 2, sz, sz)
            } else if (selector === 2) {
              const d = (cellSize / 2) * lum
              ctx.beginPath()
              ctx.moveTo(centerX, centerY - d)
              ctx.lineTo(centerX + d, centerY)
              ctx.lineTo(centerX, centerY + d)
              ctx.lineTo(centerX - d, centerY)
              ctx.fill()
            } else {
              ctx.lineWidth = 1.5
              ctx.beginPath()
              ctx.moveTo(centerX - 4, centerY)
              ctx.lineTo(centerX + 4, centerY)
              ctx.moveTo(centerX, centerY - 4)
              ctx.lineTo(centerX, centerY + 4)
              ctx.stroke()
            }
            break
          }
          case "lines": {
            const th = Math.max(1, cellSize * lum)
            ctx.lineWidth = th
            ctx.beginPath()
            ctx.moveTo(x, centerY)
            ctx.lineTo(x + cellSize, centerY)
            ctx.stroke()
            break
          }
          case "diagonal": {
            ctx.lineWidth = Math.max(1, cellSize * 0.3 * lum)
            ctx.beginPath()
            ctx.moveTo(x, y + cellSize)
            ctx.lineTo(x + cellSize, y)
            ctx.stroke()
            break
          }
          case "braille": {
            const base = 0x2800
            const dotBits = Math.floor(lum * 255)
            const brailleChar = String.fromCharCode(base + (dotBits % 256))
            ctx.font = `${Math.round(cellSize * 1.2)}px monospace`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(brailleChar, centerX, centerY)
            break
          }
          case "disco": {
            const rad = (cellSize / 2) * Math.max(0.2, lum)
            const hue = (t * 80 + c * 15 + r * 15) % 360
            ctx.fillStyle = `hsl(${hue}, 85%, ${40 + lum * 40}%)`
            ctx.beginPath()
            ctx.arc(centerX, centerY, rad, 0, Math.PI * 2)
            ctx.fill()
            break
          }
          case "hexdump": {
            const hex = Math.floor(lum * 255).toString(16).toUpperCase().padStart(2, "0")
            ctx.font = `bold ${Math.round(cellSize * 0.72)}px monospace`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(hex, centerX, centerY)
            break
          }
          case "matrix": {
            const rainChars = "ｦｱｳｴｵｶ0123456789XYZ"
            const char = rainChars[(c * 17 + r * 31 + Math.floor(t * 4)) % rainChars.length]
            const isHead = (Math.floor(t * 8 + c * 3) % rows) === r
            ctx.fillStyle = isHead ? "#ffffff" : `rgb(46, 255, 110)`
            ctx.font = `bold ${Math.round(cellSize * 1.1)}px monospace`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(char, centerX, centerY)
            break
          }
          case "rings": {
            const rad = (cellSize / 2) * Math.max(0.2, lum)
            ctx.lineWidth = Math.max(1, cellSize * 0.12)
            ctx.beginPath()
            ctx.arc(centerX, centerY, rad * 0.5, 0, Math.PI * 2)
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(centerX, centerY, rad, 0, Math.PI * 2)
            ctx.stroke()
            break
          }
          case "hearts": {
            const sz = (cellSize * 0.45) * Math.max(0.3, lum)
            ctx.beginPath()
            ctx.moveTo(centerX, centerY + sz * 0.6)
            ctx.bezierCurveTo(centerX + sz, centerY, centerX + sz, centerY - sz, centerX, centerY - sz * 0.5)
            ctx.bezierCurveTo(centerX - sz, centerY - sz, centerX - sz, centerY, centerX, centerY + sz * 0.6)
            ctx.fill()
            break
          }
          case "stars": {
            const points = 4
            const outer = (cellSize / 2) * Math.max(0.2, lum)
            const inner = outer * 0.4
            ctx.beginPath()
            for (let i = 0; i < points * 2; i++) {
              const rad = i % 2 === 0 ? outer : inner
              const a = (i * Math.PI) / points
              const px = centerX + Math.cos(a) * rad
              const py = centerY + Math.sin(a) * rad
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.fill()
            break
          }
          case "hexagons": {
            const rad = (cellSize / 2) * 0.95
            ctx.beginPath()
            for (let i = 0; i < 6; i++) {
              const a = (i * Math.PI) / 3
              const px = centerX + Math.cos(a) * rad
              const py = centerY + Math.sin(a) * rad
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.fill()
            break
          }
          case "triangles": {
            const up = (c + r) % 2 === 0
            ctx.beginPath()
            if (up) {
              ctx.moveTo(centerX, y)
              ctx.lineTo(x + cellSize, y + cellSize)
              ctx.lineTo(x, y + cellSize)
            } else {
              ctx.moveTo(x, y)
              ctx.lineTo(x + cellSize, y)
              ctx.lineTo(centerX, y + cellSize)
            }
            ctx.closePath()
            ctx.fill()
            break
          }
          case "bubbles": {
            const rad = (cellSize / 2) * Math.max(0.2, lum)
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(centerX, centerY, rad, 0, Math.PI * 2)
            ctx.stroke()
            // Highlight
            ctx.fillStyle = "rgba(255,255,255,0.7)"
            ctx.beginPath()
            ctx.arc(centerX - rad * 0.35, centerY - rad * 0.35, rad * 0.22, 0, Math.PI * 2)
            ctx.fill()
            break
          }
          case "hatch": {
            ctx.lineWidth = 1.2
            ctx.beginPath()
            ctx.moveTo(x, y + cellSize)
            ctx.lineTo(x + cellSize, y)
            if (lum > 0.45) {
              ctx.moveTo(x, y)
              ctx.lineTo(x + cellSize, y + cellSize)
            }
            ctx.stroke()
            break
          }
          case "contour": {
            const step = Math.floor(lum * 5)
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(centerX, centerY, (cellSize / 2) * (step / 5), 0, Math.PI * 2)
            ctx.stroke()
            break
          }
          case "halfblocks": {
            ctx.font = `${Math.round(cellSize * 1.05)}px monospace`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            const char = lum > 0.66 ? "█" : lum > 0.33 ? "▀" : "▄"
            ctx.fillText(char, centerX, centerY)
            break
          }
        }
      }
    }
    ctx.restore()

    // Stage 4: Tint and overlay color blending
    if (params.tintOpacity > 0 && params.tint) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, params.tintOpacity / 100))
      ctx.globalCompositeOperation = (params.overlayBlend || "multiply") as GlobalCompositeOperation
      ctx.fillStyle = params.tint
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }

    // Stage 5: Post-Effects (pfx)
    const pfx = params.pfx

    // 5a. Bloom: glow highlights composited back
    if (pfx.bloom?.enabled && pfx.bloom.intensity > 0) {
      const bloomCanvas = document.createElement("canvas")
      bloomCanvas.width = Math.max(32, Math.floor(W / 4))
      bloomCanvas.height = Math.max(32, Math.floor(H / 4))
      const bCtx = bloomCanvas.getContext("2d")!
      bCtx.drawImage(canvas, 0, 0, bloomCanvas.width, bloomCanvas.height)

      ctx.save()
      ctx.globalAlpha = (pfx.bloom.intensity / 100) * 0.8
      ctx.globalCompositeOperation = "screen"
      ctx.filter = `blur(${Math.max(4, 16 * dpr)}px)`
      ctx.drawImage(bloomCanvas, 0, 0, W, H)
      ctx.restore()
    }

    // 5b. Chromatic aberration
    if (pfx.chromatic?.enabled && pfx.chromatic.intensity > 0) {
      const shift = Math.max(1, (pfx.chromatic.intensity / 100) * 8 * dpr)
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.globalCompositeOperation = "screen"
      ctx.drawImage(canvas, -shift, 0)
      ctx.drawImage(canvas, shift, 0)
      ctx.restore()
    }

    // 5c. Scanlines
    if (pfx.scanLines?.enabled && pfx.scanLines.intensity > 0) {
      ctx.save()
      ctx.fillStyle = `rgba(0, 0, 0, ${(pfx.scanLines.intensity / 100) * 0.65})`
      const lineStep = Math.max(2, Math.round(3 * dpr))
      for (let ly = 0; ly < H; ly += lineStep * 2) {
        ctx.fillRect(0, ly, W, lineStep)
      }
      ctx.restore()
    }

    // 5d. Glitch
    if (pfx.glitch?.enabled && pfx.glitch.intensity > 0) {
      const glitchChance = (pfx.glitch.intensity / 100) * 0.4
      if (Math.random() < glitchChance) {
        ctx.save()
        const sliceY = Math.random() * (H - 20)
        const sliceH = 10 + Math.random() * 30
        const sliceShift = (Math.random() - 0.5) * 20 * dpr
        ctx.drawImage(canvas, 0, sliceY, W, sliceH, sliceShift, sliceY, W, sliceH)
        ctx.restore()
      }
    }

    // 5e. Halftone
    if (pfx.halftone?.enabled && pfx.halftone.intensity > 0) {
      ctx.save()
      ctx.fillStyle = `rgba(255, 255, 255, ${(pfx.halftone.intensity / 100) * 0.15})`
      const htStep = Math.max(4, 8 * dpr)
      for (let hy = 0; hy < H; hy += htStep) {
        for (let hx = 0; hx < W; hx += htStep) {
          ctx.beginPath()
          ctx.arc(hx, hy, 1.2 * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    }

    // 5f. Film Grain
    if (pfx.filmGrain?.enabled && pfx.filmGrain.intensity > 0) {
      const grainCanvas = document.createElement("canvas")
      const gw = Math.min(W, 256)
      const gh = Math.min(H, 256)
      grainCanvas.width = gw
      grainCanvas.height = gh
      const gctx = grainCanvas.getContext("2d")!
      const gImgData = gctx.createImageData(gw, gh)
      const gData = gImgData.data
      const gAlpha = Math.round((pfx.filmGrain.intensity / 100) * 45)
      for (let i = 0; i < gData.length; i += 4) {
        const val = Math.random() * 255
        gData[i] = val
        gData[i + 1] = val
        gData[i + 2] = val
        gData[i + 3] = gAlpha
      }
      gctx.putImageData(gImgData, 0, 0)

      ctx.save()
      ctx.globalCompositeOperation = "overlay"
      const pattern = ctx.createPattern(grainCanvas, "repeat")
      if (pattern) {
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, W, H)
      }
      ctx.restore()
    }

    // 5g. Film Dust
    if (pfx.filmDust?.enabled && pfx.filmDust.intensity > 0) {
      ctx.save()
      const dustCount = Math.floor((pfx.filmDust.intensity / 100) * 15)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)"
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)"
      for (let i = 0; i < dustCount; i++) {
        const fx = Math.random() * W
        const fy = Math.random() * H
        if (Math.random() > 0.5) {
          ctx.beginPath()
          ctx.arc(fx, fy, Math.random() * 1.5, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.moveTo(fx, fy)
          ctx.lineTo(fx + (Math.random() - 0.5) * 8, fy + (Math.random() - 0.5) * 8)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // 5h. Vignette
    if (pfx.vignette?.enabled && pfx.vignette.intensity > 0) {
      ctx.save()
      const maxR = Math.hypot(W / 2, H / 2)
      const vigGrad = ctx.createRadialGradient(W / 2, H / 2, maxR * 0.35, W / 2, H / 2, maxR)
      const vigAlpha = Math.max(0, Math.min(1, (pfx.vignette.intensity / 100) * 0.95))
      vigGrad.addColorStop(0, "rgba(0, 0, 0, 0)")
      vigGrad.addColorStop(0.7, `rgba(4, 8, 14, ${vigAlpha * 0.45})`)
      vigGrad.addColorStop(1, `rgba(0, 0, 0, ${vigAlpha})`)
      ctx.fillStyle = vigGrad
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }

    // Stage 6: Light points
    if (params.lights?.enabled && params.lights.points?.length > 0) {
      ctx.save()
      ctx.globalCompositeOperation = "screen"
      for (const pt of params.lights.points) {
        const px = pt.x * W
        const py = pt.y * H
        const pr = Math.max(10, pt.radius * dpr)
        const pInt = Math.max(0, Math.min(1, pt.intensity / 100))
        const lightGrad = ctx.createRadialGradient(px, py, 0, px, py, pr)
        lightGrad.addColorStop(0, `rgba(255, 255, 255, ${pInt})`)
        lightGrad.addColorStop(0.35, pt.color || `rgba(60, 166, 255, ${pInt * 0.7})`)
        lightGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
        ctx.fillStyle = lightGrad
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // Stage 7: Mask reveal to original photo
    if (params.mask?.enabled && maskImgRef.current) {
      ctx.save()
      const maskCanvas = document.createElement("canvas")
      maskCanvas.width = W
      maskCanvas.height = H
      const mCtx = maskCanvas.getContext("2d")!
      mCtx.drawImage(maskImgRef.current, 0, 0, W, H)

      if (params.mask.invert) {
        // Invert mask
        const mData = mCtx.getImageData(0, 0, W, H)
        for (let i = 0; i < mData.data.length; i += 4) {
          mData.data[i + 3] = 255 - mData.data[i + 3]
        }
        mCtx.putImageData(mData, 0, 0)
      }

      // Draw original photo through mask
      mCtx.globalCompositeOperation = "source-in"
      mCtx.drawImage(offCanvas, 0, 0)
      ctx.drawImage(maskCanvas, 0, 0)
      ctx.restore()
    }
  }, [params, imageLoaded])

  // Animation render loop
  useEffect(() => {
    let active = true

    const loop = () => {
      if (!active) return
      renderFrame()
      if (params.animated) {
        animationFrameRef.current = requestAnimationFrame(loop)
      }
    }

    loop()

    return () => {
      active = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [renderFrame, params.animated])

  const updateParam = <K extends keyof AsciiVignetteParams>(key: K, val: AsciiVignetteParams[K]) => {
    setParams((p) => {
      const next = { ...p, [key]: val }
      onParamChange?.(next)
      return next
    })
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-3xl border border-white/[0.08] shadow-2xl bg-base-950 ${className}`}
      style={{ width, height, ...style }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block object-cover"
        style={{ imageRendering: "auto" }}
      />

      {/* Interactive Controls Overlay (optional toggle) */}
      {(showControls || interactive) && (
        <div className="absolute bottom-3 left-3 right-3 p-3 rounded-2xl glass-strong border border-white/[0.12] flex flex-wrap items-center justify-between gap-3 text-xs z-20 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Mode</span>
            <select
              value={params.renderMode}
              onChange={(e) => updateParam("renderMode", e.target.value as RenderMode)}
              className="bg-black/50 border border-white/10 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent"
            >
              {[
                "mosaic",
                "characters",
                "dither",
                "pixel",
                "dots",
                "cross",
                "diamond",
                "voxel",
                "lego",
                "mixed",
                "lines",
                "diagonal",
                "braille",
                "disco",
                "hexdump",
                "matrix",
                "rings",
                "hearts",
                "stars",
                "hexagons",
                "triangles",
                "bubbles",
                "hatch",
                "contour",
                "halfblocks",
              ].map((m) => (
                <option key={m} value={m} className="bg-slate-900 text-white">
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={params.pfx.bloom.enabled}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    pfx: {
                      ...p.pfx,
                      bloom: { ...p.pfx.bloom, enabled: e.target.checked },
                    },
                  }))
                }
                className="rounded bg-black/40 border-white/20 text-accent focus:ring-0"
              />
              <span>Bloom</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={params.pfx.vignette.enabled}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    pfx: {
                      ...p.pfx,
                      vignette: { ...p.pfx.vignette, enabled: e.target.checked },
                    },
                  }))
                }
                className="rounded bg-black/40 border-white/20 text-accent focus:ring-0"
              />
              <span>Vignette</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={params.animated}
                onChange={(e) => updateParam("animated", e.target.checked)}
                className="rounded bg-black/40 border-white/20 text-accent focus:ring-0"
              />
              <span>Animate</span>
            </label>

            <select
              value={params.animStyle}
              onChange={(e) => updateParam("animStyle", e.target.value as AnimStyle)}
              disabled={!params.animated}
              className="bg-black/50 border border-white/10 text-white rounded-lg px-2 py-1 text-xs focus:outline-none disabled:opacity-40"
            >
              <option value="wave">Wave</option>
              <option value="pulse">Pulse</option>
              <option value="shimmer">Shimmer</option>
              <option value="ripple">Ripple</option>
              <option value="flicker">Flicker</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export default AsciiVignetteBloom
