// @ts-check
import {
    /* system */ init, Sprite, GameLoop, Pool,
    /* mouse  */ initPointer, track, getPointer, pointerPressed,
    /* maths  */ angleToTarget
} from 'kontra';
import { colors } from './colors';

import { loadImages } from './images';



let currentDimension = 0; // 0=physical, 1=spectral

(async () => {
    // loading
    const images = await loadImages();
    // init
    let { canvas, context } = init();
    // this function must be called first before pointer
    // functions will work
    initPointer();

    const blocks = [];
    let portals = [];
    const entities = [];
    let playerBulletPool = Pool({
        // create a new sprite every time the pool needs a new object
        create: Sprite
    });
    let enemyBulletPool = Pool({
        // create a new sprite every time the pool needs a new object
        create: Sprite
    });
    const enemyBullets = [];

    let player = Sprite({
        // name: 'player',
        x: 100,        // starting x,y position of the sprite
        y: 80,
        // color: 'red',  // fill color of the sprite rectangle
        // width: 20,     // width and height of the sprite rectangle
        // height: 40,
        // dx: 2,
        // dy: 2,
        image: images.playerOrange,

        // custom properties
        images: [images.playerOrange, images.playerLightGray],
        speed: 3,
        nextCanShoot: Date.now(),
        dimension: 0,
    });
    entities.push(player);

    const portalPrototype = {
        r: 16,
        length: 2000,
        update() {
            if (Date.now() >= this.untilTime) {
                this.spawnEntity(this);
            }
        },
        render() {
            context.strokeStyle = 'purple';
            context.lineWidth = 1;
            context.beginPath();
            context.arc(this.x, this.y, this.r * (this.untilTime - Date.now()) / this.length, 0, 2 * Math.PI);
            context.stroke();
        },

    };

    const spawnBasicEnemy = function (_this) {
        console.log('spawnBasicEnemy', _this.x, _this.y);
        const entity = Sprite({
            x: _this.x,
            y: _this.y,
            image: images.basicEnemyGray,

            // custom properties
            images: [images.basicEnemyGray, images.basicEnemyDarkGray],
            dimension: 0,
        });
        entity.x = _this.x - entity.width / 2;
        entity.y = _this.y - entity.height / 2;
        entities.push(entity);
    };
    const spawnSpectralFire = function (_this) {
        console.log('spawnSpectralFire', _this.x, _this.y);
        const entity = Sprite({
            x: _this.x,
            y: _this.y,
            image: images.spectralFireLightGray,

            render() {
                const yy = Date.now() % 500;
                console.log('yy', (Math.sin(yy / 500 * 2 * Math.PI)) * 1);
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    context.drawImage(
                        this.image,
                        0,
                        Math.sin(yy / 500 * 2 * Math.PI) * 1,
                        this.image.width,
                        this.image.height
                    );
                }
                // @endif

                if (this.color) {
                    context.fillStyle = this.color;
                    context.fillRect(0, 0, this.width, this.height);
                }
            },

            // custom properties
            images: [images.spectralFireLightGray, images.spectralFireBlue],
            dimension: 0,
        });
        entity.x = this.x - entity.width / 2;
        entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };

    function sameWorldAsPlayer(entity) {
        return entity.dimension == player.dimension;
    }

    
    portals.push({
        x: 200,
        y: 200,
        untilTime: Date.now() + 2000,
        ...portalPrototype,
        spawnEntity: spawnBasicEnemy,
    });
    portals.push({
        x: 250,
        y: 200,
        untilTime: Date.now() + 2000,
        ...portalPrototype,
        spawnEntity: spawnBasicEnemy,
    });
    portals.push({
        x: 250,
        y: 100,
        untilTime: Date.now() + 2000,
        ...portalPrototype,
        spawnEntity: spawnSpectralFire,
    });


    // Inputs (see https://xem.github.io/articles/jsgamesinputs.html)
    const input = {
        u: 0,
        d: 0,
        l: 0,
        r: 0,
        a: 0, /* attack */
        c1: 0, /* cheats */
        c2: 0, /* cheats */
    };

    const keyHandler = (e) => {
        const w = e.keyCode, t = e.type;

        // console.log("keyHandler", w, t);

        // -4 bytes zipped compared to if-statements
        // ['WASD', 'ZQSD', '↑←↓→']
        const keyMap = {
            87: 'u', /* W */
            90: 'u', /* Z */
            38: 'u', /* ↑ */
            83: 'd', /* S */
            40: 'd', /* ↓ */
            65: 'l', /* A */
            81: 'l', /* Q */
            37: 'l', /* ← */
            68: 'r', /* D */
            39: 'r', /* → */
            74: 'a', /* J */
            75: 'a', /* K */
            48: 'c1', /* 0 */ // cheat 1
            32: 's', /* space */
            8: 'b', /* backspace */
        };

        if (!keyMap[w]) return;

        input[keyMap[w]] = +(t[3] < 'u');

        // toggles quick hack
        if (input.c1 && 'c1' == keyMap[w]) {
            input.c1 = 0;
        }
        if (input.s && 's' == keyMap[w]) {
            currentDimension = +!currentDimension;
            input.s = 0;
        }
        // END toggles quick hack

        e.preventDefault();
        e.stopPropagation();
    };
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('keyup', keyHandler);

    let loop = GameLoop({  // create the main game loop
        update: function () { // update the game state
            portals.forEach(e => e.update());
            portals = portals.filter(p => Date.now() < p.untilTime);
            [
                ...entities,
                playerBulletPool,
                ...enemyBullets
            ].forEach(e => {
                e.image = e.images?.[currentDimension] ?? e.image;
                e.update()
            });
            if (player.x < 0) player.x = 0;
            if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
            if (player.y < 0) player.y = 0;
            if (player.y + player.height > canvas.height) player.y = canvas.height - player.height;

            player.dy = input.u ? -player.speed : input.d ? +player.speed : 0;
            player.dx = input.l ? -player.speed : input.r ? +player.speed : 0;

            const pointer = getPointer();
            if (pointerPressed('left') && Date.now() >= player.nextCanShoot) {
                const bulletSpeed = 14;
                const xx = player.x + player.width / 2;
                const yy = player.y + player.height / 2;
                const rotation = angleToTarget({ x: xx, y: yy }, pointer) - Math.PI / 2;
                const bullet = playerBulletPool.get({
                    // name: 'bullet',
                    x: xx,               // starting x,y position of the sprite
                    y: yy,
                    color: colors.gray,  // fill color of the sprite rectangle
                    width: 15,           // width and height of the sprite rectangle
                    height: 2,
                    dx: Math.cos(rotation) * bulletSpeed,
                    dy: Math.sin(rotation) * bulletSpeed,
                    rotation,
                    ttl: 3000,

                    // custom properties
                    bulletSpeed,
                });
                player.nextCanShoot = Date.now() + 300;
            }

        },
        render: function () { // render the game state
            context.fillStyle = currentDimension ? colors.black : colors.bgOrange;
            context.fillRect(0, 0, canvas.width, canvas.height);
            [
                ...portals,
                ...entities,
                playerBulletPool,
                ...enemyBullets
            ].forEach(e => e.render());

            const pointer = getPointer();
            const xx = player.x + player.width / 2;
            const yy = player.y + player.height / 2;
            const aimX = pointer.x - xx;
            const aimY = pointer.y - yy;

            context.save();
            context.strokeStyle = colors.orange;
            context.lineWidth = 1;
            context.globalAlpha = 0.3;
            context.beginPath();
            context.moveTo(xx, yy);
            context.lineTo(xx + aimX * 100, yy + aimY * 100);
            context.stroke();
            context.restore();
        }
    });

    loop.start();    // start the game
})();