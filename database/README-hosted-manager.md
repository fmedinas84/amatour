# Gestor temporal en Vercel

La ruta /clubes ofrece el gestor completo después de ingresar una clave temporal.
Vercel Functions atiende /api/manager y /api/manager/session. El servidor local
conserva su acceso anterior. Ambos reutilizan managerOperation y manager_gateway.

Variables exclusivas del servidor de producción:

- AMATOUR_MANAGER_TOKEN: capacidad registrada por hash en private.manager_capabilities.
- AMATOUR_MANAGER_ACCESS_HASH: SHA-256 de una clave aleatoria de 192 bits.
- AMATOUR_MANAGER_SESSION_SECRET: secreto de firma HMAC de sesiones.
- AMATOUR_MANAGER_ORIGIN: dominio HTTPS exacto permitido.

La clave se entrega al operador mediante ACCESO-GESTOR.txt, ignorado por Git.
No se almacena en el navegador. La cookie firmada es Secure, HttpOnly,
SameSite=Strict, válida ocho horas. El cierre elimina la cookie. Para invalidar
todas las sesiones, rotar SESSION_SECRET y volver a desplegar. Para revocar el
acceso a datos, eliminar la capacidad correspondiente o esperar su vencimiento.
La capacidad inicial dura siete días; la clave del formulario por sí sola no
permite operar después de ese vencimiento.

El origen exacto y una cabecera específica protegen las operaciones frente a
solicitudes de otros sitios. No se abren políticas RLS ni se usa service_role.
Solo los clubes Demo admiten escrituras, según la comprobación existente del RPC.
Los datos administrativos requieren sesión; no se sirve un snapshot público.
La protección de acceso de Vercel permanece habilitada. Esta clave compartida es
temporal: no sustituye usuarios, roles o auditoría individual para producción.

Verificación: npm test y npm run check. No subir archivos .manager-*.json,
ACCESO-GESTOR.txt ni variables de entorno a GitHub.
