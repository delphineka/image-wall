import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'ImageWall',
            fileName: (format) => `imagewall.${format}.js`,
            formats: ['es', 'umd'],
        },
        minify: 'esbuild',
        rollupOptions: {
            // Exclude dependencies that shouldn’t be bundled (none yet)
            external: [],
            output: {
                globals: {},
                assetFileNames: (assetInfo) => {
                    // rename Vite's default 'style.css' output
                    if (assetInfo.name === 'style.css') return 'imagewall.css';
                    return assetInfo.name!;
                },
            },
        },
    },
});
