/**
 * Recoupement des trois tableaux de la page.
 *
 * CHAQUE TABLEAU EST ÉCRIT À LA MAIN, SÉPARÉMENT. Les candidats, le
 * déroulement et le détail des votes sont tenus par des contributeurs
 * différents, à des moments différents. Rien dans MediaWiki ne les force à
 * s'accorder : un nom corrigé dans l'un peut rester faux dans l'autre pendant
 * des semaines.
 *
 * Un import qui lirait chaque tableau isolément publierait donc sereinement
 * deux versions incompatibles de la même soirée. Ces contrôles ne cherchent
 * pas à trancher — ils NOMMENT la contradiction, et laissent le relecteur
 * décider quelle source croire.
 */
import type { Anomaly } from "./extract-votes.ts";
import type { VotesExtraction } from "./extract-votes.ts";
import type { ContestantsExtraction, ProgressExtraction } from "./extract-season.ts";
import { fold } from "./parse-fr.ts";

export function crossCheck(
  contestants: ContestantsExtraction,
  progress: ProgressExtraction,
  votes: VotesExtraction,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  const known = new Set(contestants.contestants.map((c) => fold(c.displayName)));
  const inVotesTable = new Set(votes.contestants.map(fold));

  // ── Les deux listes de candidats disent-elles la même chose ? ───────────
  if (known.size > 0 && inVotesTable.size > 0) {
    for (const name of votes.contestants) {
      if (!known.has(fold(name))) {
        anomalies.push({
          code: "candidat_absent_de_la_liste",
          message:
            `« ${name} » vote dans le tableau des votes mais ne figure pas dans le tableau des candidats`,
          row: name,
        });
      }
    }
    for (const c of contestants.contestants) {
      if (!inVotesTable.has(fold(c.displayName))) {
        anomalies.push({
          code: "candidat_absent_des_votes",
          message:
            `« ${c.displayName} » figure parmi les candidats mais dans aucune ligne du tableau des votes`,
          row: c.displayName,
        });
      }
    }
  }

  // ── Les éliminés concordent-ils, épisode par épisode ? ──────────────────
  for (const episode of progress.episodes) {
    if (!episode.aired) continue;

    const fromVotes = votes.rounds
      .filter((r) => r.episodeNumber === episode.number && r.eliminated)
      .map((r) => r.eliminated as string);

    // Le tableau du déroulement groupe l'éliminé et son binôme ; celui des
    // votes leur donne une colonne chacun. On compare donc des ENSEMBLES.
    //
    // La comparaison se fait sur le nom replié, mais le MESSAGE cite
    // l'orthographe de la source : « vincent est éliminé selon le
    // déroulement » donnerait au relecteur l'impression d'une coquille dans
    // la page, alors que la coquille serait dans l'outil.
    const declared = new Map(episode.eliminated.map((n) => [fold(n), n]));
    const counted = new Map(fromVotes.map((n) => [fold(n), n]));

    if (counted.size === 0 && declared.size > 0) {
      anomalies.push({
        code: "elimination_absente_des_votes",
        message: `épisode ${episode.number} : le déroulement annonce ${
          episode.eliminated.join(", ")
        }, le tableau des votes n'en montre aucun`,
      });
      continue;
    }

    for (const [key, original] of declared) {
      if (!counted.has(key)) {
        anomalies.push({
          code: "elimine_discordant",
          message:
            `épisode ${episode.number} : « ${original} » est éliminé selon le déroulement, absent des colonnes de vote`,
        });
      }
    }
    for (const [key, original] of counted) {
      if (!declared.has(key)) {
        anomalies.push({
          code: "elimine_discordant",
          message:
            `épisode ${episode.number} : « ${original} » est éliminé selon le tableau des votes, absent du déroulement`,
        });
      }
    }

    // ── Les décomptes concordent-ils ? ───────────────────────────────────
    //
    // Le déroulement écrit « 9-9 / 11-7 » ; le détail des votes écrit
    // « 11/18 ». Le premier nombre du dernier tour et le total doivent se
    // retrouver, sinon l'une des deux lignes a été corrigée sans l'autre.
    const votingRounds = votes.rounds.filter(
      (r) => r.episodeNumber === episode.number && r.kind === "vote",
    );
    const lastDeclared = episode.tallyRounds.at(-1);
    const lastCounted = votingRounds.at(-1);
    if (lastDeclared && lastCounted?.reportedVotesFor != null) {
      if (lastDeclared.counts[0] !== lastCounted.reportedVotesFor) {
        anomalies.push({
          code: "decompte_discordant",
          message: `épisode ${episode.number} : le déroulement compte ${
            lastDeclared.counts[0]
          } voix, le détail des votes ${lastCounted.reportedVotesFor}`,
        });
      }
      if (
        lastCounted.reportedVotesTotal != null &&
        lastDeclared.total !== lastCounted.reportedVotesTotal
      ) {
        anomalies.push({
          code: "votants_discordants",
          message:
            `épisode ${episode.number} : ${lastDeclared.total} votants selon le déroulement, ${lastCounted.reportedVotesTotal} selon le détail des votes`,
        });
      }
    }

    // ── Une égalité doit se voir des deux côtés ──────────────────────────
    const declaredRounds = episode.tallyRounds.length;
    const countedRounds = votes.rounds.filter(
      (r) => r.episodeNumber === episode.number && r.kind !== "linked",
    ).length;
    if (declaredRounds > 0 && declaredRounds !== countedRounds) {
      anomalies.push({
        code: "tours_discordants",
        message:
          `épisode ${episode.number} : ${declaredRounds} tour(s) de scrutin selon le déroulement, ${countedRounds} selon le détail des votes`,
      });
    }
  }

  return anomalies;
}
