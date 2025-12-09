const express = require('express');
const router = express.Router();
const db = require('../db/firebase');
const admin = require('firebase-admin'); // Necesario para Timestamps y FieldValue

const MAX_CUOTAS = 48; // Aumentado un poco
const MAX_MONTO = 20000;

// POST /prestamos - Crear préstamo inteligente
router.post('/', async (req, res) => {
  /*
    NUEVOS CAMPOS ESPERADOS:
    - monto_prestado: Lo que recibe el cliente en mano (ej. 1000)
    - interes_porcentaje: Porcentaje de ganancia (ej. 20%)
    - frecuencia: 'DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL'
    - fecha_inicio: (Opcional) Si quiere empezar otro día que no sea hoy
  */
  const {
    cliente_id,
    monto_prestado,
    interes_porcentaje,
    num_cuotas,
    frecuencia,
    fecha_inicio
  } = req.body;

  if (!cliente_id || !monto_prestado || !num_cuotas || !frecuencia) {
    return res.status(400).json({ error: 'Faltan datos: cliente, monto, cuotas o frecuencia' });
  }

  try {
    // 1. Validaciones
    if (monto_prestado > MAX_MONTO) return res.status(400).json({ error: 'Monto excede el límite' });

    // Validar cliente
    const clienteRef = db.collection('clientes').doc(cliente_id);
    const clienteSnap = await clienteRef.get();
    if (!clienteSnap.exists) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Validar préstamo activo
    const activos = await db.collection('prestamos')
      .where('cliente_id', '==', cliente_id)
      .where('estado', '==', 'activo') // Usamos 'estado' en vez de cancelado boolean
      .get();

    if (!activos.empty) return res.status(400).json({ error: 'Cliente ya tiene un préstamo activo' });

    // 2. Cálculos Financieros
    const interes = Number(interes_porcentaje) || 0;
    const monto_total = monto_prestado * (1 + (interes / 100)); // Capital + Interés
    const monto_cuota = Number((monto_total / num_cuotas).toFixed(2));

    // Ajuste de centavos en la última cuota (para que cuadre exacto)
    const total_calculado = monto_cuota * num_cuotas;
    const diferencia_centavos = Number((monto_total - total_calculado).toFixed(2));

    // 3. Preparar Batch
    const batch = db.batch();
    const prestamoRef = db.collection('prestamos').doc();

    // Fecha base (Hoy o la que envíen)
    // Truco: Usamos "new Date(fecha + 'T12:00:00')" para evitar problemas de zona horaria al guardar solo fecha
    let fechaCursor = fecha_inicio ? new Date(fecha_inicio + 'T12:00:00') : new Date();

    // Guardar Cabecera del Préstamo
    batch.set(prestamoRef, {
      cliente_id,
      cliente_nombre: clienteSnap.data().nombre, // Guardar nombre ayuda a no buscarlo luego
      monto_prestado: Number(monto_prestado),
      monto_total: Number(monto_total.toFixed(2)),
      interes_porcentaje: interes,
      ganancia_estimada: Number((monto_total - monto_prestado).toFixed(2)),
      saldo_pendiente: Number(monto_total.toFixed(2)), // Empieza debiendo todo
      num_cuotas: Number(num_cuotas),
      monto_por_cuota: monto_cuota,
      frecuencia,
      estado: 'activo', // activo, pagado, anulado
      fecha_inicio: fechaCursor.toISOString().split('T')[0],
      creado_en: admin.firestore.FieldValue.serverTimestamp()
    });

    const cronograma = [];

    // 4. Generación de Cuotas según Frecuencia
    for (let i = 1; i <= num_cuotas; i++) {
      // Cálculo de fechas
      if (frecuencia === 'DIARIO') {
        fechaCursor.setDate(fechaCursor.getDate() + 1);
        // Opcional: Saltar domingos
        // if (fechaCursor.getDay() === 0) fechaCursor.setDate(fechaCursor.getDate() + 1); 
      } else if (frecuencia === 'SEMANAL') {
        fechaCursor.setDate(fechaCursor.getDate() + 7);
      } else if (frecuencia === 'QUINCENAL') {
        fechaCursor.setDate(fechaCursor.getDate() + 15);
      } else if (frecuencia === 'MENSUAL') {
        fechaCursor.setMonth(fechaCursor.getMonth() + 1);
      }

      // Vencimiento en string YYYY-MM-DD para compatibilidad con tu sistema actual
      const fecha_vencimiento = fechaCursor.toISOString().split('T')[0];

      // Ajuste en última cuota
      let cuota_actual = monto_cuota;
      if (i === num_cuotas) {
        cuota_actual = Number((cuota_actual + diferencia_centavos).toFixed(2));
      }

      const cuotaRef = db.collection('cuotas').doc();
      const dataCuota = {
        prestamo_id: prestamoRef.id,
        cliente_id,
        numero_cuota: i,
        fecha_vencimiento,
        monto_cuota: cuota_actual,
        saldo_pendiente: cuota_actual, // Fundamental para pagos parciales
        estado: 'PENDIENTE', // PENDIENTE, PARCIAL, PAGADA, VENCIDA
        pagada: false
      };

      batch.set(cuotaRef, dataCuota);
      cronograma.push({ id: cuotaRef.id, ...dataCuota });
    }

    await batch.commit();

    res.json({
      mensaje: 'Préstamo creado exitosamente',
      prestamo_id: prestamoRef.id,
      total_a_pagar: monto_total,
      cronograma
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /prestamos/cliente/:cliente_id (Actualizado)
router.get('/cliente/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const prestamosSnap = await db.collection('prestamos')
      .where('cliente_id', '==', cliente_id)
      .where('estado', '==', 'activo')
      .limit(1)
      .get();

    if (prestamosSnap.empty) {
      return res.status(404).json({ error: 'No hay préstamo activo' });
    }

    const docPrestamo = prestamosSnap.docs[0];
    const prestamo = { id: docPrestamo.id, ...docPrestamo.data() };

    const cuotasSnap = await db.collection('cuotas')
      .where('prestamo_id', '==', prestamo.id)
      .get();

    const cuotas = cuotasSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => a.numero_cuota - b.numero_cuota);

    res.json({ prestamo, cuotas });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;