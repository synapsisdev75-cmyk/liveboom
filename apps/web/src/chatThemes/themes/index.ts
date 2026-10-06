import { registerChatTheme } from '../registry';
import { aurora } from './aurora';
import { boomNeon } from './boomNeon';
import { candyBoom } from './candyBoom';
import { cyberCity } from './cyberCity';
import { fuegoBoom } from './fuegoBoom';
import { galaxiaLive } from './galaxiaLive';
import { goldenNight } from './goldenNight';
import { liveboomOriginal } from './liveboomOriginal';
import { oceanoProfundo } from './oceanoProfundo';
import { selvaDigital } from './selvaDigital';

[
  liveboomOriginal,
  boomNeon,
  aurora,
  fuegoBoom,
  oceanoProfundo,
  galaxiaLive,
  cyberCity,
  goldenNight,
  candyBoom,
  selvaDigital,
].forEach(registerChatTheme);

export { LIVEBOOM_ORIGINAL_ID } from './liveboomOriginal';
