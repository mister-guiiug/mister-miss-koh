/**
 * Du modèle intermédiaire vers des PROPOSITIONS de changement.
 *
 * Ce module ne touche pas plus à la base que l'extraction : il compare deux
 * collections et rend des différences classées. Écrire est le travail de la
 * publication, et publier suppose d'avoir relu.
 *
 * LA CLASSIFICATION EST TOUTE LA VALEUR DU MODULE. Un diff qui dirait
 * seulement « 47 changements » obligerait à tout relire à la main, donc à ne
 * rien relire. Cinq classes, et une seule est automatisable :
 *
 *  - `unambiguous` — une donnée neuve, sans conflit. Seule classe qu'une
 *                    politique explicite peut valider sans humain ;
 *  - `ambiguous`   — l'extraction a signalé quelque chose qu'elle n'a pas su
 *                    interpréter ;
 *  - `retroactive` — une donnée DÉJÀ PUBLIÉE change. Jamais automatique :
 *                    c'est le seul cas où l'on réécrit l'histoire ;
 *  - `conflicting` — deux propositions du même lot se contredisent ;
 *  - `suspicious`  — le lot lui-même est anormal (volume, effondrement).
 *
 * LA SUPPRESSION EST LE DANGER PRINCIPAL, et il n'est pas théorique. Une
 * extraction qui échoue à moitié — tableau renommé, section déplacée, réponse
 * tronquée — ne lève pas : elle rend simplement MOINS d'enregistrements. Sans
 * garde, le diff en conclurait que les autres ont disparu de la source et
 * proposerait de les effacer. Le référentiel serait détruit par un import qui
 * s'est cru réussi.
 *
 * D'où la règle de couverture : sous un certain rapport entre ce qui arrive et
 * ce qui existe, AUCUNE suppression n'est proposée en clair — tout le lot est
 * marqué `suspicious`, et le relecteur voit d'abord que quelque chose ne va
 * pas avec l'import, pas avec les données.
 */
import { stableStringify } from "./mediawiki.ts";

export type DifferenceOperation = "insert" | "update" | "delete";

export type DifferenceClass =
  | "unambiguous"
  | "ambiguous"
  | "retroactive"
  | "conflicting"
  | "suspicious";

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/** Ce que l'extraction propose. */
export interface IncomingRecord {
  readonly entity: string;
  readonly naturalKey: string;
  readonly payload: Record<string, Json>;
  /** Codes d'anomalie relevés pour CE fait précis. */
  readonly anomalies?: readonly string[];
}

/** Ce que le référentiel détient déjà. */
export interface StoredRecord {
  readonly entity: string;
  readonly naturalKey: string;
  readonly payload: Record<string, Json>;
  /** `true` = la ligne est publiée, donc visible des utilisateurs. */
  readonly published: boolean;
}

export interface Difference {
  readonly entity: string;
  readonly naturalKey: string;
  readonly operation: DifferenceOperation;
  readonly class: DifferenceClass;
  readonly beforeValue: Record<string, Json> | null;
  readonly afterValue: Record<string, Json> | null;
  readonly changedFields: readonly string[];
  /** Pourquoi cette classe. Affiché tel quel au relecteur. */
  readonly reasons: readonly string[];
}

export interface DiffOptions {
  /**
   * Rapport minimal entre les clés reçues et les clés publiées, par entité,
   * en deçà duquel on soupçonne un import partiel. 0 désactive le garde-fou.
   */
  readonly minCoverage?: number;
  /**
   * Au-delà de ce nombre de changements pour une entité, même les
   * différences non ambiguës passent en `suspicious` : une mise à jour
   * hebdomadaire ne réécrit pas cent lignes.
   */
  readonly maxChangesPerEntity?: number;
}

export interface DiffResult {
  readonly differences: readonly Difference[];
  /** Vrai si au moins une différence est `suspicious`. */
  readonly suspicious: boolean;
  readonly summary: Readonly<Record<DifferenceClass, number>>;
}

const DEFAULTS: Required<DiffOptions> = {
  minCoverage: 0.8,
  maxChangesPerEntity: 50,
};

/** Champs dont la valeur diffère, à comparaison stable. */
function changedFields(
  before: Record<string, Json>,
  after: Record<string, Json>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (stableStringify(before[key]) !== stableStringify(after[key])) {
      changed.push(key);
    }
  }
  return changed.sort();
}

function groupBy<T extends { entity: string }>(items: readonly T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(item.entity);
    if (bucket) bucket.push(item);
    else map.set(item.entity, [item]);
  }
  return map;
}

export function diffRecords(
  stored: readonly StoredRecord[],
  incoming: readonly IncomingRecord[],
  options: DiffOptions = {},
): DiffResult {
  const opts = { ...DEFAULTS, ...options };
  const differences: Difference[] = [];

  const storedByEntity = groupBy(stored);
  const incomingByEntity = groupBy(incoming);
  const entities = new Set([...storedByEntity.keys(), ...incomingByEntity.keys()]);

  for (const entity of entities) {
    const before = storedByEntity.get(entity) ?? [];
    const after = incomingByEntity.get(entity) ?? [];

    // ── Doublons dans le lot ────────────────────────────────────────────
    // Deux enregistrements pour la même clé : la source dit deux choses de la
    // même chose. Aucune des deux n'est retenue — choisir « la dernière »
    // reviendrait à trancher au hasard de l'ordre de lecture.
    const seen = new Map<string, IncomingRecord>();
    const duplicated = new Set<string>();
    for (const record of after) {
      if (seen.has(record.naturalKey)) duplicated.add(record.naturalKey);
      else seen.set(record.naturalKey, record);
    }

    const beforeByKey = new Map(before.map((r) => [r.naturalKey, r]));
    const publishedCount = before.filter((r) => r.published).length;

    // ── Garde de couverture ─────────────────────────────────────────────
    // Un import qui rapporte beaucoup moins que ce qui existe est suspect en
    // tant qu'IMPORT. On ne cherche pas à deviner ce qui manque : on refuse
    // de proposer quoi que ce soit de destructeur.
    const coverage = publishedCount === 0
      ? 1
      : [...seen.keys()].filter((k) => beforeByKey.get(k)?.published).length /
        publishedCount;
    const partialImport = opts.minCoverage > 0 && coverage < opts.minCoverage;

    const pending: Difference[] = [];

    for (const [key, record] of seen) {
      if (duplicated.has(key)) {
        pending.push({
          entity,
          naturalKey: key,
          operation: beforeByKey.has(key) ? "update" : "insert",
          class: "conflicting",
          beforeValue: beforeByKey.get(key)?.payload ?? null,
          afterValue: record.payload,
          changedFields: [],
          reasons: [
            "la source propose plusieurs valeurs pour la même clé : aucune n'est retenue",
          ],
        });
        continue;
      }

      const existing = beforeByKey.get(key);
      const anomalies = record.anomalies ?? [];

      if (!existing) {
        pending.push({
          entity,
          naturalKey: key,
          operation: "insert",
          class: anomalies.length > 0 ? "ambiguous" : "unambiguous",
          beforeValue: null,
          afterValue: record.payload,
          changedFields: Object.keys(record.payload).sort(),
          reasons: anomalies.length > 0
            ? anomalies.map((a) => `anomalie relevée à l'extraction : ${a}`)
            : ["donnée nouvelle, sans conflit"],
        });
        continue;
      }

      const fields = changedFields(existing.payload, record.payload);
      if (fields.length === 0) continue; // identique : rien à proposer

      const reasons: string[] = [];
      let klass: DifferenceClass;
      if (existing.published) {
        klass = "retroactive";
        reasons.push(
          `modifie une donnée déjà publiée (${
            fields.join(", ")
          }) — relecture humaine obligatoire`,
        );
      } else if (anomalies.length > 0) {
        klass = "ambiguous";
        reasons.push(...anomalies.map((a) => `anomalie relevée à l'extraction : ${a}`));
      } else {
        klass = "unambiguous";
        reasons.push(`champs modifiés : ${fields.join(", ")}`);
      }

      pending.push({
        entity,
        naturalKey: key,
        operation: "update",
        class: klass,
        beforeValue: existing.payload,
        afterValue: record.payload,
        changedFields: fields,
        reasons,
      });
    }

    // ── Disparitions ────────────────────────────────────────────────────
    for (const record of before) {
      if (seen.has(record.naturalKey)) continue;
      pending.push({
        entity,
        naturalKey: record.naturalKey,
        operation: "delete",
        class: partialImport ? "suspicious" : "ambiguous",
        beforeValue: record.payload,
        afterValue: null,
        changedFields: [],
        reasons: partialImport
          ? [
            `import probablement partiel : ${
              Math.round(coverage * 100)
            } % des clés publiées seulement`,
            "aucune suppression ne doit être appliquée sans vérifier la source",
          ]
          : [
            "la clé n'apparaît plus dans la source — une disparition n'est jamais automatique",
          ],
      });
    }

    // ── Gardes de lot ───────────────────────────────────────────────────
    const escalate = (reason: string) => {
      for (let i = 0; i < pending.length; i += 1) {
        pending[i] = {
          ...pending[i],
          class: "suspicious",
          reasons: [...pending[i].reasons, reason],
        };
      }
    };

    if (partialImport) {
      escalate(
        `import probablement partiel sur « ${entity} » : ${
          Math.round(coverage * 100)
        } % des clés publiées seulement`,
      );
    } else if (pending.length > opts.maxChangesPerEntity) {
      escalate(
        `${pending.length} changements sur « ${entity} », au-delà du plafond de ${opts.maxChangesPerEntity}`,
      );
    }

    differences.push(...pending);
  }

  const summary: Record<DifferenceClass, number> = {
    unambiguous: 0,
    ambiguous: 0,
    retroactive: 0,
    conflicting: 0,
    suspicious: 0,
  };
  for (const d of differences) summary[d.class] += 1;

  return {
    differences,
    suspicious: summary.suspicious > 0,
    summary,
  };
}

/**
 * Les différences qu'une politique d'import peut valider sans humain.
 *
 * Le plafond est vérifié ICI et non seulement à la classification, parce que
 * c'est ce point qui décide vraiment. Un appelant qui passerait outre le
 * plafond n'obtiendrait rien de plus : la liste est vide au-delà.
 */
export function autoValidatable(
  result: DiffResult,
  policy: { readonly enabled: boolean; readonly maxAutoChanges: number },
): readonly Difference[] {
  if (!policy.enabled || result.suspicious) return [];
  const candidates = result.differences.filter((d) =>
    d.class === "unambiguous" && d.operation !== "delete"
  );
  return candidates.length > policy.maxAutoChanges ? [] : candidates;
}
