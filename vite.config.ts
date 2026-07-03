import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8089,
    allowedHosts: ['8089-hermesstudio.nasw.heiyu.space'],
    // Hermes Studio's proxied Vite dev environment is not injecting the
    // React Refresh preamble, while the React plugin still emits
    // `$RefreshSig$()` calls. Disabling HMR avoids that broken partial
    // Fast Refresh state and fixes the runtime ReferenceError.
    hmr: false,
  },
})
