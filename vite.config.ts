import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8089,
    allowedHosts: ['8089-hermesstudio.nasw.heiyu.space'],
  },
})
