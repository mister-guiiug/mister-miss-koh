/**
 * Écrire ou corriger une note : le même formulaire partout.
 *
 * Un titre facultatif, un texte, une appréciation de une à cinq étoiles — les
 * trois colonnes que le schéma offre déjà (`personal_notes.title`, `body`,
 * `rating`), dont l'écran Notes n'exposait que la deuxième. Le compteur suit
 * la limite du schéma ; Ctrl+Entrée enregistre, parce qu'une note se tape
 * souvent pendant un épisode, d'une main.
 */
import {
  useCallback,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Star } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { getDefaultLocale } from '@mister-guiiug/dev-pwa-config/format';

export interface NoteValues {
  readonly title: string | null;
  readonly body: string;
  readonly rating: number | null;
}

interface Props {
  initial?: Partial<NoteValues>;
  onSubmit: (values: NoteValues) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  submitLabel?: string;
  /**
   * Le champ texte prend le focus au montage. Le bouton « Modifier » ou
   * « Ajouter une note » vient de disparaître en s'activant : sans ce
   * déplacement, le focus retomberait sur le document et un utilisateur au
   * clavier perdrait sa place. Par une référence, pas `autoFocus` : un champ
   * qui vole le focus à l'ouverture d'un écran est un autre geste.
   */
  focusOnMount?: boolean;
  /** Une condition de plus pour enregistrer (une cible choisie, par exemple). */
  canSubmit?: boolean;
  /** Rendu EN TÊTE du formulaire : le choix de la cible, quand il y en a un. */
  children?: ReactNode;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 20000;
const RATINGS = [1, 2, 3, 4, 5] as const;

export function NoteEditor({
  initial,
  onSubmit,
  onCancel,
  busy = false,
  submitLabel = 'Enregistrer',
  focusOnMount = false,
  canSubmit = true,
  children,
}: Props) {
  const id = useId();
  // Référence STABLE, sinon React la rejouerait à chaque frappe.
  const textareaRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (focusOnMount) el?.focus();
    },
    [focusOnMount]
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);

  const ready = body.trim().length > 0 && !busy && canSubmit;

  const submit = () => {
    if (!ready) return;
    void onSubmit({
      title: title.trim() === '' ? null : title.trim(),
      body: body.trim(),
      rating,
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="note-editor stack"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      {children}
      <label className="field">
        <span>Titre (facultatif)</span>
        <input
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Un mot pour la retrouver"
        />
      </label>

      <label className="field">
        <span>Note</span>
        <textarea
          rows={4}
          value={body}
          maxLength={BODY_MAX}
          onChange={e => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ce que vous voulez retenir… (Ctrl+Entrée pour enregistrer)"
          ref={textareaRef}
          aria-describedby={`${id}-count`}
        />
        <small id={`${id}-count`} className="muted note-count">
          {body.length.toLocaleString(getDefaultLocale())} /{' '}
          {BODY_MAX.toLocaleString(getDefaultLocale())}
        </small>
      </label>

      {/* Les étoiles sont de vrais boutons radio : le clavier les parcourt
          avec les flèches, et « Sans note » est un choix explicite. */}
      <fieldset className="stars">
        <legend>Appréciation</legend>
        {RATINGS.map(value => (
          <label key={value} className="star">
            <input
              type="radio"
              name={`${id}-rating`}
              value={value}
              checked={rating === value}
              onChange={() => setRating(value)}
              // Ctrl+Entrée enregistre aussi depuis une étoile : là où le
              // doigt vient de se poser.
              onKeyDown={onKeyDown}
            />
            <Star
              size={22}
              aria-hidden
              fill={
                rating !== null && value <= rating ? 'currentColor' : 'none'
              }
            />
            <span className="sr-only">
              {value} étoile{value > 1 ? 's' : ''}
            </span>
          </label>
        ))}
        <label className="star star-none">
          <input
            type="radio"
            name={`${id}-rating`}
            value=""
            checked={rating === null}
            onChange={() => setRating(null)}
            onKeyDown={onKeyDown}
          />
          <span>Sans note</span>
        </label>
      </fieldset>

      <div className="filters">
        <Button type="submit" size="sm" loading={busy} disabled={!ready}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
