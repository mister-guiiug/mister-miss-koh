/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * Les cas limites que le besoin exige — égalité, binôme, cible inconnue,
 * décompte incohérent, colonne vide, structure changée — sont éprouvés sur des
 * grilles construites à la main, puis sur la VRAIE page du 05/09/2026.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { parseTables } from "./html-table.ts";
import { extractVotes, looksLikeVotes } from "./extract-votes.ts";

const SEASON = "all-stars-2026";

/** Fabrique une grille de test à partir de lignes de texte simples. */
function gridOf(rows: (string | { t: string; s?: boolean })[][]) {
  return rows.map((row) =>
    row.map((cell) => {
      const text = typeof cell === "string" ? cell : cell.t;
      const struck = typeof cell === "string" ? false : (cell.s ?? false);
      return {
        text,
        html: text,
        header: false,
        colspan: 1,
        rowspan: 1,
        struck,
      };
    })
  );
}

Deno.test("un en-tête manquant arrête l'extraction au lieu de deviner", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["Camille", "Maxime"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.length, 0);
  assertEquals(out.anomalies[0].code, "structure_inconnue");
  assert(out.anomalies[0].message.includes("Éliminé"));
});

Deno.test("une colonne vide EN FIN de tableau n'est pas une anomalie", () => {
  const grid = gridOf([
    ["► Épisode", "1", "2"],
    ["► Éliminé", "Maxime", ""],
    ["► Votes", "5/10", ""],
    ["▼ Candidats", "Votes", ""],
    ["Camille", "Maxime", ""],
    ["Maxime", "Camille", ""],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.length, 1, "seule la colonne remplie produit un tour");
  assertEquals(out.anomalies, []);
});

Deno.test("un marqueur de statut n'est pas un vote, et suffit à ne pas créer de tour", () => {
  // La ligne d'un sorti porte son état jusqu'à la fin du tableau. Sans cette
  // distinction, l'épisode 2 — non diffusé — passerait pour un conseil tenu.
  const grid = gridOf([
    ["► Épisode", "1", "2"],
    ["► Éliminé", "Maxime", ""],
    ["► Votes", "5/10", ""],
    ["▼ Candidats", "Votes", ""],
    ["Camille", "Maxime", ""],
    ["Maxime", "Camille", "Banni"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.length, 1, "le statut ne crée pas de scrutin");
  assertEquals(out.votes.length, 2, "seules les deux vraies voix sont retenues");
  assertEquals(out.statuses, [
    { columnIndex: 2, contestant: "Maxime", label: "Banni" },
  ]);
  assertEquals(out.anomalies, []);
});

Deno.test("une colonne vide AU MILIEU est une anomalie", () => {
  const grid = gridOf([
    ["► Épisode", "1", "2", "3"],
    ["► Éliminé", "Maxime", "", "Naoil"],
    ["► Votes", "5/10", "", "6/9"],
    ["▼ Candidats", "Votes", "", ""],
    ["Camille", "Maxime", "", "Naoil"],
  ]);
  const out = extractVotes(grid, SEASON);
  assert(
    out.anomalies.some((a) => a.code === "colonne_vide_intercalee"),
    "le trou doit être signalé",
  );
});

Deno.test("une valeur ni candidat ni statut est signalée, et n'est PAS importée", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Maxime"],
    ["► Votes", "1/2"],
    ["▼ Candidats", "Votes"],
    ["Camille", "Quelquun"],
    ["Maxime", "Camille"],
  ]);
  const out = extractVotes(grid, SEASON);
  assert(out.anomalies.some((a) => a.code === "valeur_inconnue"));
  // Le besoin l'exige : « ne pas importer une valeur lorsque son
  // interprétation est ambiguë ». Seule la voix lisible est retenue.
  assertEquals(out.votes.map((v) => v.voter), ["Maxime"]);
});

Deno.test("un décompte impossible est signalé", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Maxime"],
    ["► Votes", "12/8"],
    ["▼ Candidats", "Votes"],
    ["Maxime", "Camille"],
    ["Camille", "Maxime"],
  ]);
  const out = extractVotes(grid, SEASON);
  assert(out.anomalies.some((a) => a.code === "decompte_incoherent"));
});

Deno.test("deux tours du même épisode sont numérotés 1 puis 2", () => {
  const grid = gridOf([
    ["► Épisode", "1", "1"],
    ["► Éliminé", "Maxime", "Maxime"],
    ["► Votes", "/", "5/9"],
    ["▼ Candidats", "Votes", ""],
    ["Camille", { t: "Maxime", s: true }, "Maxime"],
    ["Maxime", { t: "Camille", s: true }, "Camille"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.map((r) => r.roundNumber), [1, 2]);
  assertEquals(out.rounds[0].kind, "annulled");
  assertEquals(out.rounds[1].kind, "vote");
  assertEquals(out.rounds[0].naturalKey, "all-stars-2026:e1:r1");
});

Deno.test("zéro voix et aucun vote exprimé : c'est un départ de binôme", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Joana"],
    ["► Votes", "0"],
    ["▼ Candidats", "Votes"],
    ["Camille", ""],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds[0].kind, "linked");
  // Le zéro est une VALEUR, pas une absence.
  assertEquals(out.rounds[0].reportedVotesFor, 0);
  assertEquals(out.rounds[0].reportedVotesTotal, null);
});

// ── La vraie page ─────────────────────────────────────────────────────────

const fixture = await Deno.readTextFile(
  new URL("./fixtures/votes-section.html", import.meta.url),
);
const [table] = parseTables(fixture);
const real = extractVotes(table.grid, SEASON);

Deno.test("fixture : les dix-huit candidats sont relevés", () => {
  assertEquals(real.contestants.length, 18);
  assert(real.contestants.includes("Camille"));
  assert(real.contestants.includes("Clémentine"));
});

Deno.test("fixture : cinq scrutins utiles, deux colonnes encore à venir", () => {
  // Sept colonnes au tableau, dont deux vides en fin : la saison est en cours.
  assertEquals(table.width - 1, 7);
  assertEquals(real.rounds.length, 5);
  assertEquals(real.rounds.map((r) => r.columnIndex), [1, 2, 3, 4, 5]);
});

Deno.test("fixture : l'épisode 1 a un tour annulé, un vote, puis un binôme", () => {
  const ep1 = real.rounds.filter((r) => r.episodeNumber === 1);
  assertEquals(ep1.map((r) => r.kind), ["annulled", "vote", "linked"]);
  assertEquals(ep1.map((r) => r.roundNumber), [1, 2, 3]);
  assertEquals(ep1[1].eliminated, "Maxime");
  assertEquals(ep1[1].reportedVotesFor, 11);
  assertEquals(ep1[1].reportedVotesTotal, 18);
  assertEquals(ep1[2].eliminated, "Joana");
  assertEquals(ep1[2].reportedVotesFor, 0);
});

Deno.test("fixture : la note qui explique le départ du binôme est conservée", () => {
  const linked = real.rounds.find((r) => r.kind === "linked");
  assert(linked, "aucune colonne de départ lié");
  assert(
    linked.footnotes.length > 0,
    "l'appel de note qui justifie le zéro doit être retenu",
  );
});

Deno.test("fixture : aucune voix n'est attribuée à la colonne d'un binôme", () => {
  const linked = real.rounds.filter((r) => r.kind === "linked");
  for (const round of linked) {
    const cast = real.votes.filter((v) => v.columnIndex === round.columnIndex);
    assertEquals(cast.length, 0, `colonne ${round.columnIndex}`);
  }
});

Deno.test("fixture : les voix du tour annulé sont toutes barrées", () => {
  const annulled = real.rounds.find((r) => r.kind === "annulled");
  assert(annulled);
  const cast = real.votes.filter((v) => v.columnIndex === annulled.columnIndex);
  assert(cast.length > 0);
  assert(cast.every((v) => v.struck), "un tour annulé n'a que des voix barrées");
});

Deno.test("les libellés relevés sur les saisons passées sont des statuts, pas des inconnues", () => {
  // Cinq libellés, et cinq seulement, refusés par le vocabulaire initial sur
  // les onze pages de saison exploitables du 05/09/2026 : 69 cellules. Les
  // laisser « incomprises » noierait les vraies anomalies sous le bruit.
  const grid = gridOf([
    ["► Épisode", "1", "2", "3", "4", "5"],
    ["► Éliminé", "Maxime", "", "", "", ""],
    ["► Votes", "5/10", "", "", "", ""],
    ["▼ Candidats", "Votes", "", "", "", ""],
    ["Camille", "Maxime", "Jury final", "Exilée", "Victoire", "Défaite"],
    ["Maxime", "Camille", "Jury final", "Exilé", "Victoire", "Défaite"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(
    out.anomalies.filter((a) => a.code === "valeur_inconnue"),
    [],
    "aucun de ces libellés ne doit passer pour un nom mal orthographié",
  );
  assertEquals(out.rounds.length, 1, "un statut ne crée pas de scrutin");
  assertEquals(out.statuses.length, 8, "quatre colonnes de statuts, deux candidats");
});

Deno.test("« Jury » seul ne couvre pas « Jury final »", () => {
  // Le vocabulaire compare la cellule ENTIÈRE : ajouter « jury final » était
  // nécessaire, et ce test fige pourquoi.
  const grid = gridOf([
    ["► Épisode", "1", "2"],
    ["► Éliminé", "Maxime", ""],
    ["► Votes", "5/10", ""],
    ["▼ Candidats", "Votes", ""],
    ["Camille", "Maxime", "Jury finale"],
  ]);
  const out = extractVotes(grid, SEASON);
  assert(
    out.anomalies.some((a) => a.code === "valeur_inconnue"),
    "un libellé voisin mais non listé reste une anomalie",
  );
});

Deno.test("un départ LIÉ nomme l'élimination qui l'a causé", () => {
  // La colonne « départ lié » n'existe que parce qu'un vote a eu lieu dans la
  // même soirée. Le dire ICI, dans le modèle intermédiaire, plutôt que dans
  // une requête SQL : un relecteur voit le lien dans la différence proposée.
  const grid = gridOf([
    ["► Épisode", "1", "1", "2"],
    ["► Éliminé", "Maxime", "Joana", "Moussa"],
    ["► Votes", "11/18", "0", "12/16"],
    ["▼ Candidats", "Votes", "Votes", "Votes"],
    ["Camille", "Maxime", "", "Moussa"],
    ["Laure", "Maxime", "", "Moussa"],
  ]);
  const out = extractVotes(grid, SEASON);

  const lie = out.rounds.find((r) => r.kind === "linked");
  assert(lie, "le départ lié doit être reconnu");
  assertEquals(lie.eliminated, "Joana");
  assertEquals(lie.causedBy, "Maxime", "c'est l'éliminé du vote de la MÊME soirée");

  for (const r of out.rounds.filter((x) => x.kind !== "linked")) {
    assertEquals(r.causedBy, null, "un tour de vote ne cause rien : il EST la cause");
  }
});

Deno.test("un départ lié sans vote dans sa soirée ne nomme personne", () => {
  // Mieux vaut un duo absent qu'un duo faux : la colonne d'à côté, dans un
  // AUTRE épisode, ne dit rien de celle-ci.
  const grid = gridOf([
    ["► Épisode", "1", "2"],
    ["► Éliminé", "Maxime", "Joana"],
    ["► Votes", "11/18", "0"],
    ["▼ Candidats", "Votes", "Votes"],
    ["Camille", "Maxime", ""],
  ]);
  const out = extractVotes(grid, SEASON);
  const lie = out.rounds.find((r) => r.kind === "linked");
  assert(lie);
  assertEquals(lie.causedBy, null);
});

Deno.test("L'ÎLE DES HÉROS : une espace en moins ne sort pas une saison", async () => {
  // CETTE PAGE ÉCRIT « ►Épisode » ET « ►Éliminé ou abandon ». D'autres
  // écrivent « ► Épisode » et « ► Éliminé », une autre encore « ► Éliminés ».
  // Le même tableau, six orthographes d'en-tête — et l'égalité de chaîne en
  // écartait quatre saisons sur dix-huit. Capture du 11/09/2026.
  const html = await Deno.readTextFile(
    new URL("./fixtures/ile-des-heros-votes-section.html", import.meta.url),
  );
  const table = parseTables(html).find((t) => looksLikeVotes(t.grid));
  assert(table, "la matrice est reconnue malgré le marqueur collé");

  const out = extractVotes(table.grid, "ile-des-heros-2020");
  assertEquals(
    out.anomalies.filter((a) => a.code === "structure_inconnue"),
    [],
    "plus aucune structure incomprise",
  );
  assertEquals(out.contestants.length, 23);
  // 24 tours et 137 voix jusqu'au 13/09/2026. Les deux colonnes de jury final
  // de cette page — « Finaliste » et « Vainqueur » — ne produisent plus de
  // tour : elles fabriquaient des clés `…:e?:rN` impubliables. Les neuf voix
  // perdues sont celles de ces deux colonnes. Ce que ce test éprouve — que
  // l'en-tête « ►Épisode » collé est reconnu — n'est pas touché.
  assertEquals(out.rounds.length, 22);
  assertEquals(out.votes.length, 128);
  assertEquals(
    out.anomalies.filter((a) => a.code === "jury_final_non_importe").length,
    2,
  );
});

Deno.test("JURY FINAL : les colonnes « Finaliste » et « Vainqueur » sont nommées, pas importées", () => {
  // CE QUE CE TEST REND IMPOSSIBLE À REPRODUIRE. Ces deux colonnes
  // fabriquaient des tours de clé `…:e?:rN`, qu'aucune publication ne peut
  // résoudre — `councils.episode_id` est `not null`. Le 11/09/2026, la
  // publication de « La Guerre des chefs » s'est arrêtée dessus, et le message
  // rendu — « épisode <NULL> absent du référentiel » — ne désignait pas la
  // cause. Relevé sur les dix-huit pages du corpus le 13/09 : douze colonnes,
  // deux sur chacune de six pages, toujours les deux dernières.
  //
  // ON NE LES RATTACHE PAS AU DERNIER ÉPISODE : dans la colonne « Vainqueur »,
  // la ligne « Éliminé » nomme le VAINQUEUR. Les importer inscrirait le
  // gagnant parmi les éliminés.
  const grid = gridOf([
    ["► Épisode", "13", "14", "Finaliste", "Vainqueur"],
    ["► Éliminé", "Steeve", "Cindy", "Cindy", "Maud"],
    ["► Votes", "3/5", "1", "6/13", "7/13"],
    ["▼ Candidats", "Votes", "Votes", "Votes", "Votes"],
    ["Maud", "Steeve", "", "Jury final", "Jury final"],
    ["Cindy", "Steeve", "Steeve", "Jury final", "Jury final"],
    ["Aurélien", "Steeve", "", "Cindy", "Maud"],
  ]);
  const out = extractVotes(grid, SEASON);

  assertEquals(
    out.rounds.map((r) => r.episodeNumber),
    [13, 14],
    "seules les colonnes numérotées produisent un tour",
  );
  for (const x of [...out.rounds, ...out.votes]) {
    assert(!x.naturalKey.includes(":e?:"), `clé impubliable : ${x.naturalKey}`);
  }

  const jury = out.anomalies.filter((a) => a.code === "jury_final_non_importe");
  assertEquals(jury.length, 2, "les deux colonnes doivent être NOMMÉES, pas tues");
  assert(jury[0].message.includes("Finaliste"));
  assert(jury[1].message.includes("Vainqueur"));

  // Le vainqueur ne doit apparaître dans aucun tour, à aucun titre.
  assert(
    out.rounds.every((r) => r.eliminated !== "Maud"),
    "le vainqueur ne doit jamais être enregistré comme éliminé",
  );
});

Deno.test("un épisode illisible qui n'est PAS la finale est écarté sous son propre code", () => {
  // Même conséquence — la colonne ne produit rien — mais l'anomalie ne
  // prétend pas savoir ce qu'elle a lu. La liste des libellés de finale vaut
  // ce que vaut le relevé du corpus, et rien de plus.
  const grid = gridOf([
    ["► Épisode", "1", "épiosde 2"],
    ["► Éliminé", "Maxime", "Joana"],
    ["► Votes", "11/18", "5/9"],
    ["▼ Candidats", "Votes", "Votes"],
    ["Camille", "Maxime", "Joana"],
  ]);
  const out = extractVotes(grid, SEASON);

  assertEquals(out.rounds.map((r) => r.episodeNumber), [1]);
  const codes = out.anomalies.map((a) => a.code);
  assert(codes.includes("episode_illisible"), codes.join(", "));
  assert(!codes.includes("jury_final_non_importe"));
});

Deno.test("une ligne qui n'est pas au tableau des candidats n'est pas un votant", () => {
  // RELEVÉ LE 13/09/2026 : « La Guerre des chefs » met une ligne « Pénalité »
  // sous « ▼ Candidats », « Fidji » une ligne « Vote noir ». Prises pour des
  // aventuriers, elles produisaient des voix que la publication refusait —
  // « votant « Pénalité » inconnu de la saison » — et le lot entier tombait.
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Maxime"],
    ["► Votes", "2/3"],
    ["▼ Candidats", "Votes"],
    ["Camille", "Maxime"],
    ["Maxime", "Camille"],
    ["Pénalité", "Maxime"],
  ]);

  const sans = extractVotes(grid, SEASON);
  assertEquals(sans.contestants.length, 3, "sans la liste, l'ancien comportement tient");

  const avec = extractVotes(grid, SEASON, ["Camille", "Maxime"]);
  assertEquals(avec.contestants, ["Camille", "Maxime"]);
  assertEquals(
    avec.anomalies.filter((a) => a.code === "ligne_hors_liste").length,
    1,
    "la ligne écartée est DITE, pas tue",
  );
  assert(
    avec.votes.every((v) => v.voter !== "Pénalité"),
    "aucune voix ne vient de la ligne écartée",
  );
});

Deno.test("un accent de différence ne fait pas deux personnes", () => {
  // « La Revanche des héros » écrit « Teheiura » dans sa liste de candidats et
  // « Téheiura » dans sa matrice des votes. La publication ne cherche qu'une
  // graphie : l'accent seul faisait tomber le lot entier (relevé le
  // 13/09/2026). C'est la LISTE qui fait autorité.
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Teheiura"],
    ["► Votes", "2/2"],
    ["▼ Candidats", "Votes"],
    ["Téheiura", "Moussa"],
    ["Moussa", "Téheiura"],
  ]);

  const out = extractVotes(grid, SEASON, ["Teheiura", "Moussa"]);
  assertEquals(out.contestants, ["Teheiura", "Moussa"], "la graphie de la liste gagne");
  assertEquals(
    out.votes.map((v) => [v.voter, v.target]),
    [["Teheiura", "Moussa"], ["Moussa", "Teheiura"]],
    "votant ET cible portent la graphie de la liste",
  );
  assert(
    out.votes.every((v) =>
      v.naturalKey.includes("Teheiura") || v.naturalKey.includes("Moussa")
    ),
    "la clé naturelle aussi",
  );
  assertEquals(out.anomalies.filter((a) => a.code === "ligne_hors_liste"), []);
});

Deno.test("les voix d'un homonyme ne sont attribuées à personne", () => {
  // La matrice distingue les deux par un appel de note — « Cécile[a] » et
  // « Cécile[b] » — mais les appels de note sortent des cellules, à dessein,
  // et la liste des candidats ne les distingue pas du tout. Deviner laquelle
  // vote, ce serait prêter un bulletin à quelqu'un.
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Maxime"],
    ["► Votes", "2/3"],
    ["▼ Candidats", "Votes"],
    ["Cécile", "Maxime"],
    ["Cécile", "Maxime"],
    ["Maxime", "Cécile"],
  ]);

  const out = extractVotes(grid, SEASON, ["Cécile", "Cécile", "Maxime"]);
  assertEquals(out.contestants, ["Maxime"], "les deux homonymes sortent de la matrice");
  assert(
    out.votes.every((v) => v.voter !== "Cécile"),
    "aucune voix ne leur est prêtée",
  );
  assertEquals(
    out.anomalies.filter((a) => a.code === "homonyme_indistinct").length,
    2,
    "les deux lignes écartées sont dites",
  );
});
