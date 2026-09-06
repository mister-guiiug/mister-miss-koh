/**
 * Le binôme d'un candidat : celui que la source nomme, ou celui que vous
 * supposez — et jamais l'un pris pour l'autre.
 *
 * L'ORDRE DE LECTURE EST L'ORDRE D'AUTORITÉ. Le duo de la source vient en
 * premier, sous le garde anti-spoiler qui a toujours décidé de le montrer ou
 * de proposer de le révéler. La supposition ne s'affiche que là où la source
 * se tait — et quand elle a fini par parler, l'écran dit ce que la
 * supposition est devenue plutôt que de l'effacer sans rien dire.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useAppStore } from '../store/useAppStore';
import { useSpoilerLimit } from '../hooks/useSpoilerLimit';
import {
  eligiblePartners,
  type GuessRefusal,
  partnerView,
} from '../domain/pairing';
import type { Contestant } from '../domain/referential';
import { SpoilerGuard } from './SpoilerGuard';

/** Ce qu'on dit quand une supposition est refusée. Elle ne devrait pas l'être :
 *  la liste ne propose que des binômes recevables. C'est le filet. */
const REFUSAL_LABEL: Record<GuessRefusal, string> = {
  'meme-personne': 'Un candidat ne fait pas duo avec lui-même.',
  'candidat-inconnu': 'Ce candidat n’est pas dans le référentiel.',
  'deja-un-binome': 'La source a déjà nommé le binôme de l’un des deux.',
  'deja-suppose': 'L’un des deux est déjà dans un duo supposé.',
};

export function PairBlock({ contestant }: { contestant: Contestant }) {
  const referential = useAppStore(s => s.referential);
  const guesses = useAppStore(s => s.pairGuesses);
  const guessPair = useAppStore(s => s.guessPair);
  const forgetPairGuess = useAppStore(s => s.forgetPairGuess);
  const limit = useSpoilerLimit();
  const toast = useToast();
  const [choice, setChoice] = useState('');

  const view = useMemo(
    () =>
      referential
        ? partnerView(referential, guesses, limit, contestant.id)
        : null,
    [referential, guesses, limit, contestant.id]
  );
  const eligible = useMemo(
    () =>
      referential
        ? eligiblePartners(referential, guesses, limit, contestant.id)
        : [],
    [referential, guesses, limit, contestant.id]
  );

  if (!referential || !view) return null;

  const sourcePair =
    referential.pairs.find(p => p.memberIds.includes(contestant.id)) ?? null;
  const guessed = view.origin === 'guess' ? view.partner : null;

  const submit = () => {
    if (!choice) return;
    const refusal = guessPair(contestant.id, choice, limit);
    if (refusal) {
      toast.error(REFUSAL_LABEL[refusal]);
      return;
    }
    setChoice('');
    toast.success('Duo supposé.');
  };

  return (
    <div className="pair-block">
      {sourcePair && (
        // La source ne liste pas les duos : celui-ci n'est connu que parce
        // qu'un départ l'a nommé. Le montrer plus tôt divulgâcherait ce
        // départ — d'où le garde, inchangé.
        <SpoilerGuard
          episodeNumber={sourcePair.revealEpisodeNumber}
          label="Révéler le binôme"
        >
          <p>
            Binôme :{' '}
            {view.partner ? (
              <Link to={`/candidats/${view.partner.id}`}>
                {view.partner.displayName}
              </Link>
            ) : (
              '—'
            )}{' '}
            {view.confirmed && (
              <Badge tone="success" size="xs">
                vous l’aviez supposé
              </Badge>
            )}
          </p>
        </SpoilerGuard>
      )}

      {view.contradicted && (
        <p className="muted pair-guess-line">
          Vous aviez supposé{' '}
          <Link to={`/candidats/${view.contradicted.id}`}>
            {view.contradicted.displayName}
          </Link>
          .{' '}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => forgetPairGuess(contestant.id)}
          >
            Retirer
          </Button>
        </p>
      )}

      {guessed && (
        <p className="pair-guess-line">
          Binôme supposé :{' '}
          <Link to={`/candidats/${guessed.id}`}>{guessed.displayName}</Link>{' '}
          <Badge tone="warning" size="xs">
            supposé
          </Badge>{' '}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => forgetPairGuess(contestant.id)}
          >
            Retirer
          </Button>
        </p>
      )}

      {/* Proposer un binôme n'a de sens que là où l'écran n'en montre aucun.
          La liste ne retire QUE les candidats dont un duo est visible : en
          écarter un dont le duo est révélé plus tard le divulguerait. */}
      {!guessed && view.origin !== 'source' && eligible.length > 0 && (
        <div className="pair-picker">
          <label className="field">
            <span>
              <Users size={16} aria-hidden /> Supposer un binôme
            </span>
            <select value={choice} onChange={e => setChoice(e.target.value)}>
              <option value="">Choisir…</option>
              {eligible.map(c => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={!choice}
            onClick={submit}
          >
            Supposer ce duo
          </Button>
          <p className="muted">
            Une supposition reste sur cet appareil : elle ne change pas le
            référentiel, et la source la remplacera dès qu’elle nommera ce duo.
          </p>
        </div>
      )}
    </div>
  );
}
