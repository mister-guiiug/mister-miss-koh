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

// ── L'égalité que la source ne barre pas ──────────────────────────────────

Deno.test("« / » puis un second tour contre la même personne : une égalité", () => {
  // La forme de quatorze colonnes du corpus au 23/09/2026 : les voix du
  // premier tour ne sont PAS barrées, seul le « / » et le nom courant sur deux
  // colonnes disent l'égalité.
  const grid = gridOf([
    ["► Épisode", "5", "5"],
    ["► Éliminé", "Charlotte", "Charlotte"],
    ["► Votes", "/", "3/6"],
    ["▼ Candidats", "Votes", ""],
    ["Camille", "Vincent", "Vincent"],
    ["Charlotte", "Vincent", "Vincent"],
    ["Vincent", "Charlotte", "Charlotte"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.map((r) => r.kind), ["annulled", "vote"]);
  assertEquals(out.rounds[1].eliminated, "Charlotte");
  assertEquals(out.rounds[1].reportedVotesFor, 3);
});

Deno.test("« / » suivi d'autre chose qu'un second tour contre la même personne : inchangé", () => {
  const grid = gridOf([
    ["► Épisode", "5", "5", "6"],
    ["► Éliminé", "Charlotte", "Vincent", "Camille"],
    ["► Votes", "/", "3/6", "/"],
    ["▼ Candidats", "Votes", "", ""],
    ["Camille", "Vincent", "Vincent", "Vincent"],
    ["Charlotte", "Vincent", "Vincent", "Camille"],
    ["Vincent", "Charlotte", "Charlotte", "Camille"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(
    out.rounds.map((r) => r.kind),
    ["vote", "vote", "vote"],
    "un autre éliminé, ou aucun tour après : rien n'autorise à parler d'égalité",
  );
});

// ── La page du 23/09/2026 (révision 239752857) ────────────────────────────

const fixture0923 = await Deno.readTextFile(
  new URL("./fixtures/all-stars-votes-2026-09-23.html", import.meta.url),
);
const real0923 = extractVotes(
  parseTables(fixture0923).find((t) => looksLikeVotes(t.grid))!.grid,
  SEASON,
);

Deno.test("23/09 : l'égalité de l'épisode 5 n'élimine pas deux fois Charlotte", () => {
  const ep5 = real0923.rounds.filter((r) => r.episodeNumber === 5);
  assertEquals(ep5.map((r) => [r.kind, r.eliminated, r.rawTally]), [
    ["annulled", "Charlotte", "/"],
    ["vote", "Charlotte", "3/6"],
  ]);
});

Deno.test("23/09 : l'arène sort quatre bannis sans scrutin, et rien ne les cause", () => {
  // Épisode 4 : quatre colonnes à zéro voix AVANT le conseil de Lola. Ce ne
  // sont pas des départs de binôme — aucun vote de la soirée ne les précède —,
  // et la publication doit le savoir : `causedBy` reste vide.
  const ep4 = real0923.rounds.filter((r) => r.episodeNumber === 4);
  assertEquals(ep4.map((r) => [r.kind, r.eliminated, r.causedBy]), [
    ["linked", "Joana", null],
    ["linked", "Moussa", null],
    ["linked", "Naoil", null],
    ["linked", "Jacques", null],
    ["vote", "Lola", null],
  ]);
});

Deno.test("« Camille (x2) » : un bulletin de poids 2, pas une valeur inconnue", () => {
  const grid = gridOf([
    ["► Épisode", "6"],
    ["► Éliminé", "Camille"],
    ["► Votes", "3/4"],
    ["▼ Candidats", "Votes"],
    ["Camille", "Vincent"],
    ["Vincent", "Camille"],
    ["Yassin", "Camille (x2)"],
  ]);
  const out = extractVotes(grid, SEASON);

  assertEquals(out.anomalies, []);
  assertEquals(out.votes.map((v) => [v.voter, v.target, v.weight]), [
    ["Camille", "Vincent", 1],
    ["Vincent", "Camille", 1],
    ["Yassin", "Camille", 2],
  ]);
  assertEquals(out.rounds[0].kind, "vote");
});

Deno.test("le multiplicateur s'écrit « x » ou « × », de 2 à 9, et le nom reste vérifié", () => {
  const grid = gridOf([
    ["► Épisode", "6"],
    ["► Éliminé", "Camille"],
    ["► Votes", "4/5"],
    ["▼ Candidats", "Votes"],
    ["Vincent", "Camille (×3)"],
    ["Yassin", "Quelquun (x2)"],
    ["Camille", "Vincent (x1)"],
  ]);
  const out = extractVotes(grid, SEASON);

  assertEquals(out.votes.map((v) => [v.voter, v.target, v.weight]), [
    ["Vincent", "Camille", 3],
  ]);
  // Un nom inconnu reste inconnu, multiplié ou non ; « x1 » n'est pas une forme lue.
  assertEquals(
    out.anomalies.filter((a) => a.code === "valeur_inconnue").map((a) => a.row),
    ["Yassin", "Camille"],
  );
});

const fixture0930 = await Deno.readTextFile(
  new URL("./fixtures/all-stars-votes-2026-09-30.html", import.meta.url),
);
const real0930 = extractVotes(
  parseTables(fixture0930).find((t) => looksLikeVotes(t.grid))!.grid,
  SEASON,
);

Deno.test("30/09 : le vote double de Yassin fait le 5/6 de l'épisode 6", () => {
  assertEquals(real0930.anomalies.filter((a) => a.code === "valeur_inconnue"), []);
  const [tour] = real0930.rounds.filter((r) => r.episodeNumber === 6);
  assertEquals([tour.kind, tour.eliminated, tour.rawTally], ["vote", "Camille", "5/6"]);

  const bulletins = real0930.votes.filter((v) => v.columnIndex === tour.columnIndex);
  const yassin = bulletins.find((v) => v.voter === "Yassin");
  assertEquals([yassin?.target, yassin?.weight], ["Camille", 2]);
  const voix = (cible: string | null) =>
    bulletins.filter((v) => v.target === cible).reduce((n, v) => n + v.weight, 0);
  assertEquals(voix("Camille"), tour.reportedVotesFor);
  assertEquals(bulletins.reduce((n, v) => n + v.weight, 0), tour.reportedVotesTotal);
});

// ── La page du 13/10/2026 (révision 240344480) ────────────────────────────
//
// Deux déplacements de la source : le vote double s'écrit en DEUX cellules
// sous un en-tête qui s'étend, et l'élimination définitive à l'arène a quitté
// la matrice pour le tableau « Épreuves spéciales ».

/** Une grille à partir de vrai HTML : seuls `colspan`/`rowspan` font des cellules PARTAGÉES. */
function gridHtml(lignes: string) {
  return parseTables(`<table>${lignes}</table>`)[0].grid;
}

Deno.test("un tour sur DEUX colonnes reste UN scrutin ; la cellule propre est un bulletin de plus", () => {
  const out = extractVotes(
    gridHtml(`
<tr><th>► Épisode</th><th colspan="2">6</th></tr>
<tr><th>► Éliminé</th><th colspan="2">Camille</th></tr>
<tr><th>► Votes</th><th colspan="2">3/4</th></tr>
<tr><th>▼ Candidats</th><th colspan="2">Votes</th></tr>
<tr><td>Camille</td><td colspan="2">Vincent</td></tr>
<tr><td>Vincent</td><td colspan="2">Camille</td></tr>
<tr><td>Yassin</td><td>Camille</td><td>Camille</td></tr>`),
    SEASON,
  );
  assertEquals(out.anomalies, []);
  assertEquals(out.rounds.map((r) => [r.naturalKey, r.kind, r.rawTally]), [
    [`${SEASON}:e6:r1`, "vote", "3/4"],
  ]);
  assertEquals(out.votes.map((v) => [v.voter, v.target, v.weight]), [
    ["Camille", "Vincent", 1],
    ["Vincent", "Camille", 1],
    ["Yassin", "Camille", 2],
  ]);
});

Deno.test("un éliminé étendu sous DEUX décomptes reste deux tours : l'égalité, puis le second", () => {
  const out = extractVotes(
    gridHtml(`
<tr><th>► Épisode</th><th colspan="2">5</th></tr>
<tr><th>► Éliminé</th><th colspan="2">Charlotte</th></tr>
<tr><th>► Votes</th><th>/</th><th>2/3</th></tr>
<tr><th>▼ Candidats</th><th colspan="2">Votes</th></tr>
<tr><td>Camille</td><td><s>Charlotte</s></td><td>Charlotte</td></tr>
<tr><td>Charlotte</td><td><s>Camille</s></td><td>Camille</td></tr>
<tr><td>Vincent</td><td colspan="2">Charlotte</td></tr>`),
    SEASON,
  );
  assertEquals(out.rounds.map((r) => [r.roundNumber, r.kind, r.eliminated]), [
    [1, "annulled", "Charlotte"],
    [2, "vote", "Charlotte"],
  ]);
});

Deno.test("deux bulletins d'un même tour pour deux cibles : le premier reste, l'écart est signalé", () => {
  const out = extractVotes(
    gridHtml(`
<tr><th>► Épisode</th><th colspan="2">6</th></tr>
<tr><th>► Éliminé</th><th colspan="2">Camille</th></tr>
<tr><th>► Votes</th><th colspan="2">2/3</th></tr>
<tr><th>▼ Candidats</th><th colspan="2">Votes</th></tr>
<tr><td>Camille</td><td colspan="2">Vincent</td></tr>
<tr><td>Vincent</td><td colspan="2">Camille</td></tr>
<tr><td>Yassin</td><td>Camille</td><td>Vincent</td></tr>`),
    SEASON,
  );
  assertEquals(
    out.votes.filter((v) => v.voter === "Yassin").map((v) => [v.target, v.weight]),
    [["Camille", 1]],
  );
  assertEquals(out.anomalies.map((a) => [a.code, a.row]), [[
    "bulletins_divergents",
    "Yassin",
  ]]);
});

Deno.test("l'arène reprend sa place en tête de l'épisode, et renumérote ce qui suit", () => {
  const grid = gridOf([
    ["► Épisode", "4", "7", "7"],
    ["► Éliminé", "Lola", "Laure", "Tania"],
    ["► Votes", "2/3", "0", "2/3"],
    ["▼ Candidats", "Votes", "Votes", "Votes"],
    ["Lola", "Ugo", "", ""],
    ["Maxime", "Lola", "", "Tania"],
    ["Ugo", "Lola", "", "Tania"],
    ["Tania", "", "", "Ugo"],
  ]);
  const out = extractVotes(grid, SEASON, undefined, [
    { episodeNumber: 4, name: "Joana" },
    { episodeNumber: 7, name: "Charlotte" },
    // Votée le même soir : déjà sortie, pas de second tour à son nom.
    { episodeNumber: 7, name: "Tania" },
  ]);

  assertEquals(
    out.rounds.map((r) => [r.naturalKey, r.kind, r.eliminated, r.causedBy, r.rawTally]),
    [
      [`${SEASON}:e4:r1`, "linked", "Joana", null, "0"],
      [`${SEASON}:e4:r2`, "vote", "Lola", null, "2/3"],
      [`${SEASON}:e7:r1`, "linked", "Charlotte", null, "0"],
      [`${SEASON}:e7:r2`, "linked", "Laure", null, "0"],
      [`${SEASON}:e7:r3`, "vote", "Tania", null, "2/3"],
    ],
  );
  // Les bulletins suivent leur tour renuméroté.
  assertEquals(
    [...new Set(out.votes.map((v) => v.naturalKey.split(":").slice(0, 3).join(":")))],
    [`${SEASON}:e4:r2`, `${SEASON}:e7:r3`],
  );
  // Une colonne qui n'existe pas n'attire aucune anomalie de colonne.
  assert(out.rounds.filter((r) => r.columnIndex < 0).length === 2);
});

Deno.test("une sortie que la matrice porte déjà n'est pas écrite deux fois", () => {
  const grid = gridOf([
    ["► Épisode", "4", "4"],
    ["► Éliminé", "Joana", "Lola"],
    ["► Votes", "0", "2/3"],
    ["▼ Candidats", "Votes", "Votes"],
    ["Lola", "", "Ugo"],
    ["Maxime", "", "Lola"],
    ["Ugo", "", "Lola"],
  ]);
  const out = extractVotes(grid, SEASON, undefined, [{
    episodeNumber: 4,
    name: "Joana",
  }]);
  assertEquals(out.rounds.map((r) => [r.roundNumber, r.eliminated]), [
    [1, "Joana"],
    [2, "Lola"],
  ]);
});

const fixture1013 = await Deno.readTextFile(
  new URL("./fixtures/all-stars-votes-2026-10-13.html", import.meta.url),
);
const ARENES_1013 = [
  { episodeNumber: 4, name: "Joana" },
  { episodeNumber: 4, name: "Moussa" },
  { episodeNumber: 4, name: "Naoil" },
  { episodeNumber: 4, name: "Jacques" },
  { episodeNumber: 7, name: "Charlotte" },
  { episodeNumber: 7, name: "Tania" },
];
const real1013 = extractVotes(
  parseTables(fixture1013).find((t) => looksLikeVotes(t.grid))!.grid,
  SEASON,
  undefined,
  ARENES_1013,
);

/** Ce que la publication retient d'un tour : la clé et le payload, sans la colonne. */
const publie = (r: (typeof real1013.rounds)[number]) => [
  r.naturalKey,
  r.kind,
  r.eliminated,
  r.causedBy,
  r.reportedVotesFor,
  r.reportedVotesTotal,
  r.rawTally,
];

Deno.test("13/10 : l'épisode 4 ressort IDENTIQUE au 30/09, arène comprise", () => {
  const avant = real0930.rounds.filter((r) => r.episodeNumber === 4).map(publie);
  const apres = real1013.rounds.filter((r) => r.episodeNumber === 4).map(publie);
  assertEquals(apres, avant);
  const bulletins = (out: typeof real1013, cle: string) =>
    out.votes.filter((v) => v.naturalKey.startsWith(`${cle}:`))
      .map((v) => [v.naturalKey, v.target, v.struck, v.weight]).sort();
  assertEquals(
    bulletins(real1013, `${SEASON}:e4:r5`),
    bulletins(real0930, `${SEASON}:e4:r5`),
  );
});

Deno.test("13/10 : l'épisode 6 reste UN tour, et Yassin y vote deux fois", () => {
  const ep6 = real1013.rounds.filter((r) => r.episodeNumber === 6);
  assertEquals(
    ep6.map(publie),
    real0930.rounds.filter((r) => r.episodeNumber === 6).map(publie),
  );
  const yassin = real1013.votes.find((v) => v.naturalKey === `${SEASON}:e6:r1:Yassin`);
  assertEquals([yassin?.target, yassin?.weight], ["Camille", 2]);
});

Deno.test("13/10 : l'épisode 7 — l'arène, l'abandon, l'égalité, puis deux votes", () => {
  const ep7 = real1013.rounds.filter((r) => r.episodeNumber === 7);
  assertEquals(ep7.map((r) => [r.roundNumber, r.kind, r.eliminated, r.rawTally]), [
    [1, "linked", "Charlotte", "0"],
    [2, "linked", "Laure", "0"],
    [3, "annulled", "Nicolas", "/"],
    [4, "vote", "Nicolas", "2/4"],
    [5, "vote", "Tania", "5/6"],
  ]);
  // Tania, votée puis éliminée à l'arène le même soir : une seule sortie.
  assertEquals(ep7.filter((r) => r.eliminated === "Tania").length, 1);
});

// ── La page du 26/10/2026 (révision 240721383) ────────────────────────────
//
// Les rédacteurs préparent la colonne de l'épisode suivant avant sa diffusion,
// décompte compris : le « 0 » de l'épisode 10 faisait un tour sans éliminé,
// ambigu, et le lot entier (épisodes 8 et 9) restait retenu.

Deno.test("une colonne préparée en fin de tableau, décompte écrit, est à venir", () => {
  const grid = gridOf([
    ["► Épisode", "9", "10"],
    ["► Éliminé", "Vincent", ""],
    ["► Votes", "2/3", "0"],
    ["▼ Candidats", "Votes", "Votes"],
    ["Lola", "Vincent", ""],
    ["Ugo", "Vincent", ""],
    ["Vincent", "Lola", ""],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.map((r) => r.naturalKey), [`${SEASON}:e9:r1`]);
  assertEquals(out.anomalies, []);
});

Deno.test("au MILIEU du tableau, un décompte sans éliminé reste une anomalie", () => {
  const grid = gridOf([
    ["► Épisode", "8", "9"],
    ["► Éliminé", "", "Vincent"],
    ["► Votes", "/12", "2/3"],
    ["▼ Candidats", "Votes", "Votes"],
    ["Lola", "", "Vincent"],
    ["Ugo", "", "Vincent"],
    ["Vincent", "", "Lola"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(
    out.anomalies.map((a) => a.code).includes("eliminé_absent"),
    true,
    "un trou au milieu se dit, il ne s'efface pas",
  );
});

const fixture1026 = await Deno.readTextFile(
  new URL("./fixtures/all-stars-votes-2026-10-26.html", import.meta.url),
);
const real1026 = extractVotes(
  parseTables(fixture1026).find((t) => looksLikeVotes(t.grid))!.grid,
  SEASON,
  undefined,
  ARENES_1013,
);

Deno.test("26/10 : les épisodes 8 et 9 se lisent, l'épisode 10 attend", () => {
  assertEquals(
    real1026.rounds.filter((r) => (r.episodeNumber ?? 0) >= 8).map((r) => [
      r.naturalKey,
      r.kind,
      r.eliminated,
      r.rawTally,
    ]),
    [
      [`${SEASON}:e8:r1`, "vote", "Yassin", "6/12"],
      [`${SEASON}:e9:r1`, "linked", "Camille", "0"],
      [`${SEASON}:e9:r2`, "vote", "Vincent", "6/10"],
    ],
  );
  // Lola vote deux fois à l'épisode 8 : deux cellules sous un en-tête étendu.
  const lola = real1026.votes.find((v) => v.naturalKey === `${SEASON}:e8:r1:Lola`);
  assertEquals([lola?.target, lola?.weight], ["Vincent", 2]);
  assertEquals(real1026.anomalies.filter((a) => a.code === "eliminé_absent"), []);
});
