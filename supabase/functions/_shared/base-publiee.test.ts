/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * La base de comparaison ne tient pour publié que ce qui l'a été : le cas de
 * l'épisode 8 d'All Stars, rejeté le 13/10/2026 puis retenu jusqu'au 26/10.
 */
import { assertEquals } from "jsr:@std/assert@^1";
import { basePubliee } from "./base-publiee.ts";
import { diffRecords, type StoredRecord } from "./diff.ts";

const fiche = (naturalKey: string, payload: Record<string, unknown>): StoredRecord => ({
  entity: naturalKey.includes(":r") ? "council_round" : "episode",
  naturalKey,
  payload: payload as StoredRecord["payload"],
  published: true,
});

/** Les fiches du lot publié le 13/10 : l'extraction ENTIÈRE, refus compris. */
const LOT_DU_13 = [
  fiche("s:e7:r1", {
    episodeNumber: 7,
    roundNumber: 1,
    kind: "vote",
    eliminated: "Tania",
  }),
  // Rejeté : la colonne préparée de l'épisode 8, personne d'éliminé.
  fiche("s:e8:r1", {
    episodeNumber: 8,
    roundNumber: 1,
    kind: "unknown",
    eliminated: null,
    rawTally: "/12",
  }),
  // Rejeté aussi : des vainqueurs débordés de l'épisode 7.
  fiche("s:e8", { number: 8, aired: true, comfortWinners: ["Sebako"], eliminated: [] }),
];
const REFUS = [
  { entity: "council_round", naturalKey: "s:e8:r1", beforeValue: null },
  {
    entity: "episode",
    naturalKey: "s:e8",
    beforeValue: { number: 8, aired: false, comfortWinners: [], eliminated: [] },
  },
];

Deno.test("un ajout refusé n'est pas dans la base ; une mise à jour refusée y garde son avant", () => {
  const base = basePubliee(LOT_DU_13, REFUS);
  assertEquals(base.map((r) => r.naturalKey).sort(), ["s:e7:r1", "s:e8"]);
  assertEquals(base.find((r) => r.naturalKey === "s:e8")?.payload, {
    number: 8,
    aired: false,
    comfortWinners: [],
    eliminated: [],
  });
});

Deno.test("sans refus, la base est le lot tel quel", () => {
  assertEquals(basePubliee(LOT_DU_13, []), LOT_DU_13);
});

Deno.test("le vrai tour de l'épisode 8 arrive comme un AJOUT certain, plus comme une correction", () => {
  const vraiTour = {
    entity: "council_round",
    naturalKey: "s:e8:r1",
    payload: {
      episodeNumber: 8,
      roundNumber: 1,
      kind: "vote",
      eliminated: "Yassin",
      rawTally: "6/12",
    },
    anomalies: [],
  };
  const avant = diffRecords(LOT_DU_13.filter((r) => r.entity === "council_round"), [
    { ...LOT_DU_13[0], anomalies: [] },
    vraiTour,
  ]);
  assertEquals(
    avant.differences.map((d) => [d.naturalKey, d.operation, d.class]),
    [["s:e8:r1", "update", "retroactive"]],
    "la base du lot entier en faisait une correction rétroactive",
  );

  const apres = diffRecords(
    basePubliee(LOT_DU_13, REFUS).filter((r) => r.entity === "council_round"),
    [{ ...LOT_DU_13[0], anomalies: [] }, vraiTour],
  );
  assertEquals(
    apres.differences.map((d) => [d.naturalKey, d.operation, d.class]),
    [["s:e8:r1", "insert", "unambiguous"]],
  );
});
