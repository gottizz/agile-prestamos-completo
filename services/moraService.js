// Ahora acepta una tasa personalizada. Si no se envía, usa 0.01 por defecto.
function calcularMora(saldo_pendiente, vencida, tasa = 0.01) {
  if (!vencida) return 0;
  const mora = Number((saldo_pendiente * tasa).toFixed(2));
  return mora;
}