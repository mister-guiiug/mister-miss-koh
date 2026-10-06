import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingPreviewNotice } from './PendingPreviewNotice';
import { useAppStore } from '../store/useAppStore';
import { DEMO_REFERENTIAL } from '../backend/demo';

const PUBLIE = {
  ...DEMO_REFERENTIAL,
  provenance: {
    ...DEMO_REFERENTIAL.provenance,
    pendingRevision: '240140469',
    observedAt: '2026-10-06T20:46:04Z',
  },
};

const etatInitial = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({
    referential: PUBLIE,
    apercu: null,
    apercuDisponible: null,
  });
});
afterEach(() => {
  useAppStore.setState({
    accepterApercu: etatInitial.accepterApercu,
    quitterApercu: etatInitial.quitterApercu,
  });
});

describe('le bandeau de la version non validée', () => {
  it('rien d’attendu, rien d’affiché', () => {
    const { container } = render(<PendingPreviewNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('un aperçu prêt : il est PROPOSÉ, avec ce qu’il risque, et le geste l’accepte', async () => {
    const accepter = vi.fn(() => Promise.resolve());
    useAppStore.setState({
      apercuDisponible: '240140469:e1',
      accepterApercu: accepter,
    });
    render(<PendingPreviewNotice />);

    expect(screen.getByText(/attend une validation/)).toBeInTheDocument();
    expect(screen.getByText(/pas encore été vérifiée/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Afficher la version non validée' })
    );
    expect(accepter).toHaveBeenCalledOnce();
  });

  it('affiché : il le DIT, et on revient à la version publiée', async () => {
    const quitter = vi.fn();
    useAppStore.setState({
      apercu: { identifiant: '240140469:e1', publie: PUBLIE },
      apercuDisponible: '240140469:e1',
      quitterApercu: quitter,
    });
    render(<PendingPreviewNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Version non validée.'
    );
    expect(
      screen.queryByRole('button', { name: 'Afficher la version non validée' })
    ).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Revenir à la version publiée' })
    );
    expect(quitter).toHaveBeenCalledOnce();
  });
});
