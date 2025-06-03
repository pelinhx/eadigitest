import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs-extra'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'copy-preprocessed-data',
      closeBundle: async () => {
        try {
          const srcDir = path.resolve(__dirname, 'public/preprocessed_data')
          const destDir = path.resolve(__dirname, 'dist/preprocessed_data')
          
          console.log('Copying preprocessed_data folder to dist...')
          
          // Check if source directory exists
          if (fs.existsSync(srcDir)) {
            // Ensure destination directory exists
            await fs.ensureDir(destDir)
            
            // Copy all files recursively
            await fs.copy(srcDir, destDir)
            
            console.log(`✅ Successfully copied preprocessed_data folder to dist`)
          } else {
            console.warn('⚠️ preprocessed_data folder not found in public directory')
            
            // Check if it exists elsewhere and create a notice
            const projectRootDir = path.resolve(__dirname, 'preprocessed_data')
            if (fs.existsSync(projectRootDir)) {
              console.log('Found preprocessed_data in project root, copying to dist folder')
              await fs.ensureDir(destDir)
              await fs.copy(projectRootDir, destDir)
            }
          }
          
          // Also ensure we copy any standalone JSON files
          const jsonFiles = await fs.readdir(__dirname)
          for (const file of jsonFiles) {
            if (file.endsWith('.json') && !file.includes('package') && !file.includes('tsconfig')) {
              console.log(`Copying standalone JSON file: ${file}`)
              await fs.copy(
                path.resolve(__dirname, file),
                path.resolve(__dirname, 'dist', file)
              )
            }
          }
        } catch (err) {
          console.error('❌ Error copying preprocessed_data folder:', err)
        }
      }
    }
  ],
  base: '/eadigitest/', // Updated base path for GitHub Pages
  build: {
    outDir: 'dist',
    emptyOutDir: true, // Clean output directory before build
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          d3: ['d3'] // Split D3 into separate chunk for better caching
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    cors: true
  }
})