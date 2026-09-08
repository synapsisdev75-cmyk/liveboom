import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const overlay = readFileSync(resolve(root, 'src/components/social/CallOverlay.tsx'), 'utf8');
const frames = readFileSync(resolve(root, 'src/components/social/CallSessionFrames.tsx'), 'utf8');
const layout = readFileSync(resolve(root, 'src/components/social/privateCallLayout.ts'), 'utf8');
const contain = readFileSync(resolve(root, 'src/components/social/privateCallContain.css'), 'utf8');

const videoUi = overlay.slice(overlay.indexOf('const videoLiveUi'), overlay.indexOf('const voiceLiveUi'));
const voiceUi = overlay.slice(overlay.indexOf('const voiceLiveUi'), overlay.indexOf('const ringingChrome'));
const videoFrame = frames.slice(frames.indexOf('export function VideoCallSessionFrame'), frames.indexOf('export function VoiceCallSessionFrame'));
const voiceFrame = frames.slice(frames.indexOf('export function VoiceCallSessionFrame'));
const videoStage = overlay.slice(overlay.indexOf('function VideoCallStage'), overlay.indexOf('export function CallOverlay'));
const voiceStage = overlay.slice(overlay.indexOf('function VoiceCallStage'), overlay.indexOf('function VideoCallStage'));

let failed = 0;
function test(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

test(
  '1. Voice LiveKit host unchanged (thin .lb-voice-lk + room--voice)',
  /className="lb-voice-lk"/.test(voiceUi) &&
    /className="lb-call-room--voice"/.test(voiceUi) &&
    /style=\{livekitStyle\}/.test(voiceUi) &&
    /\{connected \? null : chrome\}/.test(voiceFrame) &&
    /hold \? 'lb-call-livekit-hold' : 'lb-voice-live-slot'/.test(voiceFrame) &&
    /<VoiceCallActive/.test(voiceStage),
  'voice overlay structure drifted',
);

test(
  '2. Video session frame uses the same chrome/hold/live split as voice',
  /\{connected \? null : chrome\}/.test(videoFrame) &&
    /hold \? 'lb-call-livekit-hold' : 'lb-video-live-slot'/.test(videoFrame) &&
    /connected \? 'lb-video-live-slot'/.test(videoFrame) &&
    !/header/.test(videoFrame) &&
    !/lb-video-connected-live-slot/.test(videoFrame),
  'video frame still splits header outside LiveKit',
);

test(
  '3. Video LiveKit host mirrors voice (one .lb-video-lk, same room style, no park shell)',
  /className="lb-video-lk"/.test(videoUi) &&
    /className="lb-call-room"/.test(videoUi) &&
    /style=\{livekitStyle\}/.test(videoUi) &&
    /LIVEKIT_VOICE_STYLE/.test(overlay) &&
    !/lb-private-lk-shell/.test(videoUi) &&
    !/data-private-lk/.test(videoUi) &&
    !/LIVEKIT_PARK_STYLE/.test(overlay) &&
    /width: 'fit-content'/.test(layout) &&
    /height: 'auto'/.test(layout),
  'video still uses a separate park/shell host',
);

test(
  '4. Connected video chrome lives inside VideoCallStage (header + stage + bar)',
  /<ConnectedVideoCallHeader/.test(videoStage) &&
    /lb-call-video-stage/.test(videoStage) &&
    /<PrivateCallRemoteVideo/.test(videoStage) &&
    /lb-call-video-local/.test(videoStage) &&
    /<ConnectedVideoCallBar/.test(videoStage) &&
    /lb-call-stage-keep is-connected/.test(videoStage) &&
    /lb-video-connected-screen/.test(videoStage),
  'video connected UI missing inside the room',
);

test(
  '5. Incoming ringing still has no LiveKit until accept; hold parks LiveKit while ringing-out',
  /const videoLiveUi = !showCall \|\| !isVideo \? null/.test(overlay) &&
    /const voiceLiveUi = !showCall \|\| isVideo \? null/.test(overlay) &&
    /hold=\{holdLiveKit\}/.test(overlay) &&
    /mediaActive=\{status === 'active'\}/.test(overlay),
);

test(
  '6. Isolation: voice CSS host kept; contain.css does not park video to 1px; posts/clips/LIVE untouched',
  /lb-voice-lk/.test(voiceUi) &&
    !/left:\s*-10000/.test(contain) &&
    !/height:\s*1px\s*!important/.test(contain) &&
    !/SocialPostCard|boom_clip|flashboom|LiveRoom/.test(videoUi) &&
    !/contentType/.test(contain),
);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\n6/6 private-call audits passed');
