//@ts-check

import * as imageList from './imageList';
import { colors } from './colors'

export async function loadImages() {
    return {
        basicEnemyOrange: await createImageAsync(imageList.tile028, colors.darkOrange),
        basicEnemyGray: await createImageAsync(imageList.tile028, colors.gray),
        basicEnemyDarkGray: await createImageAsync(imageList.tile028, colors.darkGray),
        playerOrange: await createImageAsync(imageList.tile077, colors.darkOrange),
        playerLightGray: await createImageAsync(imageList.tile077, colors.lightGray),
        spectralFireBlue: await createImageAsync(imageList.tile505, colors.blue),
        spectralFireLightGray: await createImageAsync(imageList.tile505, colors.lightGray),
        boxWhite: await createImageAsync(imageList.tile121, colors.lightGray),
        boxDarkGray: await createImageAsync(imageList.tile121, colors.lightGray),
        dualPistolOrange: await createImageAsync(imageList.tile133, colors.darkOrange),
        spiritRevolverBlue: await createImageAsync(imageList.tile133, colors.blue),
    };
}

async function createImageAsync(src, color) {
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

    return bufferCanvas;
}