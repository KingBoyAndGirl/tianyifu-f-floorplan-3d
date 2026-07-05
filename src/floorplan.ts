export type Point = [number, number]

export type RoomType = 'living' | 'wet' | 'balcony' | 'wood' | 'public'

export interface Room {
  id: string
  name: string
  type: RoomType
  x: number
  y: number
  w: number
  d: number
  points?: Point[]
}

export type OpeningType = 'door' | 'window' | 'opening' | 'sliding'
export type OpeningSwing = 'left' | 'right'

export interface WallOpening {
  start: number
  end: number
  type?: OpeningType
  swing?: OpeningSwing
}

export interface Wall {
  id: string
  from: Point
  to: Point
  thickness?: number
  height?: number
  kind?: 'full' | 'low'
  loadBearing?: boolean
  openings?: WallOpening[]
}

export const SCALE = 0.12
export const WALL_HEIGHT = 2.8
export const LOW_WALL_HEIGHT = 1.1
export const WALL_THICKNESS = 0.22
/** 根据墙体 ID 前缀判断是否为承重墙 */
export function isLoadBearingByDefault(id: string): boolean {
  if (id.startsWith('low-')) return false
  if (id.startsWith('i-')) return false
  return true
}


export const rooms: Room[] = [
  { id: 'guest-elevator', name: '客梯', type: 'public', x: 4, y: 9, w: 11, d: 8 },
  { id: 'elevator-hall', name: '电梯厅', type: 'public', x: 4, y: 19, w: 15, d: 12 },
  { id: 'foyer', name: '玄关', type: 'public', x: 19, y: 24, w: 11, d: 8 },
  { id: 'kitchen', name: '厨房', type: 'wood', x: 25, y: 8, w: 15, d: 12 },
  { id: 'dining', name: '餐厅', type: 'wood', x: 40, y: 8, w: 15, d: 12 },
  { id: 'north-bedroom', name: '东北卧', type: 'living', x: 55, y: 5, w: 18, d: 16 },
  { id: 'corridor', name: '过道', type: 'public', x: 39, y: 20, w: 27, d: 12 },
  { id: 'public-bath', name: '公卫', type: 'wet', x: 66, y: 20, w: 10, d: 10 },
  { id: 'master-bath', name: '主卫', type: 'wet', x: 76, y: 24, w: 9, d: 9 },
  { id: 'cloakroom', name: '衣帽间', type: 'living', x: 76, y: 33, w: 10, d: 10 },
  { id: 'southwest-bedroom', name: '西南次卧', type: 'living', x: 8, y: 50, w: 22, d: 19 },
  { id: 'living', name: '客厅', type: 'living', x: 30, y: 35, w: 34, d: 27 },
  { id: 'multi', name: '多功能厅', type: 'living', x: 64, y: 49, w: 12, d: 13 },
  { id: 'balcony', name: '阳台', type: 'balcony', x: 31, y: 62, w: 29, d: 7 },
  { id: 'master', name: '主卧', type: 'living', x: 76, y: 43, w: 23, d: 26 },
  { id: 'equipment', name: '设备平台', type: 'balcony', x: 37, y: 1, w: 23, d: 5 },
]

export const outline: Point[] = [
  [4, 9], [15, 9], [15, 18], [19, 18], [19, 24], [30, 24], [30, 20], [37, 20],
  [37, 1], [60, 1], [60, 6], [73, 6], [73, 20], [85, 20], [85, 43], [99, 43],
  [99, 69], [8, 69], [8, 50], [4, 50],
]

export const walls: Wall[] = [
  { id: 'w-west-a', from: [4, 9], to: [15, 9] },
  { id: 'w-west-b', from: [15, 9], to: [15, 18] },
  { id: 'w-west-c', from: [15, 18], to: [19, 18] },
  { id: 'w-west-d', from: [19, 18], to: [19, 24], openings: [{ start: 2, end: 5 }] },
  { id: 'w-west-e', from: [19, 24], to: [30, 24], openings: [{ start: 4, end: 8 }] },
  { id: 'w-north-a', from: [30, 20], to: [37, 20] },
  { id: 'w-north-b', from: [25, 8], to: [37, 8] },
  { id: 'w-north-c', from: [60, 6], to: [73, 6] },
  { id: 'w-north-d', from: [73, 6], to: [73, 20] },
  { id: 'w-east-a', from: [73, 20], to: [85, 20], openings: [{ start: 5, end: 9 }] },
  { id: 'w-east-b', from: [85, 20], to: [85, 43], openings: [{ start: 9, end: 13 }] },
  { id: 'w-master-top', from: [85, 43], to: [99, 43] },
  { id: 'w-master-east', from: [99, 43], to: [99, 69] },
  { id: 'w-south', from: [8, 69], to: [99, 69], openings: [{ start: 23, end: 52 }] },
  { id: 'w-southwest', from: [8, 50], to: [8, 69] },
  { id: 'w-left-long', from: [4, 19], to: [4, 50], openings: [{ start: 12, end: 16 }] },
  { id: 'w-left-top', from: [4, 9], to: [4, 19] },
  { id: 'i-living-left', from: [30, 35], to: [30, 62], openings: [{ start: 13, end: 18 }] },
  { id: 'i-living-east', from: [64, 20], to: [64, 62], openings: [{ start: 7, end: 11 }, { start: 17, end: 21 }, { start: 29, end: 34 }] },
  { id: 'i-suite-west', from: [76, 20], to: [76, 69], openings: [{ start: 9, end: 14 }, { start: 21, end: 25 }, { start: 29, end: 34 }] },
  { id: 'i-suite-east', from: [85, 24], to: [85, 43], openings: [{ start: 8, end: 12 }] },
  { id: 'i-suite-1', from: [76, 33], to: [99, 33], openings: [{ start: 7, end: 12 }] },
  { id: 'i-suite-2', from: [76, 43], to: [99, 43], openings: [{ start: 10, end: 15 }] },
  { id: 'i-kitchen', from: [25, 20], to: [55, 20], openings: [{ start: 14, end: 19 }] },
  { id: 'i-kitchen-sep', from: [40, 8], to: [40, 20], openings: [{ start: 4, end: 7 }] },
  { id: 'i-north-sep', from: [55, 6], to: [55, 20], openings: [{ start: 5, end: 8 }] },
  { id: 'i-living-north', from: [30, 35], to: [64, 35], openings: [{ start: 12, end: 23 }] },
  { id: 'i-bath-1', from: [66, 30], to: [76, 30], openings: [{ start: 5, end: 9 }] },
  { id: 'i-bath-2', from: [66, 40], to: [76, 40], openings: [{ start: 5, end: 9 }] },
  { id: 'i-multi', from: [66, 50], to: [76, 50], openings: [{ start: 4, end: 8 }] },
  { id: 'low-bal-n', from: [31, 62], to: [60, 62], kind: 'low', openings: [{ start: 8, end: 20 }] },
  { id: 'low-bal-s', from: [31, 69], to: [60, 69], kind: 'low' },
  { id: 'low-bal-w', from: [31, 62], to: [31, 69], kind: 'low' },
  { id: 'low-bal-e', from: [60, 62], to: [60, 69], kind: 'low' },
  { id: 'low-eq-n', from: [37, 1], to: [60, 1], kind: 'low' },
  { id: 'low-eq-s', from: [37, 6], to: [60, 6], kind: 'low', openings: [{ start: 7, end: 15 }] },
  { id: 'low-eq-w', from: [37, 1], to: [37, 6], kind: 'low' },
  { id: 'low-eq-e', from: [60, 1], to: [60, 6], kind: 'low' },
]
