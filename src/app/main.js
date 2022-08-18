// // @ts-check
import {
    /* system */ init, Sprite, GameLoop, Pool,
    /* mouse  */ initPointer, track, getPointer, pointerPressed,
    /* maths  */ angleToTarget, clamp, movePoint
} from 'kontra';
import { colors } from './colors';

import { loadImages } from './images';

/**
 * behaviours:
 * w=walk(strafeDistance, speed, targetX, targetY), // infinite aggro range
 * <=chase, // chase at speed of 1
 * >=avoid, // avoid at speed of 1
 * .=wander, // wander at speed of 0.2
 * d=solid, // push entities away from radius (width/2)
 * m=melee, // does knockback on both sides
 * s=shooty(spellCard),
 */


let currentDimension = 0; // 0=physical, 1=spectral
let dimensionAlpha = 0; // 0=physical, 1=spectral


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
    let entities = [];
    let playerBulletPool = Pool({
        // create a new sprite every time the pool needs a new object
        //@ts-ignore
        create: Sprite
    });
    let enemyBulletPool = Pool({
        // create a new sprite every time the pool needs a new object
        //@ts-ignore
        create: Sprite
    });
    const enemyBullets = [];

    let player = Sprite({
        // #IfDev
        name: 'player',
        // #EndIfDev
        x: 100,        // starting x,y position of the sprite
        y: 80,
        // color: 'red',  // fill color of the sprite rectangle
        // width: 20,     // width and height of the sprite rectangle
        // height: 40,
        // dx: 2,
        // dy: 2,
        image: images.playerOrange,
        anchor: { x: 0.5, y: 0.5 },

        // custom properties
        team: 0, // 0=player, 1=enemy
        images: [images.playerOrange, images.playerLightGray],
        speed: 3,
        nextCanShoot: Date.now(),
        dimension: 0, // 0=physical, 1=spectral
    });
    entities.push(player);

    const portalPrototype = {
        r: 16,
        length: 2000,
        update() {
            if (Date.now() >= this.untilTime) {
                this.spawnEntity();
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
    function randomUnitVector() {
        const rotation = Math.random() * 2 * Math.PI;
        return {
            x: Math.cos(rotation),
            y: Math.sin(rotation),
        }
    }
    function spawnBasicEnemy() {
        console.log('spawnBasicEnemy', this.x, this.y);
        const entity = Sprite({
            // #IfDev
            name: 'BasicEnemy',
            // #EndIfDev
            x: this.x,
            y: this.y,
            image: images.basicEnemyGray,
            anchor: { x: 0.5, y: 0.5 },

            // custom properties
            hp: 3,
            images: [images.basicEnemyGray, images.basicEnemyDarkGray],
            dimension: 0,
            b: 'w<.',
            onDeathSpawn() { spawnSpectralFire.call(this, randomUnitVector()); },
            targetX: this.x,
            targetY: this.y,
            speed: 1,
            aiNextTick: Date.now(),
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };
    function spawnSpectralFire(knockbackDir) {
        console.log('spawnSpectralFire', this.x, this.y, knockbackDir);
        const entity = Sprite({
            // #IfDev
            name: 'SpectralFire',
            // #EndIfDev
            x: this.x,
            y: this.y,
            image: images.spectralFireLightGray,
            anchor: { x: 0.5, y: 0.5 },

            render() {
                const yy = Math.sin(Date.now() % 500 / 500 * 2 * Math.PI) * 1;
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    context.drawImage(
                        this.image,
                        0,
                        yy,
                        this.image.width,
                        this.image.height
                    );
                }
                // @endif

                if (this.color) {
                    context.fillStyle = this.color;
                    //@ts-ignore
                    context.fillRect(0, 0, this.width, this.height);
                }
            },

            // custom properties
            images: [images.spectralFireLightGray, images.spectralFireBlue],
            dimension: 1,
            hp: 1,
            b: 'w>.',
            knockDx: knockbackDir?.x * 3,
            knockDy: knockbackDir?.y * 3,
            speed: 0.2,
            targetX: this.x,
            targetY: this.y,
            aiNextTick: Date.now(),
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    }
    function bulletUpdate(dt) {
        this.advance(dt);
        const entity = entities
            .filter(entity => entity.hp && entity.team === this.team && entity.dimension === this.dimension)
            .find(entity => Math.hypot(this.x - entity.x, this.y - entity.y) < entity.width / 2 + this.width / 2)
            ;
        if (entity) {
            console.log('collision');
            entity.hp -= 1;
            if (entity.hp <= 0) {
                entity.ttl = 0;
                entity.onDeathSpawn?.();
            }
            this.ttl = 0;
        }
    }

    portals.push({
        // #IfDev
        name: 'portal',
        // #EndIfDev
        x: 200,
        y: 200,
        untilTime: Date.now() + 2000,
        ...portalPrototype,
        spawnEntity: spawnBasicEnemy,
    });
    portals.push({
        // #IfDev
        name: 'portal',
        // #EndIfDev
        x: 250,
        y: 200,
        untilTime: Date.now() + 2000,
        ...portalPrototype,
        spawnEntity: spawnBasicEnemy,
    });
    portals.push({
        // #IfDev
        name: 'portal',
        // #EndIfDev
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
            currentDimension = +(!currentDimension);
            console.log('currentDimension', currentDimension);
            player.dimension = currentDimension;
            input.s = 0;
        }
        // END toggles quick hack

        e.preventDefault();
        e.stopPropagation();
    };
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('keyup', keyHandler);

    let loop = GameLoop({  // create the main game loop
        update() { // update the game state
            portals.forEach(e => e.update());
            portals = portals.filter(p => Date.now() < p.untilTime);
            [
                ...entities,
                playerBulletPool,
                ...enemyBullets
            ].forEach(e => {
                e.image = e.images?.[currentDimension] ?? e.image;
                if (e.knockDx) {
                    e.x += e.knockDx;
                    e.knockDx *= 0.85;
                }
                if (e.knockDy) {
                    // console.log('e.knockDy', e.knockDy);
                    e.y += e.knockDy;
                    e.knockDy *= 0.85;
                }
                if (e.targetX != null) {
                    if (Date.now() > e.aiNextTick) {
                        // choose target
                        if (e.b?.includes('<') && e.dimension == player.dimension) {
                            e.targetX = player.x, e.targetY = player.y;
                            e.speed = 1;
                        } else if (e.b?.includes('>') && e.dimension == player.dimension) {
                            const dist = Math.hypot(e.x - player.x, e.y - player.y);
                            e.targetX = e.x + (e.x - player.x) / dist * 100;
                            e.targetY = e.y + (e.y - player.y) / dist * 100;
                            e.speed = 1;
                            e.aiNextTick = Date.now() + 2000;
                        } else if (e.b?.includes('.')) {
                            const randomVector = randomUnitVector();
                            const randomDistance = Math.random() * 32 + 16;
                            e.targetX = e.x + randomVector.x * randomDistance;
                            e.targetY = e.y + randomVector.y * randomDistance;
                            e.speed = 0.5;
                            e.aiNextTick = Date.now() + 2000;
                        }
                    }
                    // move
                    const dist = Math.hypot(e.x - e.targetX, e.y - e.targetY);
                    if (dist < e.speed) {
                        e.x = e.targetX, e.y = e.targetY;
                    } else {
                        e.x += (e.targetX - e.x) / dist * e.speed;
                        e.y += (e.targetY - e.y) / dist * e.speed;
                    }
                }
                e.update();


                if (e.x - e.width / 2 < 0) e.x = e.width / 2;
                if (e.x + e.width / 2 > canvas.width) e.x = canvas.width - e.width / 2;
                if (e.y - e.height / 2 < 0) e.y = e.height / 2;
                if (e.y + e.height / 2 > canvas.height) e.y = canvas.height - e.height / 2;
            });
            entities = entities.filter(e => e.ttl > 0);

            player.dy = input.u ? -player.speed : input.d ? +player.speed : 0;
            player.dx = input.l ? -player.speed : input.r ? +player.speed : 0;

            const pointer = getPointer();
            if (pointerPressed('left') && Date.now() >= player.nextCanShoot) {
                const bulletSpeed = 20;
                const rotation = angleToTarget(player, pointer) - Math.PI / 2;
                const bullet = playerBulletPool.get({
                    // #IfDev
                    name: 'bullet',
                    // #EndIfDev
                    x: player.x,               // starting x,y position of the sprite
                    y: player.y,
                    color: colors.gray,  // fill color of the sprite rectangle
                    width: 8,           // width and height of the sprite rectangle
                    height: 2,
                    dx: Math.cos(rotation) * bulletSpeed,
                    dy: Math.sin(rotation) * bulletSpeed,
                    rotation,
                    ttl: 3000,
                    anchor: { x: 0.5, y: 0.5 },
                    update: bulletUpdate,
                    // custom properties
                    dimension: player.dimension,
                    bulletSpeed,
                });
                player.nextCanShoot = Date.now() + 300;
            }

        },
        render() { // render the game state

            context.fillStyle = colors.bgOrange;
            context.fillRect(0, 0, canvas.width, canvas.height);
            const gradient = context.createRadialGradient(
                canvas.width / 2, canvas.height / 2, 30,
                canvas.width / 2, canvas.height / 2, 300);
            // Add three color stops
            gradient.addColorStop(0, colors.darkBlue);
            gradient.addColorStop(1, colors.black);

            if (Math.abs(currentDimension - dimensionAlpha) <= 0.05) {
                dimensionAlpha = currentDimension;
            } else {
                dimensionAlpha += Math.sign(currentDimension - dimensionAlpha) * 0.05;
            }

            context.fillStyle = gradient;
            context.globalAlpha = dimensionAlpha; // FIXME: alpha does not work with firefox https://bugzilla.mozilla.org/show_bug.cgi?id=1164912
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.globalAlpha = 1;
            [
                ...portals,
                ...entities,
                playerBulletPool,
                ...enemyBullets
            ].forEach(e => e.render());

            const pointer = getPointer();
            const xx = player.x;
            const yy = player.y;
            const aimX = pointer.x - xx;
            const aimY = pointer.y - yy;

            context.save();
            context.strokeStyle = currentDimension ? colors.blue : colors.orange;
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