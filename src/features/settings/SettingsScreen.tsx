import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useThemeContext } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { useAppStore } from '../../store/useAppStore';
import { BACKEND, MISSING_FOR_SUPABASE } from '../../backend/config';
import { coverage, type Origin } from '../../backend/referentialRepository';
import type { SpoilerMode } from '../../domain/spoiler';
import { Provenance } from '../../components/Provenance';

const SPOILER_OPTIONS: { value: SpoilerMode; label: string; hint: string }[] = [
  {
    value: 'hide_unwatched',
    label: 'Masquer ce que je n’ai pas vu',
    hint: 'Le plus sûr : seuls les épisodes cochés « vu » sont révélés.',
  },
  {
    value: 'hide_future',
    label: 'Masquer les épisodes du jour et à venir',
    hint: 'Tout ce qui est diffusé avant aujourd’hui est visible.',
  },
  { value: 'reveal_all', label: 'Tout voir', hint: 'Aucun masquage.' },
];

const ORIGIN_LABEL: Record<
  Origin,
  { text: string; tone: 'success' | 'warning' | 'muted' }
> = {
  server: { text: 'le serveur', tone: 'success' },
  cache: { text: 'la dernière version enregistrée', tone: 'warning' },
  demo: { text: 'la démonstration (donnée fictive)', tone: 'muted' },
};

export function SettingsScreen() {
  const theme = useThemeContext();
  const spoiler = useAppStore(s => s.spoiler);
  const setSpoiler = useAppStore(s => s.setSpoiler);
  const animations = useAppStore(s => s.animations);
  const setAnimations = useAppStore(s => s.setAnimations);
  const reduceMotion = useAppStore(s => s.reduceMotion);
  const setReduceMotion = useAppStore(s => s.setReduceMotion);
  const referential = useAppStore(s => s.referential);
  const origin = useAppStore(s => s.origin);
  const notice = useAppStore(s => s.notice);
  const loading = useAppStore(s => s.loading);
  const reload = useAppStore(s => s.reload);

  return (
    <div className="stack">
      <h2>Réglages</h2>

      <Card>
        <CardHeader title="Anti-spoiler" />
        <fieldset className="stack">
          <legend className="sr-only">Que faut-il masquer ?</legend>
          {SPOILER_OPTIONS.map(o => (
            <div key={o.value} className="radio">
              <input
                id={`spoiler-${o.value}`}
                type="radio"
                name="spoiler"
                value={o.value}
                checked={spoiler === o.value}
                onChange={() => setSpoiler(o.value)}
                aria-describedby={`spoiler-${o.value}-hint`}
              />
              <span>
                <label htmlFor={`spoiler-${o.value}`}>
                  <strong>{o.label}</strong>
                </label>
                <br />
                {/* Le complément est une DESCRIPTION, pas le nom du contrôle :
                    le lecteur d'écran lit le libellé, puis l'explication. */}
                <small id={`spoiler-${o.value}-hint`} className="muted">
                  {o.hint}
                </small>
              </span>
            </div>
          ))}
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="Affichage" />
        {theme && (
          <label className="field">
            <span>Thème</span>
            <select
              value={theme.theme}
              onChange={e => theme.setTheme(e.target.value)}
            >
              <option value="system">Système</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </select>
          </label>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={animations}
            onChange={e => setAnimations(e.target.checked)}
          />
          <span>Animations</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={e => setReduceMotion(e.target.checked)}
          />
          <span>Réduire les mouvements (en plus du réglage système)</span>
        </label>
      </Card>

      <Card>
        <CardHeader
          title="Données"
          action={
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              onClick={() => void reload()}
            >
              Actualiser les données
            </Button>
          }
        />
        {referential && <Provenance data={referential.provenance} />}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <dl className="stats">
          <dt>Backend</dt>
          <dd>
            <Badge tone={BACKEND === 'supabase' ? 'success' : 'muted'}>
              {BACKEND}
            </Badge>
          </dd>
          <dt>Adaptateur du référentiel</dt>
          <dd>
            {coverage.remote.includes('referential')
              ? 'distant (Supabase)'
              : 'local'}
          </dd>
          {origin && (
            <>
              <dt>Cette lecture vient de</dt>
              <dd>
                <Badge tone={ORIGIN_LABEL[origin].tone}>
                  {ORIGIN_LABEL[origin].text}
                </Badge>
              </dd>
            </>
          )}
          {MISSING_FOR_SUPABASE.length > 0 && (
            <>
              <dt>Pour activer Supabase</dt>
              <dd>
                <code>{MISSING_FOR_SUPABASE.join(', ')}</code>
              </dd>
            </>
          )}
        </dl>
      </Card>

      <Card>
        <CardHeader title="À propos" />
        <p className="muted">
          Aventure Tracker est une application non officielle, sans lien avec
          les ayants droit de l’émission. Les données référentielles sont des
          faits relevés sur une source collaborative — chacun porte sa page, sa
          révision et sa date de lecture — et ne sont jamais présentés comme
          officiels. Version {__APP_VERSION__}.
        </p>
      </Card>
    </div>
  );
}
