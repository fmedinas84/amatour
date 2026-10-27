# Amatour web — prototipo funcional

## Gestor de clubes

En el home, **Acceso clubes** abre `/clubes`. El servidor local ofrece gestión
persistente de canchas, ventanas, reservas, bloqueos y tarifas con una sesión
temporal protegida; permite editar solo clubes Demo. Inicia con `npm run dev`.
La configuración secreta local está ignorada por Git. Consulta
`database/README-management.md` para migraciones, seguridad, renovación y pruebas.

Home y catálogo de clubes con reservas reales en Supabase. Sin login ni pagos.
El buscador del hero funciona por palabras de nombre, dirección, comuna y
características de cancha. No distingue mayúsculas ni tildes y acepta palabras
en cualquier orden. Al pulsar el CTA o Enter muestra los clubes que contienen
todas las palabras y conserva los filtros activos del catálogo. También se
puede filtrar por cancha techada/al aire libre y disponibilidad hoy.

## Ejecutar

Node.js 20 o superior, sin dependencias de ejecución:

```sh
npm run dev
npm test
npm run check
```

Abrir http://localhost:3000. La configuración de Vercel sirve `public/` como
sitio estático. No se ha desplegado todavía.

## Datos y flujo

Proyecto Supabase `prrfytdglzozamvjffxx`. El navegador solo recibe la clave
publishable. Las tablas de reservas permanecen protegidas por RLS y no permiten
escritura directa a invitados. Dos funciones públicas acotadas exponen solo la
ocupación y permiten confirmar una reserva de invitado.

Los clubes Bosque, Cordillera y Parque son ficticios y están marcados Demo.
Las reservas sí se guardan en la base. Se permiten duraciones de 30 a 180 minutos,
en múltiplos de 30, dentro de los próximos 30 días y horario local del club.
El límite inicial es cinco reservas futuras por identidad de navegador.

La identidad invitada y los comprobantes se guardan en localStorage. No hay
recuperación entre dispositivos ni cancelación desde la interfaz todavía.
Las restricciones GiST y los triggers existentes evitan doble reserva.

## Antes de publicar

Este prototipo de reservas públicas fue autorizado expresamente para pruebas.
Antes de producción se necesita control de abuso real (rate limiting en servidor,
CAPTCHA o identidad verificada) y un mecanismo de recuperación/cancelación de
reservas. El límite por navegador no impide que alguien cambie su identidad.
El pago no está integrado y la confirmación actual no implica cobro.

## SQL

`database/guest_booking.sql` amplía las reservas con `guest_id`, manteniendo
exactamente una identidad: usuario registrado o invitado. No crea usuarios
ficticios en Auth. `database/demo_clubs.sql` es la carga explícita de demos;
no volver a ejecutarla si los slugs ya existen.
