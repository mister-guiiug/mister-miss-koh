/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { parseTables } from "./html-table.ts";
import { extractContestants, extractProgress } from "./extract-season.ts";
import {
  parseAge,
  parseDay,
  parseEpisodeNumber,
  parseFrenchDate,
  parseGender,
  parseTallySequence,
  splitNames,
} from "./parse-fr.ts";

const SEASON = "all-stars-2026";

// ── Lecture des valeurs françaises ────────────────────────────────────────

Deno.test("date française : lue, ou rien", () => {
  assertEquals(parseFrenchDate("25 août 2026"), "2026-08-25");
  assertEquals(parseFrenchDate("1er septembre 2026"), "2026-09-01");
  assertEquals(parseFrenchDate("8 SEPTEMBRE 2026"), "2026-09-08");
  assertEquals(parseFrenchDate("prochainement"), null);
  assertEquals(parseFrenchDate("31 février 2026"), null, "le 31 février n'existe pas");
  assertEquals(parseFrenchDate("25 août"), null);
});

Deno.test("âge : « 32 ans », et rien d'approchant", () => {
  assertEquals(parseAge("32 ans"), 32);
  assertEquals(parseAge("41 ans"), 41);
  assertEquals(parseAge("une trentaine"), null);
  assertEquals(parseAge("32-34 ans"), null);
  assertEquals(parseAge("200 ans"), null);
});

Deno.test("numéro d'épisode et jour", () => {
  assertEquals(parseEpisodeNumber("1 épisode"), 1);
  assertEquals(parseEpisodeNumber("épisode 12"), 12);
  assertEquals(parseEpisodeNumber("finale"), null);
  assertEquals(parseDay("Jour 3"), 3);
  assertEquals(parseDay("jour  16"), 16);
  assertEquals(parseDay(""), null);
});

Deno.test("découpage des noms : étroit par principe", () => {
  assertEquals(splitNames("Maxime et Joana"), ["Maxime", "Joana"]);
  assertEquals(splitNames("Moussa, Naoil et Vincent"), ["Moussa", "Naoil", "Vincent"]);
  // Un tiret NE découpe pas : il apparaît dans des noms composés.
  assertEquals(splitNames("Jean-Pierre"), ["Jean-Pierre"]);
  assertEquals(splitNames(""), []);
});

Deno.test("décomptes : un tour, ou deux séparés par une barre", () => {
  assertEquals(parseTallySequence("12-2-1-1"), [{ counts: [12, 2, 1, 1], total: 16 }]);
  assertEquals(parseTallySequence("9-9 / 11-7"), [
    { counts: [9, 9], total: 18 },
    { counts: [11, 7], total: 18 },
  ]);
  assertEquals(parseTallySequence("unanimité"), [], "rien d'illisible n'est deviné");
  assertEquals(parseTallySequence(""), []);
});

Deno.test("genre : deux symboles, pas d'interprétation au-delà", () => {
  assertEquals(parseGender("♀"), "f");
  assertEquals(parseGender("♂"), "m");
  assertEquals(parseGender("H"), null);
});

// ── Candidats, sur la vraie page ──────────────────────────────────────────

const candidatsHtml = await Deno.readTextFile(
  new URL("./fixtures/candidats-section.html", import.meta.url),
);
const [candidatsTable] = parseTables(candidatsHtml);
const candidats = extractContestants(candidatsTable.grid, SEASON);

Deno.test("fixture : dix-huit candidats, sans anomalie", () => {
  assertEquals(candidats.contestants.length, 18);
  assertEquals(candidats.anomalies, []);
});

Deno.test("fixture : nom, genre et âge sont lus", () => {
  const camille = candidats.contestants.find((c) => c.displayName === "Camille");
  assert(camille, "Camille introuvable");
  assertEquals(camille.gender, "f");
  assertEquals(camille.age, 32);
  assertEquals(camille.naturalKey, "all-stars-2026:Camille");

  const dorian = candidats.contestants.find((c) => c.displayName === "Dorian");
  assertEquals(dorian?.gender, "m");
});

Deno.test("fixture : les saisons précédentes sont SÉPARÉES, pas recollées", () => {
  // Le défaut corrigé le 05/09/2026 : sans marque de frontière de bloc, deux
  // mentions se collaient en « Vainqueur de la saison 9Éliminée le… », une
  // chaîne que personne ne peut redécouper.
  const multiples = candidats.contestants.filter((c) => c.previousSeasons.length > 1);
  assert(multiples.length > 0, "au moins un candidat a plusieurs saisons passées");
  for (const c of candidats.contestants) {
    for (const mention of c.previousSeasons) {
      assert(mention.length > 0);
      assert(!mention.includes("mw-parser-output"), `du CSS a fui : ${mention}`);
    }
  }
});

Deno.test("fixture : « 33e jour », pas « 33 jour » — l'ordinal garde son exposant", () => {
  // Constat du 06/09/2026 en production : tous les `<sup>` sortaient avec les
  // appels de note, et le « e » de l'ordinal partait avec eux. C'est ce libellé
  // que `contestant_previous_seasons.label` publie : il doit être celui de la page.
  const maxime = candidats.contestants.find((c) => c.displayName === "Maxime");
  assertEquals(maxime?.previousSeasons, ["Éliminé le 33e jour de la saison 27"]);
  const freddy = candidats.contestants.find((c) => c.displayName === "Freddy");
  assert(
    freddy?.previousSeasons.includes("Abandon médical le 2e jour de La Légende"),
    `Freddy : ${freddy?.previousSeasons.join(" | ")}`,
  );
  for (const c of candidats.contestants) {
    for (const mention of c.previousSeasons) {
      assert(
        !/\d jour\b/.test(mention),
        `ordinal amputé pour ${c.displayName} : « ${mention} »`,
      );
    }
  }
});

Deno.test("fixture : la tribu est lue sans le CSS de la légende", () => {
  for (const c of candidats.contestants) {
    for (const stint of [...c.teams, ...c.teamStatuses]) {
      assert(
        !stint.name.includes("mw-parser-output"),
        `la colonne Tribu de ${c.displayName} contient du CSS`,
      );
    }
  }
});

Deno.test("fixture : le séjour en tribu porte ses bornes de JOURS", () => {
  // La colonne « Tribu » parle en jours, jamais en épisodes. Convertir
  // demanderait une table jour → épisode que la source ne donne pas.
  const camille = candidats.contestants.find((c) => c.displayName === "Camille");
  assert(camille, "Camille introuvable");
  assertEquals(camille.teams.length, 1);
  assertEquals(camille.teams[0].name, "Tribu unique");
  assertEquals(camille.teams[0].fromDay, 1);
  assertEquals(camille.teams[0].toDay, null, "borne ouverte : elle y est encore");
});

Deno.test("fixture : « Bannie » n'est pas une tribu", () => {
  // Sans cette distinction, la publication créerait une tribu « Bannie » et
  // lui donnerait quatre membres.
  const joana = candidats.contestants.find((c) => c.displayName === "Joana");
  assert(joana, "Joana introuvable");
  assertEquals(joana.teams.map((t) => t.name), ["Tribu unique"]);
  assertEquals(joana.teams[0].toDay, 3, "son séjour se ferme le jour de sa sortie");
  assertEquals(joana.teamStatuses.map((s) => s.name), ["Bannie"]);
  assertEquals(joana.teamStatuses[0].fromDay, 3);
  assert(
    !candidats.contestants.some((c) => c.teams.some((t) => t.name === "Bannie")),
    "aucun candidat ne doit avoir « Bannie » pour tribu",
  );
});

Deno.test("fixture : le jury final vide vaut « inconnu », pas « non »", () => {
  // La saison est en cours : la colonne est vide pour tout le monde. La lire
  // comme un « non » affirmerait que dix-huit candidats sont hors jury.
  assert(candidats.contestants.every((c) => c.finalJury === null));
});

// ── Déroulement, sur la vraie page ────────────────────────────────────────

const deroulementHtml = await Deno.readTextFile(
  new URL("./fixtures/deroulement-section.html", import.meta.url),
);
const progressTable = parseTables(deroulementHtml)[0];
const progress = extractProgress(progressTable.grid, SEASON);

Deno.test("fixture : les épisodes sont lus malgré la colonne décorative", () => {
  // Le tableau porte une colonne vide en `rowspan=37`, posée pour dessiner un
  // trait. Compter les colonnes ferait lire « Éliminé » là où il n'y a rien.
  assert(progress.episodes.length >= 3);
  assertEquals(progress.episodes[0].number, 1);
  assertEquals(progress.episodes[0].airDate, "2026-08-25");
  assertEquals(progress.episodes[1].airDate, "2026-09-01");
});

Deno.test("fixture : deux éliminés à l'épisode 1, et le binôme est séparé", () => {
  const e1 = progress.episodes[0];
  assertEquals(e1.eliminated, ["Maxime", "Joana"]);
  assertEquals(e1.departureDay, 3);
});

Deno.test("fixture : l'égalité de l'épisode 1 donne bien DEUX tours", () => {
  const e1 = progress.episodes[0];
  assertEquals(e1.rawTally, "9-9 / 11-7");
  assertEquals(e1.tallyRounds.length, 2);
  assertEquals(e1.tallyRounds[0].counts, [9, 9]);
  assertEquals(e1.tallyRounds[1].counts, [11, 7]);
  // Les deux tours portent sur le même corps électoral.
  assertEquals(e1.tallyRounds[0].total, e1.tallyRounds[1].total);
});

Deno.test("fixture : l'épisode 2 n'a qu'un tour, à quatre décomptes", () => {
  const e2 = progress.episodes[1];
  assertEquals(e2.tallyRounds.length, 1);
  assertEquals(e2.tallyRounds[0].counts, [12, 2, 1, 1]);
  assertEquals(e2.eliminated, ["Moussa", "Naoil"]);
});

Deno.test("fixture : un épisode non diffusé est marqué, pas signalé", () => {
  const future = progress.episodes.filter((e) => !e.aired);
  assert(future.length > 0, "la saison est en cours : des épisodes restent à venir");
  for (const e of future) {
    assertEquals(e.eliminated, []);
    assertEquals(e.tallyRounds, []);
  }
  // Aucune anomalie ne doit venir d'un épisode simplement à venir.
  assertEquals(
    progress.anomalies.filter((a) => a.code === "decompte_sans_elimine"),
    [],
  );
});

Deno.test("fixture : la numérotation des épisodes est continue", () => {
  assertEquals(
    progress.anomalies.filter((a) => a.code === "episode_manquant"),
    [],
  );
  assertEquals(
    progress.anomalies.filter((a) => a.code === "episode_duplique"),
    [],
  );
});

// ── Structures dégradées ──────────────────────────────────────────────────

Deno.test("sans chapeau « Candidat », l'extraction s'arrête au lieu de deviner", () => {
  // La version précédente exigeait AUSSI « Âge » et « Saisons précédentes » :
  // elle refusait de ce fait huit saisons sur onze. Le seul ancrage qui vaut
  // pour toutes les éditions est le chapeau du nom.
  const grid = parseTables(
    "<table><tr><th>Nom</th><th>Age</th></tr><tr><td>X</td><td>30</td></tr></table>",
  )[0].grid;
  const out = extractContestants(grid, SEASON);
  assertEquals(out.contestants, []);
  assertEquals(out.anomalies[0].code, "structure_inconnue");
});

Deno.test("« Âge » absent ne bloque plus rien : l'âge devient inconnu", () => {
  const grid = parseTables(
    "<table><tr><th>Candidat</th><th>Candidat</th><th>Tribu</th></tr>" +
      "<tr><td>♂</td><td>X</td><td>Rouge</td></tr></table>",
  )[0].grid;
  const out = extractContestants(grid, SEASON);
  assertEquals(out.contestants.length, 1);
  assertEquals(out.contestants[0].displayName, "X");
  assertEquals(out.contestants[0].age, null);
  assertEquals(out.contestants[0].gender, "m");
});

Deno.test("une colonne « Conseil » disparue arrête le déroulement", () => {
  const grid = parseTables(
    "<table><tr><th>Épisode</th><th>Diffusion</th></tr>" +
      "<tr><th>Épisode</th><th>Diffusion</th></tr>" +
      "<tr><td>1</td><td>25 août 2026</td></tr></table>",
  )[0].grid;
  const out = extractProgress(grid, SEASON);
  assertEquals(out.episodes, []);
  assert(out.anomalies[0].message.includes("Éliminé(s)"));
});

// ── Une saison PASSÉE, sur sa vraie page ──────────────────────────────────
//
// « La Guerre des chefs » (2019) est la contre-épreuve de l'édition All Stars :
// pas de colonne « Saisons précédentes », une colonne « Profession » intercalée
// entre le nom et l'âge, un chapeau au pluriel, et un sous-titre « Vote » au
// singulier. La première version de l'extraction échouait sur les quatre.

const gdcCandidatsHtml = await Deno.readTextFile(
  new URL("./fixtures/guerre-des-chefs-candidats-section.html", import.meta.url),
);
const gdcCandidats = extractContestants(
  parseTables(gdcCandidatsHtml)[0].grid,
  "guerre-des-chefs",
);

Deno.test("saison passée : les candidats sont lus sans « Saisons précédentes »", () => {
  assertEquals(gdcCandidats.contestants.length, 21);
  assertEquals(
    gdcCandidats.anomalies.filter((a) => a.code === "structure_inconnue"),
    [],
    "l'absence d'une colonne propre aux éditions de retour n'est pas une structure inconnue",
  );
});

Deno.test("saison passée : le nom n'est pas la profession", () => {
  // `colÂge - 1` désignait « Étudiante en STAPS ». Le nom se lit désormais
  // comme la dernière colonne du chapeau « Candidats », d'où qu'il soit.
  const alisea = gdcCandidats.contestants.find((c) => c.displayName === "Aliséa");
  assert(alisea, "Aliséa introuvable");
  assertEquals(alisea.age, 20);
  assertEquals(
    alisea.gender,
    "f",
    "le symbole se lit, il n'est plus confondu avec le nom",
  );
  assertEquals(alisea.previousSeasons, []);
  assertEquals(alisea.departure, "Abandon médical");
  assert(
    !gdcCandidats.contestants.some((c) => c.displayName.includes("Étudiante")),
    "aucune profession ne doit être prise pour un nom",
  );
});

const gdcProgress = extractProgress(
  parseTables(
    await Deno.readTextFile(
      new URL("./fixtures/guerre-des-chefs-deroulement-section.html", import.meta.url),
    ),
  )[0].grid,
  "guerre-des-chefs",
);

Deno.test("saison passée : le sous-titre « Vote » au singulier est reconnu", () => {
  assertEquals(gdcProgress.episodes.length, 14);
  assert(
    gdcProgress.episodes.some((e) => e.rawTally !== ""),
    "sans le singulier, la colonne des décomptes reste introuvable et tout rawTally est vide",
  );
});
