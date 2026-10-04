/**
 * D'où vient ce que l'écran affiche — pour CHAQUE référentiel, et sans le
 * présenter comme officiel. Wikipédia est collaboratif ; la démonstration est
 * fictive ; l'un et l'autre se disent.
 */
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import type { Provenance as ProvenanceData } from '../domain/referential';

export function Provenance({ data }: { data: ProvenanceData }) {
  if (data.kind === 'demo') {
    return (
      <p className="provenance">
        <Badge tone="warning">Donnée fictive de démonstration</Badge>{' '}
        <span>
          Aucun de ces noms n’est réel. Configurez un backend pour lire un
          référentiel publié.
        </span>
      </p>
    );
  }

  return (
    <p className="provenance">
      <Badge tone="info">Source collaborative</Badge>{' '}
      <span>
        {data.label}
        {data.url && (
          <>
            {' — '}
            <a href={data.url} target="_blank" rel="noopener noreferrer">
              {data.title ? `page « ${data.title} »` : 'page source'}
            </a>
          </>
        )}
        {data.revision && <> · révision publiée {data.revision}</>}
        {data.fetchedAt && <> · publiées le {formatDate(data.fetchedAt)}</>}
        {data.pendingRevision && (
          <>
            {' '}
            · révision {data.pendingRevision} relue
            {data.observedAt && <> le {formatDate(data.observedAt)}</>}, en
            attente de publication
          </>
        )}
        {'. Ces informations ne sont pas officielles.'}
      </span>
    </p>
  );
}
