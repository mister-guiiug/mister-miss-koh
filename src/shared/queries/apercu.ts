/**
 * La version NON VALIDÉE d'une saison (migration 0039), miroir vers Zustand.
 *
 * Le serveur range, pour le dernier lot qu'un relecteur doit encore trancher,
 * la saison telle qu'elle serait s'il était accepté. Rien n'y est publié : le
 * visiteur qui le demande la voit sur son appareil, à la place de la version
 * publiée, et seulement tant que ce lot attend.
 *
 * Trois règles, que cette fonction applique à chaque lecture publiée :
 * - rien n'attend pour cette saison : pas de proposition, et une demande
 *   passée tombe d'elle-même. Elle valait pour une attente ;
 * - un aperçu est prêt : on le propose (`apercuDisponible`), et on l'affiche
 *   si l'utilisateur l'a demandé pour cette saison ;
 * - la PROVENANCE affichée reste celle du publié. La publication simulée a
 *   noté sa propre date : la montrer ferait dire « données publiées le »
 *   d'une version que personne n'a publiée.
 */
import { backend } from '../../backend/referentialRepository';
import type { Referential } from '../../domain/referential';
import { useAppStore } from '../../store/useAppStore';

/**
 * Une panne du serveur ne change rien à ce qu'on montre : une coupure d'une
 * seconde n'est pas « plus rien n'attend ». Seule une RÉPONSE le dit.
 */
export async function synchroniserApercu(publie: Referential): Promise<void> {
  try {
    await synchroniser(publie);
  } catch {
    // On garde l'écran tel qu'il est ; le tour suivant redemandera.
  }
}

async function synchroniser(publie: Referential): Promise<void> {
  const repo = backend.referential;
  const season = useAppStore.getState().season;
  const toujoursLa = () => useAppStore.getState().season === season;

  if (!publie.provenance.pendingRevision || !repo.previewRevision) {
    const { apercuSaison, apercu } = useAppStore.getState();
    useAppStore.setState({
      apercuDisponible: null,
      apercu: null,
      ...(apercu ? { referential: publie } : {}),
    });
    if (apercuSaison === season) useAppStore.getState().quitterApercu();
    return;
  }

  const identifiant = await repo.previewRevision(season);
  if (!toujoursLa()) return;
  useAppStore.setState({ apercuDisponible: identifiant });

  const demande = useAppStore.getState().apercuSaison === season;
  if (!identifiant || !demande || !repo.loadPreview) {
    // Pas (ou plus) d'aperçu servi (périmé par une décision, pas encore
    // calculé) : la version publiée, et la demande reste en attente.
    if (useAppStore.getState().apercu) {
      useAppStore.setState({ apercu: null, referential: publie });
    }
    return;
  }

  const lu = await repo.loadPreview(season);
  if (!toujoursLa() || useAppStore.getState().apercuSaison !== season) return;
  if (!lu) {
    useAppStore.setState({ apercu: null, referential: publie });
    return;
  }
  useAppStore.setState({
    referential: { ...lu, provenance: publie.provenance },
    apercu: { identifiant, publie },
  });
}
