import * as THREE from 'three'

export type BrickColorScheme = 'load-bearing' | 'non-load-bearing' | 'low-wall'

interface BrickConfig {
  brickW: number      // 砖块宽度 (px)
  brickH: number      // 砖块高度 (px)
  mortarWidth: number // 砂浆缝宽 (px)
  colorScheme: BrickColorScheme
}

const SCHEMES: Record<BrickColorScheme, { base: string; mortar: string; variation: number }> = {
  'load-bearing':      { base: '#b5653a', mortar: '#c9b69a', variation: 30 },
  'non-load-bearing':  { base: '#d9c7aa', mortar: '#dfd4c0', variation: 20 },
  'low-wall':          { base: '#e6dccd', mortar: '#eae4d6', variation: 15 },
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

/**
 * 程序化生成砖块纹理，使用 Canvas 2D API。
 * - 错缝排列（每两行错开半砖）
 * - 随机颜色微变
 * - 砂浆线
 * - 无缝平铺
 */
export function createBrickTexture(scheme: BrickColorScheme = 'load-bearing'): THREE.CanvasTexture {
  const config: BrickConfig = {
    brickW: 64,
    brickH: 28,
    mortarWidth: 4,
    colorScheme: scheme,
  }

  const { brickW, brickH, mortarWidth } = config
  const schemeColors = SCHEMES[scheme]
  const [baseR, baseG, baseB] = hexToRgb(schemeColors.base)

  // 纹理尺寸 = 2 行砖 + 砂浆，保证无缝平铺
  const texW = brickW * 2 + mortarWidth * 2
  const texH = (brickH + mortarWidth) * 2

  const canvas = document.createElement('canvas')
  canvas.width = texW
  canvas.height = texH
  const ctx = canvas.getContext('2d')!
  const variation = schemeColors.variation

  // 清空为砂浆色
  ctx.fillStyle = schemeColors.mortar
  ctx.fillRect(0, 0, texW, texH)

  // 绘制砖块，每两行错缝
  const rows = 4 // 4 行确保无缝
  for (let row = 0; row < rows; row++) {
    const offsetX = row % 2 === 0 ? 0 : brickW / 2 + mortarWidth
    const y = row * (brickH + mortarWidth)
    // 每行砖数
    const cols = row % 2 === 0 ? 2 : 2
    for (let col = 0; col < cols; col++) {
      const x = offsetX + col * (brickW + mortarWidth)

      // 随机颜色微变
      const rv = (Math.random() - 0.5) * variation
      const gv = (Math.random() - 0.5) * variation
      const bv = (Math.random() - 0.5) * variation

      const r = clamp(baseR + rv)
      const g = clamp(baseG + gv)
      const b = clamp(baseB + bv)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.fillRect(x, y, brickW, brickH)

      // 砖块微妙的表面质感——轻微高光边缘
      ctx.strokeStyle = `rgba(255,255,255,0.04)`
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, brickW - 1, brickH - 1)
    }
  }

  // 绘制砂浆垂直线（在重复边界处确保连续）
  ctx.fillStyle = schemeColors.mortar
  // 第 0 行和第 2 行的垂直砂浆缝
  for (let row = 0; row < rows; row += 2) {
    const y = row * (brickH + mortarWidth)
    for (let col = 0; col <= 2; col++) {
      const x = col * (brickW + mortarWidth)
      ctx.fillRect(x - mortarWidth / 2, y, mortarWidth, brickH)
    }
  }

  // 第 1 行和第 3 行的垂直砂浆缝（错开）
  for (let row = 1; row < rows; row += 2) {
    const y = row * (brickH + mortarWidth)
    for (let col = 0; col <= 2; col++) {
      const x = brickW / 2 + mortarWidth + col * (brickW + mortarWidth)
      ctx.fillRect(x - mortarWidth / 2, y, mortarWidth, brickH)
    }
  }

  // 水平砂浆缝
  for (let row = 1; row < rows; row++) {
    const y = row * (brickH + mortarWidth) - mortarWidth / 2
    ctx.fillRect(0, y, texW, mortarWidth)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4

  return texture
}

/**
 * 根据墙的实际长度（模型单位）计算纹理 repeat。
 * 1 模型单位 ≈ 米，砖块现实 ≈ 0.24m × 0.12m（含缝）
 */
export function brickRepeat(length: number): number {
  // 1 模型单位 = 1 米
  // 砖块含缝约 0.26m 宽
  return length / 0.26
}
