/**
 * Le chargement d'un fichier Rive, signalé à qui l'attend.
 *
 * À part de `riveLite.ts` pour une raison de poids : ce registre est lu par
 * `AppAnimation`, donc chargé avec l'application, alors que le chargeur du
 * moteur ne doit l'être qu'à la première animation (`import()`).
 */
type Signal = (pret: boolean) => void;
const attentes = new Map<string, Set<Signal>>();

/** S'abonner au chargement de `src` ; rend la fonction de désabonnement. */
export function attendre(src: string, signal: Signal): () => void {
  if (!attentes.has(src)) attentes.set(src, new Set());
  attentes.get(src)!.add(signal);
  return () => attentes.get(src)?.delete(signal);
}

export function signaler(src: string, pret: boolean) {
  attentes.get(src)?.forEach(s => s(pret));
}
