# Grupos

Los grupos en Nostr City se basan en NIP-29. Son comunidades gestionadas por relays, no salas globales controladas por un servidor central de Nostr City.

Para descubrir grupos, primero eliges relays de grupos. Esos relays son una configuración especializada y local: añadirlos en Nostr City permite consultar grupos NIP-29, pero no publica tus preferencias ni modifica tu lista pública de grupos.

## Identidad de un grupo

Un grupo se identifica por la pareja `{relay,id}`:

- `relay`: el servidor que hospeda y aplica las reglas del grupo.
- `id`: el identificador del grupo dentro de ese relay.

El mismo `id` en otro relay no tiene por qué ser el mismo grupo. Puede ser una copia, una bifurcación o una comunidad distinta. Por eso Nostr City muestra y conserva el relay como parte de la identidad del grupo.

## Qué muestra Nostr City

La página `/groups` empieza por los relays de grupos. Puedes elegir un relay configurado, añadir uno personalizado de forma local o pegar un enlace de invitación que incluya `relay`, `group` y un `code` opcional. NIP-29 define el uso del tag `code` en la solicitud `kind:9021`, pero no define un formato único de URL para invitaciones; Nostr City acepta estos parámetros para poder abrir el grupo y usar el código solo al solicitar unirse. El código no se guarda.

Si todavía no hay relays de grupos configurados, `/groups` muestra una guía de inicio con relays sugeridos que puedes añadir localmente antes de buscar comunidades.

Cuando hay relays configurados, Nostr City muestra la información que cada relay publica y que puede verificarse para ese relay:

- Nombre, descripción e imagen cuando el relay publica metadata `kind:39000`.
- Número de miembros cuando el relay publica una lista `kind:39002` accesible.
- Mensajes recientes `kind:9` etiquetados con `h` para ese grupo.

Para acelerar el descubrimiento, la app puede pedir la metadata pública `kind:39000` a través del BFF de Nostr City. Esa consulta no incluye tu clave pública, tus grupos recordados, tus relays configurados como lista personal ni códigos de invitación; solo envía el relay que quieres explorar.

Nostr City solo trata como metadata de grupo confiable la metadata NIP-29 `kind:39000` firmada por la clave `self` que el relay anuncia en su información NIP-11. Si un relay real tiene NIP-11 ausente o roto, la app puede mostrar metadata `kind:39000` con firma válida como **no verificada**, pero no confía en listas de administradores, miembros o roles (`kind:39001`, `kind:39002`, `kind:39003`) sin `self` verificable. Algunos grupos pueden ser privados, restringidos, ocultos o cerrados. En esos casos, la app puede mostrar menos datos o no poder publicar aunque tengas una identidad válida.

También puedes explorar grupos desde el detalle de un relay de grupos en `/relays`. Esa vista lista los grupos anunciados por ese relay y, al abrir uno, enlaza con `/groups?relay=...&group=...`. Si el grupo está entre los grupos cargados, queda seleccionado directamente.

## Grupos guardados y privacidad

Por defecto, configurar relays de grupos y añadir relays sugeridos es local. No publica un evento `kind:10009` ni comparte tus relays de grupos con otros clientes.

Unirse a un grupo envía una solicitud `kind:9021` al relay del grupo. Si la solicitud se publica correctamente, Nostr City recuerda el grupo localmente para la clave pública activa en ese dispositivo. Recordar un grupo localmente no publica `kind:10009`, no guarda códigos de invitación y no prueba membresía pública.

Guardar un grupo sí publica una lista NIP-51 `kind:10009` con etiquetas `group` para tus grupos guardados y etiquetas `r` para los relays de esos grupos. Esa lista funciona como marcadores o favoritos públicos asociados a tu identidad.

La sincronización pública de grupos también es opcional y explícita. Cuando eliges sincronizar grupos públicos, Nostr City actualiza el `kind:10009` con:

- Etiquetas `group` para los grupos guardados.
- Etiquetas `r` para los relays de los grupos guardados y para los relays de grupos configurados.

Importante:

- `kind:10009` es público.
- Guardar un grupo no demuestra que seas miembro.
- Un grupo recordado localmente solo vive en el almacenamiento del navegador para la clave pública activa.
- Los códigos de invitación no se guardan en la configuración local ni en la lista pública.
- Quitar o cambiar una lista guardada no borra necesariamente copias antiguas que otros relays o clientes hayan visto.
- La membresía real depende del relay del grupo y de los eventos o reglas que ese relay acepte.

## Acciones que requieren firma

Estas acciones crean eventos y, por tanto, requieren una sesión capaz de firmar:

| Acción | Evento | Qué significa |
| --- | --- | --- |
| Publicar mensaje | `kind:9` con etiqueta `h` | Envía un mensaje al relay del grupo. |
| Guardar grupo | `kind:10009` | Publica el grupo guardado y su relay en tu lista pública de grupos. |
| Sincronizar grupos públicos | `kind:10009` | Publica grupos guardados y relays de grupos como datos públicos de Nostr. |
| Solicitar unirse | `kind:9021` | Pide entrada al grupo; el relay puede aceptarla, dejarla pendiente o rechazarla. |
| Solicitar salir | `kind:9022` | Pide salir del grupo; el relay decide cómo aplicar el cambio. |

Si entras con `npub`, estas acciones quedan desactivadas porque no hay capacidad de firma. Con NIP-07 dependen de la extensión. Con NIP-46 dependen de que el búnker autorice los permisos necesarios. Con cuenta local dependen de que la cuenta esté desbloqueada.

## Lectura, escritura y reglas del relay

NIP-29 permite que los relays apliquen reglas propias. Un grupo puede ser:

- Público para lectura o privado para miembros.
- Abierto para escritura o restringido a miembros.
- Visible u oculto para usuarios externos.
- Abierto a solicitudes o cerrado.

Nostr City intenta mostrar el estado disponible, pero la decisión final de aceptar mensajes, solicitudes de entrada o solicitudes de salida pertenece al relay del grupo.

La experiencia actual cubre descubrimiento, visualización de metadata/listas firmadas por el relay y acciones básicas disponibles en la interfaz. No implementa todos los flujos de administración, moderación o configuración avanzada definidos alrededor de NIP-29.

## NIP-46 y grupos

Si usas búnker o QR NIP-46, el firmante remoto debe conceder permisos compatibles con las acciones de grupos. Para la experiencia actual son relevantes `sign_event:9`, `sign_event:9021`, `sign_event:9022` y `sign_event:10009`.

En el flujo QR, Nostr City genera un URI `nostrconnect://...` con permisos recomendados y una clave de cliente para el emparejamiento. Esa clave de cliente no se guarda como sesión persistente por defecto; si necesitas volver a usar el búnker, reconéctalo explícitamente.

## Relacionado

- [Acceso y login](/cuenta-y-acceso/acceso-y-login)
- [Aplicación en Nostr City](/protocolo/aplicacion-en-nostr-city)
- [NIPs usadas](/protocolo/nips-usadas)
