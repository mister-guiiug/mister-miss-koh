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
 * UNE LECTURE, UNE RÉVISION. `fetchRevision` dit quelle révision est en ligne ;
 * tout ce qui se lit ensuite (sections, HTML) se demande pour CETTE révision,
 * par `oldid`, et la réponse doit la nommer. Lire par le titre, c'était lire la
 * page telle qu'elle était à chaque appel : un soir de diffusion, quand les
 * contributeurs écrivent en direct et que l'import passe toutes les trente
 * minutes, les candidats pouvaient venir d'une révision et les votes de la
 * suivante, rangés sous le numéro de la première.
 *
 * LA PAGE SE DÉSIGNE PAR SON `pageid`. Il survit à un renommage, le titre non :
 * par le titre, une page renommée rendait sa page de redirection, sans aucune
 * section, et l'import échouait à chaque passage sans dire pourquoi.
 *
 * IDENTIFICATION ET MESURE. Chaque appel porte un `User-Agent` qui nomme le
 * projet et un moyen de contact, comme la politique d'accès de Wikimedia le
 * demande. Les appels partent EN SÉRIE (la règle de l'API : jamais deux
 * requêtes à la fois) et portent `maxlag` : quand les serveurs de Wikimedia
 * prennent du retard, ils le disent, et on attend. On ne reprend qu'une
 * requête que le serveur a lui-même demandé de refaire plus tard (429, 503,
 * `maxlag`), deux fois au plus, en suivant `Retry-After` dans la limite de dix
 * secondes. Pour tout le reste, une synchronisation qui échoue attendra la
 * suivante.
 */

export interface WikiConfig {
  /** Racine de l'API, p. ex. `https://fr.wikipedia.org/w/api.php`. */
  readonly apiUrl: string;
  /** Obligatoire : nomme le projet ET un moyen de contact. */
  readonly userAgent: string;
  /** Injectable pour les tests ; `globalThis.fetch` par défaut. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** Injectable pour les tests : l'attente avant une reprise. */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Reçoit chaque avertissement de l'API : fonction dépréciée, valeur
   * ignorée. Une dépréciation annonce une panne future ; elle doit se lire
   * dans le journal avant de casser l'import.
   */
  readonly onWarning?: (warning: string) => void;
}

/**
 * Retard de réplication toléré, en secondes. C'est la valeur que Wikimedia
 * demande aux tâches automatiques ; au-delà, l'API refuse et dit d'attendre.
 */
export const MAXLAG = 5;

/** Reprises au plus, et seulement quand le serveur les a demandées. */
export const MAX_RETRIES = 2;

/** Une attente plus longue attend plutôt la planification suivante. */
export const MAX_WAIT_MS = 10_000;

export interface RevisionInfo {
  readonly pageId: number;
  readonly title: string;
  readonly revId: string;
  readonly revisedAt: string;
  readonly sizeBytes: number;
}

/** Une page : son `pageid` quand on le connaît, son titre sinon. */
export interface PageRef {
  readonly title: string;
  readonly pageId?: string | number | null;
}

/** Ce qu'une lecture de contenu demande : une révision précise. */
export interface RevisionRef {
  readonly revId: string;
}

export interface SectionInfo {
  readonly index: string;
  readonly number: string;
  readonly line: string;
}

export class WikiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Le code d'erreur de MediaWiki (`maxlag`, `nosuchrevid`…), s'il y en a un. */
    readonly code?: string,
  ) {
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

/**
 * L'attente que le serveur demande (`Retry-After`, en secondes), ou à défaut
 * une et deux secondes, toujours plafonnée.
 */
function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("Retry-After")?.trim() ?? "";
  const ms = /^\d+$/.test(header) ? Number(header) * 1000 : 1000 * 2 ** attempt;
  return Math.min(ms, MAX_WAIT_MS);
}

/**
 * Transmet les avertissements de la réponse.
 *
 * L'invitation à s'abonner à la liste des annonces de l'API accompagne toute
 * dépréciation sans dire laquelle : elle est écartée, le module qui parle
 * ensuite (« "prop=sections" has been deprecated ») est gardé.
 */
function forwardWarnings(body: unknown, onWarning?: (warning: string) => void): void {
  if (!onWarning || !body || typeof body !== "object") return;
  const warnings = (body as { warnings?: Record<string, { warnings?: unknown }> })
    .warnings;
  if (!warnings || typeof warnings !== "object") return;
  for (const [module, entry] of Object.entries(warnings)) {
    if (typeof entry?.warnings !== "string") continue;
    for (const line of entry.warnings.split("\n")) {
      const text = line.trim();
      if (text && !text.includes("mediawiki-api-announce")) {
        onWarning(`${module} : ${text}`);
      }
    }
  }
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
  url.searchParams.set("maxlag", String(MAXLAG));

  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const sleep = config.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0;; attempt += 1) {
    const response = await doFetch(url.toString(), {
      headers: { "User-Agent": ua, "Accept": "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
    });

    // 429 : trop de requêtes ; 503 : serveur surchargé. Les deux disent
    // « plus tard », c'est-à-dire tout de suite après l'attente demandée.
    if (response.status === 429 || response.status === 503) {
      await response.body?.cancel();
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new WikiError(
        `l'API a répondu ${response.status} pour ${url.pathname}, encore après ${MAX_RETRIES} reprise(s)`,
        response.status,
      );
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new WikiError(
        `l'API a répondu ${response.status} pour ${url.pathname}`,
        response.status,
      );
    }

    const body = await response.json();
    // MediaWiki rend 200 avec un objet `error` : sans ce contrôle, l'erreur
    // passerait pour une page vide et l'import conclurait « rien à changer ».
    if (body && typeof body === "object" && "error" in body) {
      const err = (body as { error?: { code?: string; info?: string } }).error;
      // `maxlag` arrive AUSSI en 200 : c'est une demande d'attendre, pas une
      // erreur de la requête.
      if (err?.code === "maxlag" && attempt < MAX_RETRIES) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new WikiError(
        `erreur MediaWiki : ${err?.info ?? "inconnue"}`,
        undefined,
        err?.code,
      );
    }
    forwardWarnings(body, config.onWarning);
    return body;
  }
}

/**
 * La réponse d'un `action=parse` nomme la révision qu'elle a lue. Si ce n'est
 * pas celle demandée, on ne lit rien : c'est tout l'intérêt d'avoir épinglé.
 */
function checkRevision(revid: unknown, expected: RevisionRef): void {
  if (typeof revid === "number" && String(revid) !== expected.revId) {
    throw new WikiError(`révision ${revid} rendue au lieu de ${expected.revId}`);
  }
}

/**
 * Métadonnées de la dernière révision. Un appel, aucun contenu transféré.
 *
 * Par `pageids` dès que le `pageid` est connu ; par le titre sinon, avec
 * `redirects` pour suivre une page renommée jusqu'à sa cible. Le titre rendu
 * est celui de la page aujourd'hui : s'il diffère de celui qu'on tenait, la
 * page a changé de nom.
 */
export async function fetchRevision(
  config: WikiConfig,
  page: string | PageRef,
): Promise<RevisionInfo> {
  return (await fetchRevisionHistory(config, page, 1)).revisions[0];
}

export interface RevisionHistory {
  readonly pageId: number;
  readonly title: string;
  /** Les dernières révisions, la plus récente d'abord. Jamais vide. */
  readonly revisions: readonly RevisionInfo[];
}

/**
 * Les dernières révisions de la page, la plus récente d'abord.
 *
 * C'est la sonde de la soirée de diffusion : en un seul appel, sans lire une
 * ligne de contenu, elle dit si la page a bougé, quand pour la dernière fois,
 * et depuis quand elle attend d'être lue.
 */
export async function fetchRevisionHistory(
  config: WikiConfig,
  page: string | PageRef,
  limit = 20,
): Promise<RevisionHistory> {
  const ref: PageRef = typeof page === "string" ? { title: page } : page;
  const pageId = ref.pageId == null ? "" : String(ref.pageId).trim();
  const target: Record<string, string> = /^\d+$/.test(pageId)
    ? { pageids: pageId }
    : { titles: ref.title, redirects: "1" };

  const body = await callApi(config, {
    action: "query",
    prop: "revisions",
    ...target,
    rvprop: "ids|timestamp|size",
    rvlimit: String(limit),
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

  const found = body.query?.pages?.[0];
  if (!found || found.missing || !found.pageid) {
    throw new WikiError(
      `page introuvable : ${ref.title}${pageId ? ` (pageid ${pageId})` : ""}`,
    );
  }
  const pageid = found.pageid;
  const title = found.title ?? ref.title;
  const revisions: RevisionInfo[] = [];
  for (const rev of found.revisions ?? []) {
    if (!rev.revid || !rev.timestamp) continue;
    revisions.push({
      pageId: pageid,
      title,
      revId: String(rev.revid),
      revisedAt: rev.timestamp,
      sizeBytes: rev.size ?? 0,
    });
  }
  if (revisions.length === 0) {
    throw new WikiError(`aucune révision lisible pour ${ref.title}`);
  }
  return { pageId: pageid, title, revisions };
}

type RawSection = { index?: string; number?: string; line?: string };

/**
 * Sections de la révision.
 *
 * L'INDEX N'EST PAS LE NUMÉRO. `index` est ce qu'il faut passer à l'API ;
 * `number` est le numéro affiché (« 4.2 »). Les confondre fait lire la
 * mauvaise section — l'index 3 de cette page rend « Nouveautés » alors que le
 * numéro 3 désigne « Candidats ». Les sections se cherchent donc par leur
 * TITRE, jamais par leur rang.
 *
 * `prop=tocdata`, ET NON PLUS `prop=sections`. Le 30/09/2026, l'API répondait
 * à la seconde « "prop=sections" has been deprecated. Please use
 * "prop=tocdata" instead. » La table des matières rend les mêmes champs ;
 * `sections` n'est plus lu qu'en repli, si une réponse le porte encore.
 */
export async function fetchSections(
  config: WikiConfig,
  revision: RevisionRef,
): Promise<SectionInfo[]> {
  const body = await callApi(config, {
    action: "parse",
    oldid: revision.revId,
    prop: "tocdata",
  }) as {
    parse?: {
      revid?: number;
      tocdata?: { sections?: RawSection[] };
      sections?: RawSection[];
    };
  };

  checkRevision(body.parse?.revid, revision);
  const raw = body.parse?.tocdata?.sections ?? body.parse?.sections ?? [];
  return raw.map((s) => ({
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

/** HTML rendu d'une section de la révision, modèles développés. */
export async function fetchSectionHtml(
  config: WikiConfig,
  revision: RevisionRef,
  sectionIndex: string,
): Promise<string> {
  const body = await callApi(config, {
    action: "parse",
    oldid: revision.revId,
    prop: "text",
    section: sectionIndex,
  }) as { parse?: { revid?: number; text?: string } };

  checkRevision(body.parse?.revid, revision);
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
  ...wanted: readonly string[]
): SectionInfo | null {
  const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  // PLUSIEURS TITRES POUR UN MÊME RÔLE, dans l'ordre de préférence. Le même
  // tableau de votes s'intitule « Détails des votes » sur les saisons
  // récentes, « Détail des votes » sur une, et « Détail des éliminations » sur
  // quatre anciennes — relevé du 11/09/2026 sur les 18 pages. Le premier titre
  // trouvé gagne, ce qui rend l'ordre de la liste significatif.
  for (const title of wanted) {
    const target = fold(title);
    const found = sections.find((s) => fold(s.line) === target);
    if (found) return found;
  }
  return null;
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
