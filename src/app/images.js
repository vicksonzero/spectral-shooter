//@ts-check

import * as imageList from './imageList';
import { colors } from './colors'

export async function loadImages() {
    return Promise.all([
        createImageAsync('basicEnemyOrange', imageList.tile028, colors.darkOrange),
        createImageAsync('basicEnemyGray', imageList.tile028, colors.gray),
        createImageAsync('basicEnemyDarkGray', imageList.tile028, colors.darkGray),
        createImageAsync('playerOrange', imageList.tile077, colors.darkOrange),
        createImageAsync('playerLightGray', imageList.tile077, colors.lightGray),
        createImageAsync('spectralFireBlue', imageList.tile505, colors.blue),
        createImageAsync('spectralFireLightGray', imageList.tile505, colors.lightGray),
        createImageAsync('boxWhite', imageList.tile505, colors.lightGray),
        createImageAsync('boxDarkGray', imageList.tile505, colors.lightGray),
        createImageAsync('dualPistolOrange', imageList.tile505, colors.darkOrange),
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