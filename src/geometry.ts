import { SCALE } from './floorplan'
import type { Point, Room, Wall } from './floorplan'

export type Selection =
  | { type: 'room'; id: string }
  | { type: 'room-point'; id: string; index: number }
  | { type: 'wall'; id: string }
  | null

export function toWorld(x: number, y: number): [number, number, number] {
  return [(x - 52) * SCALE, 0, (y - 36) * SCALE]
}

export function interp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export function wallLength(wall: Wall) {
  return Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1])
}

export function roomPoints(room: Room): Point[] {
  return room.points && room.points.length >= 3 ? room.points : [[room.x, room.y], [room.x + room.w, room.y], [room.x + room.w, room.y + room.d], [room.x, room.y + room.d]]
}

export function polygonArea(points: Point[]) {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

export function roomArea(room: Room) {
  return polygonArea(roomPoints(room))
}

export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return [0, 0]
  let x = 0
  let y = 0
  for (const point of points) {
    x += point[0]
    y += point[1]
  }
  return [x / points.length, y / points.length]
}

export function roomCenter(room: Room): Point {
  return polygonCentroid(roomPoints(room))
}

export function polygonBounds(points: Point[]) {
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function selectionKey(selection: Selection) {
  return selection ? `${selection.type}:${selection.id}` : ''
}
