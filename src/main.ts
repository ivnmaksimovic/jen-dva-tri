import { Game } from './game/Game.js';
import { createProtoScene } from './game/proto/proto.js';
import './style.css';

const game = new Game({ container: document.getElementById('app')! });

// v0 throwaway prototype (see src/game/proto/). Rapier's WASM init is async,
// so the loop starts once the scene is ready.
createProtoScene(game)
  .then(() => game.start())
  .catch((err) => {
    console.error('Failed to start prototype:', err);
    document.title = 'Failed to start — see console';
  });
