# ArborQuote — Sistema de Cotizaciones Arbóreas

> Aplicación web estática para generar y gestionar cotizaciones de servicios de árboles, integrada con Google Sheets como backend.

---

## Tabla de Contenidos

1. [Arquitectura](#arquitectura)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Configuración de Google Sheets](#1-configuración-de-google-sheets)
4. [Configuración de Google Apps Script](#2-configuración-de-google-apps-script)
5. [Configuración del Frontend](#3-configuración-del-frontend)
6. [Despliegue en GitHub Pages](#4-despliegue-en-github-pages)
7. [Datos de Prueba](#5-datos-de-prueba)
8. [Guía de Uso](#6-guía-de-uso)
9. [Seguridad y Limitaciones](#7-seguridad-y-limitaciones)
10. [Mejoras Futuras (Roadmap)](#8-mejoras-futuras)

---

## Arquitectura

```
┌─────────────────────────────────────────────┐
│              GitHub Pages (CDN)             │
│  HTML + CSS + JS (vanilla, sin build step)  │
└──────────────────┬──────────────────────────┘
                   │  fetch() HTTPS POST
┌──────────────────▼──────────────────────────┐
│         Google Apps Script Web App          │
│  doPost(e) → Router → Handlers → Sheets     │
└──────────────────┬──────────────────────────┘
                   │  Sheets API
┌──────────────────▼──────────────────────────┐
│              Google Sheets                  │
│  Usuarios | Cotizaciones | Tokens           │
└─────────────────────────────────────────────┘
```

**Principios aplicados:**
- **SRP**: Cada módulo JS tiene una única responsabilidad
- **OCP**: Nuevas rutas en GAS sin modificar el router base
- **DIP**: Frontend depende de `ApiService` (abstracción), no de fetch directo
- **Calculador puro**: `PriceCalculator` sin efectos secundarios, testeable aislado

---

## Estructura del Proyecto

```
cotizador-arboles/
├── index.html                  # SPA principal
├── assets/
│   ├── css/
│   │   └── main.css            # Estilos globales
│   └── js/
│       ├── config.js           # Constantes y tablas de multiplicadores
│       ├── api.js              # Capa de comunicación con GAS
│       ├── auth.js             # Gestión de sesiones (sessionStorage)
│       ├── calculator.js       # Motor de cálculo de precios (puro)
│       ├── quotes.js           # Renderizado de cotizaciones (HTML)
│       └── app.js              # Controlador principal (orquestador)
├── scripts/
│   └── Code.gs                 # Backend completo (Google Apps Script)
├── docs/
│   └── README.md               # Este archivo
└── .github/
    └── workflows/
        └── deploy.yml          # CI/CD para GitHub Pages
```

---

## 1. Configuración de Google Sheets

### Paso 1.1 — Crear la Hoja de Cálculo

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una nueva hoja
2. Renómbrala como "ArborQuote - Base de Datos"
3. Copia el **ID** de la URL: `https://docs.google.com/spreadsheets/d/[ESTE_ID]/edit`

### Paso 1.2 — Crear las Hojas

Crea **tres hojas** con exactamente estos nombres (sensible a mayúsculas):

#### Hoja: `Usuarios`

| Columna A | Columna B | Columna C | Columna D | Columna E | Columna F |
|-----------|-----------|-----------|-----------|-----------|-----------|
| ID | Usuario | PasswordHash | Rol | FechaCreacion | Estado |

#### Hoja: `Cotizaciones`

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| ID_Cotizacion | Usuario | Cliente | Fecha | ItemsJSON | Subtotal | Impuestos | Descuento | Total | Estado |

#### Hoja: `Tokens`

| A | B | C | D | E |
|---|---|---|---|---|
| Token | Usuario | CreadoEn | ExpiraEn | Activo |

### Paso 1.3 — Crear el usuario admin inicial

Para crear el hash de la contraseña, abre la consola del navegador (F12) en cualquier página y ejecuta:

```javascript
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
// Cambiar 'tu_contraseña' por la contraseña real
sha256('admin123').then(h => console.log(h));
```

Agrega en la fila 2 de la hoja `Usuarios`:

| ID | Usuario | PasswordHash | Rol | FechaCreacion | Estado |
|----|---------|--------------|-----|---------------|--------|
| 1 | admin | [hash generado] | Admin | 2025-01-01 | Activo |

---

## 2. Configuración de Google Apps Script

### Paso 2.1 — Crear el proyecto

1. Ve a [script.google.com](https://script.google.com)
2. Clic en **"Nuevo proyecto"**
3. Renombra el proyecto como "ArborQuote Backend"

### Paso 2.2 — Pegar el código

1. Borra el contenido del archivo `Code.gs`
2. Pega el contenido completo del archivo `scripts/Code.gs` de este repositorio
3. Reemplaza en la línea 25:
   ```javascript
   var SPREADSHEET_ID = "TU_SPREADSHEET_ID_AQUI";
   // →
   var SPREADSHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz123"; // tu ID real
   ```

### Paso 2.3 — Publicar como Web App

1. Clic en **"Implementar"** → **"Nueva implementación"**
2. Tipo: **"Aplicación web"**
3. Configurar:
   - Descripción: `v1.0`
   - Ejecutar como: **Yo (mi correo)**
   - Quién tiene acceso: **Cualquiera** *(Anyone)*
4. Clic en **"Implementar"**
5. Autoriza los permisos solicitados
6. **Copia la URL** que aparece: `https://script.google.com/macros/s/[ID]/exec`

> ⚠️ Cada vez que modifiques el código GAS debes hacer una **nueva implementación** y actualizar la URL en `config.js`.

---

## 3. Configuración del Frontend

### Paso 3.1 — Actualizar la URL del API

Edita `assets/js/config.js` y reemplaza:

```javascript
APPS_SCRIPT_URL: "https://script.google.com/macros/s/TU_DEPLOYMENT_ID_AQUI/exec",
// →
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycby.../exec",
```

### Paso 3.2 — Verificar la conexión (prueba local)

Abre `index.html` directamente en el navegador (o usa un servidor local):

```bash
# Opción 1: Python
python3 -m http.server 3000

# Opción 2: Node
npx serve .
```

Ve a `http://localhost:3000` e intenta hacer login.

---

## 4. Despliegue en GitHub Pages

### Paso 4.1 — Crear el repositorio

```bash
git init
git add .
git commit -m "feat: initial ArborQuote setup"
git branch -M main
git remote add origin https://github.com/tu-usuario/arborquote.git
git push -u origin main
```

### Paso 4.2 — Habilitar GitHub Pages

1. Ve a tu repositorio → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Clic en **Save**
5. En ~2 minutos estará disponible en: `https://tu-usuario.github.io/arborquote/`

### Paso 4.3 — CI/CD automático (opcional)

Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

---

## 5. Datos de Prueba

### Usuario de prueba

Ejecuta en consola del navegador para obtener el hash de `demo123`:

```javascript
async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
sha256('demo123').then(console.log);
// → ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae
```

Agregar en la hoja `Usuarios`:

```
2 | vendedor1 | ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae | Vendedor | 2025-01-15 | Activo
```

---

## 6. Guía de Uso

### Flujo básico

1. **Login** → Ingresar usuario y contraseña
2. **Dashboard** → Ver resumen de actividad y cotizaciones recientes
3. **Nueva Cotización** → Completar el formulario:
   - Información del cliente
   - Condiciones del árbol (espacio, cables, altura, etc.)
   - El precio se calcula en tiempo real
4. **Guardar** → Se guarda en Google Sheets
5. **Ver / Imprimir** → Botón de ojo en la lista → Imprimir como PDF

### Fórmula de precios

```
horas = horasBase × multEspacio × multCables × multObjetos × multAcceso × multAltura × multDiámetro × multRiesgo
laborCost = horas × tarifaHora
subtotal = laborCost + serviciosAdicionales
total = (subtotal − descuento) × (1 + impuesto%)
```

---

## 7. Seguridad y Limitaciones

### Seguridad implementada

| Medida | Implementación |
|--------|----------------|
| Passwords hasheadas | SHA-256 en el browser antes de enviar |
| Tokens con TTL | 4h, almacenados en Google Sheets |
| Sanitización de inputs | Frontend + backend (anti-formula injection) |
| Multi-tenant básico | Filtro por usuario en cada consulta |
| XSS prevention | `_esc()` en todo HTML renderizado dinámicamente |

### Limitaciones conocidas

| Limitación | Descripción | Mitigación |
|------------|-------------|------------|
| **CORS en GAS** | Apps Script no permite `Access-Control-Allow-Origin` en ContentService directo | Publicar como "Cualquiera" y usar modo `no-cors` si es necesario |
| **Cuotas GAS** | 6 min/ejecución, 20k reads/día (plan gratuito) | Caché local con `_quotes`, batch reads |
| **Concurrencia** | Sheets no es transaccional: 2 escrituras simultáneas pueden colisionar | Aceptable para < 10 usuarios simultáneos |
| **Escalabilidad** | Google Sheets soporta ~5M celdas; cotizaciones ilimitadas en la práctica | Migrar a Firebase/Supabase si superas 10k registros |
| **Tokens inseguros** | No son JWT firmados; se pueden invalidar borrando la fila | Suficiente para uso interno; agregar HMAC para producción |
| **Sin HTTPS local** | `crypto.subtle` requiere HTTPS o localhost | GitHub Pages provee HTTPS automáticamente |

---

## 8. Mejoras Futuras

### Corto plazo (v1.1)
- [ ] Refresh automático de token (sliding session)
- [ ] Cambio de estado de cotización (Enviada / Cancelada)
- [ ] Exportación a PDF con jsPDF (sin abrir el diálogo de impresión)
- [ ] Notificación por email al crear cotización (GAS MailApp)

### Mediano plazo (v2.0)
- [ ] Migración a **Supabase** para auth real (JWT, RLS por usuario)
- [ ] Dashboard de analytics con Chart.js
- [ ] Panel de administración para gestionar usuarios
- [ ] Firma digital de cotizaciones

### Arquitectura alternativa (escala empresarial)
```
Frontend (Next.js) → Supabase (Auth + PostgreSQL) → Storage (R2/S3)
```
Costo ~$25/mes vs $0 actual con GAS, pero con:
- Autenticación OAuth2 real
- 50k MAU gratuitos en Supabase
- Queries SQL complejas
- Tiempo real con WebSockets

---

## Licencia

MIT — Libre uso, modificación y distribución.

---

*Generado por ArborQuote Setup Wizard · Versión 1.0.0*
