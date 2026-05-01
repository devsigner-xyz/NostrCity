# Aplicación en Nostr City

Esta página conecta el protocolo con la experiencia concreta del producto. La app no reemplaza a Nostr ni a tus relays: usa identidades, eventos y firmantes compatibles para construir una experiencia visual y social alrededor de la ciudad.

## Identidad

La identidad determina desde qué punto entras en la ciudad y qué contexto social puede cargarse alrededor de ti. Puedes entrar con:

- `npub`, para explorar una clave pública en modo lectura.
- Extensión NIP-07, para pedir firmas al navegador.
- Búnker o QR NIP-46, para pedir firmas a un firmante remoto.
- Cuenta local, para firmar desde este navegador/dispositivo.

La app distingue entre identificarte y poder firmar. Un `npub` identifica, pero no autoriza escritura. NIP-07, NIP-46 y cuenta local pueden firmar si están disponibles, desbloqueados y con permisos suficientes.

## Perfil, metadata y grafo social

La metadata ayuda a representar perfiles con más contexto visual y semántico dentro de la interfaz. La red de follows es una de las bases para construir proximidad, vecindad y relaciones visibles en la ciudad.

El resultado depende de los relays consultados. Si tu actividad, perfil o lista de follows no está en los relays configurados, Nostr City puede mostrar una vista parcial.

## Firma y acceso

Los métodos de firma condicionan qué acciones puedes realizar:

- En modo `npub`, la experiencia es de lectura.
- Con NIP-07, la extensión firma eventos concretos si el usuario y la extensión lo aprueban.
- Con NIP-46, Nostr City se comunica con un búnker usando una clave de cliente de NIP-46 y solicitudes cifradas. En el flujo QR, esa clave de cliente no se conserva como sesión persistente por defecto; reconectar el búnker es una acción explícita.
- Con cuenta local, la app puede firmar mientras el material local esté disponible y desbloqueado.

## Grupos en la aplicación

Los grupos siguen el modelo NIP-29: una identidad de grupo se entiende como `{relay,id}`. El mismo `id` en relays diferentes puede representar comunidades distintas o bifurcaciones, por eso el relay forma parte de la identidad.

Nostr City carga grupos guardados desde la lista pública `kind:10009` de la identidad activa y luego consulta el relay de cada grupo para obtener metadata, miembros cuando el relay los publica y mensajes recientes. Esa lista pública sirve para recordar grupos, pero no demuestra que una persona sea miembro.

Para escribir en grupos, la sesión debe poder firmar. Publicar mensajes, guardar grupos, solicitar unirse y solicitar salir requieren firma; leer metadata o mensajes públicos depende sobre todo de los relays y de las reglas del grupo.

## Privacidad y límites

- Muchos eventos de Nostr son públicos por diseño. No publiques información sensible si no entiendes el tipo de evento y los relays usados.
- Los relays pueden aceptar, rechazar, ocultar o limitar eventos según sus reglas.
- Los eventos cifrados protegen contenido, pero no eliminan todos los metadatos de transporte.
- La lista `kind:10009` de grupos guardados es pública.
- La membresía real de un grupo NIP-29 depende del relay del grupo; no se debe inferir solo por una lista guardada.

## Relacionado

- [NIPs usadas](/protocolo/nips-usadas)
- [Relays y configuración](/cuenta-y-acceso/relays-y-configuracion)
- [Grupos](/grupos/)
