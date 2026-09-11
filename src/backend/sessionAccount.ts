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
 * À MIGRER : le socle publie le même utilitaire sous
 * `@mister-guiiug/dev-pwa-config/auth/stored-session` depuis la 4.9.0. Ce dépôt
 * ne peut pas encore le prendre — `^4.9.0` résout vers 4.10.0, qui réclame
 * ESLint 10 alors que `eslint-plugin-jsx-a11y` s'arrête à 9. Cette copie
 * disparaîtra avec cette montée-là.
 */

const NOM_DE_CASE = /^sb-[a-z0-9]+-auth-token$/;

/**
 * Le navigateur affirme-t-il être HORS LIGNE ?
 *
 * `=== false` et non `!onLine` : hors navigateur la propriété n'existe pas, et
 * `!undefined` ferait croire à une coupure permanente. L'inverse n'est pas
 * fiable non plus — `onLine` est vrai derrière un portail captif comme sur un
 * Wi-Fi qui ne route rien. D'où l'attente bornée, en plus de ce test.
 */
export function navigateurHorsLigne(): boolean {
  return globalThis.navigator?.onLine === false;
}

/**
 * Le compte lu dans la session rangée sur l'appareil, ou `null`.
 *
 * **Best-effort** : navigation privée, stockage refusé, contenu illisible —
 * tout rend `null`, exactement comme une absence de session. La session est
 * lue MÊME PÉRIMÉE : hors ligne, un jeton expiré ne dit rien de l'utilisateur,
 * il dit qu'une heure a passé.
 */
export function compteRange(): Account | null {
  try {
    const stockage = globalThis.localStorage;
    if (!stockage) return null;
    for (let i = 0; i < stockage.length; i++) {
      const nom = stockage.key(i);
      if (!nom || !NOM_DE_CASE.test(nom)) continue;
      const brut = stockage.getItem(nom);
      if (!brut) continue;
      const valeur = JSON.parse(brut) as {
        user?: { id?: unknown; email?: unknown };
      };
      const id = valeur?.user?.id;
      if (typeof id !== 'string' || id.length === 0) continue;
      const email = valeur.user?.email;
      return { id, email: typeof email === 'string' ? email : null };
    }
    return null;
  } catch {
    return null;
  }
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
