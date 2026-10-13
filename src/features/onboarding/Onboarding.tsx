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
import { avecTransition } from '../../animations/transitions';

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
  // LE SENS DU PASSAGE : « Suivant » fait entrer l'étape par la droite,
  // « Retour » par la gauche, et le compteur défile dans le même sens.
  const [sens, setSens] = useState<'avant' | 'arriere' | null>(null);
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const toggleFavorite = useAppStore(s => s.toggleFavorite);
  const setOnboarded = useAppStore(s => s.setOnboarded);
  if (!referential) return null;

  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const aller = (vers: number) => {
    setSens(vers > step ? 'avant' : 'arriere');
    setStep(vers);
  };
  // La fin de l'accueil : la carte s'efface et la page remonte dans une
  // transition de vue ; le soleil de l'en-tête se lève une dernière fois
  // (HomeScreen remonte l'emblème quand `onboarded` change).
  const terminer = () => avecTransition('ecran', () => setOnboarded(true));

  return (
    <Card as="section" className="onboarding" aria-labelledby="bienvenue">
      <p className="onboarding-step">
        {/* `key` : le numéro défile à chaque étape, dans le sens du geste. */}
        <span
          key={step}
          className="onboarding-num"
          data-sens={sens ?? undefined}
        >
          {pad(step + 1)}
        </span>{' '}
        / {pad(STEPS.length)}
      </p>
      {/* `key` : chaque étape remonte, et son entrée se rejoue — par la
          droite en avançant, par la gauche en revenant. */}
      <div
        key={step}
        className="onboarding-corps"
        data-sens={sens ?? undefined}
      >
        <h2 id="bienvenue" className="onboarding-title">
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
      </div>

      <div className="onboarding-actions">
        <Button variant="ghost" size="sm" onClick={terminer}>
          Passer
        </Button>
        {step > 0 && (
          <Button variant="outline" size="sm" onClick={() => aller(step - 1)}>
            Retour
          </Button>
        )}
        <Button size="sm" onClick={() => (last ? terminer() : aller(step + 1))}>
          {last ? 'C’est parti' : 'Suivant'}
        </Button>
      </div>
    </Card>
  );
}
