import { MapPin } from 'lucide-react';
import { UserAvatar } from '../profile/UserAvatar';

export type MapPerson = {
  uid?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
  displayName?: string | null;
};

type Props = {
  person?: MapPerson | null;
  live?: boolean;
  size?: number;
};

/** Marcador de ubicación: foto de quien comparte, anillo "EN VIVO" y punta apoyada en el punto exacto. */
export function LocationPin({ person, live = false, size = 46 }: Props) {
  const hasPerson = Boolean(person && (person.uid || person.avatarUrl || person.handle || person.displayName));
  return (
    <div className={`lb-loc-pin${live ? ' is-live' : ''}`} style={{ ['--lb-loc-pin-size' as string]: `${size}px` }}>
      <span className="lb-loc-pin__halo" aria-hidden />
      <span className="lb-loc-pin__head">
        {hasPerson ? (
          <UserAvatar
            src={person?.avatarUrl}
            uid={person?.uid}
            username={person?.handle}
            displayName={person?.displayName}
            size={size - 8}
          />
        ) : (
          <span className="lb-loc-pin__icon">
            <MapPin size={Math.round(size * 0.45)} />
          </span>
        )}
      </span>
      {live ? <span className="lb-loc-pin__badge">EN VIVO</span> : null}
      <span className="lb-loc-pin__tail" aria-hidden />
      <span className="lb-loc-pin__ground" aria-hidden />
    </div>
  );
}
