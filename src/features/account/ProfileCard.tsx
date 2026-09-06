/**
 * Choisir son pseudonyme — et, si l'on veut, une adresse publique.
 *
 * À QUOI ÇA SERT, DIT AVANT. Ce nom signe les notes qu'on partage, et — si
 * l'on ouvre son profil — nomme la page qu'un visiteur trouve à son adresse.
 * Sans profil, les notes partagées sont signées « quelqu'un qui n'a pas choisi
 * de pseudonyme » : ce n'est pas une panne, c'est l'état réel, et l'écran le
 * dit plutôt que d'afficher un champ vide sans raison.
 *
 * UN PROFIL EST PRIVÉ PAR DÉFAUT, et « Public » n'est proposé qu'une fois un
 * identifiant choisi : la page se rejoint par `#/profil/<identifiant>`, et
 * l'offrir sans adresse promettrait une page injoignable. Retirer son
 * identifiant referme donc le profil, plutôt que de laisser un réglage qui
 * n'ouvre plus rien.
 *
 * DEUX CHAMPS, DEUX NATURES. Le pseudonyme est un libellé : deux personnes
 * peuvent s'appeler pareil. L'identifiant public est une ADRESSE : unique,
 * réservable, d'une forme stricte parce qu'il finira dans une URL. Sa
 * disponibilité se demande au serveur (`handle_is_available`) et non à la
 * table : la RLS cache le profil qui le détient déjà, et une vérification côté
 * client répondrait « libre » pour un identifiant pris.
 *
 * LA VÉRIFICATION A LIEU DEUX FOIS : à la sortie du champ, pour le dire tôt, et
 * à l'enregistrement, parce qu'un identifiant libre il y a trente secondes peut
 * avoir été pris entre-temps. Seul le serveur tranche pour de bon — la
 * contrainte `unique` est le dernier mot.
 */
import { useState } from 'react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { currentAppUrl } from '@mister-guiiug/dev-pwa-config/share';
import { useProfileStore } from '../../store/useProfileStore';
import { ShareLinkPanel } from '../../components/ShareLinkPanel';
import {
  BIO_MAX,
  HANDLE_MAX,
  PSEUDONYM_MAX,
  checkHandle,
  checkPseudonym,
  suggestHandle,
} from '../../domain/profile';
import { profileUrl } from '../../domain/sharing';
import {
  PROFILE_VISIBILITIES,
  canBePublic,
  type Visibility,
} from '../../domain/visibility';

type HandleState = 'idle' | 'checking' | 'free' | 'taken';

/**
 * Le CYCLE de vie du profil (chargement, oubli à la déconnexion) appartient à
 * l'écran, qui reste monté quand personne n'est connecté ; cette carte, elle,
 * n'existe que pour un compte et se contente de lire.
 */
export function ProfileCard() {
  const profile = useProfileStore(s => s.profile);
  const error = useProfileStore(s => s.error);
  if (profile === undefined) {
    return (
      <Card>
        <CardHeader title="Profil" />
        <SkeletonGroup label="Chargement du profil" lines={2} />
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </Card>
    );
  }
  // Remonté quand le profil change d'identité : les champs partent de ce qui
  // est enregistré, sans effet qui les resynchronise après coup.
  return <ProfileForm key={profile?.updatedAt ?? 'aucun'} />;
}

function ProfileForm() {
  const profile = useProfileStore(s => s.profile) ?? null;
  const save = useProfileStore(s => s.save);
  const isHandleFree = useProfileStore(s => s.isHandleFree);
  const toast = useToast();

  const [pseudonym, setPseudonym] = useState(profile?.pseudonym ?? '');
  const [handle, setHandle] = useState(profile?.handle ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [visibility, setVisibility] = useState<Visibility>(
    profile?.visibility ?? 'private'
  );
  const [showNotes, setShowNotes] = useState(profile?.showNotes ?? false);
  const [state, setState] = useState<HandleState>('idle');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestion = suggestHandle(pseudonym);
  /**
   * SANS ADRESSE, PAS DE PAGE. L'écran public se rejoint par l'identifiant :
   * proposer « Public » avant qu'il existe promettrait une page injoignable.
   */
  const publiable = canBePublic(handle.trim() || null);
  /** Inutile de redemander au serveur l'identifiant qu'on détient déjà. */
  const mine = (value: string) => value === (profile?.handle ?? '');

  const verify = async (value: string): Promise<boolean> => {
    const wanted = value.trim();
    if (wanted === '' || mine(wanted) || checkHandle(wanted)) return true;
    setState('checking');
    try {
      const free = await isHandleFree(wanted);
      setState(free ? 'free' : 'taken');
      return free;
    } catch {
      // Le serveur n'a pas répondu : ne rien affirmer, et laisser
      // l'enregistrement trancher.
      setState('idle');
      return true;
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const wanted = handle.trim();
    const refused = checkPseudonym(pseudonym) ?? checkHandle(wanted);
    if (refused) {
      setRefusal(refused);
      return;
    }
    setRefusal(null);
    setBusy(true);
    try {
      if (!(await verify(wanted))) {
        // La ligne d'état sous le champ dit déjà « pris » ; ce message-ci dit
        // l'autre moitié, que l'état ne dit pas : rien n'a été enregistré.
        setRefusal('Identifiant indisponible : le profil n’a pas été modifié.');
        return;
      }
      await save({
        pseudonym: pseudonym.trim(),
        handle: wanted || null,
        bio: bio.trim() || null,
        // Retirer son identifiant referme le profil : le laisser « public »
        // laisserait une case cochée qui n'ouvre plus rien.
        visibility: publiable ? visibility : 'private',
        showNotes,
      });
      toast.success('Profil enregistré.');
    } catch (cause) {
      setRefusal(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Profil"
        subtitle={profile ? undefined : 'aucun pour l’instant'}
      />
      <p className="muted">
        Ce nom signe les notes que vous partagez. Sans lui, elles sont signées «
        quelqu’un qui n’a pas choisi de pseudonyme ». Un profil reste{' '}
        <strong>privé</strong> tant que vous ne décidez pas le contraire, et vos
        notes privées le restent quoi qu’il arrive.
      </p>
      <form className="stack" onSubmit={e => void submit(e)}>
        <label className="field">
          <span>Pseudonyme</span>
          <input
            type="text"
            required
            maxLength={PSEUDONYM_MAX}
            autoComplete="nickname"
            value={pseudonym}
            onChange={e => setPseudonym(e.target.value)}
            placeholder="Tarzan"
          />
        </label>

        <label className="field">
          <span>Identifiant public (facultatif)</span>
          <input
            type="text"
            inputMode="text"
            maxLength={HANDLE_MAX}
            autoComplete="off"
            spellCheck={false}
            value={handle}
            onChange={e => {
              setHandle(e.target.value.toLowerCase());
              setState('idle');
            }}
            onBlur={e => void verify(e.target.value)}
            placeholder={suggestion || 'mon-identifiant'}
            aria-describedby="identifiant-etat"
          />
        </label>
        <p id="identifiant-etat" className="muted handle-state" role="status">
          {state === 'checking' && 'Vérification…'}
          {state === 'free' && 'Cet identifiant est libre.'}
          {state === 'taken' && 'Cet identifiant est déjà pris, ou réservé.'}
          {state === 'idle' &&
            'Minuscules, chiffres et tirets — c’est une adresse, elle doit rester unique.'}
        </p>

        {suggestion && handle.trim() === '' && (
          <p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setHandle(suggestion);
                void verify(suggestion);
              }}
            >
              Reprendre « {suggestion} »
            </Button>
          </p>
        )}

        <label className="field">
          <span>Quelques mots (facultatif)</span>
          <textarea
            rows={3}
            maxLength={BIO_MAX}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Ce que vous regardez, ce que vous notez…"
          />
        </label>

        <fieldset className="field visibility-field">
          <legend>Qui peut voir votre profil</legend>
          {PROFILE_VISIBILITIES.map(option => (
            <div key={option.value} className="option">
              <label>
                <input
                  type="radio"
                  name="profil-visibilite"
                  value={option.value}
                  checked={visibility === option.value}
                  disabled={option.value === 'public' && !publiable}
                  onChange={() => setVisibility(option.value)}
                />
                <strong>{option.label}</strong>
                <small className="muted">
                  {option.value === 'public' && !publiable
                    ? 'Choisissez d’abord un identifiant public : c’est l’adresse de la page.'
                    : option.hint}
                </small>
              </label>
            </div>
          ))}
        </fieldset>

        {visibility === 'public' && publiable && (
          <>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={showNotes}
                onChange={e => setShowNotes(e.target.checked)}
              />
              <span>
                Y montrer mes notes <strong>publiques</strong>
                <small className="muted">
                  Celles-là seulement — une note « moi seul·e » ou « qui a le
                  lien » n’y apparaît jamais.
                </small>
              </span>
            </label>
          </>
        )}

        {refusal && (
          <p role="alert" className="notice">
            {refusal}
          </p>
        )}

        <Button type="submit" loading={busy}>
          {profile ? 'Enregistrer' : 'Créer mon profil'}
        </Button>
      </form>

      {/* HORS du formulaire, et volontairement : cette adresse est celle du
          profil ENREGISTRÉ, pas de ce qu'on est en train de taper. */}
      {profile?.visibility === 'public' && profile.handle && (
        <div className="profile-address">
          <h4>L’adresse de votre profil</h4>
          <ShareLinkPanel
            link={profileUrl(currentAppUrl(), profile.handle)}
            title={`Le profil de ${profile.pseudonym}`}
            qrLabel={`QR code du lien vers le profil de ${profile.pseudonym}`}
            note={
              <p className="muted qr-note">
                Cette adresse ne porte aucun jeton et ne se révoque pas : elle
                est la vôtre, publiquement. Pour la refermer, repassez le profil
                en « Privé » — la page cesse alors de répondre.
              </p>
            }
          />
        </div>
      )}
    </Card>
  );
}
