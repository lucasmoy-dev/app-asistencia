# Asistencia — App para tomar asistencia

Esta es una aplicación para tomar asistencia, sacar fotos y anotar notas de
tus alumnos, organizada por grupo. Funciona en el celular, sin necesidad de
internet una vez instalada, y **todos los datos quedan guardados en tu
propio teléfono** (no hay ningún servidor ni nube: nadie más que vos tiene
acceso a las fotos y notas).

No hace falta saber programar para instalarla ni para usarla. Esta guía
tiene dos partes: **1) cómo publicarla en internet** (lo hacés una sola vez)
y **2) cómo usarla día a día**.

---

## Parte 1 — Publicarla con GitHub Pages (una sola vez)

Necesitás una cuenta gratuita de GitHub (github.com). Si no tenés, creala
primero en https://github.com/signup.

1. **Creá un repositorio nuevo.**
   - Entrá a https://github.com/new
   - Ponele un nombre, por ejemplo `asistencia` (sin espacios).
   - Dejalo en "Public" (público). Tiene que ser público para que GitHub
     Pages lo pueda mostrar gratis.
   - No marques ninguna casilla de "agregar README" ni licencia.
   - Hacé clic en "Create repository".

2. **Subí los archivos de esta carpeta.**
   - En la página del repositorio que se acaba de crear, vas a ver un
     botón que dice "uploading an existing file" (o "Add file" →
     "Upload files").
   - Arrastrá **todos** los archivos y carpetas de esta carpeta
     (`index.html`, `manifest.json`, `service-worker.js`, la carpeta
     `css`, la carpeta `js`, la carpeta `icons` y este mismo `README.md`)
     a la ventana de GitHub. Importante: hay que mantener la misma
     estructura de carpetas, no todo suelto.
   - Abajo escribí un mensaje como "Primera versión de la app" y hacé
     clic en "Commit changes".

3. **Activá GitHub Pages.**
   - Andá a la pestaña "Settings" (Configuración) del repositorio.
   - En el menú de la izquierda, hacé clic en "Pages".
   - Donde dice "Branch", elegí `main` (o `master`) y la carpeta `/root`,
     y hacé clic en "Save".
   - Esperá uno o dos minutos. GitHub te va a mostrar un link parecido a:
     `https://tu-usuario.github.io/asistencia/`

4. **Abrí ese link desde el celular.** Ahí ya está funcionando la app.

### Instalarla en el celular (para que quede como una app más)

- **Android (Chrome):** abrí el link, tocá el menú (⋮) y elegí
  "Instalar aplicación" o "Agregar a la pantalla de inicio". También puede
  aparecer un botón "Instalar app" dentro de la sección **Ajustes** de la
  propia aplicación.
- **iPhone (Safari):** abrí el link, tocá el ícono de Compartir (el
  cuadrado con la flecha hacia arriba) y elegí "Agregar a la pantalla de
  inicio".

A partir de ahí, el ícono va a estar en tu pantalla de inicio como
cualquier otra app, y va a abrir sin mostrar la barra del navegador.

### Si en el futuro modificás algún archivo

Cada vez que cambies algo en `index.html`, `css/styles.css` o cualquier
archivo dentro de `js/`, abrí el archivo `service-worker.js` y cambiá el
número de la línea que dice:

```
const CACHE_NAME = 'asistencia-shell-v1';
```

por ejemplo a `'asistencia-shell-v2'`. Esto le avisa a los teléfonos que ya
tienen la app instalada que hay una versión nueva para descargar. Si no se
cambia ese número, los celulares van a seguir viendo la versión vieja
guardada.

---

## Parte 2 — Cómo usar la app

### Primeros pasos

Al abrir la app por primera vez ya vas a ver 5 grupos creados:
"1° Primaria", "2° Primaria", "3° Primaria", "1° Secundaria" y
"2° Secundaria". Podés cambiarles el nombre tocando el lápiz (✎) arriba a
la derecha cuando estés dentro de un grupo. También podés crear grupos
nuevos desde la pantalla de inicio ("+ Agregar otro grupo").

### Cargar alumnos

Hay dos formas, y se pueden combinar:

- **De a uno**, con foto: entrá al grupo → "+ Agregar alumno" → sacá o
  elegí la foto, completá nombre y apellido, guardar.
- **Todos juntos, sin foto** (más rápido si tenés una lista escrita):
  entrá al grupo → "⇪ Importar lista" → pegá la lista, un alumno por
  línea, en formato `Apellido, Nombre` → "Importar". Las fotos se pueden
  agregar después, alumno por alumno, tocando su nombre y después el
  lápiz (✎).

### Tomar asistencia

Entrá al grupo y tocá "📋 Tomar asistencia". Vas a ver la lista de
alumnos del día de hoy. Como lo más común es que la mayoría esté
presente, tocá primero "Marcar todos presentes" y después tocá el botón
**A** (rojo) solamente de los que faltaron. Si te equivocás, tocá el
botón de nuevo para dejarlo sin marcar.

Podés moverte a otro día con las flechas `‹` `›`, o ir directo a una
fecha pasada desde "📅 Calendario" (los días con un punto ya tienen
asistencia cargada).

### Notas

Entrá al perfil de un alumno (tocando su nombre) para agregarle una nota
o calificación. Las notas quedan con la fecha y se pueden borrar
individualmente.

### Copia de seguridad — MUY IMPORTANTE

Todo (fotos incluidas) se guarda únicamente en este teléfono. **Si el
teléfono se pierde, se rompe o se resetea, se pierde todo con él.** Por
eso, andá seguido a **Ajustes → "⬇ Descargar copia de seguridad"** y
guardá el archivo que se descarga en otro lugar (te lo podés mandar por
email, subirlo a Google Drive, etc.). Si alguna vez cambiás de teléfono o
necesitás recuperar los datos, instalá la app en el teléfono nuevo y usá
"⬆ Restaurar copia de seguridad" con ese mismo archivo.

Recomendación: hacé una copia de seguridad al menos una vez por semana, y
siempre antes de cambiar de celular.

---

## Preguntas frecuentes

**¿Necesito internet para usarla?** Solo la primera vez que la instalás.
Después funciona sin señal, incluso en el medio de una cancha sin
cobertura.

**¿Alguien más puede ver las fotos o notas?** No. No hay servidor, no hay
nube, no hay cuenta de usuario. Todo queda en el teléfono donde la usás.
Esto también significa que si querés usarla desde dos teléfonos, cada uno
va a tener sus propios datos por separado (no se sincronizan solos entre
sí) — para pasar los datos de un teléfono a otro, usá la copia de
seguridad (Ajustes → Descargar / Restaurar).

**Me quedé sin espacio en el teléfono.** La app te va a avisar con un
mensaje si no puede guardar algo por falta de espacio. Entrá a
Ajustes para ver cuánto espacio está usando, hacé una copia de seguridad
primero, y después liberá espacio en el teléfono (fotos, videos, apps que
no uses).

**Cargué mal el nombre de un alumno o lo puse en el grupo equivocado.**
Entrá a su perfil y tocá el lápiz (✎) para editarlo: podés corregir
nombre, apellido, foto y cambiarlo de grupo.
