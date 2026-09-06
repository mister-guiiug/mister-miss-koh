/**
 * Ce qu'on emporte quand on partage un portrait — et ce que chaque route peut
 * RÉELLEMENT porter.
 *
 * DEUX CHOSES DIFFÉRENTES, DEUX ROUTES. L'IMAGE part par le partage natif de
 * l'appareil ou par un enregistrement : d'appareil à appareil, sans serveur,
 * parce qu'elle n'est rangée nulle part ailleurs que sur celui-ci — ni chez
 * nous, ni chez personne. LE LIEN, lui, désigne la fiche publique du candidat :
 * n'importe qui peut l'ouvrir, et il n'emporte aucune photo.
 *
 * POURQUOI UN QR CODE NE PORTE PAS L'IMAGE. Un QR code contient au plus
 * 2 953 octets — version 40, correction « L », mode binaire : la limite absolue
 * du format, pas une limite de notre encodeur. Une vignette de portrait en pèse
 * plusieurs fois plus. Et même une image assez petite n'y entrerait pas
 * utilement : encodée en `data:`, elle serait refusée à l'ouverture par les
 * scanners des téléphones. Le QR porte donc le lien — et l'écran le dit, avec
 * les deux tailles à l'appui.
 */
import { slugify } from '@mister-guiiug/dev-pwa-config/format';

/** Capacité maximale d'un QR code, en octets (version 40, correction « L »). */
export const QR_MAX_BYTES = 2953;

/**
 * Les types que l'encodeur du socle produit, plus ceux qu'un navigateur peut
 * rendre. Hors de cette liste, l'extension est déduite du sous-type.
 */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

function extensionOf(mimeType: string): string {
  // `image/jpeg; charset=…` existe : le paramètre ne fait pas partie du type.
  const type = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  const known = EXTENSIONS[type];
  if (known) return known;
  const subtype = type.startsWith('image/') ? type.slice('image/'.length) : '';
  // Un sous-type inconnu mais propre vaut mieux qu'une extension inventée.
  return /^[a-z0-9]+$/.test(subtype) ? subtype : 'img';
}

/**
 * Le nom proposé au partage et à l'enregistrement.
 *
 * Il nomme la personne, parce que c'est ce qu'on cherche dans une pellicule six
 * mois plus tard — et l'extension suit le type réel du blob, jamais celui du
 * fichier d'origine : l'image a été ré-encodée en chemin.
 */
export function photoFileName(displayName: string, mimeType: string): string {
  const slug = slugify(displayName);
  return `portrait-${slug || 'candidat'}.${extensionOf(mimeType)}`;
}

/**
 * Une route de l'application, en URL absolue.
 *
 * L'application est en `HashRouter` : la route vit dans le fragment, et c'est
 * lui qu'il faut poser après la base. `currentAppUrl()` du socle rend la base
 * du déploiement — donc un lien partagé depuis un serveur de développement
 * pointe le serveur de développement, ce qui est exactement ce qu'on veut
 * vérifier.
 */
function appRoute(appUrl: string, path: string): string {
  const base = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;
  return `${base}#${path}`;
}

/** Le lien public d'une fiche de candidat. */
export function contestantUrl(appUrl: string, contestantId: string): string {
  return appRoute(appUrl, `/candidats/${encodeURIComponent(contestantId)}`);
}

/**
 * L'adresse d'un profil public.
 *
 * C'est l'IDENTIFIANT PUBLIC qui la forme, jamais l'identifiant de compte : le
 * premier est choisi et changeable, le second désigne une personne dans
 * `auth.users` et n'a rien à faire dans une URL qu'on colle dans une
 * conversation.
 */
export function profileUrl(appUrl: string, handle: string): string {
  return appRoute(appUrl, `/profil/${encodeURIComponent(handle)}`);
}

/**
 * L'adresse d'une photo partagée pour un jour.
 *
 * Une seule portée, donc pas de segment pour la dire : ce jeton n'ouvre qu'une
 * chose, et l'ouvrir la détruit. L'adresse est courte exprès — elle se colle
 * dans une conversation, et un QR code la porte sans peine (là où l'image,
 * elle, n'y entrerait jamais).
 */
export function photoShareUrl(appUrl: string, token: string): string {
  return appRoute(appUrl, `/photo/${encodeURIComponent(token)}`);
}

/** Une note, ou toute une collection. */
export type SharedKind = 'note' | 'notes';

/**
 * L'adresse d'un partage.
 *
 * LA PORTÉE EST DANS L'URL, pas devinée du jeton. Le serveur a deux lecteurs —
 * un par portée — et un jeton ne dit pas lequel l'ouvre ; c'est l'application
 * qui crée le lien, elle sait donc ce qu'elle a créé. L'inscrire épargne un
 * aller-retour perdu à chaque ouverture, et rend l'adresse lisible.
 */
export function sharedUrl(
  appUrl: string,
  kind: SharedKind,
  token: string
): string {
  return appRoute(appUrl, `/partage/${kind}/${encodeURIComponent(token)}`);
}
