/**
 * Lecture des valeurs françaises de la source.
 *
 * CHAQUE FONCTION REND `null` PLUTÔT QU'UNE APPROXIMATION. « 32 ans » donne
 * 32 ; « une trentaine » ne donne rien, et l'appelant en fait une anomalie.
 * Deviner ici reviendrait à inscrire une invention dans le référentiel, avec
 * l'apparence d'une donnée sourcée.
 */

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

/** Sans casse ni accents. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** « 25 août 2026 » → « 2026-08-25 ». Rien d'autre n'est accepté. */
export function parseFrenchDate(raw: string): string | null {
  const parts = fold(raw).replace(/\s+/g, " ").trim().split(" ");
  if (parts.length < 3) return null;
  // Le jour peut s'écrire « 1er » : on ne garde que les chiffres de tête.
  const day = Number.parseInt(parts[0].replace(/[^0-9]/g, ""), 10);
  const month = MONTHS[parts[1]];
  const year = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(day) || !month || !Number.isFinite(year)) return null;
  if (day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Contrôle final : le 31 février n'existe pas, et une date impossible dans
  // la source est une anomalie, pas une valeur à corriger en silence.
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== day) return null;
  return iso;
}

/** « 32 ans » → 32. Une plage ou une approximation ne donne rien. */
export function parseAge(raw: string): number | null {
  const match = fold(raw).match(/^(\d{1,3})\s*ans?$/);
  if (!match) return null;
  const age = Number.parseInt(match[1], 10);
  return age >= 1 && age <= 120 ? age : null;
}

/** « 1er épisode », « épisode 3 », « 12 » → le numéro. */
export function parseEpisodeNumber(raw: string): number | null {
  const digits = fold(raw).match(/\d+/);
  if (!digits) return null;
  const value = Number.parseInt(digits[0], 10);
  return value > 0 && value < 100 ? value : null;
}

/** « Jour 3 » → 3. */
export function parseDay(raw: string): number | null {
  const match = fold(raw).match(/jour\s*(\d+)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value > 0 && value < 200 ? value : null;
}

/**
 * « Maxime et Joana » → deux noms.
 *
 * LA SÉPARATION EST DÉLIBÉRÉMENT ÉTROITE. Seuls « et » et la virgule
 * découpent ; un tiret ou une parenthèse ne découpent pas, parce qu'ils
 * apparaissent DANS des noms et des mentions. Mieux vaut rendre une valeur
 * qu'on refusera ensuite qu'inventer deux personnes à partir d'une.
 */
export function splitNames(raw: string): string[] {
  return raw
    .split(/\s+et\s+|,/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * « 9-9 / 11-7 » → deux tours de scrutin, chacun avec ses décomptes.
 * « 12-2-1-1 » → un seul tour, quatre décomptes.
 *
 * Le premier nombre de chaque tour est celui de l'éliminé : c'est la
 * convention du tableau, et elle se vérifie sur les deux épisodes joués.
 */
export interface TallyRound {
  readonly counts: readonly number[];
  readonly total: number;
}

export function parseTallySequence(raw: string): TallyRound[] {
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return [];
  const rounds: TallyRound[] = [];
  for (const chunk of cleaned.split("/")) {
    if (!chunk) continue;
    const counts = chunk.split("-").map((n) => Number.parseInt(n, 10));
    if (counts.some((n) => !Number.isFinite(n) || n < 0)) return [];
    rounds.push({ counts, total: counts.reduce((a, b) => a + b, 0) });
  }
  return rounds;
}

/** « ♀ » → 'f', « ♂ » → 'm'. Tout autre signe n'est pas interprété. */
export function parseGender(raw: string): "f" | "m" | null {
  const value = raw.trim();
  if (value === "♀") return "f";
  if (value === "♂") return "m";
  return null;
}
