/**
 * Ce qu'un lien de photo éphémère ouvre — une fois, pour n'importe qui.
 *
 * L'OUVERTURE DE LA PAGE NE CONSOMME RIEN. C'est le point qui décide de tout
 * cet écran : les messageries préchargent les liens qu'on leur confie, et un
 * aperçu de conversation brûlerait la photo avant que son destinataire la
 * voie. La consommation est donc derrière un GESTE — un appel `rpc`,
 * c'est-à-dire un POST, que nul robot d'aperçu ne fait.
 *
 * ET ELLE EST DÉFINITIVE. On le dit AVANT, pas après : ce bouton n'est pas
 * « afficher », c'est « prendre ». Après quoi le seul exemplaire qui reste est
 * celui qu'on aura enregistré.
 *
 * UN SEUL MESSAGE POUR TROIS ÉCHECS — inconnu, déjà ouvert, périmé. Ce n'est
 * pas une précaution de discrétion, c'est une CONSÉQUENCE : la ligne est
 * supprimée, pas marquée, donc le serveur lui-même ne sait plus laquelle des
 * trois. Distinguer supposerait de garder la trace de ce qu'on a promis
 * d'effacer.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Eye, Flame } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { downloadBlob } from '@mister-guiiug/dev-pwa-config/download';
import { formatBytes } from '@mister-guiiug/dev-pwa-config/format';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import {
  photoShareRepository,
  type ConsumedPhoto,
} from '../../backend/photoShare';
import { photoFileName } from '../../domain/sharing';

type State =
  | { step: 'offered' }
  | { step: 'opening' }
  | { step: 'taken'; photo: ConsumedPhoto; url: string }
  | { step: 'gone' };

/** La question « est-ce seulement une adresse de partage ? » se tranche au rendu. */
export function SharedPhotoScreen() {
  const { token } = useParams();
  if (!token) {
    return (
      <div className="stack">
        <h2>Photo partagée</h2>
        <EmptyState
          title="Ce lien n’ouvre rien"
          description="Cette adresse n’est pas celle d’un partage."
          action={<Link to="/">Aller à l’accueil</Link>}
        />
      </div>
    );
  }
  return <SharedPhoto token={token} />;
}

function SharedPhoto({ token }: { token: string }) {
  const toast = useToast();
  const [state, setState] = useState<State>({ step: 'offered' });

  // L'URL d'objet retient son blob tant qu'on ne la relâche pas — et cette
  // page n'en aura jamais d'autre.
  useEffect(() => {
    if (state.step !== 'taken') return;
    const url = state.url;
    return () => URL.revokeObjectURL(url);
  }, [state]);

  const take = () => {
    setState({ step: 'opening' });
    photoShareRepository
      .consume(token)
      .then(photo => {
        setState(
          photo
            ? { step: 'taken', photo, url: URL.createObjectURL(photo.blob) }
            : { step: 'gone' }
        );
      })
      .catch((cause: unknown) => {
        // Un échec RÉSEAU n'est pas un lien mort : le dire « éteint » ferait
        // renoncer quelqu'un dont le lien est encore parfaitement valide.
        setState({ step: 'offered' });
        toast.error(
          cause instanceof Error ? cause.message : 'L’ouverture a échoué.'
        );
      });
  };

  const save = () => {
    if (state.step !== 'taken') return;
    const name = photoFileName(
      state.photo.label ?? 'photo',
      state.photo.blob.type
    );
    if (!downloadBlob(state.photo.blob, name)) {
      toast.error('L’enregistrement n’a pas pu démarrer.');
    }
  };

  return (
    <div className="stack">
      <h2>Photo partagée</h2>

      {(state.step === 'offered' || state.step === 'opening') && (
        <Card className="photo-offer">
          <p>
            <Flame size={18} aria-hidden /> Quelqu’un vous a confié une photo{' '}
            <strong>pour une seule ouverture</strong>.
          </p>
          <p className="muted">
            L’afficher l’efface du serveur : ce lien ne servira plus, ni à vous,
            ni à personne d’autre. Pensez à l’enregistrer ensuite si vous voulez
            la garder — et si la page se ferme entre-temps, elle sera perdue.
          </p>
          <Button
            disabled={state.step === 'opening'}
            onClick={take}
            aria-label="Voir la photo, une seule fois"
          >
            <Eye size={16} aria-hidden />
            {state.step === 'opening' ? 'Ouverture…' : 'Voir la photo'}
          </Button>
        </Card>
      )}

      {state.step === 'gone' && (
        <EmptyState
          title="Ce lien n’ouvre plus rien"
          description="Il a déjà été ouvert, ou il a plus d’un jour. Le serveur n’en garde aucune trace : il faut en demander un nouveau."
          action={<Link to="/">Aller à l’accueil</Link>}
        />
      )}

      {state.step === 'taken' && (
        <Card className="photo-taken">
          {/* `alt` : ce que le partage en dit, jamais une description
              inventée — personne ici ne sait ce que l'image montre. */}
          <img
            className="photo-received"
            src={state.url}
            alt={state.photo.label ?? 'Photo partagée'}
          />
          {state.photo.label && (
            <p className="photo-legend">{state.photo.label}</p>
          )}
          <p className="muted">
            Ce lien est éteint. Cette image n’existe plus que dans cette page —
            et sur votre appareil si vous l’enregistrez.{' '}
            {formatBytes(state.photo.blob.size)}.
          </p>
          <Button variant="outline" onClick={save}>
            <Download size={16} aria-hidden />
            Enregistrer l’image
          </Button>
        </Card>
      )}
    </div>
  );
}
