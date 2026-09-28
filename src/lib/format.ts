/** Formatiert eine Meter-/Flächenangabe im deutschen Zahlenformat (Komma statt Punkt). */
export function formatMeters(v: number, digits = 2): string {
  return v.toFixed(digits).replace('.', ',');
}
