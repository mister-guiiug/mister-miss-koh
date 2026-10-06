import { useState } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { useAppStore } from '../store/useAppStore';

/**
 * LA VERSION EN ATTENTE DE VALIDATION, PROPOSÉE À QUI LA VEUT.
 *
 * Le soir d'un épisode, la relecture de Wikipédia trouve souvent un lot
 * qu'elle ne peut pas publier seule : il attend un relecteur, et le site
 * montre la version précédente. Le serveur range la saison telle qu'elle
 * serait si ce lot était accepté (migration 0039) ; ce bandeau la propose.
 *
 * Le choix vaut pour cet appareil, et tombe de lui-même quand plus rien
 * n'attend. Ce qu'on montre n'a été relu par personne : le bandeau le dit
 * avant le geste, et reste là tant que la version non validée est affichée.
 */
export function PendingPreviewNotice() {
  const referential = useAppStore(s => s.referential);
  const apercu = useAppStore(s => s.apercu);
  const disponible = useAppStore(s => s.apercuDisponible);
  const accepter = useAppStore(s => s.accepterApercu);
  const quitter = useAppStore(s => s.quitterApercu);
  const [busy, setBusy] = useState(false);

  const relueLe = referential?.provenance.observedAt
    ? ` le ${formatDate(referential.provenance.observedAt)}`
    : '';

  if (apercu) {
    return (
      <div role="status" className="notice stack" data-apercu="affiche">
        <p>
          <strong>Version non validée.</strong> Vous voyez la saison telle
          qu’elle serait si la page Wikipédia relue{relueLe} était acceptée.
          Personne ne l’a encore vérifiée.
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={quitter}>
            Revenir à la version publiée
          </Button>
        </div>
      </div>
    );
  }

  if (!disponible) return null;

  return (
    <div className="notice stack" data-apercu="propose">
      <p>
        Une version plus récente de la saison attend une validation : la page
        Wikipédia a été relue{relueLe}.
      </p>
      <p className="muted">
        Elle n’a pas encore été vérifiée : une erreur, ou une modification
        malveillante de la page, peut s’y trouver. Le choix vaut pour cet
        appareil, et cesse de lui-même quand la version est publiée.
      </p>
      <div>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          onClick={() => {
            setBusy(true);
            void accepter().finally(() => setBusy(false));
          }}
        >
          Afficher la version non validée
        </Button>
      </div>
    </div>
  );
}
