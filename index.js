const express = require('express');
const cors = require('cors');
const path = require('path'); // Importante para rutas de archivos

// Importar rutas
const clientesRoutes = require('./routes/clientes');
const prestamosRoutes = require('./routes/prestamos');
const pagosRoutes = require('./routes/pagos');
const cajaRoutes = require('./routes/caja');
const flowRoutes = require('./routes/flow');
const mercadopagoRoutes = require('./routes/mercadopago');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. SERVIR ARCHIVOS ESTÁTICOS (TU FRONTEND)
// Esto hace que la carpeta 'public' sea accesible desde el navegador
app.use(express.static(path.join(__dirname, 'public')));

// 2. RUTAS DE LA API
app.use('/clientes', clientesRoutes);
app.use('/prestamos', prestamosRoutes);
app.use('/pagos', pagosRoutes);
app.use('/caja', cajaRoutes);
app.use('/flow', flowRoutes);
app.use('/mercadopago', mercadopagoRoutes);

// 3. RUTA FALLBACK (PARA QUE SIEMPRE CARGUE TU HTML)
// Si entran a una ruta que no es API, devuelve el index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 4. EXPORTAR LA APP (REQUISITO DE VERCEL)
// Vercel necesita que exportes 'app', no que uses app.listen directamente en producción
module.exports = app;

// Solo escuchar puerto si estamos en local (no en Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}