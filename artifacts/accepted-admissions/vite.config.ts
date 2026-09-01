import path from 'path';
import { writeFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT ?? '5173';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';
const outputDir = path.resolve(import.meta.dirname, 'dist/public');
const publicOrigin =
  process.env.PUBLIC_SITE_ORIGIN ??
  'https://accepted-admissions-platform.replit.app';
const normalizedBasePath = `/${basePath.replace(/^\/|\/$/g, '')}${basePath === '/' ? '' : '/'}`;

function crawlerAssets() {
  const publicBaseUrl = new URL(normalizedBasePath, publicOrigin);
  return {
    name: 'base-path-aware-crawler-assets',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      const canonicalUrl = publicBaseUrl.href;
      return html
        .replace(
          /<link rel="canonical" href="[^"]*" \/>/,
          `<link rel="canonical" href="${canonicalUrl}" />`,
        )
        .replace(
          /<meta property="og:url" content="[^"]*" \/>/,
          `<meta property="og:url" content="${canonicalUrl}" />`,
        );
    },
    async closeBundle() {
      const publicRoutes = ['/', '/sat', '/our-team', '/past-success', '/client-request'];
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...publicRoutes.flatMap((route, index) => [
          '  <url>',
          `    <loc>${new URL(route.replace(/^\//, ''), publicBaseUrl).href}</loc>`,
          `    <changefreq>${index < 2 ? 'weekly' : 'monthly'}</changefreq>`,
          `    <priority>${index === 0 ? '1.0' : index === 1 || index === 4 ? '0.9' : '0.8'}</priority>`,
          '  </url>',
        ]),
        '</urlset>',
        '',
      ].join('\n');
      const robots = [
        'User-agent: *',
        'Allow: /',
        `Disallow: ${normalizedBasePath}admin`,
        `Disallow: ${normalizedBasePath}api/`,
        `Disallow: ${normalizedBasePath}login`,
        `Disallow: ${normalizedBasePath}portal`,
        `Disallow: ${normalizedBasePath}sign-in`,
        `Disallow: ${normalizedBasePath}t-g`,
        `Disallow: ${normalizedBasePath}tutor`,
        '',
        `Sitemap: ${new URL('sitemap.xml', publicBaseUrl).href}`,
        '',
      ].join('\n');
      await Promise.all([
        writeFile(path.join(outputDir, 'robots.txt'), robots),
        writeFile(path.join(outputDir, 'sitemap.xml'), sitemap),
      ]);
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    crawlerAssets(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
