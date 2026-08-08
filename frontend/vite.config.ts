import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) =>
            tag.startsWith('flutter-') ||
            tag.startsWith('webf-') ||
            tag.startsWith('songloft-'),
        },
      },
    }),
    {
      name: 'songloft-html-transform',
      apply: 'build',
      transformIndexHtml(html) {
        let output = html.replace(/"\.\//g, '"static/');
        output = output.replace(/\s+crossorigin(?==|\s|>)/g, '');
        const script = output.match(
          /<script\b[^>]*\bsrc="static\/js\/app\.js"[^>]*><\/script>/,
        );
        if (!script) {
          throw new Error('没有生成 builder 要求的 static/js/app.js 引用');
        }
        output = output.replace(script[0], '');
        return output
          .replace(/[ \t]+$/gm, '')
          .replace('</body>', `${script[0]}\n  </body>`);
      },
    },
  ],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    cssTarget: 'chrome61',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'js/app.js',
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css')
            ? 'css/style.css'
            : 'assets/[name].[ext]',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:58091',
        changeOrigin: true,
      },
    },
  },
});
