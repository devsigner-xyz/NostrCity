# Acceso y login

Esta guía explica las formas actuales de entrar en Nostr City y qué puedes esperar de cada una. En Nostr no hay un login central clásico: la app trabaja con una identidad pública y, según el método elegido, con una forma de firmar eventos.

## Qué resuelve esta página

Te ayuda a elegir entre entrar en modo lectura, firmar con una extensión, conectar un búnker NIP-46 o usar una cuenta local. La diferencia principal es si Nostr City puede publicar eventos en tu nombre o solo leer información pública asociada a tu identidad.

## Demo pública y uso local

La instancia pública puede estar configurada como demo de solo lectura. En ese modo solo se permite entrar con `npub`; la app no solicita firmas, no crea cuentas locales y no conecta firmantes NIP-07 o NIP-46.

Para usar todas las capacidades, ejecuta [Nostr City en local](/empezar/usar-en-local) o en una instancia propia. Así puedes usar extensión NIP-07, búnker NIP-46, cuenta local, publicación, DMs, zaps y configuración local sin depender del dominio público del autor.

Si ya habías usado una cuenta local en el dominio público, el modo demo no borra automáticamente material guardado del navegador. Puedes limpiar los datos del sitio desde las herramientas del navegador si quieres eliminar estado antiguo de `nostrcity.xyz`.

## Métodos de acceso

### `npub`: identidad pública en modo lectura

Un `npub` es una forma legible de compartir una clave pública Nostr. Sirve para decirle a la app qué identidad quieres explorar.

Con este método:

- Nostr City puede cargar datos públicos que encuentre en los relays configurados.
- No puede firmar ni publicar eventos, porque no tiene acceso a una clave privada ni a un firmante.
- Las acciones de escritura, como publicar en grupos o guardar una lista pública de grupos, quedan desactivadas.

Usa `npub` si solo quieres mirar una identidad o probar la visualización sin conceder permisos de firma.

### Extensión NIP-07: firma desde el navegador

NIP-07 permite que una extensión del navegador exponga `window.nostr` para que las aplicaciones pidan la clave pública y soliciten firmas. La extensión decide qué aprobar y puede mostrar confirmaciones antes de firmar.

Con este método:

- Tu clave privada permanece en la extensión compatible.
- Nostr City puede pedir firmas para eventos concretos.
- La disponibilidad depende del navegador, la extensión instalada y los permisos que concedas.

Es una buena opción si ya usas una extensión Nostr y quieres mantener la gestión de claves fuera de Nostr City.

### Búnker o QR NIP-46: firmante remoto

NIP-46 conecta Nostr City con un firmante remoto, también llamado búnker. La app no recibe tu clave privada: envía solicitudes cifradas al firmante y este responde con firmas o resultados autorizados.

Nostr City admite dos formas habituales:

- Pegar un URI `bunker://...` generado por tu firmante remoto.
- Usar un QR `nostrconnect://...` generado por Nostr City para que el firmante remoto lo escanee o apruebe.

En el flujo QR, Nostr City genera una clave de cliente para comunicarse con el búnker y un secreto de emparejamiento. El firmante remoto responde por los relays indicados, Nostr City valida el secreto y después pide la clave pública real del usuario con `get_public_key`.

Por defecto, esa clave de cliente NIP-46 no se conserva como una sesión permanente. Si cierras sesión, recargas en condiciones donde se pierda la sesión o vuelves otro día, debes reconectar explícitamente el búnker. Esto reduce la persistencia accidental, pero también significa que la experiencia depende de que el firmante remoto esté disponible y autorice los permisos necesarios.

### Cuenta local

La cuenta local usa material de clave gestionado en este navegador/dispositivo. Permite firmar y cifrar con las capacidades que ofrece la app, sin depender de una extensión o un búnker externo.

Con este método:

- Nostr City puede firmar eventos mientras la cuenta esté desbloqueada.
- La cuenta depende del almacenamiento local del navegador y de la protección disponible en el dispositivo o de la passphrase configurada.
- Si pierdes el material local o la passphrase necesaria, Nostr City no puede recuperar la cuenta por ti.

## Privacidad y persistencia

- Los datos públicos de Nostr se leen desde relays. Si un evento es público en un relay, otros clientes también pueden leerlo.
- El método `npub` no concede firma, pero revela a la app qué identidad quieres consultar.
- Con NIP-07, las decisiones de firma y el almacenamiento de claves pertenecen a la extensión.
- Con NIP-46, la comunicación con el búnker usa eventos cifrados, pero los relays usados para transportar solicitudes pueden observar metadatos como tiempos, participantes técnicos y disponibilidad de conexión.
- Con cuenta local, la seguridad depende del navegador, el dispositivo y la passphrase o protección local elegida.

## Límites habituales

- Si los relays configurados no tienen tus eventos, la ciudad puede verse incompleta.
- Un método de lectura no puede publicar, guardar grupos ni solicitar unirse o salir de grupos.
- Un firmante NIP-46 puede denegar permisos concretos, por ejemplo `sign_event:9` para mensajes de grupo o `sign_event:10009` para grupos guardados.
- Las sesiones NIP-46 no se restauran automáticamente como una sesión persistente por defecto; debes reconectar el búnker.

## Relacionado

- [Crear cuenta](/cuenta-y-acceso/crear-cuenta)
- [Usar Nostr City en local](/empezar/usar-en-local)
- [Relays y configuración](/cuenta-y-acceso/relays-y-configuracion)
- [Grupos](/grupos/)
