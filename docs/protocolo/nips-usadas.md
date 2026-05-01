# NIPs usadas

Las NIPs son documentos que describen convenciones del protocolo Nostr. No todas tienen el mismo peso en la experiencia de Nostr City, pero varias influyen en identidad, perfiles, firma, relays y grupos.

## Cómo leer esta sección

No necesitas memorizar cada NIP. Lo útil es entender qué parte de la experiencia depende de cada convención y qué límites hereda la app del protocolo o de los relays.

## Identidad y acceso

| NIP | Uso en Nostr City | Límite importante |
| --- | --- | --- |
| NIP-01 | Modelo base de eventos, claves públicas, firmas y filtros. | La app solo puede confiar plenamente en eventos válidos y firmados. |
| NIP-07 | Acceso mediante extensión del navegador (`window.nostr`). | Depende de que la extensión exista, esté desbloqueada y apruebe la firma. |
| NIP-19 | Formatos legibles como `npub`. | `npub` identifica una clave pública; no concede permiso de firma. |
| NIP-46 | Firma remota con búnker o flujo QR `nostrconnect://`. | La sesión requiere permisos del firmante y no se persiste como clave de cliente permanente por defecto. |

## Relays, perfil y datos públicos

| NIP | Uso en Nostr City | Límite importante |
| --- | --- | --- |
| NIP-11 | Información anunciada por un relay, incluida la clave `self` cuando está disponible. | Si el relay no anuncia información suficiente, algunas verificaciones quedan limitadas. |
| NIP-65 | Relays asociados a una identidad. | Una configuración incompleta puede hacer que falten eventos o perfiles. |
| NIP-44 | Cifrado moderno usado por flujos compatibles, como NIP-46 y mensajes privados. | El cifrado protege contenido, no todos los metadatos de transporte. |

## Grupos

| NIP | Estado | Uso en Nostr City | Límite importante |
| --- | --- | --- | --- |
| NIP-29 | Parcial | Grupos basados en relays, identificados por `{relay,id}`. La app consulta relays de grupos configurados, permite navegación centrada en el relay, muestra metadata `kind:39000`, mensajes básicos `kind:9`, solicitudes de unión/salida `kind:9021`/`kind:9022` e invitaciones con código opcional. | El estado del grupo depende del relay que lo hospeda y de sus reglas. Sin NIP-11 `self` verificable, la metadata puede mostrarse como no verificada y no se confían administradores, miembros o roles. No cubre todos los flujos de administración, moderación o configuración avanzada. |
| NIP-51 / `kind:10009` | Parcial | Lista pública de grupos guardados por una persona. Guardar un grupo publica etiquetas `group` y etiquetas `r` para los relays de esos grupos; la sincronización explícita añade también etiquetas `r` con relays de grupos configurados. | Es una lista pública de marcadores y relays; no prueba membresía ni permiso de escritura, y puede quedar replicada después de publicarse. Unirse a un grupo no publica automáticamente esta lista. |

Los relays de grupos son una configuración local por defecto. Añadir relays sugeridos o personalizados en `/groups` o en `/relays` permite descubrir grupos NIP-29 sin publicar `kind:10009`. Unirse recuerda el grupo localmente para la clave pública activa después de solicitar entrada, pero no guarda códigos de invitación ni sincroniza datos públicos. Guardar un grupo firma y publica la lista con ese grupo y su relay; la sincronización pública explícita publica también los relays de grupos configurados.

## Acciones de escritura relevantes

Cuando la app publica, necesita un método capaz de firmar. En la práctica, esto afecta a:

- Publicar mensajes de grupo (`kind:9`) con etiqueta `h` del grupo.
- Solicitar unirse a un grupo (`kind:9021`).
- Solicitar salir de un grupo (`kind:9022`).
- Guardar grupos y sincronizar relays de grupos en la lista pública (`kind:10009`).

Si entras con `npub`, esas acciones no están disponibles. Si entras con NIP-46, el búnker también debe aprobar permisos como `sign_event:9`, `sign_event:9021`, `sign_event:9022` y `sign_event:10009`.

## Relacionado

- [Qué es Nostr](/conceptos/que-es-nostr)
- [Aplicación en Nostr City](/protocolo/aplicacion-en-nostr-city)
- [Grupos](/grupos/)
