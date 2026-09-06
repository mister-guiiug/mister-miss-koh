import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContestantsScreen } from './ContestantsScreen';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';

function renderList() {
  return render(
    <MemoryRouter>
      <ContestantsScreen />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAppStore.setState({
    referential: DEMO_REFERENTIAL,
    ready: true,
    // Tout révélé : la limite anti-spoiler ne doit pas décider à la place du
    // filtre dans ces tests-ci.
    spoiler: 'reveal_all',
    watched: [],
    favorites: [],
    pairGuesses: [],
    contestantFilter: 'en-jeu',
  });
});

describe('l’ordre d’un duo à l’écran', () => {
  it('nomme la dame en premier — et les lignes suivent le titre', () => {
    // LE COUPLAGE EST CE QUI COMPTE : si le titre et les lignes lisaient deux
    // listes, l'un annoncerait un ordre que l'autre contredirait juste en
    // dessous. Elouan (m) et Fanny (f) sont rangés dans cet ordre par la
    // source : c'est le duo qui montre le changement.
    useAppStore.setState({ contestantFilter: 'tous' });
    const { container } = renderList();

    const titre = screen.getByText(/Fanny et Elouan/);
    const groupe = titre.closest('section');
    const noms = Array.from(
      groupe!.querySelectorAll('.list .row a'),
      a => a.textContent
    );

    expect(noms).toEqual(['Fanny', 'Elouan']);
    // Et un duo déjà dans le bon ordre n'est pas retourné pour autant.
    expect(container.textContent).toContain('Céleste et Dimitri');
  });
});

describe('le filtre de statut', () => {
  it('part sur « En jeu », et la liste ne montre que ceux qui restent', () => {
    renderList();

    expect(screen.getByRole('tab', { name: 'En jeu' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const badges = screen.getAllByText(/^(en jeu|sorti·e)$/);
    expect(badges.every(b => b.textContent === 'en jeu')).toBe(true);
  });

  it('le choix est RETENU : il part dans les données personnelles', async () => {
    // C'est ce qui évite de reprendre le filtre à chaque visite — il vit avec
    // les favoris, pas dans l'état de l'écran.
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('tab', { name: 'Sorti·e' }));

    expect(useAppStore.getState().contestantFilter).toBe('sorti');
    const badges = screen.getAllByText(/^(en jeu|sorti·e)$/);
    expect(badges.every(b => b.textContent === 'sorti·e')).toBe(true);
  });

  it('l’écran vide NOMME le filtre qui le vide', () => {
    // Le filtre étant retenu, arriver sur une liste vide sans savoir lequel
    // est posé serait une énigme.
    //
    // Vide À COUP SÛR : rien de vu et « masquer ce que je n'ai pas vu » posent
    // la limite à l'épisode 0, donc personne n'est encore sorti — et « Sorti·e »
    // ne laisse alors personne. Un test qui ne vide qu'« en général » ne
    // vérifierait rien le jour où les données changent.
    useAppStore.setState({
      contestantFilter: 'sorti',
      spoiler: 'hide_unwatched',
      watched: [],
    });
    renderList();

    expect(screen.getByText('Aucun candidat')).toBeInTheDocument();
    expect(
      screen.getByText('Le filtre « Sorti·e » ne laisse personne.')
    ).toBeInTheDocument();
  });

  it('une recherche sans résultat le dit autrement, et cite les deux', async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByLabelText('Filtrer'), 'zzzz');

    expect(screen.getByText('Aucun candidat')).toBeInTheDocument();
    expect(
      screen.getByText(/Aucun nom ne correspond à « zzzz », filtre « En jeu »/)
    ).toBeInTheDocument();
  });
});
