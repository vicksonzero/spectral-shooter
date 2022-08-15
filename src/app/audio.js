import { jsfxr } from '../lib/jsfxr/jsfxr';

// thanks https://codepen.io/jackrugile/post/arcade-audio-for-js13k-games
export class ArcadeAudio {
    constructor() {
        this.sounds = {};

        this.add('chop', 3,
            [
                [3, , 0.0138, , 0.2701, 0.4935, , -0.6881, , , , , , , , , , , 1, , , , , 0.25],
                [0, , 0.0639, , 0.2425, 0.7582, , -0.6217, , , , , , 0.4039, , , , , 1, , , 0.1, , 0.25],
                [3, , 0.0948, , 0.2116, 0.7188, , -0.6372, , , , , , , , , , , 1, , , 0.2236, , 0.25],
            ]
        );

        this.add('fire', 2,
            [
                [3, , 0.1645, 0.7236, 0.1, 0.0417, , , , , , , , , , , , , 1, , , , , 0.08],
                [3, , 0.1645, 0.7236, 0.2, 0.0217, , , , , , , , , , , , , 1, , , , , 0.08],
                [3, , 0.1645, 1.7236, 0.2, 0.0417, , , , , , , , , , , , , 1, , , , , 0.08],
                [3, , 0.1645, 0.7236, 0.3402, 0.010, , , , , , , , , , , , , 1, , , , , 0.1],
                [3, , 0.1645, 0.7236, 0.3402, 0.010, , , , , , , , , , , , , 1, , , , , 0],
            ]
        );
    }

    add(key, count, settings) {
        this.sounds[key] = [];
        settings.forEach((elem, index) => {
            this.sounds[key].push({
                tick: 0,
                count: count,
                pool: []
            });
            for (var i = 0; i < count; i++) {
                var audio = new Audio();
                audio.src = jsfxr(elem);
                this.sounds[key][index].pool.push(audio);
            }
        });
    }

    play(key, volume = 1) {
        var sound = this.sounds[key];
        var soundData = sound.length > 1 ? sound[Math.floor(Math.random() * sound.length)] : sound[0];
        soundData.pool[soundData.tick].volume = volume;
        soundData.pool[soundData.tick].play().catch(e => {/* do nothing */ });
        soundData.tick < soundData.count - 1 ? soundData.tick++ : soundData.tick = 0;
    }


}