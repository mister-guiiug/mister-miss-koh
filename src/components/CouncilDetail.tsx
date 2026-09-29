/**
 * Le détail d'un tour de conseil : les voix par candidat, puis les bulletins.
 *
 * Rendu DANS le garde anti-spoiler de l'épisode, jamais à côté : c'est la
 * soirée elle-même. Les barres sont décoratives (`aria-hidden`) ; le compte
 * est écrit en toutes lettres à côté.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Referential } from '../domain/referential';
import { contestantById } from '../domain/referential';
import type { CouncilView } from '../domain/council';

export function CouncilDetail({
  referential,
  view,
}: {
  referential: Referential;
  view: CouncilView;
}) {
  const name = (id: string | null) =>
    contestantById(referential, id)?.displayName ?? 'Sans cible';
  const atLeast = view.complete ? '' : '≥ ';

  return (
    <div className="council-detail">
      <ul className="council-bars">
        {view.tallies.map(t => {
          const contestant = contestantById(referential, t.targetId);
          return (
            <li key={t.targetId ?? 'sans-cible'}>
              <span className="council-name">
                {contestant ? (
                  <Link to={`/candidats/${contestant.id}`}>
                    {contestant.displayName}
                  </Link>
                ) : (
                  'Sans cible'
                )}
              </span>
              <span
                className="council-bar"
                aria-hidden
                style={
                  {
                    '--votes': t.votes / view.max,
                    '--struck': t.struck / view.max,
                  } as CSSProperties
                }
              >
                <span className="council-fill" />
                <span className="council-struck" />
              </span>
              <span className="council-count">
                {atLeast}
                {`${t.votes} voix`}
                {t.struck > 0 &&
                  `, ${t.struck} barrée${t.struck > 1 ? 's' : ''}`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="council-ballots-title">Qui a voté contre qui</p>
      <ul className="council-ballots">
        {view.ballots.map((b, index) => {
          const line = (
            <>
              {name(b.voterId)} <span aria-hidden>→</span>
              <span className="sr-only"> a voté contre </span>{' '}
              {name(b.targetId)}
            </>
          );
          return (
            // Deux bulletins identiques sont possibles (un vote répété au
            // second tour se range dans un autre tour) : l'index départage.
            <li key={`${b.voterId}-${index}`}>
              {b.struck ? (
                <>
                  <s>{line}</s> <small className="muted">(barrée)</small>
                </>
              ) : (
                line
              )}
            </li>
          );
        })}
      </ul>
      {!view.complete && (
        <p className="muted">
          « ≥ » : la source ne détaille pas toutes les voix de ce tour.
        </p>
      )}
    </div>
  );
}
