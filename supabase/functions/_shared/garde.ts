/**
 * La garde anti-vandalisme, avant toute publication SANS humain.
 *
 * POURQUOI. La complétion (voir `diff.ts`) laisse la soirée publier seule les
 * résultats d'un épisode. Un faux résultat écrit sur la page serait publié de
 * la même façon, et sa révocation ne le retirerait pas du site : défaire une
 * donnée publiée est `retroactive`, donc réservé à un humain. Le faux resterait
 * en ligne jusqu'à ce que quelqu'un le voie.
 *
 * LA RÈGLE. Un lot ne se publie seul que si chaque modification de la page
 * depuis la révision en ligne sur le site vient d'un compte CONFIRMÉ de
 * Wikipédia (groupe `autoconfirmed`, le seuil que Wikipédia exige elle-même
 * pour écrire sur une page semi-protégée). Une adresse IP, un compte
 * temporaire ou un compte trop récent, et le lot attend un humain.
 *
 * POURQUOI PAS LE MODÈLE DE WIKIMEDIA. Lift Wing estime le risque qu'une
 * modification soit annulée. Mesuré le 30/09/2026 sur 628 modifications de
 * trois pages de saison : les 23 annulées d'anonymes notées toutes au-dessus
 * de 0,5, mais 121 anonymes sur 126 jamais annulées aussi ; les 10 annulées
 * d'inscrits toutes à 0,45 ou moins, aucune rattrapée. La note sépare les anonymes
 * des inscrits, et rien de plus. La règle sur l'auteur fait la même chose
 * sans service tiers, et se lit d'une phrase.
 *
 * CE QUI N'EST PAS VÉRIFIÉ. Une modification déjà annulée (balise
 * `mw-reverted`) : son effet a quitté la page. Une modification restée en
 * ligne plus de `SURVIE_MS` : sur une page suivie, un vandalisme ne tient pas
 * une journée.
 *
 * DANS LE DOUTE, ON ATTEND. Historique illisible, trop de modifications,
 * comptes illisibles : le lot n'est pas publié seul. C'est ce qui se passait
 * avant la garde, et c'est sans danger.
 */
import {
  type EditInfo,
  fetchEdits,
  fetchUserGroups,
  type PageRef,
  type WikiConfig,
} from "./mediawiki.ts";

/** Une modification restée en ligne un jour a survécu à ceux qui suivent la page. */
export const SURVIE_MS = 24 * 3_600_000;

/** Au-delà, on ne vérifie pas une à une : le lot attend. */
export const MAX_VERIFIEES = 50;

/** Les groupes qui valent confirmation, automatique ou donnée à la main. */
const CONFIRMES = new Set(["autoconfirmed", "confirmed"]);

export interface GuardOptions {
  /** La révision en ligne sur le site (`last_seen_revision`), `null` si aucune. */
  readonly published: string | null;
  /** La révision que le lot vient de lire. */
  readonly candidate: string;
  /** L'horloge, en millisecondes. */
  readonly now: number;
}

export interface GuardVerdict {
  /** Vrai : le lot peut se publier seul. */
  readonly ok: boolean;
  /** Ce qui a été vérifié, ou pourquoi le lot attend. Journalisé tel quel. */
  readonly message: string;
}

/**
 * Les modifications à vérifier : de la révision lue vers le passé, jusqu'à la
 * révision en ligne ou jusqu'à une modification qui a survécu un jour. `null`
 * quand la fenêtre dépasse ce que l'API a rendu.
 */
function editsToCheck(
  window: { edits: readonly EditInfo[]; more: boolean },
  options: GuardOptions,
): EditInfo[] | null {
  const published = options.published !== null && /^\d+$/.test(options.published)
    ? Number(options.published)
    : null;
  const oldest = options.now - SURVIE_MS;
  const toCheck: EditInfo[] = [];
  for (const edit of window.edits) {
    if (published !== null && Number(edit.revId) <= published) return toCheck;
    if (Date.parse(edit.revisedAt) < oldest) return toCheck;
    if (edit.tags.includes("mw-reverted")) continue;
    toCheck.push(edit);
  }
  return window.more ? null : toCheck;
}

export async function guardEdits(
  config: WikiConfig,
  page: PageRef,
  options: GuardOptions,
): Promise<GuardVerdict> {
  const refuse = (message: string): GuardVerdict => ({
    ok: false,
    message: `garde anti-vandalisme : ${message} : relecture humaine`,
  });
  const motif = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  let toCheck: EditInfo[] | null;
  try {
    toCheck = editsToCheck(
      await fetchEdits(config, page, options.candidate, MAX_VERIFIEES),
      options,
    );
  } catch (error) {
    return refuse(`historique de la page illisible (${motif(error)})`);
  }
  if (toCheck === null) {
    return refuse(
      `plus de ${MAX_VERIFIEES} modifications récentes depuis la révision en ligne, trop pour les vérifier`,
    );
  }
  if (toCheck.length === 0) {
    return { ok: true, message: "garde anti-vandalisme : aucune modification récente" };
  }

  // Personne d'identifiable : on ne demande rien à l'API, on attend.
  const anonyme = toCheck.find((edit) => edit.user === null);
  if (anonyme) {
    return refuse(
      `la révision ${anonyme.revId} vient d'une adresse IP ou d'un compte temporaire`,
    );
  }

  let groups: Map<string, readonly string[]>;
  try {
    groups = await fetchUserGroups(config, [
      ...new Set(toCheck.map((edit) => edit.user as string)),
    ]);
  } catch (error) {
    return refuse(`comptes illisibles (${motif(error)})`);
  }
  const nonConfirmee = toCheck.find((edit) =>
    !(groups.get(edit.user as string) ?? []).some((g) => CONFIRMES.has(g))
  );
  if (nonConfirmee) {
    return refuse(`la révision ${nonConfirmee.revId} vient d'un compte non confirmé`);
  }

  return {
    ok: true,
    message:
      `garde anti-vandalisme : ${toCheck.length} modification(s) récente(s), toutes de comptes confirmés`,
  };
}
