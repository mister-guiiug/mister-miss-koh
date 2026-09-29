/**
 * Le nombre d'épisodes à rattraper, sur l'icône de l'application installée.
 *
 * LE RAPPEL SANS LE SPOILER. Une notification d'actualité titre sur
 * l'éliminé du soir ; la pastille ne dit qu'un nombre d'épisodes diffusés —
 * la grille des programmes, rien de ce qui s'y passe. Elle ne demande aucun
 * serveur : l'API Badging suffit, là où le système la propose (application
 * installée ; certains systèmes exigent en plus l'autorisation des
 * notifications, que l'application ne demande pas). Ailleurs, rien ne se
 * passe, et rien n'est dit : ce n'est pas une promesse de l'écran.
 */
import { useEffect } from 'react';
import { episodesBehind } from '../domain/summary';
import { useAppStore } from '../store/useAppStore';

interface Badging {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export function useAppBadge(): void {
  const referential = useAppStore(s => s.referential);
  const watched = useAppStore(s => s.watched);
  const enabled = useAppStore(s => s.appBadge);

  useEffect(() => {
    const nav: Badging = navigator;
    if (!nav.setAppBadge || !nav.clearAppBadge) return;
    const behind = enabled ? episodesBehind(referential, watched) : 0;
    // Un refus (contexte non installé, autorisation absente) n'est pas une
    // erreur de l'application : on l'avale.
    (behind > 0 ? nav.setAppBadge(behind) : nav.clearAppBadge()).catch(
      () => undefined
    );
  }, [referential, watched, enabled]);
}
