# Gestor de clubes — MVP local seguro

## Modelo y migraciones

La migración `club_management_windows_rates_gateway` incorpora:

- `court_operating_windows`: ventanas semanales por cancha, varias por día.
- `rate_plans`: alias, precio por 30 minutos, moneda, actividad y predeterminada.
- `court_rate_schedules`: franjas semanales por cancha y tarifa compatible con su club.
- `court_rate_overrides`: vigencias inclusivas por fechas, días y franjas, con prioridad.
- `private.manager_capabilities`: hashes de sesiones temporales con vencimiento.

Amplía `clubs` con `is_demo`, `courts` con `custom_hours`, `court_blocks` con
identificación de origen demo y observación, y `reservations` con cliente demo,
importe, moneda y desglose histórico. No modifica reservas anteriores para
asignarles precios inventados. No crea usuarios ni pagos ficticios.

`fix_manager_snapshot_alias` corrige un alias de lectura; su definición final está
en `manager_gateway.sql`. `guest_booking_historical_price_receipt` permite que
el comprobante público muestre la cotización realmente guardada al confirmar.
La firma anterior de reservas de invitado sigue disponible.

`manager_composite_indexes_and_exact_duration` agrega índices para las claves
foráneas compuestas por club y evita redondear segundos al validar duraciones.
Las cuatro migraciones de esta etapa están registradas en Supabase.

No ejecutar las migraciones manualmente sobre la base ya migrada. Los archivos
son el código fuente de las operaciones aplicadas y las pruebas reproducibles.

## Horarios y concurrencia

Días: 0=lunes y 6=domingo. Los minutos son locales al club. `20:00–01:00`
se guarda como 1200–1500; no se crean filas para slots disponibles. Los tramos
se validan incluso contra la ventana nocturna del día anterior. Un día sin
ventanas está cerrado cuando la cancha tiene `custom_hours=true`.

Las canchas sin personalización siguen heredando `club_opening_hours`. Al editar
por primera vez, los días no seleccionados conservan el horario general.
Un cambio de ventanas que deje reservas activas fuera del nuevo horario es
rechazado: el operador debe resolverlas explícitamente.

La restricción GiST de reservas continúa impidiendo solapamientos. Se mantienen
los locks transaccionales por cancha y por club para coordinar bloqueos y
operaciones administrativas. Las canchas inactivas no se ofrecen al público.
Eliminación: si hay historial, desactiva; sin reservas ni bloqueos, elimina.

## Tarifas

Cada bloque de 30 minutos busca: promoción vigente, luego franja semanal, luego
tarifa predeterminada. No encontrar tarifa produce importe nulo y una indicación
explícita. No se inventa precio cero. Las promociones se ordenan por prioridad
descendente, inicio de vigencia más reciente, creación más reciente e ID.

Las asignaciones superpuestas semanales se reemplazan únicamente dentro del
rango elegido, conservando los extremos. La matriz marca «Mixta» cuando una
franja contiene distintos planes. El precio total suma cada bloque; mezclar
monedas en una reserva provoca un error.

El trigger de inserción fija importe, moneda y desglose en la reserva, tanto
PENDING como CONFIRMED. Esos datos y el intervalo histórico son inmutables.
Modificar una tarifa no recalcula reservas previas. Reprogramar requiere cancelar
y crear una nueva reserva. Una cotización no representa un pago.

## Seguridad temporal

El servidor escucha solamente en `127.0.0.1`. `/api/manager/session` crea una
cookie HttpOnly, SameSite=Strict; las operaciones requieren esa cookie, cabecera
de origen local y una cabecera personalizada. Se rechazan hosts y orígenes
externos. El secreto de Supabase nunca llega al navegador.

`manager_gateway` valida el hash y el vencimiento antes de cualquier lectura o
escritura. Permite leer todos los clubes; solo escribe cuando `is_demo=true`.
Las tablas nuevas mantienen RLS y no admiten accesos directos anon/authenticated.
El RPC es visible desde PostgREST, pero sin la capacidad secreta devuelve 42501.
Es un mecanismo temporal local, no un sistema definitivo de autenticación.

La configuración `.manager-local.json` está ignorada por Git. Para renovar:

```sh
node scripts/new-manager-session.mjs
```

El script guarda el secreto localmente e imprime solo el SQL con su hash para
que el operador lo registre desde su sesión administrativa de Supabase.
La sesión inicial dura 7 días. El borrado del hash o su vencimiento revoca acceso.

Los asesores de Supabase señalan las funciones públicas SECURITY DEFINER. Su
exposición es intencional: disponibilidad y cotización son públicas; el gestor
requiere la capacidad expirable antes de operar. La existencia del endpoint no
autoriza escrituras. Los tests comprueban rechazo de claves inválidas y de clubes
no Demo; no se han suprimido avisos para ocultarlos.

En un despliegue estático, `/api/manager` no existe y el panel muestra acceso sin
configurar. Publicar el gestor requerirá un servidor con sesión administrativa
segura; no se debe publicar el secreto ni abrir políticas anónimas para imitarla.

La futura autorización puede reemplazar la capacidad por `auth.uid()` y una
relación `club_memberships(user_id,club_id,role)`, con permisos de lectura,
operación y tarifas. No se implementa todavía el mantenedor de roles.

## Datos Demo y pruebas

Se reutilizan los tres clubes Demo. Los importes 5000, 8000 y 3500 CLP son datos
editables del seed, no constantes del motor de pricing. Cyber Demo tiene vigencia
2–8 de noviembre de 2026. Existen reservas ejemplo sin pago y bloqueos claramente
marcados Demo. Una cancha adicional se creó desde la interfaz para verificar la
persistencia y se dejó en mantenimiento como ejemplo operativo.

`verify_manager.sql` realiza 16 verificaciones en una subtransacción revertida.
La capacidad debe inyectarse solo en memoria reemplazando `__TOKEN__`; nunca
guardar el SQL con un secreto real. `manager-integration.mjs` valida sesión,
CSRF, lectura y persistencia con el servidor encendido. Los tests unitarios
incluyen ventanas nocturnas, matriz tarifaria y protección de host/origen.

La vista diaria es la prioridad de este MVP. No hay vista semanal del calendario,
pagos reales, login definitivo ni roles. Los nombres de usuarios registrados se
muestran como tales; todavía no existe una tabla de perfiles para sus nombres.
