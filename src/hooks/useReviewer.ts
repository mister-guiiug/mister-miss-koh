import { useEffect, useState } from 'react';
import { isReviewer } from '../backend/reviewer';

/** `true` une fois la session lue et un rôle relecteur trouvé. */
export function useReviewer(accountId: string | null | undefined): boolean {
  const [reviewer, setReviewer] = useState(false);

  useEffect(() => {
    if (!accountId) {
      setReviewer(false);
      return;
    }
    let alive = true;
    void isReviewer().then(value => {
      if (alive) setReviewer(value);
    });
    return () => {
      alive = false;
    };
  }, [accountId]);

  return reviewer;
}
