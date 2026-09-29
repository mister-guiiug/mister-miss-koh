import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  isAnalyticsLoaded,
  resetAnalytics,
} from '@mister-guiiug/dev-pwa-config/analytics';
import {
  readConsentChoice,
  writeConsentChoice,
} from '@mister-guiiug/dev-pwa-config/react/consent-banner';
import { CLE_DE_TEST } from '@mister-guiiug/dev-pwa-config/testing/posthog';
import { App } from '../../App';
import { useAppStore } from '../../store/useAppStore';

/**
 * La mesure d’audience s’accepte en un clic au bandeau : elle doit se retirer
 * aussi simplement depuis les Réglages (RGPD, art. 7.3). L’écran est rendu
 * par l’application entière, comme dans `App.test.tsx` : c’est elle qui pose
 * les fournisseurs dont il a besoin.
 */

// L’accord rejoué au montage charge la bibliothèque : la vraie partirait
// joindre PostHog depuis jsdom. Le double du socle se souvient d’un retrait.
vi.mock('posthog-js/dist/module.slim.js', async () => {
  const { fauxPosthog } =
    await import('@mister-guiiug/dev-pwa-config/testing/posthog');
  return { default: fauxPosthog() };
});

beforeEach(() => {
  localStorage.clear();
  // Le magasin est un module : chaque test repart d’un référentiel non chargé.
  useAppStore.setState({
    ready: false,
    loading: false,
    error: null,
    referential: null,
    origin: null,
    notice: null,
  });
  window.location.hash = '#/reglages';
  vi.stubEnv('VITE_POSTHOG_KEY', CLE_DE_TEST);
  // L’état de la mesure est celui d’un module : il survivrait d’un test à
  // l’autre.
  resetAnalytics();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.location.hash = '';
});

describe('Réglages — la mesure d’audience', () => {
  it('un accord donné au bandeau se retire ici, en un clic', async () => {
    const user = userEvent.setup();
    writeConsentChoice('granted');
    render(<App />);

    // Les Réglages sont chargés à la demande : on laisse le temps au morceau.
    const titre = await screen.findByRole(
      'heading',
      { name: 'Mesure d’audience' },
      { timeout: 5000 }
    );
    const section = titre.closest('section')!;
    expect(within(section).getByRole('status')).toHaveTextContent(
      'Vous avez accepté cette mesure.'
    );
    // L’accord rejoué a chargé la bibliothèque (le double).
    await waitFor(() => expect(isAnalyticsLoaded()).toBe(true));

    await user.click(
      within(section).getByRole('button', {
        name: 'Retirer mon consentement',
      })
    );

    expect(readConsentChoice()).toBe('denied');
    const posthog = (await import('posthog-js/dist/module.slim.js')).default;
    expect(posthog.has_opted_out_capturing()).toBe(true);
    expect(within(section).getByRole('status')).toHaveTextContent(
      'Vous avez refusé cette mesure.'
    );
  });
});
