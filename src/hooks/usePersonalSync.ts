/**
 * Le suivi qui suit le compte : favoris et épisodes vus, d'un appareil à
 * l'autre.
 *
 * CE QUE CE HOOK RÉPARE. L'anti-spoiler est la fonction centrale de
 * l'application et il ne franchissait pas l'appareil : un épisode marqué vu
 * sur le téléphone laissait la tablette afficher les éliminés. Les tables
 * (`user_favorites`, `watched_episodes`) et leurs politiques existent depuis
 * les migrations 0003 et 0004 ; c'est le câblage qui manquait.
 *
 * TROIS CONDITIONS, ET AUCUNE N'EST NÉGOCIABLE :
 *
 *  1. un backend configuré — sinon il n'y a pas de serveur à qui parler ;
 *  2. un compte connecté — les lignes sont attachées à `auth.uid()` ;
 *  3. un référentiel qui vient du SERVEUR OU DU CACHE, jamais de la
 *     démonstration. Les identifiants de démonstration (`c-ael`, `e1`) ne sont
 *     pas des uuid : les envoyer ferait échouer chaque insertion sur une
 *     violation de type, et publierait au passage un suivi qui ne veut rien
 *     dire.
 *
 * L'ORDRE COMPTE. Le relais est branché AVANT la fusion : une case cochée
 * pendant que la fusion tourne part au serveur au lieu d'être oubliée, et la
 * fusion étant une union, elle ne la défera pas.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useOnline } from '@mister-guiiug/dev-pwa-config/react/use-online';
import { useSession } from './useSession';
import { useAppStore } from '../store/useAppStore';
import {
  type PersonalRepository,
  type PersonalSnapshot,
  mergeSnapshots,
  missingFrom,
  personalRepository,
} from '../backend/personal';

/** Les deux traductions entre les clés du magasin et celles du serveur. */
interface Keys {
  readonly idOfNumber: ReadonlyMap<number, string>;
  readonly numberOfId: ReadonlyMap<string, number>;
}

export function usePersonalSync(
  repository: PersonalRepository = personalRepository
): void {
  const { account, available } = useSession();
  const referential = useAppStore(s => s.referential);
  const origin = useAppStore(s => s.origin);
  const attach = useAppStore(s => s.attachPersonalRemote);
  const setPersonal = useAppStore(s => s.setPersonal);
  const toast = useToast();
  const online = useOnline();
  /** Le compte déjà fusionné pendant cette session d'écran. */
  const merged = useRef<string | null>(null);

  const keys = useMemo<Keys | null>(() => {
    if (!referential) return null;
    return {
      idOfNumber: new Map(referential.episodes.map(e => [e.number, e.id])),
      numberOfId: new Map(referential.episodes.map(e => [e.id, e.number])),
    };
  }, [referential]);

  const accountId = account?.id ?? null;
  const syncable =
    available && accountId !== null && keys !== null && origin !== 'demo';

  useEffect(() => {
    if (!syncable || !keys || !accountId) {
      // Déconnexion, démonstration, backend absent : l'appareil redevient seul.
      attach(null);
      merged.current = null;
      return undefined;
    }

    let alive = true;

    // Branché d'abord : un geste posé pendant la fusion part quand même.
    attach({
      favorite(contestantId, on) {
        void repository.setFavorite(contestantId, on).catch(() => {
          // Le geste a déjà eu lieu à l'écran et dans le magasin local ; le
          // défaire ici serait pire que l'écart qu'on répare. La prochaine
          // fusion rattrapera un ajout perdu — un retrait perdu, lui, revient,
          // et c'est le prix connu de l'union (voir `personal.ts`).
        });
      },
      watched(episodeNumber, on) {
        const id = keys.idOfNumber.get(episodeNumber);
        if (!id) return;
        void repository.setWatched(id, on).catch(() => {});
      },
    });

    if (merged.current === accountId) return () => attach(null);
    merged.current = accountId;

    void (async () => {
      const before = useAppStore.getState();
      const local: PersonalSnapshot = {
        favorites: [...before.favorites],
        watchedEpisodeIds: before.watched
          .map(n => keys.idOfNumber.get(n))
          .filter((id): id is string => id !== undefined),
      };

      try {
        const server = await repository.pull();
        if (!alive) return;
        await repository.push(missingFrom(server, local));
        if (!alive) return;

        const union = mergeSnapshots(server, local);
        setPersonal({
          favorites: union.favorites,
          watched: union.watchedEpisodeIds
            .map(id => keys.numberOfId.get(id))
            .filter((n): n is number => n !== undefined)
            // Un épisode vu sur un autre appareil peut avoir disparu du
            // référentiel local (cache plus ancien) : on le garde côté serveur,
            // on ne l'invente pas ici.
            .sort((a, b) => a - b),
        });
      } catch {
        // HORS LIGNE, C'EST NORMAL, ET ÇA NE SE DIT PAS. En ligne, c'est un
        // vrai refus du serveur, et le taire laisserait croire que le suivi
        // voyage alors qu'il ne voyage pas. Dans les deux cas le magasin local
        // n'a pas bougé : l'application reste entière.
        if (alive && online) {
          toast.error('Votre suivi n’a pas pu être synchronisé.', {
            duration: 8000,
          });
        }
        merged.current = null;
      }
    })();

    return () => {
      alive = false;
      attach(null);
    };
    // `online` est LU dans le rattrapage d'erreur, pas suivi : le rebranchement
    // à chaque changement de connexion relancerait une fusion pour rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncable, accountId, keys, attach, setPersonal, repository, toast]);
}
