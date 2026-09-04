/**
 * L'orchestrateur : dix-huit étapes, et deux arrêts d'urgence.
 *
 * IL NE PARLE PAS À SUPABASE. Tout ce qui lit ou écrit passe par le port
 * `ImportPort`, injecté. C'est ce qui rend l'enchaînement testable sans base :
 * les décisions — s'arrêter, refuser, classer, valider — se prouvent avec un
 * port de fantaisie, et il ne reste au vrai port qu'à traduire en SQL.
 *
 * DEUX ARRÊTS D'URGENCE, avant tout diff :
 *
 *  1. **révision inchangée** — la page n'a pas bougé depuis le dernier import
 *     réussi : on s'arrête en `unchanged`, sans rien lire de plus. C'est aussi
 *     ce qui rend une planification fréquente inoffensive ;
 *  2. **structure incomprise** — un en-tête a disparu, un tableau est absent.
 *     On s'arrête en `failed` SANS produire de différences. C'est le garde le
 *     plus important du pipeline : une extraction vide, passée au diff,
 *     proposerait de supprimer tout le référentiel. Le diff a bien sa règle de
 *     couverture, mais un deuxième verrou en amont coûte trois lignes et ferme
 *     la porte plus tôt.
 *
 * ET UN TROISIÈME, plus discret : l'empreinte du modèle intermédiaire. Une
 * nouvelle révision qui n'a rien changé d'utile — un lien corrigé, une
 * catégorie ajoutée — se termine aussi en `unchanged`, et n'encombre pas la
 * file de relecture.
 */
import {
  extractHash,
  fetchRevision,
  fetchSectionHtml,
  fetchSections,
  findSection,
  type WikiConfig,
} from "./mediawiki.ts";
import { parseTables } from "./html-table.ts";
import { extractVotes } from "./extract-votes.ts";
import { extractContestants, extractProgress } from "./extract-season.ts";
import { crossCheck } from "./cross-check.ts";
import {
  autoValidatable,
  type Difference,
  diffRecords,
  type IncomingRecord,
  type Json,
  type StoredRecord,
} from "./diff.ts";
import type { Anomaly } from "./extract-votes.ts";

export type RunStatus = "unchanged" | "diffed" | "failed";

export interface SourceDocument {
  readonly id: string;
  readonly title: string;
  readonly apiUrl: string;
  readonly seasonSlug: string;
}

export interface ImportPolicy {
  readonly autoValidateUnambiguous: boolean;
  readonly maxAutoChanges: number;
}

/** Tout l'accès à la base passe par là. Rien d'autre n'écrit. */
export interface ImportPort {
  loadDocument(documentId: string): Promise<SourceDocument | null>;
  /** Révision du dernier import qui a abouti, pour l'arrêt « inchangé ». */
  lastImportedRevision(documentId: string): Promise<string | null>;
  lastExtractHash(documentId: string): Promise<string | null>;
  createRun(input: {
    documentId: string;
    trigger: "manual" | "scheduled";
    actorId: string | null;
  }): Promise<string>;
  finishRun(runId: string, patch: {
    status: RunStatus;
    revision?: string;
    revisedAt?: string;
    extractHash?: string;
    error?: string;
    differencesTotal?: number;
    differencesAmbiguous?: number;
  }): Promise<void>;
  saveRecords(
    runId: string,
    records: readonly IncomingRecord[],
    anomaliesByKey: Readonly<Record<string, readonly string[]>>,
  ): Promise<void>;
  loadPublished(
    documentId: string,
    entities: readonly string[],
  ): Promise<readonly StoredRecord[]>;
  saveDifferences(runId: string, differences: readonly Difference[]): Promise<void>;
  autoValidateDifferences(runId: string, keys: readonly string[]): Promise<void>;
  loadPolicy(documentId: string): Promise<ImportPolicy>;
  log(action: string, summary: string, targetId?: string): Promise<void>;
}

export interface RunOptions {
  readonly documentId: string;
  readonly trigger: "manual" | "scheduled";
  readonly actorId: string | null;
  readonly userAgent: string;
  readonly fetchImpl?: typeof fetch;
  /** Forcer la relecture même si la révision n'a pas changé. */
  readonly force?: boolean;
}

export interface RunOutcome {
  readonly runId: string;
  readonly status: RunStatus;
  readonly revision?: string;
  readonly message: string;
  readonly counts?: Readonly<Record<string, number>>;
  readonly anomalies?: readonly Anomaly[];
}

const ENTITIES = [
  "season_contestant",
  "episode",
  "council_round",
  "council_vote",
] as const;

const SECTIONS = {
  contestants: "Candidats",
  progress: "Déroulement",
  votes: "Détails des votes",
} as const;

/** Anomalies qui interdisent d'aller plus loin. */
function isFatal(anomaly: Anomaly): boolean {
  return anomaly.code === "structure_inconnue" || anomaly.code === "aucun_candidat";
}

export async function runImport(
  port: ImportPort,
  options: RunOptions,
): Promise<RunOutcome> {
  const document = await port.loadDocument(options.documentId);
  if (!document) {
    throw new Error(`document source introuvable : ${options.documentId}`);
  }

  const runId = await port.createRun({
    documentId: document.id,
    trigger: options.trigger,
    actorId: options.actorId,
  });

  const wiki: WikiConfig = {
    apiUrl: document.apiUrl,
    userAgent: options.userAgent,
    fetchImpl: options.fetchImpl,
  };

  try {
    // ── 1. Révision ───────────────────────────────────────────────────────
    const revision = await fetchRevision(wiki, document.title);
    const known = await port.lastImportedRevision(document.id);
    if (!options.force && known === revision.revId) {
      await port.finishRun(runId, {
        status: "unchanged",
        revision: revision.revId,
        revisedAt: revision.revisedAt,
      });
      return {
        runId,
        status: "unchanged",
        revision: revision.revId,
        message: `révision ${revision.revId} déjà traitée`,
      };
    }

    // ── 2. Sections, par leur titre ───────────────────────────────────────
    const sections = await fetchSections(wiki, document.title);
    const wanted: Record<keyof typeof SECTIONS, string> = {
      contestants: "",
      progress: "",
      votes: "",
    };
    const missing: string[] = [];
    for (const [key, title] of Object.entries(SECTIONS)) {
      const found = findSection(sections, title);
      if (!found) missing.push(title);
      else wanted[key as keyof typeof SECTIONS] = found.index;
    }
    if (missing.length > 0) {
      const message = `sections introuvables : ${missing.join(", ")}`;
      await port.finishRun(runId, {
        status: "failed",
        revision: revision.revId,
        error: message,
      });
      await port.log("import.failed", message, runId);
      return { runId, status: "failed", revision: revision.revId, message };
    }

    // ── 3. Extraction ─────────────────────────────────────────────────────
    const [contestantsHtml, progressHtml, votesHtml] = await Promise.all([
      fetchSectionHtml(wiki, document.title, wanted.contestants),
      fetchSectionHtml(wiki, document.title, wanted.progress),
      fetchSectionHtml(wiki, document.title, wanted.votes),
    ]);

    const contestantsTable = parseTables(contestantsHtml)[0];
    const progressTable = parseTables(progressHtml)[0];
    const votesTable = parseTables(votesHtml)[0];

    if (!contestantsTable || !progressTable || !votesTable) {
      const message = "au moins un tableau attendu est absent de la page";
      await port.finishRun(runId, {
        status: "failed",
        revision: revision.revId,
        error: message,
      });
      await port.log("import.failed", message, runId);
      return { runId, status: "failed", revision: revision.revId, message };
    }

    const contestants = extractContestants(contestantsTable.grid, document.seasonSlug);
    const progress = extractProgress(progressTable.grid, document.seasonSlug);
    const votes = extractVotes(votesTable.grid, document.seasonSlug);

    const anomalies: Anomaly[] = [
      ...contestants.anomalies,
      ...progress.anomalies,
      ...votes.anomalies,
      ...crossCheck(contestants, progress, votes),
    ];

    // Les lignes irrégulières du tableau relèvent du LECTEUR, pas de
    // l'extraction : elles se récupèrent ici pour ne pas être perdues.
    for (
      const [name, table] of Object.entries({
        contestants: contestantsTable,
        progress: progressTable,
        votes: votesTable,
      })
    ) {
      for (const row of table.raggedRows) {
        anomalies.push({
          code: "ligne_irreguliere",
          message:
            `tableau « ${name} » : la ligne ${row} n'a pas le même nombre de cellules que les autres`,
        });
      }
    }

    // ── 4. ARRÊT si la structure n'a pas été comprise ─────────────────────
    const fatal = anomalies.filter(isFatal);
    if (fatal.length > 0) {
      const message = `structure incomprise : ${fatal.map((a) => a.message).join(" ; ")}`;
      await port.finishRun(runId, {
        status: "failed",
        revision: revision.revId,
        error: message,
      });
      await port.log("import.failed", message, runId);
      return { runId, status: "failed", revision: revision.revId, message, anomalies };
    }

    // ── 5. Modèle intermédiaire, et son empreinte ─────────────────────────
    const { records, anomaliesByKey } = buildRecords(
      contestants,
      progress,
      votes,
      anomalies,
    );
    const hash = await extractHash(records);
    const previousHash = await port.lastExtractHash(document.id);
    if (!options.force && previousHash === hash) {
      await port.finishRun(runId, {
        status: "unchanged",
        revision: revision.revId,
        revisedAt: revision.revisedAt,
        extractHash: hash,
      });
      return {
        runId,
        status: "unchanged",
        revision: revision.revId,
        message: "nouvelle révision, mais aucun changement utile",
      };
    }

    await port.saveRecords(runId, records, anomaliesByKey);

    // ── 6. Diff contre le publié ──────────────────────────────────────────
    const published = await port.loadPublished(document.id, ENTITIES);
    const result = diffRecords(published, records);
    await port.saveDifferences(runId, result.differences);

    // ── 7. Validation automatique, si et seulement si elle est autorisée ──
    const policy = await port.loadPolicy(document.id);
    const auto = autoValidatable(result, {
      enabled: policy.autoValidateUnambiguous,
      maxAutoChanges: policy.maxAutoChanges,
    });
    if (auto.length > 0) {
      await port.autoValidateDifferences(
        runId,
        auto.map((d) => `${d.entity}:${d.naturalKey}`),
      );
    }

    const ambiguous = result.differences.length - auto.length;
    await port.finishRun(runId, {
      status: "diffed",
      revision: revision.revId,
      revisedAt: revision.revisedAt,
      extractHash: hash,
      differencesTotal: result.differences.length,
      differencesAmbiguous: ambiguous,
    });
    await port.log(
      "import.diffed",
      `${result.differences.length} différence(s), dont ${auto.length} validée(s) automatiquement`,
      runId,
    );

    return {
      runId,
      status: "diffed",
      revision: revision.revId,
      message: `${result.differences.length} différence(s) proposée(s)`,
      counts: { ...result.summary, autoValidated: auto.length },
      anomalies,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await port.finishRun(runId, { status: "failed", error: message });
    await port.log("import.failed", message, runId);
    return { runId, status: "failed", message };
  }
}

/**
 * Assemble le modèle intermédiaire, et rattache chaque anomalie au fait
 * qu'elle concerne.
 *
 * UNE ANOMALIE SANS ADRESSE NE SERT À RIEN. « décompte incohérent » perdu dans
 * une liste globale oblige le relecteur à chercher lequel ; rattachée à la
 * clé, elle rend la différence correspondante `ambiguous` toute seule.
 */
export function buildRecords(
  contestants: ReturnType<typeof extractContestants>,
  progress: ReturnType<typeof extractProgress>,
  votes: ReturnType<typeof extractVotes>,
  anomalies: readonly Anomaly[],
): {
  records: IncomingRecord[];
  anomaliesByKey: Record<string, string[]>;
} {
  const byRow = new Map<string, string[]>();
  const byColumn = new Map<number, string[]>();
  for (const a of anomalies) {
    if (a.row) byRow.set(a.row, [...(byRow.get(a.row) ?? []), a.code]);
    if (a.columnIndex !== undefined) {
      byColumn.set(a.columnIndex, [...(byColumn.get(a.columnIndex) ?? []), a.code]);
    }
  }

  const records: IncomingRecord[] = [];
  const anomaliesByKey: Record<string, string[]> = {};
  const push = (
    entity: string,
    naturalKey: string,
    payload: Record<string, Json>,
    codes: string[],
  ) => {
    records.push({ entity, naturalKey, payload, anomalies: codes });
    if (codes.length > 0) anomaliesByKey[`${entity}:${naturalKey}`] = codes;
  };

  for (const c of contestants.contestants) {
    push("season_contestant", c.naturalKey, {
      displayName: c.displayName,
      gender: c.gender,
      age: c.age,
      previousSeasons: [...c.previousSeasons],
      team: c.team,
      finalJury: c.finalJury,
    }, byRow.get(c.displayName) ?? []);
  }

  for (const e of progress.episodes) {
    push("episode", e.naturalKey, {
      number: e.number,
      airDate: e.airDate,
      comfortWinners: [...e.comfortWinners],
      immunityWinners: [...e.immunityWinners],
      eliminated: [...e.eliminated],
      rawTally: e.rawTally,
      departureDay: e.departureDay,
      aired: e.aired,
    }, []);
  }

  for (const r of votes.rounds) {
    push("council_round", r.naturalKey, {
      episodeNumber: r.episodeNumber,
      roundNumber: r.roundNumber,
      kind: r.kind,
      eliminated: r.eliminated,
      reportedVotesFor: r.reportedVotesFor,
      reportedVotesTotal: r.reportedVotesTotal,
      rawTally: r.rawTally,
    }, byColumn.get(r.columnIndex) ?? []);
  }

  for (const v of votes.votes) {
    push("council_vote", v.naturalKey, {
      voter: v.voter,
      target: v.target,
      struck: v.struck,
    }, byRow.get(v.voter) ?? []);
  }

  return { records, anomaliesByKey };
}
