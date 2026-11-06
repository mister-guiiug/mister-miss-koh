import type { Account } from './auth';

/**
 * QUI EST CONNECTÉ, SANS ATTENDRE LE RÉSEAU POUR LE SAVOIR.
 *
 * `auth.getUser()` n'est pas une lecture : il commence par `getSession()`, et
 * celui-ci RENOUVELLE le jeton d'accès quand il est périmé — ce qu'il est au
 * bout d'une heure. Sans réseau, ce renouvellement ne peut pas aboutir : il
 * tourne une demi-minute avant de renoncer. L'application s'ouvre bien pendant
 * ce temps (le référentiel vient du cache), mais elle affiche « personne » à
 * quelqu'un dont la session dort sur l'appareil.
 *
 * LA LECTURE DU STOCKAGE EST CELLE DU SOCLE (`auth/stored-session`). Ce
 * fichier en portait une copie, « à migrer » depuis la 4.9.0 ; elle prenait la
 * première case `sb-*` venue — sur un appareil qui sert à une autre app du
 * parc, la session de l'autre. Le socle lit la case de CE projet, nommée par
 * `supabaseStorageKey` (6.31.0).
 */
import {
  navigateurHorsLigne,
  storedSupabaseSession,
} from '@mister-guiiug/dev-pwa-config/auth/stored-session';
import { supabaseStorageKey } from '@mister-guiiug/dev-pwa-config/supabase-client';

export { navigateurHorsLigne };

/** Le compte rangé sur l'appareil, par la session de CE projet, même périmée. */
export function compteRange(): Account | null {
  const session = storedSupabaseSession({
    auth: {
      storageKey: supabaseStorageKey(import.meta.env.VITE_SUPABASE_URL),
    },
  }) as { user?: { id?: unknown; email?: unknown } } | null;
  const id = session?.user?.id;
  if (typeof id !== 'string' || id.length === 0) return null;
  const email = session?.user?.email;
  return { id, email: typeof email === 'string' ? email : null };
}

/**
 * Combien de temps attendre le serveur avant de se rabattre sur le stockage.
 *
 * `navigator.onLine` ne protège que du cas franc : derrière un portail captif
 * ou sur un Wi-Fi qui ne route rien, l'appel part et ne revient jamais — SANS
 * lever, donc sans qu'aucun `catch` ne serve.
 */
const ATTENTE_MS = 5_000;

/** Marqueur d'attente dépassée, distinct de « personne n'est connecté ». */
const TROP_LONG = Symbol('attente dépassée');

/**
 * Le compte courant, ou `null`.
 *
 * @param demanderAuServeur Ce que fait Supabase quand on le lui demande —
 * injecté pour que cette décision s'éprouve sans client ni réseau.
 * @param attenteMs Surchargeable pour les tests.
 */
export async function compteCourant(
  demanderAuServeur: () => Promise<Account | null>,
  attenteMs: number = ATTENTE_MS
): Promise<Account | null> {
  // Hors ligne : ne rien demander. La réponse est sur l'appareil, et Supabase
  // mettrait une demi-minute à dire qu'il ne sait pas.
  if (navigateurHorsLigne()) {
    const range = compteRange();
    if (range) return range;
  }

  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    const issue = await Promise.race([
      demanderAuServeur(),
      new Promise<typeof TROP_LONG>(resoudre => {
        minuteur = setTimeout(() => resoudre(TROP_LONG), attenteMs);
      }),
    ]);
    return issue === TROP_LONG ? compteRange() : issue;
  } catch {
    // Le réseau a lâché en cours de route : le stockage sait encore.
    return compteRange();
  } finally {
    clearTimeout(minuteur);
  }
}
