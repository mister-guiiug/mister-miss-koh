/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * Les cas exigés par le besoin (§18, « Import ») : page inchangée, nouvelle
 * révision, tableau absent, cellule ambiguë, doublon, correction rétroactive,
 * import partiel. Chacun a son test, et chacun décrit un dégât précis qu'on
 * cherche à empêcher.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import {
  autoValidatable,
  diffRecords,
  type IncomingRecord,
  type StoredRecord,
} from "./diff.ts";

const stored = (
  key: string,
  payload: Record<string, string | number | null>,
  published = true,
): StoredRecord => ({ entity: "council_round", naturalKey: key, payload, published });

const incoming = (
  key: string,
  payload: Record<string, string | number | null>,
  anomalies: string[] = [],
): IncomingRecord => ({
  entity: "council_round",
  naturalKey: key,
  payload,
  anomalies,
});

Deno.test("page inchangée : aucune différence", () => {
  const before = [stored("e1:r1", { eliminated: "Maxime", votesFor: 11 })];
  const after = [incoming("e1:r1", { eliminated: "Maxime", votesFor: 11 })];
  const result = diffRecords(before, after);
  assertEquals(result.differences, []);
  assertEquals(result.suspicious, false);
});

Deno.test("l'ordre des clés d'un objet ne crée pas de différence", () => {
  const before = [stored("e1:r1", { eliminated: "Maxime", votesFor: 11 })];
  const after = [incoming("e1:r1", { votesFor: 11, eliminated: "Maxime" })];
  assertEquals(diffRecords(before, after).differences, []);
});

Deno.test("nouvel épisode : insertion non ambiguë", () => {
  const before = [stored("e1:r1", { eliminated: "Maxime" })];
  const after = [
    incoming("e1:r1", { eliminated: "Maxime" }),
    incoming("e2:r1", { eliminated: "Moussa" }),
  ];
  const result = diffRecords(before, after);
  assertEquals(result.differences.length, 1);
  assertEquals(result.differences[0].operation, "insert");
  assertEquals(result.differences[0].class, "unambiguous");
});

Deno.test("une anomalie d'extraction rend l'insertion ambiguë", () => {
  const result = diffRecords([], [
    incoming("e2:r1", { eliminated: "?" }, ["decompte_incoherent"]),
  ]);
  assertEquals(result.differences[0].class, "ambiguous");
  assert(result.differences[0].reasons[0].includes("decompte_incoherent"));
});

Deno.test("modifier une donnée PUBLIÉE est toujours rétroactif", () => {
  const before = [stored("e1:r1", { eliminated: "Maxime", votesFor: 11 })];
  const after = [incoming("e1:r1", { eliminated: "Maxime", votesFor: 12 })];
  const result = diffRecords(before, after);
  assertEquals(result.differences[0].class, "retroactive");
  assertEquals(result.differences[0].changedFields, ["votesFor"]);
  // Le diff doit être LISIBLE : le champ touché est nommé, pas deux objets
  // à comparer à l'œil.
  assert(result.differences[0].reasons[0].includes("votesFor"));
});

Deno.test("modifier une donnée NON publiée reste non ambigu", () => {
  const before = [stored("e1:r1", { votesFor: 11 }, false)];
  const after = [incoming("e1:r1", { votesFor: 12 })];
  assertEquals(diffRecords(before, after).differences[0].class, "unambiguous");
});

Deno.test("deux valeurs pour la même clé : conflit, et aucune n'est retenue", () => {
  const result = diffRecords([], [
    incoming("e1:r1", { eliminated: "Maxime" }),
    incoming("e1:r1", { eliminated: "Laure" }),
  ]);
  assertEquals(result.differences.length, 1);
  assertEquals(result.differences[0].class, "conflicting");
});

Deno.test("une disparition n'est JAMAIS automatique", () => {
  const before = [
    stored("e1:r1", { eliminated: "Maxime" }),
    stored("e1:r2", { eliminated: "Joana" }),
  ];
  // Une clé sur deux subsiste : la couverture reste au-dessus du seuil.
  const after = [incoming("e1:r1", { eliminated: "Maxime" })];
  const result = diffRecords(before, after, { minCoverage: 0.4 });
  const del = result.differences.find((d) => d.operation === "delete");
  assert(del);
  assertEquals(del.class, "ambiguous");
});

Deno.test("TABLEAU ABSENT : rien n'est proposé à la suppression en clair", () => {
  // Le dégât qu'on empêche : une extraction qui échoue rend zéro
  // enregistrement. Sans garde, le diff conclurait que tout a disparu de la
  // source et proposerait d'effacer le référentiel — un import qui se croit
  // réussi détruirait la base.
  const before = [
    stored("e1:r1", { eliminated: "Maxime" }),
    stored("e1:r2", { eliminated: "Joana" }),
    stored("e2:r1", { eliminated: "Moussa" }),
  ];
  const result = diffRecords(before, []);
  assertEquals(result.suspicious, true);
  assertEquals(result.differences.length, 3);
  for (const d of result.differences) {
    assertEquals(d.operation, "delete");
    assertEquals(d.class, "suspicious");
    assert(d.reasons.some((r) => r.includes("partiel")));
  }
});

Deno.test("import partiel : tout le lot bascule en suspect, pas seulement les suppressions", () => {
  const before = [
    stored("e1:r1", { eliminated: "Maxime" }),
    stored("e1:r2", { eliminated: "Joana" }),
    stored("e2:r1", { eliminated: "Moussa" }),
    stored("e2:r2", { eliminated: "Naoil" }),
  ];
  // Une seule clé sur quatre revient, plus une insertion qui, isolée,
  // paraîtrait parfaitement saine.
  const after = [
    incoming("e1:r1", { eliminated: "Maxime" }),
    incoming("e3:r1", { eliminated: "Vincent" }),
  ];
  const result = diffRecords(before, after);
  assertEquals(result.suspicious, true);
  const insertion = result.differences.find((d) => d.operation === "insert");
  assert(insertion);
  assertEquals(
    insertion.class,
    "suspicious",
    "une insertion saine dans un lot douteux ne doit pas passer pour saine",
  );
});

Deno.test("un volume anormal de changements bascule le lot en suspect", () => {
  const after = Array.from(
    { length: 12 },
    (_, i) => incoming(`e1:r${i}`, { eliminated: "X" }),
  );
  const result = diffRecords([], after, { maxChangesPerEntity: 10 });
  assertEquals(result.suspicious, true);
  assert(result.differences.every((d) => d.class === "suspicious"));
});

Deno.test("le résumé compte chaque classe", () => {
  const before = [stored("a", { v: 1 }), stored("b", { v: 1 }, false)];
  const after = [
    incoming("a", { v: 2 }), // rétroactif
    incoming("b", { v: 2 }), // non ambigu
    incoming("c", { v: 1 }, ["cellule_vide"]), // ambigu
  ];
  const result = diffRecords(before, after);
  assertEquals(result.summary.retroactive, 1);
  assertEquals(result.summary.unambiguous, 1);
  assertEquals(result.summary.ambiguous, 1);
  assertEquals(result.summary.suspicious, 0);
});

// ── Validation automatique ────────────────────────────────────────────────

Deno.test("sans politique explicite, rien n'est validé automatiquement", () => {
  const result = diffRecords([], [incoming("e1:r1", { v: 1 })]);
  assertEquals(autoValidatable(result, { enabled: false, maxAutoChanges: 20 }), []);
});

Deno.test("seul le non ambigu, et jamais une suppression, peut être automatique", () => {
  const before = [stored("a", { v: 1 }), stored("b", { v: 1 })];
  const after = [incoming("a", { v: 1 }), incoming("c", { v: 1 })];
  const result = diffRecords(before, after, { minCoverage: 0.4 });
  const auto = autoValidatable(result, { enabled: true, maxAutoChanges: 20 });
  assertEquals(auto.length, 1);
  assertEquals(auto[0].operation, "insert");
});

Deno.test("un lot suspect ne peut RIEN valider automatiquement", () => {
  const before = [stored("a", { v: 1 }), stored("b", { v: 1 }), stored("c", { v: 1 })];
  const result = diffRecords(before, [incoming("d", { v: 1 })]);
  assertEquals(autoValidatable(result, { enabled: true, maxAutoChanges: 99 }), []);
});

Deno.test("au-delà du plafond, la validation automatique ne prend rien du tout", () => {
  // Volontairement tout ou rien : valider les cinq premiers et laisser le
  // reste produirait un référentiel à moitié à jour, plus difficile à relire
  // qu'un lot entier resté en attente.
  const after = Array.from({ length: 6 }, (_, i) => incoming(`k${i}`, { v: 1 }));
  const result = diffRecords([], after);
  assertEquals(autoValidatable(result, { enabled: true, maxAutoChanges: 5 }), []);
});
