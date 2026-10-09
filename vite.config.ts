import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

// Relative assets support GitHub Pages and other static hosts, including a subdirectory.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), {
    name: 'published-pdf-documents',
    generateBundle() {
      for (const filename of ['report.pdf', 'presentation.pdf']) {
        this.emitFile({ type: 'asset', fileName: `docs/${filename}`, source: readFileSync(path.resolve(root, 'docs', filename)) })
      }
    },
  }],
  resolve: { alias: { '@': path.resolve(root, './src') } },
  publicDir: 'public-landing',
})
