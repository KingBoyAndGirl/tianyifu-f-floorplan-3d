# 天一府 F户型 3D 白模还原

React + Three.js 版户型白模原型，用于留痕和继续迭代。

## 技术栈

- Vite
- React
- TypeScript
- Three.js
- @react-three/fiber
- @react-three/drei
- zustand

## 当前版本

- `V9`：React Three Fiber 真 3D 白模
- 朝向：上北下南、左西右东
- 墙高：约 2.8m 示意
- 阳台 / 设备平台矮墙：约 1.1m 示意
- 交互：左键旋转、滚轮缩放、右键平移

## 本地运行

使用 npm 安装依赖后，启动 Vite dev server，端口固定为 8089，并绑定 0.0.0.0。

## 构建

执行项目 build 脚本即可生成 `dist/`。

## 说明

当前是可交互 3D 白模，不是施工 CAD。精确版需要现场实测：层高、梁高、门高、窗台高、窗高、墙厚、各房间净尺寸。
