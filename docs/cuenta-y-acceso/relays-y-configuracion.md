# Relays y configuración

Los relays condicionan qué datos puedes cargar y, por tanto, qué ciudad acabas viendo.

## Qué hacen los relays en la práctica

Un relay almacena y reenvía eventos. Si tu configuración no incluye relays donde exista tu actividad o tus contactos, la visualización será incompleta.

## Qué conviene revisar

- Si los relays configurados reflejan dónde está tu actividad real.
- Si tienes duplicados o endpoints poco fiables.
- Si estás usando una mezcla razonable de relays públicos y personales.

## Relays de grupos

Los grupos NIP-29 usan relays especializados. En `/relays`, la sección **Group relays** permite añadir o quitar relays dedicados a descubrir grupos. Estos relays son opt-in y se guardan localmente por defecto: sirven para consultar grupos, pero no cambian tus relays sociales, de mensajes privados o de búsqueda.

Si `/groups` no tiene relays de grupos configurados, muestra una guía de inicio. Puedes añadir relays sugeridos de forma local para empezar a descubrir comunidades sin publicar un `kind:10009`.

El detalle de un relay de grupos muestra los grupos disponibles cuando el relay anuncia metadata NIP-29 `kind:39000` firmada por la clave `self` declarada en su información NIP-11. Desde esa vista puedes abrir un grupo; Nostr City enlaza a `/groups?relay=...&group=...` y lo selecciona si está entre los grupos cargados.

## Sincronización pública opcional

Guardar un grupo publica un evento NIP-51 `kind:10009` con ese grupo y su relay en tu lista pública de grupos guardados. La acción explícita de sincronizar grupos públicos actualiza ese mismo tipo de evento e incluye, además, etiquetas `r` con los relays de grupos configurados. Ambas acciones requieren una sesión con capacidad de firma y producen datos públicos de Nostr que pueden quedar replicados en relays.

Si solo quieres probar relays de grupos o mantenerlos como preferencia local, no guardes grupos ni uses la sincronización pública.

## Señal de mala configuración

Si entras y apenas ves contexto, perfiles o relaciones esperadas, muchas veces el problema no es la identidad sino los relays usados para cargar datos.

## Relacionado

- [Acceso y login](/cuenta-y-acceso/acceso-y-login)
- [Aplicación en Nostr City](/protocolo/aplicacion-en-nostr-city)
- [Grupos](/grupos/)
