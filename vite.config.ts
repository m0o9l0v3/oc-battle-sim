import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス配下で配信されるため、CI から BASE_PATH を渡す
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
