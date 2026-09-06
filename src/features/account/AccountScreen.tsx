/**
 * Se connecter, se déconnecter — et rien d'autre.
 *
 * AUCUN MOT DE PASSE. L'identification se fait par lien envoyé à une adresse :
 * l'application ne voit passer aucun secret et n'en stocke aucun. Le choix est
 * expliqué à l'écran, parce qu'un formulaire sans champ « mot de passe »
 * surprend, et qu'une surprise non expliquée passe pour une panne.
 */
import { useState } from 'react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { sendMagicLink, signOut } from '../../backend/auth';
import { useProfile } from '../../hooks/useProfile';
import { ProfileCard } from './ProfileCard';

type Sending = 'idle' | 'sending' | 'sent';

export function AccountScreen() {
  // `useProfile` porte AUSSI la session : c'est lui qui charge le profil à la
  // connexion et l'oublie à la déconnexion, et cet écran est le seul qui reste
  // monté dans les deux cas.
  const { account, available } = useProfile();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<Sending>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!available) {
    return (
      <div className="stack">
        <h2>Compte</h2>
        <Card>
          <p className="muted">
            Aucun backend n’est configuré : cette version de l’application lit
            un référentiel de démonstration et garde vos favoris sur cet
            appareil. La connexion n’a donc rien à quoi se connecter.
          </p>
        </Card>
      </div>
    );
  }

  if (account === undefined) {
    return (
      <div className="stack">
        <h2>Compte</h2>
        <p role="status" className="muted">
          Vérification de la session…
        </p>
      </div>
    );
  }

  if (account) {
    return (
      <div className="stack">
        <h2>Compte</h2>
        <Card>
          <CardHeader title="Connecté·e" />
          <p>
            <Badge tone="success">{account.email ?? 'session active'}</Badge>
          </p>
          <p className="muted">
            Vos notes sont attachées à ce compte et à lui seul. Personne d’autre
            ne les lit — pas même un administrateur : le référentiel n’a aucune
            politique d’écriture, et vos notes aucune politique de lecture pour
            autrui.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        </Card>
        <ProfileCard />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState('sending');
    try {
      await sendMagicLink(email.trim());
      setState('sent');
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="stack">
      <h2>Compte</h2>
      <Card>
        <CardHeader title="Se connecter" />
        {state === 'sent' ? (
          <p role="status">
            Un lien vient d’être envoyé à <strong>{email}</strong>. Ouvrez-le
            depuis cet appareil : il vous ramènera ici, connecté·e. Il n’est
            valable qu’une fois.
          </p>
        ) : (
          <form className="stack" onSubmit={e => void submit(e)}>
            <label className="field">
              <span>Adresse électronique</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
              />
            </label>
            <p className="muted">
              Pas de mot de passe : vous recevez un lien à usage unique.
              L’application ne voit ni ne conserve aucun secret, et il n’y a
              donc rien à vous voler ici.
            </p>
            {error && (
              <p role="alert" className="notice">
                {error}
              </p>
            )}
            <Button type="submit" loading={state === 'sending'}>
              Recevoir un lien
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
