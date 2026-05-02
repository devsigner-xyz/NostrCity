# Relays y configuración

Los relays condicionan qué datos puedes cargar y, por tanto, qué ciudad acabas viendo.

## Qué hacen los relays en la práctica

Un relay almacena y reenvía eventos. Si tu configuración no incluye relays donde exista tu actividad o tus contactos, la visualización será incompleta.

## Qué conviene revisar

- Si los relays configurados reflejan dónde está tu actividad real.
- Si tienes duplicados o endpoints poco fiables.
- Si estás usando una mezcla razonable de relays públicos y personales.

## Privacidad y límites de relay

Los relays ven metadatos de consulta aunque el contenido final que busques sea público: clave pública consultada, tipos de eventos, marcas de tiempo, ritmo de peticiones y qué relay recibió la consulta.

Cuando una consulta pasa por el BFF de Nostr City, la capa endurecida de servidor solo reenviará peticiones a relays públicos `wss://`. Quedan fuera `ws://`, hostnames locales o internos, IPs privadas, endpoints con credenciales embebidas y otros destinos que puedan usarse para SSRF o para filtrar tráfico a redes internas.

Ese límite protege despliegues públicos y también afecta instalaciones completas/locales cuando usan las rutas del BFF: si dependes de relays privados o internos, el BFF actual no los consultará.

## Relays de grupos

Los grupos NIP-29 usan relays especializados. En `/relays`, la sección **Group relays** permite añadir o quitar relays dedicados a descubrir grupos. Estos relays son opt-in y se guardan localmente por defecto: sirven para consultar grupos, pero no cambian tus relays sociales, de mensajes privados o de búsqueda.

Si `/groups` no tiene relays de grupos configurados, muestra una guía de inicio. Puedes añadir relays sugeridos o un relay personalizado desde `/groups` de forma local para empezar a descubrir comunidades sin publicar un `kind:10009`.

El detalle de un relay de grupos muestra los grupos disponibles cuando el relay anuncia metadata NIP-29 `kind:39000`. Si el relay declara una clave `self` válida en NIP-11, Nostr City usa esa clave para verificar metadata y listas del grupo. Si NIP-11 falta o está roto, la app puede mostrar metadata firmada como no verificada, pero no confía en miembros, administradores o roles.

Desde esa vista puedes abrir un grupo; Nostr City enlaza a `/groups?relay=...&group=...` y lo selecciona si está entre los grupos cargados. También puedes abrir enlaces de invitación con `relay`, `group` y un `code` opcional. El código se usa solo en la solicitud de unión y no se persiste.

## Sincronización pública opcional

Unirse a un grupo recuerda localmente `{relay,id}` para la clave pública activa después de publicar la solicitud `kind:9021`, pero no publica tu lista pública de grupos. Recordar localmente un grupo no demuestra membresía ante otros clientes.

Guardar un grupo publica un evento NIP-51 `kind:10009` con ese grupo y su relay en tu lista pública de grupos guardados. La acción explícita de sincronizar grupos públicos actualiza ese mismo tipo de evento e incluye, además, etiquetas `r` con los relays de grupos configurados. Ambas acciones requieren una sesión con capacidad de firma y producen datos públicos de Nostr que pueden quedar replicados en relays.

Si solo quieres probar relays de grupos o mantenerlos como preferencia local, no guardes grupos ni uses la sincronización pública.

## Señal de mala configuración

Si entras y apenas ves contexto, perfiles o relaciones esperadas, muchas veces el problema no es la identidad sino los relays usados para cargar datos.

## Relacionado

- [Acceso y login](/cuenta-y-acceso/acceso-y-login)
- [Aplicación en Nostr City](/protocolo/aplicacion-en-nostr-city)
- [Grupos](/grupos/)
