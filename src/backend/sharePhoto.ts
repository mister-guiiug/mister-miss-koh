/**
 * Envoyer une IMAGE par la feuille de partage du système.
 *
 * POURQUOI PAS `shareOrCopy` DU SOCLE. Le socle partage un titre, un texte et
 * une URL — et il a raison de s'arrêter là : son repli est le presse-papiers,
 * qui ne sait rien faire d'un fichier. Ici c'est le fichier qui est la charge
 * utile. Ce module ne recopie donc pas `shareOrCopy` (l'écran l'appelle pour le
 * LIEN, à côté), il traite le cas que le socle ne couvre pas.
 *
 * `canShare` AVANT `share`, AVEC LA MÊME CHARGE. Un navigateur peut accepter un
 * texte et refuser un fichier ; la question ne se pose donc qu'avec la charge
 * exacte qu'on s'apprête à envoyer, sans quoi le bouton promet ce que la
 * plateforme refusera. D'où une fonction unique qui la construit pour les deux.
 *
 * L'ANNULATION N'EST PAS UN ÉCHEC — la leçon est celle du socle, dont trois
 * apps du parc affichaient « échec » à qui avait simplement refermé la feuille.
 */

/** Ce qui s'est réellement passé. */
export type PhotoShareResult =
  'shared' | 'cancelled' | 'unsupported' | 'failed';

/**
 * Le strict nécessaire d'un `navigator` — deux méthodes, toutes deux
 * facultatives. Déclarer si peu rend le module injectable dans un test sans
 * fabriquer un navigateur entier.
 */
export interface SharePlatform {
  share?(data: ShareData): Promise<void>;
  canShare?(data: ShareData): boolean;
}

function payload(file: File, title: string): ShareData {
  // Fichier et titre, rien d'autre : ajouter une `url` fait refuser la charge
  // entière par plusieurs plateformes qui, seules, acceptent chaque partie.
  return { files: [file], title };
}

/**
 * La plateforme sait-elle envoyer CE fichier ?
 *
 * `canShare` est absente des navigateurs anciens : son absence vaut refus,
 * puisqu'on ne saurait pas quoi faire de l'échec qui suivrait.
 */
export function canSharePhoto(
  file: File,
  title: string,
  platform: SharePlatform | undefined = globalThis.navigator
): boolean {
  if (typeof platform?.share !== 'function') return false;
  if (typeof platform.canShare !== 'function') return false;
  try {
    return platform.canShare(payload(file, title));
  } catch {
    // Une charge que la plateforme n'arrive même pas à examiner est un refus.
    return false;
  }
}

/**
 * Ouvre la feuille de partage du système sur cette image.
 *
 * À APPELER DANS LE GESTE. Safari exige que `share` parte du clic ; l'appelant
 * tient donc le `File` prêt AVANT d'afficher le bouton, et ce module ne lit
 * rien — ni base, ni réseau — entre le clic et l'ouverture de la feuille.
 */
export async function sharePhoto(
  file: File,
  title: string,
  platform: SharePlatform | undefined = globalThis.navigator
): Promise<PhotoShareResult> {
  const share = platform?.share;
  if (typeof share !== 'function') return 'unsupported';
  try {
    await share.call(platform, payload(file, title));
    return 'shared';
  } catch (error) {
    // La feuille refermée lève, exactement comme une panne : seul le nom les
    // distingue, et l'appelant a besoin de la distinction pour se taire.
    if (error instanceof Error && error.name === 'AbortError')
      return 'cancelled';
    return 'failed';
  }
}
