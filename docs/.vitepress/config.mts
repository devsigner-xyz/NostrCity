import { defineConfig } from 'vitepress';
import { resolvePublicAppUrl } from '../../src/site/app-url';

const appUrl = resolvePublicAppUrl(process.env);

export default defineConfig({
  lang: 'es-ES',
  title: 'Nostr City',
  description: 'Centro de ayuda de Nostr City',
  base: '/docs/',
  head: [
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icon-light-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/icon-light-180x180.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
  ],
  cleanUrls: true,
  lastUpdated: process.env.VITEPRESS_LAST_UPDATED !== 'false',
  outDir: '../dist/docs',
  ignoreDeadLinks: ['/app/', '/app/index'],
  srcExclude: ['superpowers/**', 'migration/**', 'landing-routing.md', 'portfolio-backend-first.md'],
  themeConfig: {
    nav: [
      { text: 'Documentación', link: '/' },
      { text: 'Aplicación', link: appUrl },
      { text: 'GitHub', link: 'https://github.com/strhodler/NostrCity' },
    ],
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/strhodler/NostrCity' },
    ],
    sidebar: [
      {
        text: 'Empezar',
        items: [
          { text: 'Inicio', link: '/' },
          { text: 'Primeros pasos', link: '/empezar/' },
          { text: 'Usar en local', link: '/empezar/usar-en-local' },
          { text: 'Recorrido rápido', link: '/empezar/primeros-pasos' },
          { text: 'Mapa y controles', link: '/empezar/mapa-y-controles' },
          { text: 'Exportación y STL', link: '/empezar/exportacion-y-stl' },
        ],
      },
      {
        text: 'Conceptos básicos',
        items: [
          { text: 'Qué es Nostr City', link: '/conceptos/que-es-nostr-city' },
          { text: 'Qué es Nostr', link: '/conceptos/que-es-nostr' },
        ],
      },
      {
        text: 'Cuenta y acceso',
        items: [
          { text: 'Acceso y login', link: '/cuenta-y-acceso/acceso-y-login' },
          { text: 'Crear cuenta', link: '/cuenta-y-acceso/crear-cuenta' },
          { text: 'Relays y configuración', link: '/cuenta-y-acceso/relays-y-configuracion' },
        ],
      },
      {
        text: 'Protocolo Nostr',
        items: [
          { text: 'NIPs usadas', link: '/protocolo/nips-usadas' },
          { text: 'Aplicación en Nostr City', link: '/protocolo/aplicacion-en-nostr-city' },
        ],
      },
      {
        text: 'Grupos',
        items: [{ text: 'Grupos', link: '/grupos/' }],
      },
      {
        text: 'Ayuda',
        items: [{ text: 'Preguntas frecuentes', link: '/faq/' }],
      },
    ],
    outline: {
      level: [2, 3],
      label: 'En esta página',
    },
    docFooter: {
      prev: 'Página anterior',
      next: 'Página siguiente',
    },
  },
});
