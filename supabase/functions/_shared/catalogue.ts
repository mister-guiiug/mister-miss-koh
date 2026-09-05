/**
 * Le catalogue des saisons — découvert, jamais écrit à la main.
 *
 * POURQUOI PAS UNE LISTE DE TITRES DANS LE CODE. Une liste codée en dur vieillit
 * en silence : une saison ajoutée n'arrive jamais, une page renommée casse
 * l'import sans dire pourquoi, et personne ne sait plus si la liste reflète
 * l'encyclopédie ou l'idée que s'en faisait son auteur. On demande donc à
 * MediaWiki ce QU'IL déclare comme une saison, et on en prend acte.
 *
 * CE QUE LE CATALOGUE N'EST PAS. Ce n'est pas la liste officielle des saisons
 * diffusées. C'est le contenu d'une catégorie de Wikipédia — ni plus, ni moins.
 * Le 05/09/2026 elle comptait 18 pages, et toutes les saisons diffusées n'y
 * sont pas. L'application ne prétend pas le contraire.
 *
 * L'ÉTAT D'UNE SAISON NE SE DEVINE PAS. Une page découverte donne un titre et
 * un identifiant. Ni la date de première diffusion, ni la date de fin : la
 * saison entre donc en `unknown`, et c'est l'import de sa page qui tranchera.
 * Le défaut `announced` aurait affirmé d'une saison de 2019 qu'elle est à venir.
 */
import { fetchCategoryMembers, type WikiConfig } from "./mediawiki.ts";

/** Catégorie de référence, en français. Paramétrable : rien n'y est figé. */
export const DEFAULT_CATEGORY = "Catégorie:Saison de Koh-Lanta";

export interface CataloguePage {
  /** `pageid` MediaWiki, sous forme de texte : c'est l'`external_id` stocké. */
  readonly externalId: string;
  readonly title: string;
  readonly url: string;
  /** Dérivé du titre, stable et lisible : c'est la clé publique de la saison. */
  readonly slug: string;
}

/**
 * Titre de page → identifiant d'URL.
 *
 * Déterministe et sans perte utile : accents dépliés, ponctuation réduite à
 * des tirets, tirets multiples fondus. « Koh-Lanta : L'Île des héros » devient
 * `koh-lanta-l-ile-des-heros`.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** URL lisible d'une page, à partir de son titre. */
export function pageUrl(baseUrl: string, title: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/wiki/${
    encodeURIComponent(title.replace(/ /g, "_"))
  }`;
}

export interface CatalogueOptions {
  readonly category?: string;
  /** Racine du site, pour construire les URL. */
  readonly baseUrl?: string;
}

/**
 * Les pages de saison telles que l'encyclopédie les déclare, à cet instant.
 *
 * Deux garanties, et pas une de plus : chaque entrée a un identifiant stable
 * et un `slug` unique. Un doublon de `slug` — deux titres qui se réduisent au
 * même — est écarté et signalé, parce qu'il écraserait une saison par une
 * autre au moment de l'enregistrement.
 */
export async function fetchSeasonCatalogue(
  config: WikiConfig,
  options: CatalogueOptions = {},
): Promise<{ pages: CataloguePage[]; duplicates: string[] }> {
  const baseUrl = options.baseUrl ?? "https://fr.wikipedia.org";
  const members = await fetchCategoryMembers(
    config,
    options.category ?? DEFAULT_CATEGORY,
  );

  const bySlug = new Map<string, CataloguePage>();
  const duplicates: string[] = [];

  for (const m of members) {
    const slug = slugify(m.title);
    if (!slug) {
      duplicates.push(m.title);
      continue;
    }
    if (bySlug.has(slug)) {
      duplicates.push(m.title);
      continue;
    }
    bySlug.set(slug, {
      externalId: String(m.pageId),
      title: m.title,
      url: pageUrl(baseUrl, m.title),
      slug,
    });
  }

  return {
    pages: [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title, "fr")),
    duplicates,
  };
}

/** Tout ce que la découverte sait écrire dans la base. Rien d'autre n'écrit. */
export interface CataloguePort {
  /** Documents déjà connus, par `externalId`. */
  knownExternalIds(): Promise<readonly string[]>;
  registerSeason(page: CataloguePage): Promise<void>;
  log(action: string, summary: string): Promise<void>;
}

export interface DiscoveryOutcome {
  readonly found: number;
  readonly added: number;
  readonly known: number;
  readonly duplicates: readonly string[];
  readonly addedTitles: readonly string[];
}

/**
 * Enregistre les pages découvertes qui manquent, et RIEN de plus.
 *
 * La découverte n'écrit jamais dans le référentiel : elle ajoute des documents
 * à suivre et des saisons en attente de relecture. Aucun candidat, aucun vote,
 * aucune publication. C'est l'import de chaque page qui proposera un contenu,
 * et un humain qui l'acceptera.
 *
 * Elle ne supprime rien non plus : une page retirée de la catégorie reste
 * suivie. Retirer un document effacerait en cascade des données publiées, sur
 * la foi d'une modification faite par n'importe qui.
 */
export async function discoverSeasons(
  port: CataloguePort,
  config: WikiConfig,
  options: CatalogueOptions = {},
): Promise<DiscoveryOutcome> {
  const { pages, duplicates } = await fetchSeasonCatalogue(config, options);
  const known = new Set(await port.knownExternalIds());

  const addedTitles: string[] = [];
  for (const page of pages) {
    if (known.has(page.externalId)) continue;
    await port.registerSeason(page);
    addedTitles.push(page.title);
  }

  await port.log(
    "catalogue.discover",
    `${pages.length} page(s) déclarée(s), ${addedTitles.length} ajoutée(s)`,
  );

  return {
    found: pages.length,
    added: addedTitles.length,
    known: known.size,
    duplicates,
    addedTitles,
  };
}
