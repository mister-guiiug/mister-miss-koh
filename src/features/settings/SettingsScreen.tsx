import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useThemeContext } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { AppFooter } from '@mister-guiiug/dev-pwa-config/react/app-footer';
import { UpdateButton } from '@mister-guiiug/dev-pwa-config/react/update-button';
import { ConsentSection } from '@mister-guiiug/dev-pwa-config/react/consent-section';
import { currentAppUrl } from '@mister-guiiug/dev-pwa-config/share';
import { ShareLinkPanel } from '../../components/ShareLinkPanel';
import { PhotosExport } from '../../components/PhotosExport';
import { PortraitsQueue } from '../../components/PortraitsQueue';
import { LocationMap } from '../../components/LocationMap';
import { useAppStore } from '../../store/useAppStore';
import { useSession } from '../../hooks/useSession';
import { useRefreshReferential } from '../../hooks/useRefreshReferential';
import { useRereadWikipedia } from '../../hooks/useRereadWikipedia';
import { usePublishHeldLot } from '../../hooks/usePublishHeldLot';
import { useReviewer } from '../../hooks/useReviewer';
import { Provenance } from '../../components/Provenance';
import { SpoilerModePicker } from '../../components/SpoilerModePicker';
import { REPO_URL } from '../../links';

/* Les deux réglages du mouvement, expliqués : ils pilotent le CSS de
   l'interface (`data-motion`, voir animations/motion.ts), pas seulement une
   animation Rive qu'aucun fichier ne porte encore. */
const MOTION_OPTIONS = [
  {
    key: 'animations',
    label: 'Animations',
    hint: 'Entrées d’écran, éclat de l’étoile, battement du chargement, vibration. Décochée, une case ou un bouton répond encore.',
  },
  {
    key: 'reduceMotion',
    label: 'Réduire les mouvements',
    hint: 'Plus aucun déplacement, cases et boutons compris. Le réglage système du même nom s’applique de toute façon.',
  },
] as const;

export function SettingsScreen() {
  const theme = useThemeContext();
  const { account, available } = useSession();
  const appBadge = useAppStore(s => s.appBadge);
  const setAppBadge = useAppStore(s => s.setAppBadge);
  const animations = useAppStore(s => s.animations);
  const setAnimations = useAppStore(s => s.setAnimations);
  const reduceMotion = useAppStore(s => s.reduceMotion);
  const setReduceMotion = useAppStore(s => s.setReduceMotion);
  const referential = useAppStore(s => s.referential);
  const notice = useAppStore(s => s.notice);
  const error = useAppStore(s => s.error);
  const loading = useAppStore(s => s.loading);
  const season = useAppStore(s => s.season);
  const seasons = useAppStore(s => s.seasons);
  const setSeason = useAppStore(s => s.setSeason);
  const loadSeasons = useAppStore(s => s.loadSeasons);
  const refresh = useRefreshReferential({ manual: true });
  const reviewer = useReviewer(account?.id);
  const { reread, reading } = useRereadWikipedia();
  const { publish, publishing } = usePublishHeldLot();
  const pendingLot =
    Boolean(referential?.provenance.pendingRevision) &&
    referential?.provenance.pendingRevision !==
      referential?.provenance.revision;

  // La liste ne sert qu'ici : on la demande en arrivant, pas au démarrage de
  // l'application. Un échec ne se dit pas — sans liste, il n'y a simplement
  // pas de choix à offrir.
  useEffect(() => {
    void loadSeasons();
  }, [loadSeasons]);

  /**
   * La saison choisie DOIT figurer dans la liste, même dépubliée : sans elle,
   * le menu s'ouvrirait sur un blanc et le premier geste changerait de saison
   * sans que personne l'ait demandé.
   */
  const choix = useMemo(() => {
    const connue = seasons.some(o => o.slug === season);
    if (connue || !referential) return seasons;
    return [...seasons, { slug: season, name: referential.season.name }];
  }, [seasons, season, referential]);

  const motion = {
    animations: { checked: animations, set: setAnimations },
    reduceMotion: { checked: reduceMotion, set: setReduceMotion },
  };

  return (
    /* `settings` porte le RYTHME des cartes. Mesurés, leurs blocs se
       touchaient : 1 px entre le texte du compte et son lien, 0 px entre la
       version et son bouton — deux endroits où l'on croit lire un seul bloc.
       Le rythme est posé une fois sur le conteneur, pas ajouté marge par
       marge : une marge entre voisins perd contre le `margin: 0` d'un enfant
       de spécificité égale, un `gap` ne se dispute avec personne. */
    <div className="stack settings">
      <h2>Réglages</h2>

      <Card>
        <CardHeader title="Anti-spoiler" />
        {/* Le même contrôle s'ouvre depuis l'écran des Épisodes : un seul
            texte pour les trois réglages, dans `domain/spoilerModes.ts`. */}
        <SpoilerModePicker idPrefix="spoiler" />
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
          <div className="check">
            <input
              id="app-badge"
              type="checkbox"
              checked={appBadge}
              onChange={e => setAppBadge(e.target.checked)}
              aria-describedby="app-badge-hint"
            />
            <span>
              <label htmlFor="app-badge">
                <strong>Pastille sur l’icône</strong>
              </label>
              <br />
              <small id="app-badge-hint" className="muted">
                Le nombre d’épisodes diffusés que vous n’avez pas cochés, sur
                l’icône de l’app installée — jamais ce qui s’y passe. Là où le
                système le permet.
              </small>
            </span>
          </div>
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
        {/* UN BOUTON, comme les deux autres actions de l'écran. C'était un
            lien nu de 24 px de haut au milieu de cartes dont les actions font
            44 : trop petit pour un pouce, et surtout d'une autre famille que
            « Actualiser les données » ou « Recharger l’application », qui sont
            pourtant la même chose — l'action de leur carte. */}
        {available && (
          <Link
            data-dwc="button"
            data-variant="outline"
            data-size="sm"
            to="/compte"
          >
            Gérer le compte
          </Link>
        )}
      </Card>

      {/* PARTAGER L'APPLICATION, pas un écran. `currentAppUrl()` rend la base
          du déploiement SANS le fragment : donner ce lien depuis les Réglages
          ne fait pas atterrir sur les Réglages. Le QR sert le cas où l'on est
          côte à côte — on montre l'écran, l'autre scanne. */}
      <Card>
        <CardHeader title="Partager l’application" />
        {/* CE QU'ON DONNE, PUIS LE GESTE. La phrase était SOUS les boutons :
            on partageait avant d'avoir lu ce qui part — et la carte voisine,
            « Portraits », fait l'inverse. Deux cartes du même écran ne
            peuvent pas se lire dans deux ordres. */}
        <p className="muted">
          Rien de personnel ne part avec : ni vos notes, ni vos favoris, ni les
          épisodes que vous avez vus. C’est l’adresse publique du site, la même
          pour tout le monde.
        </p>
        <ShareLinkPanel
          link={currentAppUrl()}
          title="Mister & Miss Koh"
          qrTarget="l’application"
          lead
          note={
            <p className="muted qr-note">
              Ce lien ouvre l’application, sans compte et sans installation.
            </p>
          }
        />
      </Card>

      {/* L'EXPORT EN MASSE, à côté du partage : les deux sortent quelque chose
          de l'application, et aucun des deux n'envoie quoi que ce soit. */}
      <Card>
        <CardHeader title="Portraits" />
        <PhotosExport />
        {/* DEUX SORTIES, ET ELLES NE FONT PAS LA MÊME CHOSE. L'archive vous
            rend vos images ; la tournée les CONFIE, une par une, à d'autres.
            La seconde publie, la première non — d'où le trait qui les sépare
            et la teinte d'avertissement de `ephemeral-share`. */}
        <PortraitsQueue />
      </Card>

      <Card>
        <CardHeader
          title="Source de vérité"
          action={
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              disabled={reading}
              onClick={() => void refresh()}
            >
              Actualiser les données
            </Button>
          }
        />
        <div className="stack">
          {choix.length > 1 && (
            <label className="field">
              <span>Saison</span>
              <select
                value={season}
                disabled={loading || reading}
                onChange={e => setSeason(e.target.value)}
              >
                {choix.map(o => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="muted">
            Chaque soir, un lot entièrement certain est publié. Actualiser
            recharge cette version.
          </p>
          {reviewer && (
            <div className="stack">
              <Button
                variant="outline"
                size="sm"
                loading={reading}
                disabled={loading || publishing}
                onClick={() => void reread()}
              >
                Relire Wikipédia
              </Button>
              <p className="muted">
                Relit la page tout de suite, sans attendre le soir.
              </p>
              {pendingLot && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={publishing}
                    disabled={loading || reading}
                    onClick={() => void publish()}
                  >
                    Publier le lot en attente
                  </Button>
                  <p className="muted">
                    Applique la partie déjà validée de la dernière relecture,
                    sans relire Wikipédia.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
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
                  <dt>
                    {referential.provenance.pendingRevision
                      ? 'Révision publiée'
                      : 'Révision'}
                  </dt>
                  <dd>
                    <code>{referential.provenance.revision}</code>
                  </dd>
                </>
              )}
              {referential.provenance.fetchedAt && (
                <>
                  <dt>Publiées le</dt>
                  <dd>{formatDate(referential.provenance.fetchedAt)}</dd>
                </>
              )}
              {referential.provenance.pendingRevision && (
                <>
                  <dt>Révision relue, en attente</dt>
                  <dd>
                    <code>{referential.provenance.pendingRevision}</code>
                    {referential.provenance.observedAt && (
                      <> · le {formatDate(referential.provenance.observedAt)}</>
                    )}
                  </dd>
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

      {/* Plus de carte « Données » : Backend / adaptateur / supabase étaient
          du diagnostic de déploiement, pas un réglage. L'origine d'une
          lecture (cache, démo) se dit déjà sous « Source de vérité » via
          `notice`, et le toast après « Actualiser ». */}

      {/* CE BOUTON EXISTE PARCE QUE LE CACHE PEUT MENTIR. L'application se met
          à jour en mode « prompt » : la nouvelle version se télécharge en fond
          et le bandeau propose de recharger. Mais tant qu'on ne l'accepte pas,
          le service worker continue de SERVIR L'ANCIENNE — y compris le
          document lui-même, si bien qu'une route neuve peut renvoyer à
          l'accueil et donner l'impression d'un déploiement manqué. Recharger
          la page ne suffit pas ; vider le cache HTTP non plus. Le bouton du
          socle purge le Cache Storage et repart avec un anti-cache. */}
      {/* PLUS DE CARTE « VERSION INSTALLÉE ». Elle nommait le build de quatre
          façons — numéro, commit, heure de compilation, identifiant — et
          dépliait par-dessus les versions de chaque bibliothèque. Le bouton
          ci-dessous, lui, reste : il ne DÉCRIT pas un build, il en change. */}
      <Card>
        <CardHeader title="Mise à jour" />

        <UpdateButton
          label="Recharger l’application"
          updatingLabel="Rechargement…"
          showHint
          hint="Remplace la copie de l’application gardée sur cet appareil. Les données, les notes et les réglages ne sont pas touchés."
        />
      </Card>

      <Card>
        <CardHeader title="À propos" />
        <p className="muted">
          Mister &amp; Miss Koh est une application indépendante de suivi de
          Koh-Lanta, sans lien avec TF1 ni avec la production. Les données
          référentielles sont des faits relevés sur une source collaborative —
          chacun porte sa page, sa révision et sa date de lecture — et ne sont
          jamais présentés comme officiels.
        </p>
      </Card>

      {/* Revenir sur son choix de mesure d’audience : le retrait se fait ici,
          en un clic (RGPD, art. 7.3). Mêmes clé et chargeur que le bandeau.
          Sans clé, la section ne rend rien : `empty:hidden!` retire alors la
          carte restée vide — avec `!`, parce que la règle hors couche
          `[data-dwc='card'] { display: flex }` de `styles.css` l’emporterait
          sur un utilitaire. */}
      <Card className="empty:hidden!">
        <ConsentSection
          posthogKey={import.meta.env.VITE_POSTHOG_KEY}
          loader={() => import('posthog-js/dist/module.slim.js')}
          headingLevel={3}
        />
      </Card>
      {/* Le second des DEUX écrans qui portent le pied de page : l'accueil,
          où l'on arrive, et « À propos », où l'on vient chercher ces liens. */}
      <AppFooter issues repoUrl={REPO_URL} />
    </div>
  );
}
