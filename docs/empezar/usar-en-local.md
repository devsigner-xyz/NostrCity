# Usar Nostr City en local

La forma recomendada de usar Nostr City con todas sus capacidades es ejecutarla en tu propio equipo. Así evitas depender de la instancia pública y reduces la exposición de flujos sensibles a un dominio de terceros.

## Opción rápida con Docker

Requisitos:

- Docker Desktop o Docker Engine con Docker Compose.
- Git para clonar el repositorio.

Desde la raíz del proyecto:

```bash
docker compose up --build
```

Abre:

- Aplicación: `http://127.0.0.1:3000/app/`
- Documentación: `http://127.0.0.1:3000/docs/`
- Health check: `http://127.0.0.1:3000/v1/health`

Para detenerla:

```bash
docker compose down
```

## Capacidades disponibles en local

En local, la app puede ofrecer los métodos de acceso completos que soporte la versión actual:

- `npub` en modo lectura.
- Extensión NIP-07, si tu navegador la expone a la página local.
- Búnker o QR NIP-46.
- Cuenta local guardada en el navegador.

La cuenta local sigue dependiendo del almacenamiento del navegador, del dispositivo y de la passphrase o protección que elijas. Nostr City no puede recuperar una clave perdida.

## Opción para desarrollo

Si quieres modificar código o ejecutar tests, usa la instalación con Node y pnpm:

```bash
corepack enable
corepack use pnpm@10.33.0
pnpm install
make dev
```

La app quedará en `http://127.0.0.1:5173/app/` y la documentación en `http://127.0.0.1:5174/docs/`.

## Límites

- Docker local no está pensado como despliegue público de producción.
- El compose por defecto escucha solo en `127.0.0.1`.
- No metas secretos en `.env`, argumentos de build ni imágenes Docker.
- Los eventos que publiques en Nostr pueden ser públicos según su tipo y los relays usados.

## Relacionado

- [Acceso y login](/cuenta-y-acceso/acceso-y-login)
- [Primeros pasos](/empezar/primeros-pasos)
- [Relays y configuración](/cuenta-y-acceso/relays-y-configuracion)
