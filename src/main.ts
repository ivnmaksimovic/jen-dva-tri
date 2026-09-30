import { Game } from './game/Game.js';
import { createDemoScene } from './game/demo.js';
import './style.css';

const game = new Game({ container: document.getElementById('app')! });
createDemoScene(game.scene, game);

game.start();
