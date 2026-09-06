/**
 * Client MediaWiki — l'API officielle, pas la page.
 *
 * POURQUOI L'API ET NON LE HTML PUBLIC. Elle est le canal prévu pour un accès
 * programmatique : elle rend du contenu structuré, elle donne l'identité de la
 * révision, et elle ne demande pas d'imiter un navigateur. Lire la page servie
 * aux lecteurs pour en extraire des données, c'est du scraping — et le besoin
 * l'écarte explicitement, sauf en dernier recours justifié.
 *
 * LA RÉVISION REMPLACE L'EMPREINTE. MediaWiki expose un `revid` monotone et un
 * horodatage : deux lectures de la même révision sont identiques par
 * construction. Comparer des empreintes de HTML rendu produirait au contraire
 * des différences fantômes — les bandeaux de maintenance, le rendu des modèles
 * et les identifiants de section varient sans qu'un mot du contenu ait bougé.
 *
 * IDENTIFICATION ET MESURE. Chaque appel porte un `User-Agent` qui nomme le
 * projet et un moyen de contact, comme la politique d'accès de Wikimedia le
 * demande. Le client ne parallélise rien et n'a aucune reprise agressive : une
 * synchronisation qui échoue attendra la suivante.
 */

export interface WikiConfig {
  /** Racine de l'API, p. ex. `https://fr.wikipedia.org/w/api.php`. */
  readonly apiUrl: string;
  /** Obligatoire : nomme le projet ET un moyen de contact. */
  readonly userAgent: string;
  /** Injectable pour les tests ; `globalThis.fetch` par défaut. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface RevisionInfo {
  readonly pageId: number;
  readonly title: string;
  readonly revId: string;
  readonly revisedAt: string;
  readonly sizeBytes: number;
}

export interface SectionInfo {
  readonly index: string;
  readonly number: string;
  readonly line: string;
}

export class WikiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "WikiError";
  }
}

function requireUserAgent(config: WikiConfig): string {
  const ua = config.userAgent?.trim() ?? "";
  // Un `User-Agent` anonyme est un manquement aux conditions d'accès, pas un
  // détail de confort : le refus est immédiat, et côté client.
  if (ua.length < 10 || !ua.includes("http")) {
    throw new WikiError(
      "User-Agent absent ou anonyme : il doit nommer le projet et un moyen de contact",
    );
  }
  return ua;
}

async function callApi(
  config: WikiConfig,
  params: Record<string, string>,
): Promise<unknown> {
  const ua = requireUserAgent(config);
  const url = new URL(config.apiUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const signal = AbortSignal.timeout(config.timeoutMs ?? 15_000);
  const response = await doFetch(url.toString(), {
    headers: { "User-Agent": ua, "Accept": "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new WikiError(
      `l'API a répondu ${response.status} pour ${url.pathname}`,
      response.status,
    );
  }

  const body = await response.json();
  // MediaWiki rend 200 avec un objet `error` : sans ce contrôle, l'erreur
  // passerait pour une page vide et l'import conclurait « rien à changer ».
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { info?: string } }).error;
    throw new WikiError(`erreur MediaWiki : ${err?.info ?? "inconnue"}`);
  }
  return body;
}

/** Métadonnées de la dernière révision. Un appel, aucun contenu transféré. */
export async function fetchRevision(
  config: WikiConfig,
  title: string,
): Promise<RevisionInfo> {
  const body = await callApi(config, {
    action: "query",
    prop: "revisions",
    titles: title,
    rvprop: "ids|timestamp|size",
    rvlimit: "1",
  }) as {
    query?: {
      pages?: Array<
        {
          pageid?: number;
          title?: string;
          missing?: boolean;
          revisions?: Array<{ revid?: number; timestamp?: string; size?: number }>;
        }
      >;
    };
  };

  const page = body.query?.pages?.[0];
  if (!page || page.missing || !page.pageid) {
    throw new WikiError(`page introuvable : ${title}`);
  }
  const rev = page.revisions?.[0];
  if (!rev?.revid || !rev.timestamp) {
    throw new WikiError(`aucune révision lisible pour ${title}`);
  }

  return {
    pageId: page.pageid,
    title: page.title ?? title,
    revId: String(rev.revid),
    revisedAt: rev.timestamp,
    sizeBytes: rev.size ?? 0,
  };
}

/**
 * Sections de la page.
 *
 * L'INDEX N'EST PAS LE NUMÉRO. `index` est ce qu'il faut passer à l'API ;
 * `number` est le numéro affiché (« 4.2 »). Les confondre fait lire la
 * mauvaise section — l'index 3 de cette page rend « Nouveautés » alors que le
 * numéro 3 désigne « Candidats ». Les sections se cherchent donc par leur
 * TITRE, jamais par leur rang.
 */
export async function fetchSections(
  config: WikiConfig,
  title: string,
): Promise<SectionInfo[]> {
  const body = await callApi(config, {
    action: "parse",
    page: title,
    prop: "sections",
  }) as {
    parse?: { sections?: Array<{ index?: string; number?: string; line?: string }> };
  };

  return (body.parse?.sections ?? []).map((s) => ({
    index: s.index ?? "",
    number: s.number ?? "",
    line: s.line ?? "",
  }));
}

/**
 * Pages d'une catégorie.
 *
 * C'est par là que le catalogue des saisons se découvre : on ne code pas une
 * liste de titres, on demande à l'encyclopédie ce qu'elle déclare comme une
 * saison. Une page renommée, ajoutée ou retirée se répercute d'elle-même.
 *
 * `cmtype=page` écarte les sous-catégories et les fichiers. La pagination est
 * suivie jusqu'au bout, avec un plafond : une catégorie qui bouclerait ne doit
 * pas faire tourner l'import indéfiniment.
 */
export async function fetchCategoryMembers(
  config: WikiConfig,
  category: string,
  maxPages = 10,
): Promise<Array<{ pageId: number; title: string }>> {
  const members: Array<{ pageId: number; title: string }> = [];
  let cont: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const params: Record<string, string> = {
      action: "query",
      list: "categorymembers",
      cmtitle: category,
      cmtype: "page",
      cmprop: "ids|title",
      cmlimit: "500",
    };
    if (cont) params.cmcontinue = cont;

    const body = await callApi(config, params) as {
      query?: { categorymembers?: Array<{ pageid?: number; title?: string }> };
      continue?: { cmcontinue?: string };
    };

    for (const m of body.query?.categorymembers ?? []) {
      if (m.pageid && m.title) members.push({ pageId: m.pageid, title: m.title });
    }

    cont = body.continue?.cmcontinue;
    if (!cont) return members;
  }

  throw new WikiError(
    `la catégorie ${category} n'a pas fini de se paginer en ${maxPages} appels`,
  );
}

/** HTML rendu d'une section, modèles développés. */
export async function fetchSectionHtml(
  config: WikiConfig,
  title: string,
  sectionIndex: string,
): Promise<string> {
  const body = await callApi(config, {
    action: "parse",
    page: title,
    prop: "text",
    section: sectionIndex,
  }) as { parse?: { text?: string } };

  const html = body.parse?.text;
  if (typeof html !== "string") {
    throw new WikiError(`section ${sectionIndex} sans contenu lisible`);
  }
  return html;
}

export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Coordonnées PRIMAIRES d'une page (extension GeoData), ou `null` si elle
 * n'en déclare pas.
 *
 * C'est ainsi que le lieu de tournage se place sur une carte : la page de la
 * saison ne porte pas de coordonnées, mais elle LIE la page du lieu, et
 * celle-ci en porte. On demande donc à l'API, pour ce titre, le point qu'elle
 * considère comme principal — jamais une estimation faite ici.
 */
export async function fetchCoordinates(
  config: WikiConfig,
  title: string,
): Promise<Coordinates | null> {
  const body = await callApi(config, {
    action: "query",
    titles: title,
    prop: "coordinates",
    coprimary: "primary",
  }) as {
    query?: {
      pages?: Array<{
        missing?: boolean;
        coordinates?: Array<{ lat?: number; lon?: number; globe?: string }>;
      }>;
    };
  };

  const page = body.query?.pages?.[0];
  const point = page?.coordinates?.find((c) => (c.globe ?? "earth") === "earth");
  if (!point || typeof point.lat !== "number" || typeof point.lon !== "number") {
    return null;
  }
  return { lat: point.lat, lon: point.lon };
}

/** Retrouve une section par son titre, insensible à la casse et aux accents. */
export function findSection(
  sections: readonly SectionInfo[],
  wanted: string,
): SectionInfo | null {
  const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const target = fold(wanted);
  return sections.find((s) => fold(s.line) === target) ?? null;
}

/** Empreinte stable du modèle intermédiaire — pas de la page. */
export async function extractHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sérialisation à clés triées.
 *
 * `JSON.stringify` conserve l'ordre d'insertion : deux extractions
 * équivalentes mais construites dans un ordre différent produiraient deux
 * empreintes, donc un import « modifié » sans le moindre changement.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${
    entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")
  }}`;
}
