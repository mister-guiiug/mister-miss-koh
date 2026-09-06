import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useThemeContext } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { AppFooter } from '@mister-guiiug/dev-pwa-config/react/app-footer';
import { LocationMap } from '../../components/LocationMap';
import { useAppStore } from '../../store/useAppStore';
import { useSession } from '../../hooks/useSession';
import { useRefreshReferential } from '../../hooks/useRefreshReferential';
import { BACKEND, MISSING_FOR_SUPABASE } from '../../backend/config';
import { coverage, type Origin } from '../../backend/referentialRepository';
import type { SpoilerMode } from '../../domain/spoiler';
import { Provenance } from '../../components/Provenance';
import { REPO_URL } from '../../links';

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

/* Les deux réglages du mouvement, expliqués : ils pilotent le CSS de
   l'interface (`data-motion`, voir animations/motion.ts), pas seulement une
   animation Rive qu'aucun fichier ne porte encore. */
const MOTION_OPTIONS = [
  {
    key: 'animations',
    label: 'Animations',
    hint: 'Entrées d’écran, éclat de l’étoile, flamme du chargement, vibration. Décochée, une case ou un bouton répond encore.',
  },
  {
    key: 'reduceMotion',
    label: 'Réduire les mouvements',
    hint: 'Plus aucun déplacement, cases et boutons compris. Le réglage système du même nom s’applique de toute façon.',
  },
] as const;

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
  const { account, available } = useSession();
  const spoiler = useAppStore(s => s.spoiler);
  const setSpoiler = useAppStore(s => s.setSpoiler);
  const animations = useAppStore(s => s.animations);
  const setAnimations = useAppStore(s => s.setAnimations);
  const reduceMotion = useAppStore(s => s.reduceMotion);
  const setReduceMotion = useAppStore(s => s.setReduceMotion);
  const referential = useAppStore(s => s.referential);
  const origin = useAppStore(s => s.origin);
  const notice = useAppStore(s => s.notice);
  const error = useAppStore(s => s.error);
  const loading = useAppStore(s => s.loading);
  const refresh = useRefreshReferential();

  const motion = {
    animations: { checked: animations, set: setAnimations },
    reduceMotion: { checked: reduceMotion, set: setReduceMotion },
  };

  return (
    <div className="stack">
      <h2>Réglages</h2>

      <Card>
        <CardHeader title="Anti-spoiler" />
        <fieldset className="stack">
          <legend className="sr-only">Que faut-il masquer ?</legend>
          {SPOILER_OPTIONS.map(o => (
            // Toute la carte se touche (`.option`) ; le nom du contrôle reste
            // le libellé seul, l'explication une description.
            <div key={o.value} className="radio option">
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
        <div className="stack">
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
          {MOTION_OPTIONS.map(o => (
            <div key={o.key} className="check">
              <input
                id={`motion-${o.key}`}
                type="checkbox"
                checked={motion[o.key].checked}
                onChange={e => motion[o.key].set(e.target.checked)}
                aria-describedby={`motion-${o.key}-hint`}
              />
              <span>
                <label htmlFor={`motion-${o.key}`}>
                  <strong>{o.label}</strong>
                </label>
                <br />
                <small id={`motion-${o.key}-hint`} className="muted">
                  {o.hint}
                </small>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Compte" />
        <p className="muted">
          {!available
            ? 'Sans backend, il n’y a pas de compte : vos réglages et vos favoris restent sur cet appareil.'
            : account === undefined
              ? 'Vérification de la session…'
              : account
                ? `Connecté·e en tant que ${account.email ?? 'compte sans adresse'}.`
                : 'Non connecté·e. Un compte ne sert qu’à retrouver vos notes d’un autre appareil ; tout le reste fonctionne sans.'}
        </p>
        {available && <Link to="/compte">Gérer le compte</Link>}
      </Card>

      <Card>
        <CardHeader
          title="Source de vérité"
          action={
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              onClick={() => void refresh()}
            >
              Actualiser les données
            </Button>
          }
        />
        {referential && (
          <div className="stack">
            <Provenance data={referential.provenance} />
            {referential.provenance.url && (
              <p>
                <a
                  data-dwc="button"
                  data-variant="primary"
                  data-size="sm"
                  href={referential.provenance.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir la page source <ExternalLink size={16} aria-hidden />
                </a>
              </p>
            )}
            <dl className="stats">
              {referential.provenance.title && (
                <>
                  <dt>Page</dt>
                  <dd>{referential.provenance.title}</dd>
                </>
              )}
              {referential.provenance.revision && (
                <>
                  <dt>Révision</dt>
                  <dd>
                    <code>{referential.provenance.revision}</code>
                  </dd>
                </>
              )}
              {referential.provenance.fetchedAt && (
                <>
                  <dt>Lue le</dt>
                  <dd>{formatDate(referential.provenance.fetchedAt)}</dd>
                </>
              )}
              <dt>Version du référentiel</dt>
              <dd>{referential.provenance.version}</dd>
              <dt>Lieu de tournage</dt>
              <dd>
                {referential.season.location?.name ?? 'la source ne le dit pas'}
              </dd>
            </dl>
            {/* La carte ne se dessine qu'avec un point : un lieu nommé sans
                coordonnées se lit, il ne se place pas. */}
            {referential.season.location &&
              (referential.season.location.lat !== null &&
              referential.season.location.lon !== null ? (
                <LocationMap
                  name={referential.season.location.name}
                  lat={referential.season.location.lat}
                  lon={referential.season.location.lon}
                />
              ) : (
                <p className="muted">
                  La page du lieu ne donne pas de coordonnées : pas de carte.
                </p>
              ))}
          </div>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {/* Un rechargement en échec ne remplace pas l'écran (App) : le toast
            l'a dit sur le moment, et cet avis le redit tant qu'une lecture
            n'a pas abouti — sous la provenance de ce qui reste affiché. */}
        {error && (
          <p role="status" className="notice">
            Le rechargement a échoué : {error}. Les données affichées sont
            celles de la lecture précédente.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Données" />
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
          Mister &amp; miss Koh est une application non officielle, sans lien
          avec les ayants droit de l’émission. Les données référentielles sont
          des faits relevés sur une source collaborative — chacun porte sa page,
          sa révision et sa date de lecture — et ne sont jamais présentés comme
          officiels. Version {__APP_VERSION__}.
        </p>
      </Card>
      {/* Le second des DEUX écrans qui portent le pied de page : l'accueil,
          où l'on arrive, et « À propos », où l'on vient chercher ces liens. */}
      <AppFooter issues repoUrl={REPO_URL} version />
    </div>
  );
}
