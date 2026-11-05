import { Link } from 'react-router-dom';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { AppAnimation } from '../../animations/AppAnimation';

/**
 * CE QUE CET ÉCRAN PROMET, ET RIEN DE PLUS.
 *
 * Il annonçait que « vos notes et favoris se modifient normalement et seront
 * synchronisés au retour du réseau ». Faux deux fois (audit hors ligne du
 * 05/11/2026) : une note vit sur le serveur et nulle part ailleurs, donc
 * aucune ne s'écrit hors connexion ; et les favoris comme les épisodes vus
 * restent sur l'appareil, sans file qui les renverrait au retour du réseau —
 * seule la fusion suivante les rattrape, et un retrait fait hors ligne peut y
 * revenir. L'écran dit donc ce qui marche, et ce qui ne marche pas.
 */
export function OfflineScreen() {
  return (
    <EmptyState
      icon={<AppAnimation name="went-offline" />}
      title="Hors connexion"
      description="La dernière version enregistrée du référentiel reste consultable. Vos favoris et vos épisodes vus se cochent toujours : ils sont gardés sur cet appareil. Vos notes, elles, vivent sur le serveur et demandent une connexion."
      action={
        <Link data-dwc="button" data-variant="outline" data-size="sm" to="/">
          Retour à l’accueil
        </Link>
      }
    />
  );
}
