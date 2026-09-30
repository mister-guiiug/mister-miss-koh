/**
 * La sonde de la soirée de diffusion : savoir, pour presque rien, s'il y a
 * quelque chose à lire.
 *
 * POURQUOI UNE SONDE. Le passage de la soirée relisait la saison en diffusion
 * toutes les trente minutes : une élimination pouvait attendre une demi-heure
 * avant d'être seulement lue. Relire plus souvent par l'import coûtait une
 * exécution en base à chaque passage, même quand rien n'avait bougé. La sonde
 * fait UN appel à l'API (les dernières révisions, aucun contenu) et ne crée
 * rien quand la page n'a pas changé : elle note seulement l'heure de lecture.
 *
 * ATTENDRE QUE LA PAGE SE CALME. Pendant l'émission, les contributeurs écrivent
 * par rafales : un tableau de votes se remplit en cinq modifications, une
 * élimination s'annonce avant que la colonne ne soit complète. Lire chaque état
 * intermédiaire donnerait des lots incomplets, souvent ambigus, donc arrêtés
 * en relecture. La sonde ne lit une révision nouvelle que si la page n'a plus
 * bougé depuis `CALME_MS`. Et pour qu'une page qui ne s'arrête jamais ne fige
 * pas le site, elle lit quand même au bout de `ATTENTE_MAX_MS` d'attente.
 *
 * CE QU'ELLE NE DÉCIDE PAS. Ni l'extraction, ni la relecture, ni la
 * publication : tout cela reste `runImport`, qui reçoit la révision jugée
 * calme et la lit, elle, sans en redemander une autre.
 */
import {
  EXTRACTOR_VERSION,
  type ImportPort,
  runImport,
  type RunOptions,
  type RunOutcome,
} from "./import-run.ts";
import { fetchRevisionHistory, type RevisionInfo, type WikiConfig } from "./mediawiki.ts";

/** Une page qui n'a plus bougé depuis trois minutes s'est calmée. */
export const CALME_MS = 3 * 60_000;

/** Au-delà, on lit une page qui bouge encore : le site ne doit pas se figer. */
export const ATTENTE_MAX_MS = 15 * 60_000;

/** Assez de révisions pour dater le début d'une rafale. */
const HISTORIQUE = 20;

export type ProbeStatus = "inchangee" | "trop_recente" | "importee";

export interface ProbeOutcome {
  readonly status: ProbeStatus;
  readonly revision: string;
  readonly message: string;
  /** L'exécution d'import, quand la sonde en a lancé une. */
  readonly run?: RunOutcome;
}

export interface ProbeOptions extends RunOptions {
  /** Injectable pour les tests : l'horloge, en millisecondes. */
  readonly now?: () => number;
}

/**
 * Depuis quand la page attend d'être lue : la date de la plus ancienne des
 * révisions postérieures à la dernière lue. `null` quand aucune ne l'est.
 *
 * Les révisions arrivent de la plus récente à la plus ancienne. Sans révision
 * connue, toutes attendent, et c'est la plus ancienne de l'historique qui date
 * l'attente.
 */
export function pendingSince(
  revisions: readonly RevisionInfo[],
  known: string | null,
): string | null {
  const connue = known !== null && /^\d+$/.test(known) ? Number(known) : null;
  let plusAncienne: string | null = null;
  for (const r of revisions) {
    if (connue !== null && Number(r.revId) <= connue) break;
    plusAncienne = r.revisedAt;
  }
  return plusAncienne;
}

export async function probe(
  port: ImportPort,
  options: ProbeOptions,
): Promise<ProbeOutcome> {
  const document = await port.loadDocument(options.documentId);
  if (!document) {
    throw new Error(`document source introuvable : ${options.documentId}`);
  }

  const wiki: WikiConfig = {
    apiUrl: document.apiUrl,
    userAgent: options.userAgent,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
  };
  const history = await fetchRevisionHistory(wiki, {
    title: document.title,
    pageId: document.pageId,
  }, HISTORIQUE);
  const latest = history.revisions[0];

  const known = await port.lastImportedRevision(document.id);
  const memeExtraction = (await port.lastExtractorVersion(document.id)) ===
    EXTRACTOR_VERSION;

  if (known === latest.revId && memeExtraction) {
    // Déjà lue. Sauf si son lot certain attend encore d'être en ligne : alors
    // on le rejoue, et rien sur la page ne justifie d'attendre.
    if (!await port.replayUnpublished(document.id, latest.revId)) {
      await port.noteObserved(document.id, latest.revId);
      return {
        status: "inchangee",
        revision: latest.revId,
        message: `révision ${latest.revId} déjà lue`,
      };
    }
  } else if (known !== latest.revId) {
    const now = options.now?.() ?? Date.now();
    const calme = now - Date.parse(latest.revisedAt);
    const depuis = pendingSince(history.revisions, known);
    const attente = depuis === null ? 0 : now - Date.parse(depuis);
    if (calme < CALME_MS && attente < ATTENTE_MAX_MS) {
      return {
        status: "trop_recente",
        revision: latest.revId,
        message: `révision ${latest.revId} modifiée il y a ${
          Math.round(calme / 1000)
        } s : la page ne s'est pas encore calmée`,
      };
    }
  }
  // Même révision mais extraction nouvelle : la page n'a pas bougé, on lit.

  const run = await runImport(port, { ...options, revision: latest });
  return { status: "importee", revision: latest.revId, message: run.message, run };
}
