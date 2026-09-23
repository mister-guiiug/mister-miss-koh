import type { Team } from '../domain/referential';
import { colourName } from '../domain/tribes';

/**
 * Le nom d'une tribu, précédé de sa pastille — « ● Taboga · tribu jaune ».
 *
 * LA COULEUR N'EST JAMAIS SEULE. La pastille est décorative (`aria-hidden`) et
 * disparaît en contraste forcé : c'est le NOM qui dit la tribu, à l'écran comme
 * à la lecture vocale. `describe` ajoute le nom de la teinte, parce que c'est
 * ainsi qu'on en parle devant l'émission — « la jaune », « la rouge » —, et
 * qu'un nom de tribu inventé pour la saison ne se retient pas en un épisode.
 */
export function TribeName({
  team,
  describe = false,
}: {
  team: Team;
  describe?: boolean;
}) {
  const colour = colourName(team.colour);
  return (
    <span className="tribe">
      {team.colour && (
        <span
          className="tribe-swatch"
          style={{ background: team.colour }}
          aria-hidden="true"
        />
      )}
      <span className="tribe-name">{team.name}</span>
      {describe && colour && (
        <span className="tribe-colour"> · tribu {colour}</span>
      )}
    </span>
  );
}
