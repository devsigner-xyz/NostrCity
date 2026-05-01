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
  lastUpdated: true,
  outDir: '../dist/docs',
  ignoreDeadLinks: ['/app/', '/app/index'],
  srcExclude: ['superpowers/**', 'migration/**', 'landing-routing.md', 'portfolio-backend-first.md'],
  themeConfig: {
    nav: [
      { text: 'Documentacion', link: '/' },
      { text: 'Aplicacion', link: appUrl },
      { text: 'GitHub', link: 'https://github.com/devsigner-xyz/NostrCity' },
    ],
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/devsigner-xyz/NostrCity' },
    ],
    sidebar: [
      {
        text: 'Empezar',
        items: [
          { text: 'Inicio', link: '/' },
          { text: 'Primeros pasos', link: '/empezar/' },
          { text: 'Recorrido rapido', link: '/empezar/primeros-pasos' },
          { text: 'Mapa y controles', link: '/empezar/mapa-y-controles' },
          { text: 'Exportacion y STL', link: '/empezar/exportacion-y-stl' },
        ],
      },
      {
        text: 'Conceptos basicos',
        items: [
          { text: 'Que es Nostr City', link: '/conceptos/que-es-nostr-city' },
          { text: 'Que es Nostr', link: '/conceptos/que-es-nostr' },
        ],
      },
      {
        text: 'Cuenta y acceso',
        items: [
          { text: 'Acceso y login', link: '/cuenta-y-acceso/acceso-y-login' },
          { text: 'Crear cuenta', link: '/cuenta-y-acceso/crear-cuenta' },
          { text: 'Relays y configuracion', link: '/cuenta-y-acceso/relays-y-configuracion' },
        ],
      },
      {
        text: 'Protocolo Nostr',
        items: [
          { text: 'NIPs usadas', link: '/protocolo/nips-usadas' },
          { text: 'Aplicacion en Nostr City', link: '/protocolo/aplicacion-en-nostr-city' },
        ],
      },
      {
        text: 'Ayuda',
        items: [{ text: 'Preguntas frecuentes', link: '/faq/' }],
      },
    ],
    outline: {
      level: [2, 3],
      label: 'En esta pagina',
    },
    docFooter: {
      prev: 'Pagina anterior',
      next: 'Pagina siguiente',
    },
  },
});
