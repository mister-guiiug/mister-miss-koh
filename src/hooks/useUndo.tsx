/**
 * Annuler plutôt que confirmer.
 *
 * LE CONSTAT. La suppression d'une note était déjà LOGIQUE côté serveur
 * (`deleted_at`), mais l'interface demandait une confirmation avant, et
 * n'offrait rien après : la note disparaissait de l'écran pour toujours. Une
 * boîte de dialogue à chaque geste fatigue sans protéger — on répond « oui »
 * par réflexe —, alors qu'un moyen de revenir en arrière protège vraiment.
 *
 * POURQUOI L'ANNULATION ET PAS UNE CORBEILLE. Les deux étaient possibles sur
 * le papier ; une seule l'était SANS TOUCHER À LA BASE. La politique de
 * lecture de `personal_notes` porte `deleted_at is null` : le propriétaire ne
 * peut pas lire ses propres notes supprimées, donc pas les lister. Une
 * corbeille demanderait une politique de lecture de plus — c'est-à-dire une
 * politique PERMISSIVE de plus, combinée par OU avec les autres, exactement le
 * piège que `docs/politiques-rls.md` documente — et une migration à appliquer
 * sur le projet hébergé. La restauration, elle, marche déjà : la politique de
 * MISE À JOUR ne filtre pas sur `deleted_at`.
 *
 * LE SOCLE N'A PAS D'ACTION DANS SES NOTIFICATIONS, et ce fichier ne le
 * modifie pas depuis cette application. Il n'en a pas besoin : `toast.show`
 * accepte un nœud React comme message, un bouton en fait partie, et
 * l'identifiant passé à `show` permet de refermer la notification depuis ce
 * bouton. Le jour où le socle portera une action, ce fichier deviendra un
 * appel de plus — pas une réécriture.
 *
 * CE QUE ÇA NE COUVRE PAS, ET QUI EST DIT. Huit secondes suffisent au
 * mauvais clic, pas à une hésitation de dix minutes. Le compte à rebours est
 * suspendu tant que le pointeur survole la pile ou que le focus s'y trouve
 * (c'est le fournisseur du socle qui le fait, WCAG 2.2.1). Passé ce délai, la
 * note n'est PAS détruite pour autant — la ligne est toujours en base, seule
 * sa date de suppression est posée.
 */
import { useCallback } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';

/** Huit secondes : le temps de lire la notification et de se raviser. */
export const UNDO_MS = 8000;

export interface UndoRequest {
  /**
   * Ce que l'action vise. Deux suppressions successives donnent deux
   * notifications distinctes — un identifiant partagé ferait remplacer la
   * première par la seconde, et la première note deviendrait irrattrapable.
   */
  readonly key: string;
  /** Ce qui vient de se passer. « Note supprimée. » */
  readonly message: string;
  /** Le retour en arrière. Son échec est dit, jamais avalé. */
  readonly undo: () => Promise<unknown>;
  /** Ce qu'on annonce quand le retour en arrière a réussi. */
  readonly undone: string;
}

export type AskUndo = (request: UndoRequest) => void;

export function useUndo(): AskUndo {
  const toast = useToast();

  return useCallback(
    ({ key, message, undo, undone }: UndoRequest) => {
      const id = `annuler-${key}`;
      toast.show(
        <span className="undo">
          <span>{message}</span>
          <button
            type="button"
            className="undo-action"
            onClick={() => {
              // Refermée D'ABORD : laisser l'offre d'annulation à l'écran
              // pendant que l'annulation part inviterait à cliquer deux fois.
              toast.dismiss(id);
              void undo().then(
                () => toast.success(undone),
                (cause: unknown) =>
                  toast.error(
                    cause instanceof Error ? cause.message : String(cause)
                  )
              );
            }}
          >
            Annuler
          </button>
        </span>,
        { tone: 'info', duration: UNDO_MS, id }
      );
    },
    [toast]
  );
}
