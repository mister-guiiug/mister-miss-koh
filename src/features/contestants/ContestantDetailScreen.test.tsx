import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { ContestantDetailScreen } from './ContestantDetailScreen';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';

function renderAt(id: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/candidats/${id}`]}>
        <Routes>
          <Route path="/candidats/:id" element={<ContestantDetailScreen />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('ContestantDetailScreen', () => {
  beforeEach(() => {
    useAppStore.setState({
      referential: DEMO_REFERENTIAL,
      ready: true,
      spoiler: 'reveal_all',
      watched: [],
      favorites: [],
    });
  });

  it('mène à ce qu’on vient LIRE, pas aux boutons de la photo', () => {
    // Cinq boutons et deux paragraphes d'explication occupaient le haut de la
    // fiche et repoussaient plus bas les saisons précédentes, le binôme et la
    // source. Ils sont maintenant après, et repliés.
    const { container } = renderAt('c-ael');

    const outils = container.querySelector('details.photo-tools');
    expect(outils).not.toBeNull();
    expect(outils).not.toHaveAttribute('open');
    expect(screen.getByText('Photo et partage')).toBeInTheDocument();

    // L'ORDRE, pas seulement la présence : le CV vient AVANT les outils.
    const cv = screen.getByText('Saisons précédentes');
    expect(
      cv.compareDocumentPosition(outils!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Et le dépôt d'une photo est bien DANS le repli, pas à côté. Ce n'est pas
    // un bouton mais un `<input type="file">` habillé : le script de captures
    // et le clavier le trouvent, un bouton simulé les perdrait.
    expect(outils).toContainElement(screen.getByText('Ajouter une photo'));
  });

  it('le CV liste les saisons précédentes, une par ligne, dans l’ordre de la source', () => {
    renderAt('c-ael');
    const lines = Array.from(
      document.querySelectorAll('.cv-seasons li'),
      li => li.textContent
    );
    expect(lines).toEqual(['Saison fictive 3']);
    expect(screen.getByText('en jeu')).toBeInTheDocument();
  });

  it('sans page source (démonstration), pas de lien Wikipédia ; avec, un lien direct vers la section des candidats', () => {
    renderAt('c-ael');
    expect(
      screen.queryByRole('link', { name: /Voir sur Wikipédia/ })
    ).toBeNull();

    act(() => {
      useAppStore.setState({
        referential: {
          ...DEMO_REFERENTIAL,
          provenance: {
            ...DEMO_REFERENTIAL.provenance,
            kind: 'wikipedia',
            url: 'https://fr.wikipedia.org/wiki/Saison_fictive',
          },
        },
      });
    });
    expect(
      screen.getByRole('link', { name: /Voir sur Wikipédia/ })
    ).toHaveAttribute(
      'href',
      'https://fr.wikipedia.org/wiki/Saison_fictive#Candidats'
    );
  });

  it('le dépôt d’une photo n’est pas dans la colonne d’identité', () => {
    // Rendu là, le bouton commençait 88 px plus à droite que le titre, le
    // partage, le binôme et le lien source — un seul contrôle en retrait dans
    // une carte où tout le reste s'aligne. Ce test fige le bord retrouvé ;
    // la mesure, elle, ne se voit qu'à l'écran.
    const { container } = renderAt('c-ael');

    const colonne = container.querySelector('.identity-main');
    expect(colonne).not.toBeNull();
    expect(colonne?.querySelector('.photo-picker')).toBeNull();
    expect(container.querySelector('.photo-picker')).not.toBeNull();
  });

  it('la carte d’identité porte le rythme vertical de ses blocs', () => {
    // Sans cette classe, ses blocs se touchent : `.stats` pose `margin: 0` à
    // spécificité égale et plus loin dans la feuille, donc aucune marge posée
    // ici ne les sépare — c'est un `gap` de conteneur qui le fait, et il ne
    // s'applique qu'à cette carte-là.
    const { container } = renderAt('c-ael');

    const carte = container.querySelector('.identity-card');
    expect(carte).not.toBeNull();
    expect(carte?.querySelector('.photo-picker')).not.toBeNull();
    expect(carte?.querySelector('.stats')).not.toBeNull();
  });
});
