/**
 * Les trois réglages anti-spoiler, en cartes à toucher.
 *
 * Le même contrôle sert les Réglages, la feuille ouverte depuis l'écran des
 * Épisodes et la première ouverture ; `idPrefix` garde ses identifiants
 * uniques là où deux exemplaires pourraient coexister.
 */
import { useAppStore } from '../store/useAppStore';
import { SPOILER_OPTIONS } from '../domain/spoilerModes';

export function SpoilerModePicker({ idPrefix }: { idPrefix: string }) {
  const spoiler = useAppStore(s => s.spoiler);
  const setSpoiler = useAppStore(s => s.setSpoiler);

  return (
    <fieldset className="stack">
      <legend className="sr-only">Que faut-il masquer ?</legend>
      {SPOILER_OPTIONS.map(o => (
        // Toute la carte se touche (`.option`) ; le nom du contrôle reste
        // le libellé seul, l'explication une description.
        <div key={o.value} className="radio option">
          <input
            id={`${idPrefix}-${o.value}`}
            type="radio"
            name={idPrefix}
            value={o.value}
            checked={spoiler === o.value}
            onChange={() => setSpoiler(o.value)}
            aria-describedby={`${idPrefix}-${o.value}-hint`}
          />
          <span>
            <label htmlFor={`${idPrefix}-${o.value}`}>
              <strong>{o.label}</strong>
            </label>
            <br />
            {/* Le complément est une DESCRIPTION, pas le nom du contrôle :
                le lecteur d'écran lit le libellé, puis l'explication. */}
            <small id={`${idPrefix}-${o.value}-hint`} className="muted">
              {o.hint}
            </small>
          </span>
        </div>
      ))}
    </fieldset>
  );
}
