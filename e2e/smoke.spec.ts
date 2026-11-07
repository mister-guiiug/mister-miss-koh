import { expect, test } from '@playwright/test';

/**
 * Le SMOKE : ce qui doit marcher pour qu'une livraison ait un sens.
 *
 * Le tag `@critical` est l'un des deux que la CI de la famille joue
 * (`e2e-grep` vaut `@critical|@a11y` par défaut) : une spec sans lui n'est PAS
 * jouée en intégration continue.
 *
 * LE BACKEND EST LOCAL, sans base ni réseau : aucune variable Supabase n'est
 * posée au build (voir `playwright.config.ts`), l'app sert donc le référentiel
 * de DÉMONSTRATION de `src/backend/demo.ts`. Les prénoms et les dates
 * ci-dessous en viennent ; aucun ne désigne une personne réelle.
 */
test.describe('@critical le cadre', () => {
  test('l’app monte sur le référentiel de démonstration', async ({ page }) => {
    await page.goto('/');

    // ANCRÉ SUR CE QUE SEUL REACT REND. Le HTML servi porte déjà un `h1` et
    // une description (contenu servi du socle) : une app dont le JavaScript
    // ne charge pas affiche quand même un titre. Le nom de la saison, lui,
    // n'existe qu'une fois le référentiel lu par le magasin.
    await expect(
      page.getByRole('heading', {
        name: 'Saison de démonstration',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByText('Donnée fictive de démonstration')
    ).toBeVisible();
    // Et le contenu servi a bien été REMPLACÉ, pas seulement recouvert.
    await expect(page.locator('[data-dwc="served-content"]')).toHaveCount(0);

    // La première ouverture pose ses questions : rien n'est encore coché.
    await expect(
      page.getByRole('region', { name: 'Où en êtes-vous ?' })
    ).toBeVisible();
  });

  test('un épisode coché lève l’anti-spoiler, et le reste au rechargement', async ({
    page,
  }) => {
    await page.goto('/#/episodes');

    const episode1 = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Épisode 1' }) });
    const vu = episode1.getByRole('checkbox', { name: 'Vu' });
    const masque = episode1.getByRole('group', {
      name: 'Contenu masqué (anti-spoiler)',
    });

    // Rien de vu : la soirée est masquée, c'est la promesse de l'app.
    await expect(vu).not.toBeChecked();
    await expect(masque).toBeVisible();

    await vu.check();
    await expect(masque).toHaveCount(0);
    await expect(episode1.getByText('Immunité')).toBeVisible();
    // L'épisode suivant, lui, reste masqué : cocher le 1 ne révèle pas le 2.
    await expect(
      page
        .getByRole('article')
        .filter({ has: page.getByRole('heading', { name: 'Épisode 2' }) })
        .getByRole('group', { name: 'Contenu masqué (anti-spoiler)' })
    ).toBeVisible();

    // Le vrai contrat de la persistance : ce qui est coché se relit après un
    // démarrage à froid, pas seulement dans l'état vivant du magasin.
    await page.reload();
    await expect(vu).toBeChecked();
    await expect(masque).toHaveCount(0);
  });

  test('la barre basse mène aux candidats, aux épisodes et au suivi', async ({
    page,
  }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });

    await nav.getByRole('link', { name: 'Candidats' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Candidats' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Aël', exact: true })
    ).toBeVisible();

    await nav.getByRole('link', { name: 'Épisodes' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Épisodes' })
    ).toBeVisible();

    await nav.getByRole('link', { name: 'Suivi' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Tableau de bord' })
    ).toBeVisible();
  });
});
