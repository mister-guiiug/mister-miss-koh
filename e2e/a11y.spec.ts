import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoA11yViolations } from '@mister-guiiug/dev-pwa-config/playwright-a11y';

/**
 * axe-core sur les trois écrans où l'on passe le plus de temps : l'accueil
 * (première ouverture comprise), les candidats, les épisodes.
 *
 * CHAQUE AUDIT ATTEND SON ÉCRAN. Lancé au `load`, axe auditerait l'écran
 * d'attente (« Chargement du référentiel ») ou le contenu servi du socle — et
 * sortirait vert sur une page que personne ne lit. L'ancre est toujours un
 * élément que seul React rend.
 *
 * LES DEUX THÈMES. L'app suit `prefers-color-scheme` (`defaultTheme="system"`)
 * : un contraste juste en clair peut être faux en sombre, et aucune autre
 * suite du parc ne l'auditait.
 */
const ECRANS: { nom: string; url: string; ancre: (page: Page) => unknown }[] = [
  {
    nom: 'accueil',
    url: '/',
    ancre: page =>
      expect(
        page.getByRole('region', { name: 'Où en êtes-vous ?' })
      ).toBeVisible(),
  },
  {
    nom: 'candidats',
    url: '/#/candidats',
    ancre: page =>
      expect(
        page.getByRole('link', { name: 'Aël', exact: true })
      ).toBeVisible(),
  },
  {
    nom: 'épisodes',
    url: '/#/episodes',
    ancre: page =>
      expect(
        page.getByRole('heading', { name: 'Épisode 1', exact: true })
      ).toBeVisible(),
  },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`@a11y accessibilité, thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.use({ colorScheme: theme });

    for (const ecran of ECRANS) {
      test(`${ecran.nom} sans violation WCAG A/AA`, async ({ page }) => {
        await page.goto(ecran.url);
        await ecran.ancre(page);
        await expectNoA11yViolations(page, AxeBuilder, expect);
      });
    }
  });
}
