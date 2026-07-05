import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WALL_HEIGHT } from './floorplan'
import type { OpeningSwing } from './floorplan'

interface DoorModelProps {
  position: [number, number, number]   // 门扇底部中心位置（世界坐标）
  width: number                         // 门宽（模型单位）
  swing: OpeningSwing                   // 开门方向
  hingeSide: 'start' | 'end'            // 铰链在 opening 的起点侧还是终点侧
  opened?: boolean                      // 是否打开
}

const DOOR_HEIGHT = WALL_HEIGHT * 0.85
const DOOR_THICKNESS = 0.04

/**
 * 3D 门扇组件。
 * - 薄板 boxGeometry 表示门扇
 * - 根据 swing 和 hingeSide 确定铰链侧
 * - useFrame + MathUtils.lerp 平滑开合动画
 */
export function DoorModel({ position, width, swing, hingeSide: _hingeSide, opened = false }: DoorModelProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [targetAngle, setTargetAngle] = useState(opened ? Math.PI / 2 : 0)
  const currentAngle = useRef(0)

  useEffect(() => {
    setTargetAngle(opened ? Math.PI / 2 : 0)
  }, [opened])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    // 用 lerp 平滑过渡
    currentAngle.current = THREE.MathUtils.lerp(currentAngle.current, targetAngle, delta * 4)
    meshRef.current.rotation.y = currentAngle.current
  })

  // 根据 swing 确定初始旋转朝向
  // swing='right' → 顺时针旋转，swing='left' → 逆时针旋转
  // hingeSide 确定门扇展开方向
  const rotationBase = swing === 'right' ? 0 : -Math.PI / 2

  return (
    <mesh
      ref={meshRef}
      position={[position[0], position[1] + DOOR_HEIGHT / 2, position[2]]}
      rotation={[0, rotationBase, 0]}
      castShadow
    >
      <boxGeometry args={[width, DOOR_HEIGHT, DOOR_THICKNESS]} />
      <meshStandardMaterial
        color="#d4b896"
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  )
}
