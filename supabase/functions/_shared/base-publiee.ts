/**
 * La base de comparaison : ce qui est VRAIMENT en ligne.
 *
 * L'import compare chaque extraction aux fiches du dernier lot publié
 * (`loadPublished`). Ces fiches sont l'extraction ENTIÈRE de ce lot, y compris
 * ce qu'un relecteur a refusé ou laissé en attente : une publication n'écrit
 * que les différences validées. Prendre le lot tel quel, c'était tenir pour
 * publié ce qui ne l'a jamais été.
 *
 * LE CAS QUI L'A RÉVÉLÉ (13/10 → 26/10/2026, All Stars). Le 13/10, le tour de
 * l'épisode 8 n'était qu'une colonne préparée (« /12 », personne d'éliminé) :
 * il a été REJETÉ, et l'épisode publié sans lui. Mais sa fiche est restée dans
 * la base. Quand la source a nommé Yassin, le vrai tour est arrivé comme la
 * MODIFICATION d'un tour « publié » (`unknown` → `vote`), donc `retroactive`,
 * donc soumis à un humain : le lot est resté retenu, et les épisodes 8 et 9
 * n'ont jamais été publiés.
 *
 * LA RÈGLE. Pour chaque différence du lot qui n'a pas été publiée, la base
 * reprend son « avant » : la fiche d'avant le lot, ou rien si c'était un ajout.
 * C'est exactement ce que les tables contiennent.
 */
import type { Json, StoredRecord } from "./diff.ts";

/** Une différence du lot publié qui n'a PAS été écrite (refusée, en attente). */
export interface DifferenceNonPubliee {
  readonly entity: string;
  readonly naturalKey: string;
  /** La fiche d'avant le lot ; `null` pour un ajout. */
  readonly beforeValue: Record<string, Json> | null;
}

export function basePubliee(
  records: readonly StoredRecord[],
  nonPubliees: readonly DifferenceNonPubliee[],
): StoredRecord[] {
  const cle = (entity: string, key: string) => `${entity}\u0000${key}`;
  const parCle = new Map(records.map((r) => [cle(r.entity, r.naturalKey), r]));
  for (const d of nonPubliees) {
    const k = cle(d.entity, d.naturalKey);
    if (d.beforeValue === null) {
      parCle.delete(k);
    } else {
      parCle.set(k, {
        entity: d.entity,
        naturalKey: d.naturalKey,
        payload: d.beforeValue,
        published: true,
      });
    }
  }
  return [...parCle.values()];
}
