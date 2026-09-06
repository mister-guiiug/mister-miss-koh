/**
 * Ce qu'il reste à vivre à un partage éphémère, dit en toutes lettres.
 *
 * UNE DATE ABSOLUE NE RÉPOND PAS À LA QUESTION. « expire le 7 septembre à
 * 23:12 » oblige à calculer de tête ; ce qu'on veut savoir en donnant un lien,
 * c'est combien de temps il tiendra. On arrondit donc vers le BAS : promettre
 * « 2 h » quand il en reste une heure et cinquante-neuf minutes est une
 * promesse qu'on peut tenir, l'inverse non.
 *
 * L'HEURE QUI FAIT FOI EST CELLE DU SERVEUR — c'est lui qui a posé
 * `expires_at`, et lui qui refusera la lecture. Une horloge de navigateur en
 * avance affichera « expiré » un peu tôt : mieux vaut ce sens-là que
 * l'inverse.
 */

/** Combien de temps encore, en clair. `null` quand il n'y en a plus. */
export function remainingLabel(
  expiresAt: string,
  now: Date = new Date()
): string | null {
  const reste = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(reste) || reste <= 0) return null;

  const minutes = Math.floor(reste / 60_000);
  if (minutes < 1) return 'moins d’une minute';
  if (minutes < 60) return `${minutes} min`;

  const heures = Math.floor(minutes / 60);
  return `${heures} h`;
}

/** Ce partage a-t-il encore cours ? La même question, en booléen. */
export function isAlive(expiresAt: string, now: Date = new Date()): boolean {
  return remainingLabel(expiresAt, now) !== null;
}
