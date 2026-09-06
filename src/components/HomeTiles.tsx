/**
 * L'accueil en tuiles : quatre chiffres, quatre destinations.
 *
 * CHAQUE TUILE PORTE UN CHIFFRE, sans quoi elle ne serait qu'un raccourci vers
 * un écran que la barre basse atteint déjà. « 12 en jeu sur 18 » dit où en est
 * la saison ; « Candidats » ne dit rien de plus qu'un onglet.
 *
 * LE TABLEAU DE BORD A SA TUILE PARCE QU'IL N'A PAS D'ONGLET : c'est le seul
 * écran de l'application qu'on ne rejoint que depuis ici. Le perdre dans une
 * ligne de liens le rendait invisible.
 *
 * LA TUILE ENTIÈRE EST CLIQUABLE, et c'est un `<Link>` qui l'englobe — pas une
 * carte avec un lien dedans. Une zone tactile de la taille d'une tuile vaut
 * mieux qu'un mot souligné, et le lecteur d'écran annonce alors une seule
 * cible au lieu d'un décor suivi d'un lien.
 *
 * LES NOTES NE DÉCLENCHENT AUCUNE LECTURE. La tuile lit le magasin partagé
 * s'il est déjà rempli, et se contente d'un libellé sinon : l'accueil n'a pas
 * à ouvrir une session ni à interroger le serveur pour s'afficher.
 */
import { Link } from 'react-router-dom';
import { BarChart3, NotebookPen, Star, Tv, Users } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useNotesStore } from '../store/useNotesStore';
import { useSpoilerLimit } from '../hooks/useSpoilerLimit';
import { homeFigures } from '../domain/summary';

interface Tile {
  readonly to: string;
  readonly icon: React.ReactNode;
  readonly value: string;
  readonly label: string;
  readonly detail: string;
}

export function HomeTiles() {
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const watched = useAppStore(s => s.watched);
  const notes = useNotesStore(s => s.notes);
  const limit = useSpoilerLimit();

  if (!referential) return null;
  const f = homeFigures(referential, favorites, watched, limit);

  const tiles: Tile[] = [
    {
      to: '/candidats',
      icon: <Users size={20} aria-hidden />,
      value: String(f.inGame),
      label: 'en jeu',
      detail: `sur ${f.contestants} candidats`,
    },
    {
      to: '/episodes',
      icon: <Tv size={20} aria-hidden />,
      value: `${f.watched}/${f.aired}`,
      label: 'épisodes vus',
      detail:
        f.aired === 0
          ? 'aucun diffusé'
          : `${f.aired} diffusé${f.aired > 1 ? 's' : ''}`,
    },
    {
      to: '/candidats',
      icon: <Star size={20} aria-hidden />,
      value: String(f.favorites),
      label: f.favorites > 1 ? 'favoris' : 'favori',
      detail: f.favorites === 0 ? 'aucun pour l’instant' : 'que vous suivez',
    },
    {
      to: '/tableau-de-bord',
      icon: <BarChart3 size={20} aria-hidden />,
      value: '→',
      label: 'Tableau de bord',
      detail: 'voix, épreuves, conseils',
    },
  ];

  if (notes !== null) {
    tiles.splice(3, 0, {
      to: '/notes',
      icon: <NotebookPen size={20} aria-hidden />,
      value: String(notes.length),
      label: notes.length > 1 ? 'notes' : 'note',
      detail: notes.length === 0 ? 'la première s’écrit là' : 'sur ce compte',
    });
  }

  return (
    <>
      <ul className="tiles">
        {tiles.map(tile => (
          <li key={`${tile.to}-${tile.label}`}>
            <Link to={tile.to} className="tile">
              <span className="tile-icon">{tile.icon}</span>
              <strong className="tile-value">{tile.value}</strong>
              <span className="tile-label">{tile.label}</span>
              <small className="muted">{tile.detail}</small>
            </Link>
          </li>
        ))}
      </ul>
      {/* Le chiffre « en jeu » s'arrête à la limite anti-spoiler : le dire
          évite de faire passer une précaution pour une erreur de compte. */}
      {f.upTo < f.aired && (
        <p className="muted tiles-note">
          Ces comptes s’arrêtent à l’épisode {f.upTo} : c’est votre réglage
          anti-spoiler, pas la fin de la saison.
        </p>
      )}
    </>
  );
}
