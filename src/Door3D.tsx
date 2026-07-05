/**
 * 3D 门组件 — 带往返旋转动画
 * 使用 useFrame + useRef 实现平滑动画，避免不必要的 re-render
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface Door3DProps {
  position: [number, number, number]
  rotation: number
  width: number
  height: number
  swing?: 'left' | 'right'
}

export function Door3D({ position, rotation, width, height, swing = 'left' }: Door3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const depth = 0.03

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    // 往返动画：0° → 85° → 0°
    const time = clock.getElapsedTime()
    const maxAngle = THREE.MathUtils.degToRad(85)
    const angle = Math.sin(time * 1.5) * maxAngle
    // swing='left' 逆时针（正向），'right' 顺时针（反向）
    const direction = swing === 'left' ? 1 : -1
    groupRef.current.rotation.y = direction * angle
  })

  return (
    <group position={position} rotation={[0, -rotation, 0]}>
      {/* 门轴位于门板左侧边缘，通过 group 的 position 偏移实现 */}
      <group ref={groupRef} position={[width / 2, 0, 0]}>
        <mesh castShadow>
          {/* 门板几何体 */}
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial
            color="#c4956a"
            roughness={0.6}
            metalness={0.05}
          />
        </mesh>
        {/* 门把手（小装饰球） */}
        <mesh position={[-width / 2 + 0.04, -height / 2 + 0.12, depth / 2 + 0.005]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial color="#b8860b" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
    </group>
  )
}
