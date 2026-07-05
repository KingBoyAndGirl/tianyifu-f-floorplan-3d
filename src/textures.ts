/**
 * 程序化生成砖墙纹理（Canvas API）
 * 无需外部资源，运行时生成 Three.js CanvasTexture
 */
import * as THREE from 'three'

/**
 * 创建砖墙颜色贴图
 * @param color 砖块颜色
 * @param mortarColor 砂浆颜色
 * @param brickW 砖块宽度（像素）
 * @param brickH 砖块高度（像素）
 */
export function createBrickTexture(
  color = '#8B7355',
  mortarColor = '#c4b59a',
  brickW = 120,
  brickH = 40
): THREE.CanvasTexture {
  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 背景色（砂浆）
  ctx.fillStyle = mortarColor
  ctx.fillRect(0, 0, w, h)

  // 绘制砖块，每行交错半个砖宽
  const mortarGap = 4
  const rows = Math.ceil(h / (brickH + mortarGap))
  const cols = Math.ceil(w / (brickW + mortarGap)) + 1

  for (let row = 0; row < rows; row++) {
    const offsetX = row % 2 === 0 ? 0 : brickW / 2
    for (let col = 0; col < cols; col++) {
      const x = col * (brickW + mortarGap) + offsetX
      const y = row * (brickH + mortarGap)
      // 砖块颜色微随机，增加真实感
      const variation = Math.floor(Math.random() * 15 - 7)
      const brickColor = adjustBrightness(color, variation)
      ctx.fillStyle = brickColor
      ctx.fillRect(x, y, brickW, brickH)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  return texture
}

/**
 * 从颜色贴图推导简易法线贴图
 * 砖块凸起、砂浆凹陷
 */
export function createBrickNormalMap(): THREE.CanvasTexture {
  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 生成与颜色贴图相同的砖块布局
  const brickW = 120
  const brickH = 40
  const mortarGap = 4

  // 背景色（砂浆区域：法线指向凹陷方向 - 偏蓝/偏下）
  ctx.fillStyle = 'rgb(128, 128, 200)'
  ctx.fillRect(0, 0, w, h)

  const rows = Math.ceil(h / (brickH + mortarGap))
  const cols = Math.ceil(w / (brickW + mortarGap)) + 1

  for (let row = 0; row < rows; row++) {
    const offsetX = row % 2 === 0 ? 0 : brickW / 2
    for (let col = 0; col < cols; col++) {
      const x = col * (brickW + mortarGap) + offsetX
      const y = row * (brickH + mortarGap)
      // 砖块区域：法线朝上（偏红/偏上），凸起效果
      ctx.fillStyle = 'rgb(160, 160, 128)'
      ctx.fillRect(x, y, brickW, brickH)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  return texture
}

/**
 * 非承重墙浅色纹理
 */
export function createPartitionTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 浅灰白底色
  ctx.fillStyle = '#e8e0d5'
  ctx.fillRect(0, 0, w, h)

  // 极淡的纹理线条，模拟墙面质感
  ctx.strokeStyle = 'rgba(180, 170, 155, 0.15)'
  ctx.lineWidth = 0.5
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    ctx.beginPath()
    ctx.arc(x, y, Math.random() * 20 + 5, 0, Math.PI * 2)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 1)
  return texture
}

/**
 * 辅助：调整颜色亮度
 */
function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `rgb(${r}, ${g}, ${b})`
}
