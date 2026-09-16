/**
 * Sesión Screen Share — reexporta el coordinador existente.
 * No mezcla Sala/Batalla.
 */

export {
  beginScreenShareSession,
  endScreenShareSession,
  getScreenShareSession,
  screenShareSessionIdFor,
  type ScreenShareBranch,
  type ScreenShareSessionSnapshot,
  type ScreenShareTransportMode,
} from '../../lib/screenShareSessionCoordinator';
