# Crear cuenta

Esta página resume cuándo tiene sentido crear una cuenta nueva en Nostr City y cuándo conviene reutilizar una identidad existente.

## Antes de crear una cuenta

En Nostr, tu identidad se basa en claves. La clave pública se puede compartir como `npub`; la capacidad de publicar depende de un método de firma: extensión NIP-07, búnker NIP-46 o cuenta local.

Nostr City no necesita una cuenta central en un servidor propio para empezar. Lo que necesita es saber con qué identidad quieres entrar y, si quieres escribir, cómo se firmarán los eventos.

## Cuándo tiene sentido crear una cuenta local

- Quieres probar Nostr City sin tocar tu identidad principal.
- Estás aprendiendo Nostr desde cero.
- Prefieres separar una identidad de exploración de tu actividad habitual.
- No tienes una extensión NIP-07 ni un búnker NIP-46 configurados.

Una cuenta local puede firmar eventos desde este navegador/dispositivo mientras esté desbloqueada. Si eliges una passphrase, guárdala con cuidado: Nostr City no puede recuperarla por ti.

## Cuándo conviene reutilizar una identidad existente

- Ya tienes contactos y follows en Nostr.
- Quieres ver la ciudad construida con tu propio contexto social.
- Buscas continuidad entre Nostr City y otros clientes.
- Ya confías en una extensión NIP-07 o en un búnker NIP-46 para firmar.

Reutilizar una identidad suele dar una visualización más representativa, porque la app puede encontrar perfiles, follows, relays y actividad asociados a esa clave pública.

## Diferencias rápidas entre métodos

| Método | Qué aporta | Límite principal |
| --- | --- | --- |
| `npub` | Entrada en modo lectura con una clave pública. | No puede firmar ni publicar. |
| Extensión NIP-07 | Firma desde una extensión del navegador. | Depende de la extensión y de sus permisos. |
| Búnker/QR NIP-46 | Firma remota sin entregar la clave privada a la app. | Requiere reconexión explícita y permisos aprobados por el firmante. |
| Cuenta local | Firma desde material guardado localmente. | Depende del dispositivo, del navegador y de la protección local. |

## Privacidad y recuperación

- Una cuenta local no convierte a Nostr City en custodio central de tu identidad.
- Los eventos que publiques en Nostr pueden ser públicos según su tipo y los relays donde se publiquen.
- Los grupos guardados se publican como una lista pública `kind:10009`; guardar un grupo no demuestra membresía.
- Si usas una cuenta local, conserva cualquier material de recuperación o passphrase que hayas elegido. Sin eso, la cuenta puede quedar inaccesible desde este dispositivo.

## Consejo práctico

Si tu objetivo es entender la propuesta del proyecto, una cuenta local nueva o un `npub` pueden ser suficientes. Si tu objetivo es ver valor real en la visualización social, usar tu identidad habitual con NIP-07 o NIP-46 suele ser más representativo.

## Relacionado

- [Acceso y login](/cuenta-y-acceso/acceso-y-login)
- [Qué es Nostr](/conceptos/que-es-nostr)
- [Grupos](/grupos/)
