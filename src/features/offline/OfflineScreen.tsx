import { Link } from 'react-router-dom';
import { EmptyState } from '@mister-guiiug/dev-wpa-config/react/empty-state';
import { AppAnimation } from '../../animations/AppAnimation';

export function OfflineScreen() {
  return (
    <EmptyState
      icon={<AppAnimation name="went-offline" />}
      title="Hors connexion"
      description="La dernière version enregistrée du référentiel reste consultable ; vos notes et favoris se modifient normalement et seront synchronisés au retour du réseau."
      action={<Link to="/">Retour à l’accueil</Link>}
    />
  );
}
