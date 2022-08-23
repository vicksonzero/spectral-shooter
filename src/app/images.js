//@ts-check

import * as imageList from './imageList';
import { colors } from './colors'

export async function loadImages() {
    return {
        basicEnemyOrange: await createImageAsync(imageList.tile028, colors.darkOrange),
        basicEnemyPhysical: await createImageAsync(imageList.tile028, colors.darkGray),
        basicEnemySpectral: await createImageAsync(imageList.tile028, colors.gray),
        playerPhysical: await createImageAsync(imageList.tile077, colors.orange),
        playerSpectral: await createImageAsync(imageList.tile077, colors.lightGray),
        ghostFirePhysical: await createImageAsync(imageList.tile505, colors.lightGray),
        ghostFireSpectral: await createImageAsync(imageList.tile505, colors.blue),
        boxWhite: await createImageAsync(imageList.tile121, colors.white),
        boxDarkGray: await createImageAsync(imageList.tile121, colors.lightGray),
        dualPistolOrange: await createImageAsync(imageList.tile478_c, colors.orange),
        spiritRevolverBlue: await createImageAsync(imageList.tile133, colors.blue),
        floorTile1: await createImageAsync(imageList.tile006, colors.lightGray),
        floorTile2: await createImageAsync(imageList.tile002, colors.lightGray),
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