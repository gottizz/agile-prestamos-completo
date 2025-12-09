const admin = require('firebase-admin');

// 1. Evitar inicializar Firebase más de una vez
if (!admin.apps.length) {

  // 2. LÓGICA PARA PRODUCCIÓN (VERCEL)
  // Utiliza variables de entorno que configuraste en Vercel
  if (process.env.FIREBASE_PRIVATE_KEY) {
    console.log("🔥 Inicializando Firebase con Variables de Entorno (Producción)");
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,

          // 🚨 SOLUCIÓN CRÍTICA: Reemplaza los saltos de línea (\n)
          // que Vercel rompe en la clave privada.
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } catch (error) {
      console.error("❌ Error al inicializar Firebase con Vercel ENV:", error.message);
    }
  }

  // 3. LÓGICA PARA ENTORNO LOCAL (Desarrollo)
  // Intenta leer el archivo serviceAccountKey.json
  else {
    try {
      const serviceAccount = require('../serviceAccountKey.json'); // Ajusta la ruta si es necesario
      console.log("🔥 Inicializando Firebase con Archivo Local (Desarrollo)");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (e) {
      // Esto es normal si el archivo no existe en producción
      console.error("❌ Error al inicializar Firebase. No se encontró serviceAccountKey.json ni variables de entorno.");
    }
  }
}

// Exportar la instancia de Firestore
const db = admin.firestore();
module.exports = db;