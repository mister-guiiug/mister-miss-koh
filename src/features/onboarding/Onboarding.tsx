/**
 * La première ouverture, en trois temps : où l'on en est, ce qu'il faut
 * masquer, qui l'on suit.
 *
 * POURQUOI ELLE EXISTE. Un nouveau venu arrive avec le réglage le plus sûr et
 * rien de coché : tout est masqué, et rien ne lui dit pourquoi. Trois
 * questions suffisent à rendre l'application juste pour lui dès l'accueil.
 *
 * ELLE NE RÉVÈLE RIEN. L'étape 1 ne montre que des numéros et des dates ;
 * l'étape 3, les prénoms de la saison — ceux que l'écran des candidats liste
 * déjà à tout le monde —, sans aucun statut. On peut la passer à tout moment,
 * et elle ne revient pas.
 */
import { useState } from 'react';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useAppStore } from '../../store/useAppStore';
import { WatchedPicker } from '../../components/WatchedPicker';
import { SpoilerModePicker } from '../../components/SpoilerModePicker';
import { FavoriteButton } from '../../components/FavoriteButton';

const STEPS = [
  {
    title: 'Où en êtes-vous ?',
    hint: 'Choisissez le dernier épisode vu : ce qui suit restera masqué.',
  },
  {
    title: 'Que faut-il masquer ?',
    hint: 'Modifiable à tout moment, depuis les Épisodes ou les Réglages.',
  },
  {
    title: 'Qui suivez-vous ?',
    hint: 'Vos favoris restent sur cet appareil tant que vous n’avez pas de compte.',
  },
] as const;

export function Onboarding() {
  const [step, setStep] = useState(0);
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const toggleFavorite = useAppStore(s => s.toggleFavorite);
  const setOnboarded = useAppStore(s => s.setOnboarded);
  if (!referential) return null;

  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <Card as="section" className="onboarding" aria-labelledby="bienvenue">
      <p className="onboarding-step">
        {pad(step + 1)} / {pad(STEPS.length)}
      </p>
      {/* \`key\` : chaque étape remonte son titre, et son entrée se rejoue. */}
      <h2 id="bienvenue" key={step} className="onboarding-title">
        {current.title}
      </h2>
      <p className="muted">{current.hint}</p>

      {step === 0 && <WatchedPicker label="J’ai vu jusqu’à" />}
      {step === 1 && <SpoilerModePicker idPrefix="bienvenue-spoiler" />}
      {step === 2 && (
        <ul className="onboarding-cast">
          {referential.contestants.map(c => (
            <li key={c.id}>
              <span>{c.displayName}</span>
              <FavoriteButton
                name={c.displayName}
                favorite={favorites.includes(c.id)}
                onToggle={() => toggleFavorite(c.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="onboarding-actions">
        <Button variant="ghost" size="sm" onClick={() => setOnboarded(true)}>
          Passer
        </Button>
        {step > 0 && (
          <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
            Retour
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => (last ? setOnboarded(true) : setStep(step + 1))}
        >
          {last ? 'C’est parti' : 'Suivant'}
        </Button>
      </div>
    </Card>
  );
}
