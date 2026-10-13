import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Onboarding } from './Onboarding';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';

function open() {
  return render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>
  );
}

describe('la première ouverture', () => {
  beforeEach(() => {
    useAppStore.setState({
      referential: DEMO_REFERENTIAL,
      ready: true,
      spoiler: 'hide_unwatched',
      watched: [],
      favorites: [],
      onboarded: false,
    });
  });

  it('pose trois questions, et chaque réponse agit tout de suite', async () => {
    const user = userEvent.setup();
    const { container } = open();
    // Le numéro est un élément à part (il défile d'une étape à l'autre) :
    // le compteur se lit sur son paragraphe entier.
    const compteur = () => container.querySelector('.onboarding-step');

    // 01 — où en êtes-vous : des numéros et des dates, rien d'autre.
    expect(compteur()).toHaveTextContent('01 / 03');
    expect(
      screen.getByRole('heading', { name: 'Où en êtes-vous ?' })
    ).toBeInTheDocument();
    const choix = screen.getByRole('combobox', { name: 'J’ai vu jusqu’à' });
    expect(
      Array.from(choix.querySelectorAll('option'), o => o.textContent)
    ).toEqual([
      'Je n’ai encore rien vu',
      'Épisode 1 — 25 août 2026',
      'Épisode 2 — 1 sept. 2026',
    ]);
    await user.selectOptions(choix, '1');
    expect(useAppStore.getState().watched).toEqual([1]);

    // 02 — que faut-il masquer.
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    await user.click(
      screen.getByRole('radio', {
        name: 'Masquer les épisodes du jour et à venir',
      })
    );
    expect(useAppStore.getState().spoiler).toBe('hide_future');

    // 03 — qui suivez-vous : les prénoms, sans aucun statut.
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(compteur()).toHaveTextContent('03 / 03');
    expect(screen.queryByText(/éliminé|sorti/i)).toBeNull();
    const [etoile] = screen.getAllByRole('button', { pressed: false });
    if (!etoile) throw new Error('une étoile attendue');
    await user.click(etoile);
    expect(useAppStore.getState().favorites).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'C’est parti' }));
    expect(useAppStore.getState().onboarded).toBe(true);
  });

  it('se passe à tout moment, et ne revient pas', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('button', { name: 'Passer' }));

    expect(useAppStore.getState().onboarded).toBe(true);
    expect(useAppStore.getState().watched).toEqual([]);
  });

  it('revient en arrière sans rien perdre', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    await user.click(screen.getByRole('button', { name: 'Retour' }));

    expect(
      screen.getByRole('heading', { name: 'Où en êtes-vous ?' })
    ).toBeInTheDocument();
  });
});
