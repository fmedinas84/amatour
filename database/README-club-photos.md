# Fotos de clubes — versión de prueba

Configuración → Foto del club permite seleccionar JPG, PNG o WebP (máximo 8 MB),
ver la vista previa y guardar una portada. Se puede reemplazar con otra foto.
La imagen aparece en el listado público y en Mis clubes. Los clubes sin foto
conservan su ilustración. No se alteran las fotos ni las reservas del perfil Demo.

La foto se convierte a JPEG, sin metadatos, hasta 800 píxeles y 45 KB.
Para mantener esta prueba sencilla se almacena una única imagen pequeña como
data URL en clubs.photo_data_url. No se usa localStorage ni una URL temporal.
La base valida formato, tamaño y marcadores JPEG. El gateway existente exige
capacidad válida y mantiene la restricción de escritura a clubes Demo.
Los visitantes solo pueden leer las fotos públicas, nunca subirlas.

Migración: club_photos.sql / club_photo_cover. Añade una columna nullable y
extiende el gateway con club.photo, preservando su definición vigente.
No se agregan permisos anónimos de edición ni claves privadas al navegador.

Si aumenta el número de clubes o se requieren imágenes de alta resolución,
conviene mover los archivos a Supabase Storage con subidas firmadas; la columna
actual está deliberadamente limitada para este prototipo.
