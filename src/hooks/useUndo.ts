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
 * LE BOUTON EST CELUI DU SOCLE. Ce fichier a d'abord construit son propre
 * bouton dans le message, parce que le toast du socle n'avait alors aucune
 * notion d'action. Il en porte une depuis la 4.5.0 : `show(message,
 * { action })` rend un vrai `<button>` DANS le message, libellé « Annuler »
 * dans la langue de l'app (`labels.toast.undo`), habillé par `components.css`
 * (`[data-dwc='toast-action']`), qui agit PUIS referme la notification dans
 * le même geste — l'offre d'annuler ne reste pas à l'écran pendant que
 * l'annulation part, elle n'invite pas à cliquer deux fois. Il ne reste ici
 * que ce que le socle ne peut pas savoir : quoi annuler, et quoi annoncer
 * ensuite — le rétablissement, ou son échec.
 *
 * LA DURÉE EST UN PLANCHER DU SOCLE. Un toast porteur d'une action vit huit
 * secondes au moins — le temps de lire, de décider et d'atteindre le bouton —
 * et le compte à rebours est suspendu tant que le pointeur survole la pile ou
 * que le focus s'y trouve (WCAG 2.2.1). Ce fichier ne passe donc plus de
 * durée : c'est la même mesure qu'avant, décidée à un seul endroit, et un
 * fournisseur réglé plus haut serait respecté.
 *
 * CE QUE ÇA NE COUVRE PAS, ET QUI EST DIT. Huit secondes suffisent au
 * mauvais clic, pas à une hésitation de dix minutes. Passé ce délai, la note
 * n'est PAS détruite pour autant — la ligne est toujours en base, seule sa
 * date de suppression est posée.
 */
import { useCallback } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';

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
      toast.show(message, {
        id: `annuler-${key}`,
        action: {
          onAction: () => {
            // Un `undo` qui lèverait avant même de rendre sa promesse prend
            // le chemin d'un rejet : la notification est déjà refermée par le
            // socle, l'échec doit être dit.
            void Promise.resolve()
              .then(() => undo())
              .then(
                () => toast.success(undone),
                (cause: unknown) =>
                  toast.error(
                    cause instanceof Error ? cause.message : String(cause)
                  )
              );
          },
        },
      });
    },
    [toast]
  );
}
