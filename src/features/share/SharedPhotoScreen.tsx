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
import { Download, Eye, Flame, UserRoundCheck } from 'lucide-react';
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
import { useAppStore } from '../../store/useAppStore';
import { usePhotosStore } from '../../store/usePhotosStore';

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
  const [busy, setBusy] = useState(false);
  const [pose, setPose] = useState(false);
  const referential = useAppStore(s => s.referential);
  const attach = usePhotosStore(s => s.attach);

  // Le candidat que ce portrait montre — s'il est dans le référentiel CHARGÉ.
  // Un partage créé contre le serveur et ouvert sur la démonstration ne
  // trouvera personne : on se tait alors, plutôt que de nommer un inconnu.
  const cible =
    state.step === 'taken' && state.photo.contestantId
      ? (referential?.contestants.find(
          c => c.id === state.photo.contestantId
        ) ?? null)
      : null;

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

  /**
   * Poser la photo sur la fiche, sans passer par les fichiers de l'appareil.
   *
   * Le partage dit DÉJÀ qui il montre (0022 le range, 0025 le rend) : faire
   * enregistrer puis redéposer à la main, c'était deux gestes pour une
   * information que le serveur avait. La photo rejoint le dépôt local — la
   * même route que le sélecteur d'image de la fiche, donc le même
   * ré-encodage, la même vignette, le même retrait des métadonnées.
   */
  const applique = () => {
    if (state.step !== 'taken' || !cible) return;
    const nom = photoFileName(cible.displayName, state.photo.blob.type);
    setBusy(true);
    void attach(
      cible.id,
      new File([state.photo.blob], nom, {
        type: state.photo.blob.type,
      })
    )
      .then(() => {
        setPose(true);
        toast.success(`Portrait de ${cible.displayName} mis à jour.`);
      })
      .catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setBusy(false));
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
            et sur votre appareil si vous la gardez.{' '}
            {formatBytes(state.photo.blob.size)}.
          </p>
          <div className="photo-actions">
            {/* LA ROUTE COURTE D'ABORD : c'est celle qu'on veut neuf fois sur
                dix, et elle évite l'aller-retour par les téléchargements. */}
            {cible && !pose && (
              <Button disabled={busy} onClick={applique}>
                <UserRoundCheck size={16} aria-hidden />
                {`Mettre sur la fiche de ${cible.displayName}`}
              </Button>
            )}
            <Button variant="outline" onClick={save}>
              <Download size={16} aria-hidden />
              Enregistrer l’image
            </Button>
          </div>
          {pose && cible && (
            <p role="status" className="muted">
              Le portrait de {cible.displayName} est à jour sur cet appareil.{' '}
              <Link to={`/candidats/${cible.id}`}>Voir sa fiche</Link>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
