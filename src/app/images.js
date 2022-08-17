//@ts-check

// bash$ find ./src -iname "*.png"
import tile028 from '../assets/characters/tile028.png'
import tile077 from '../assets/characters/tile077.png'
import tile505 from '../assets/characters/tile505.png'
import tile567 from '../assets/characters/tile567.png'

import tile001 from '../assets/foliage/tile001.png'
import tile002 from '../assets/foliage/tile002.png'
import tile003 from '../assets/foliage/tile003.png'
import tile004 from '../assets/foliage/tile004.png'
import tile005 from '../assets/foliage/tile005.png'
import tile006 from '../assets/foliage/tile006.png'
import tile007 from '../assets/foliage/tile007.png'
import tile049 from '../assets/foliage/tile049.png'
import tile050 from '../assets/foliage/tile050.png'
import tile051 from '../assets/foliage/tile051.png'
import tile052 from '../assets/foliage/tile052.png'
import tile053 from '../assets/foliage/tile053.png'
import tile054 from '../assets/foliage/tile054.png'
import tile055 from '../assets/foliage/tile055.png'
import tile056 from '../assets/foliage/tile056.png'
import tile098 from '../assets/foliage/tile098.png'
import tile099 from '../assets/foliage/tile099.png'
import tile100 from '../assets/foliage/tile100.png'
import tile101 from '../assets/foliage/tile101.png'
import tile102 from '../assets/foliage/tile102.png'
import tile103 from '../assets/foliage/tile103.png'
import tile104 from '../assets/foliage/tile104.png'
import tile105 from '../assets/foliage/tile105.png'
import tile121 from '../assets/items/tile121.png'
import tile133 from '../assets/items/tile133.png'
import tile134 from '../assets/items/tile134.png'
import tile018 from '../assets/tiles/tile018.png'
import tile019 from '../assets/tiles/tile019.png'
import tile020 from '../assets/tiles/tile020.png'
import tile067 from '../assets/tiles/tile067.png'
import tile068 from '../assets/tiles/tile068.png'
import tile069 from '../assets/tiles/tile069.png'
import tile116 from '../assets/tiles/tile116.png'
import tile117 from '../assets/tiles/tile117.png'
import tile118 from '../assets/tiles/tile118.png'
import tile165 from '../assets/tiles/tile165.png'
import tile166 from '../assets/tiles/tile166.png'
import tile167 from '../assets/tiles/tile167.png'
import tile168 from '../assets/tiles/tile168.png'
import tile214 from '../assets/tiles/tile214.png'
import tile215 from '../assets/tiles/tile215.png'
import tile216 from '../assets/tiles/tile216.png'
import tile217 from '../assets/tiles/tile217.png'
import { colors } from './colors'




export async function loadImages() {
    return Promise.all([
        createImageAsync('basicEnemyOrange', tile028, colors.orange),
        createImageAsync('basicEnemyGray', tile028, colors.gray),
        createImageAsync('basicEnemyDarkGray', tile028, colors.darkGray),
        createImageAsync('playerOrange', tile077, colors.orange),
        createImageAsync('playerLightGray', tile077, colors.lightGray),
        createImageAsync('spectralFireBlue', tile505, colors.blue),
        createImageAsync('spectralFireLightGray', tile505, colors.lightGray),
    ])
        .then(entries => Object.fromEntries(entries));
}

async function createImageAsync(key, src, color) {
    const image = new Image();
    const bufferCanvas = document.createElement('canvas');

    await new Promise(resolve => {
        image.src = src;
        image.onload = resolve;
    });

    bufferCanvas.width = image.width;
    bufferCanvas.height = image.height;
    // @ts-ignore
    /** @type {CanvasRenderingContext2D}  */ const btx = bufferCanvas.getContext('2d');

    // fill offscreen buffer with the tint color
    btx.fillStyle = color;
    btx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height);

    // destination atop makes a result with an alpha channel identical to fg, but with all pixels retaining their original color *as far as I can tell*
    btx.globalCompositeOperation = "destination-atop";
    btx.drawImage(image, 0, 0);

    return [key, bufferCanvas];
}