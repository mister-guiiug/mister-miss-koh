/**
 * Choisir son pseudonyme — et, si l'on veut, une adresse publique.
 *
 * À QUOI ÇA SERT, DIT AVANT. Le seul endroit où ce nom apparaît aujourd'hui,
 * c'est au bas d'une note qu'on partage par un lien. Sans profil, ces notes
 * sont signées « quelqu'un qui n'a pas choisi de pseudonyme » — ce n'est pas
 * une panne, c'est l'état réel, et l'écran le dit plutôt que d'afficher un
 * champ vide sans raison.
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
import { useProfileStore } from '../../store/useProfileStore';
import {
  HANDLE_MAX,
  PSEUDONYM_MAX,
  checkHandle,
  checkPseudonym,
  suggestHandle,
} from '../../domain/profile';

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
  const [state, setState] = useState<HandleState>('idle');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestion = suggestHandle(pseudonym);
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
      await save({ pseudonym: pseudonym.trim(), handle: wanted || null });
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
        Ce nom signe les notes que vous partagez par un lien. Sans lui, elles
        sont signées « quelqu’un qui n’a pas choisi de pseudonyme ». Il ne
        s’affiche nulle part ailleurs, et vos notes privées restent privées.
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

        {refusal && (
          <p role="alert" className="notice">
            {refusal}
          </p>
        )}

        <Button type="submit" loading={busy}>
          {profile ? 'Enregistrer' : 'Créer mon profil'}
        </Button>
      </form>
    </Card>
  );
}
