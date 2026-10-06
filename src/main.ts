import Phaser from 'phaser';
import { MatchScene } from './render/MatchScene';
import { PALETTE } from './render/palette';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './render/view';
import { mountBuildTag } from './ui/buildTag';
import { mountControlsHint } from './ui/controlsHint';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: PALETTE.background,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MatchScene],
});

mountBuildTag();
mountControlsHint(
  'WASD move  ·  mouse aims  ·  click: pass  ·  hold + release: shoot  ·  G: drop ball (debug)',
);
