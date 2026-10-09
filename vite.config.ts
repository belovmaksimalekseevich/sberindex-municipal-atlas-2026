import path from 'node:path'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative assets support GitHub Pages and other static hosts, including a subdirectory.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), {
    name: 'published-pdf-documents',
    generateBundle() {
      for (const filename of ['report.pdf', 'presentation.pdf']) {
        this.emitFile({ type: 'asset', fileName: `docs/${filename}`, source: readFileSync(path.resolve(__dirname, 'docs', filename)) })
      }
    },
  }],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  publicDir: 'public-landing',
})
