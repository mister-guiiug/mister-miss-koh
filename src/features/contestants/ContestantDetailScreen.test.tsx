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
});
