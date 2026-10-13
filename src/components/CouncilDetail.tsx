/**
 * Le détail d'un tour de conseil : les voix par candidat, puis les bulletins.
 *
 * Rendu DANS le garde anti-spoiler de l'épisode, jamais à côté : c'est la
 * soirée elle-même. Les barres sont décoratives (`aria-hidden`) ; le compte
 * est écrit en toutes lettres à côté.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Referential } from '../domain/referential';
import { contestantById } from '../domain/referential';
import type { CouncilView } from '../domain/council';
import { AppAnimation } from '../animations/AppAnimation';

/**
 * LE DÉPOUILLEMENT. Les barres ne se remplissent plus toutes ensemble : une
 * voix après l'autre, de la moins votée à la plus votée, comme on lit les
 * bulletins un à un. Celle de l'éliminé·e se remplit en DERNIER, et la braise
 * s'éteint à côté de son nom une fois la dernière barre posée.
 *
 * Le pas et la durée viennent du CSS (`--pas-voix`, `--motion-slow`) ; la
 * braise, elle, attend en JS, parce qu'une animation Rive ne se retarde pas
 * par une propriété CSS : elle est montée au bon moment.
 */
export const PAS_VOIX_MS = 220;
const BARRE_MS = 380;

function attenteDeLaBraise(barres: number): number {
  if (typeof document === 'undefined') return 0;
  const niveau = document.documentElement.dataset.motion ?? 'full';
  if (niveau !== 'full') return 0;
  return Math.max(0, barres - 1) * PAS_VOIX_MS + BARRE_MS;
}

/** Le `<details>` du conseil : il sait s'il est ouvert, et le dit au détail. */
export function CouncilDisclosure({
  referential,
  view,
  eliminatedId,
}: {
  referential: Referential;
  view: CouncilView;
  eliminatedId: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  // Chaque ouverture rejoue le dépouillement, et donc la braise.
  const [ouverture, setOuverture] = useState(0);
  return (
    <details
      className="council"
      onToggle={e => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        setOuvert(open);
        if (open) setOuverture(o => o + 1);
      }}
    >
      <summary>Détail des voix</summary>
      <CouncilDetail
        referential={referential}
        view={view}
        eliminatedId={eliminatedId}
        ouvert={ouvert}
        ouverture={ouverture}
      />
    </details>
  );
}

export function CouncilDetail({
  referential,
  view,
  eliminatedId = null,
  ouvert = true,
  ouverture = 0,
}: {
  referential: Referential;
  view: CouncilView;
  /** L'éliminé·e du tour, quand il y en a un : sa braise s'éteint. */
  eliminatedId?: string | null;
  /** Le dépouillement se joue à l'OUVERTURE, pas au rendu de l'écran. */
  ouvert?: boolean;
  /** Le numéro de l'ouverture en cours : la braise d'une ouverture passée
      ne vaut pas pour la suivante. */
  ouverture?: number;
}) {
  const name = (id: string | null) =>
    contestantById(referential, id)?.displayName ?? 'Sans cible';
  const atLeast = view.complete ? '' : '≥ ';
  const n = view.tallies.length;
  const [braiseDe, setBraiseDe] = useState(-1);

  useEffect(() => {
    if (!ouvert || !eliminatedId) return;
    const id = window.setTimeout(
      () => setBraiseDe(ouverture),
      attenteDeLaBraise(n)
    );
    return () => window.clearTimeout(id);
  }, [ouvert, ouverture, eliminatedId, n]);
  const braise = ouvert && eliminatedId !== null && braiseDe === ouverture;

  return (
    <div className="council-detail">
      <ul className="council-bars">
        {view.tallies.map((t, i) => {
          const contestant = contestantById(referential, t.targetId);
          const sortant = eliminatedId !== null && t.targetId === eliminatedId;
          return (
            <li
              key={t.targetId ?? 'sans-cible'}
              data-sortant={sortant ? '' : undefined}
              // Le rang du dépouillement : la plus votée (en tête de liste)
              // passe en dernier.
              style={{ '--rang': n - 1 - i } as CSSProperties}
            >
              <span className="council-name">
                {contestant ? (
                  <Link to={`/candidats/${contestant.id}`}>
                    {contestant.displayName}
                  </Link>
                ) : (
                  'Sans cible'
                )}
                {sortant && braise && (
                  <AppAnimation name="torch-out" className="council-braise" />
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
              {b.weight > 1 && (
                <>
                  {' '}
                  <small className="muted">({b.weight} voix)</small>
                </>
              )}
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
