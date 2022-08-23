// // @ts-check
import {
    /* system */ init, Sprite, GameLoop, Pool,
    /* mouse  */ initPointer, track, getPointer, pointerPressed,
    /* maths  */ angleToTarget, clamp, movePoint, lerp
    /* Vector is imported through Sprite, GameObject, Updatable */
} from 'kontra';
import { colors } from './colors';

import { loadImages } from './images';
import { ArcadeAudio } from './audio';

/**
 * behaviours:
 * w=walk(strafeDistance, speed, targetX, targetY), // infinite aggro range
 * <=chase,  // chase at speed of 1
 * >=avoid,  // avoid at speed of 1
 * .=wander, // wander at speed of 0.2
 * d=solid,  // try not to collide with others
 * D=static, // stops others from hitting
 * W=wall,   // static, plus absorbs bullets
 * m=melee,  // does knockback on both sides
 * s=shooty(spellCard),
 * // b=box()     // gives item
 */

const DIFFICULTY_RATIO = 1.618; // GoldenRatio=1.618

const BACKGROUND_COLOR = colors.bgGray;
const PHYSICAL_DIMENSION = 0;
const SPECTRAL_DIMENSION = 1;
const BETWEEN_DIMENSION1 = 2;
const BETWEEN_DIMENSION2 = 3;
const BETWEEN_DIMENSION3 = 4;


const MAIN_NONE = 0 // none
const MAIN_DUAL_PISTOL = 1 // dual pistol (low spray)
const MAIN_MACHINE_GUN = 2 // machine gun (mid spray)
const MAIN_SHOTGUN = 3 // shotgun (no spray)
const MAIN_DUAL_UZI = 4 // dual uzi (no spray)
const MAIN_MINI_GUN = 5 // mini gun (mid spray)
const MAIN_SPREAD_GUN = 6 // spread gun (no spray)
const MAIN_ROCKET = 7 // rocket (no spray)
const MAIN_NUKE = 8 // nuke (no spray)


const SUB_SPIRIT_DASH = 0 // Spirit Dash
const SUB_SPIRIT_REVOLVER = 1 // Spectral Revolver


const TEAM_PLAYER = 0;
const TEAM_ENEMY = 1; // or undefined


const ENEMY_RESPAWN_TIME = 20;
const TUT_WASD = 'Use WASD, ZQSD, or Arrow keys to move';
const TUT_SHOOT = 'Use mouse to aim, left click to shoot';
const TUT_ENEMIES = `Enemies can respawn after ${ENEMY_RESPAWN_TIME} seconds`;
const TUT_SPECTRAL_ATTACK = 'Touch %1% ghost fire to respawn';

const DIMENSION_TRANSITION_LENGTH1 = 500;
const DIMENSION_TRANSITION_LENGTH2 = 1000;
const DIMENSION_TRANSITION_LENGTH3 = 1000;


let currentDimension = 0; // 0=physical, 1=spectral
let dimensionTransitionUntil = 0;
let dimensionAlpha = 0; // 0=physical, 1=spectral

let score = 0;
let scoreMultiplier = 1;
let scoreMultiplierNextTick = 0;

let respawnEnergy = 0;
let respawnEnergyGoal = 5;

let nextSpawnTick = -1;

let mainWeapon = MAIN_NONE// MAIN_NONE;
let gunSide = 1; // 0, 1

let subWeapon = 0;



(async () => {
    // loading
    const images = await loadImages();
    const mainWeaponImages = [
        '',
        images.dualPistolOrange,
        images.dualPistolOrange,
        images.dualPistolOrange,
    ];
    const subWeaponImages = [
        '',
        images.spiritRevolverBlue,
    ];

    const audio = new ArcadeAudio();


    // init
    let { canvas, context } = init();

    context.imageSmoothingEnabled = false;
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
        x: canvas.width / 2,        // starting x,y position of the sprite
        y: canvas.height / 2 + 80,
        // color: 'red',  // fill color of the sprite rectangle
        // width: 20,     // width and height of the sprite rectangle
        // height: 40,
        // dx: 2,
        // dy: 2,
        image: images.playerPhysical,
        anchor: { x: 0.5, y: 0.5 },

        // custom properties
        team: TEAM_PLAYER, // 0=player, 1=enemy
        images: [images.playerPhysical, images.playerSpectral],
        speed: 1.5,
        nextCanShoot: Date.now(),
        dimension: PHYSICAL_DIMENSION, // 0=physical, 1=spectral
        frontRotation: 0,
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
            const progress = this.untilTime - Date.now();
            if (progress < 0) return;
            context.strokeStyle = 'purple';
            context.lineWidth = 1;
            context.beginPath();
            context.arc(this.x, this.y, this.r * progress / this.length, 0, 2 * Math.PI);
            context.stroke();
        },

    };

    function lerpRadians(a, b, lerpFactor)// Lerps from angle a to b (both between 0.f and 2*Math.PI), taking the shortest path
    {
        let result;
        let diff = b - a;
        if (diff < -Math.PI) {
            // lerp upwards past 2*Math.PI
            b += 2 * Math.PI;
            result = lerp(a, b, lerpFactor);
            if (result >= 2 * Math.PI) {
                result -= 2 * Math.PI;
            }
        }
        else if (diff > Math.PI) {
            // lerp downwards past 0
            b -= 2 * Math.PI;
            result = lerp(a, b, lerpFactor);
            if (result < 0) {
                result += 2 * Math.PI;
            }
        }
        else {
            // straight lerp
            result = lerp(a, b, lerpFactor);
        }

        return result;
    }
    function randomUnitVector() {
        const rotation = Math.random() * 2 * Math.PI;
        return {
            x: Math.cos(rotation),
            y: Math.sin(rotation),
        }
    }
    function dist(a, b) { // not using it saves more space ?!
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function hasCircleCollisionWith(a, b) { // not using it saves more space ?!
        return dist(a, b) < b.width / 2 + a.width / 2;
    }
    function spawnBasicEnemy() {
        // console.log('spawnBasicEnemy', this.x, this.y);
        const entity = Sprite({
            // #IfDev
            name: 'BasicEnemy',
            // #EndIfDev
            x: this.x,
            y: this.y,
            image: images.basicEnemyPhysical,
            anchor: { x: 0.5, y: 0.5 },

            // custom properties
            hp: 5,
            images: [images.basicEnemyPhysical, images.basicEnemySpectral],
            dimension: PHYSICAL_DIMENSION,
            b: 'dw<.',
            onDeathSpawn() { spawnGhostFire.call(this, randomUnitVector()); },
            targetX: this.x,
            targetY: this.y,
            speed: 1,
            aiNextTick: Date.now(),
            hitEffectUntil: Date.now(),
            render() {
                context.globalAlpha = this.hitEffectUntil > Date.now() ? 0.7 : 1;
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    context.drawImage(
                        this.image,
                        0,
                        0,
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
                context.globalAlpha = 1;
            },
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };
    function spawnGhostFire(knockbackDir) {
        console.log('spawnGhostFire', this.x, this.y, knockbackDir.x, knockbackDir.y);
        const entity = Sprite({
            // #IfDev
            name: 'GhostFire',
            // #EndIfDev
            x: this.x,
            y: this.y,
            image: images.ghostFirePhysical,
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
            images: [images.ghostFirePhysical, images.ghostFireSpectral],
            dimension: 1,
            hp: 1,
            b: 'w>.',
            knockDx: knockbackDir?.x * 3,
            knockDy: knockbackDir?.y * 3,
            speed: 0.2,
            targetX: this.x,
            targetY: this.y,
            aiNextTick: Date.now() + 1000,
            returnHp: 60 * ENEMY_RESPAWN_TIME,
            spawnEntity: spawnBasicEnemy,
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    }

    function spawnBox(x, y, _mainWeapon, _subWeapon) {
        const entity = Sprite({
            x, y,
            image: images.boxWhite,
            mainWeapon: _mainWeapon,
            subWeapon: _subWeapon,
            update() {
                if (Math.hypot(player.x - this.x, player.y - this.y) < this.width / 2 + player.width / 2) {
                    // console.log('player collect box');

                    if (this.mainWeapon) { // not zero
                        mainWeapon = this.mainWeapon;
                        nextSpawnTick = Date.now() + 500;
                        console.log(mainWeapon);
                    }
                    if (this.subWeapon) { // not zero
                        subWeapon = this.subWeapon;
                    }
                    audio.play('pickup');
                    this.ttl = 0;
                }
            },
            render() {
                // draw box
                const _x = - this.image.width / 2;
                const _y = - this.image.height / 2;
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    // context.fillStyle = colors.blue;
                    // context.fillRect(_x, _y, this.image.width, this.image.height);
                    context.fillStyle = colors.darkGray;
                    context.globalAlpha = 0.7;
                    context.beginPath();
                    context.ellipse(0, 0 + this.height - 10, 6, 2, 0, 0, Math.PI * 2);
                    context.fill();
                    context.globalAlpha = 1;
                    // context.drawImage(
                    //     this.image,
                    //     0,
                    //     0,
                    //     this.image.width,
                    //     this.image.height
                    // );
                }
                // @endif
                // draw bounding weapon
                const amplitude = 1;
                const yy = Math.sin(Date.now() % 500 / 500 * 2 * Math.PI) * amplitude - 12;
                if (this.mainWeapon) { // not zero
                    context.drawImage(
                        mainWeaponImages[this.mainWeapon],
                        _x,
                        yy,
                        this.image.width,
                        this.image.height
                    );
                }
                if (this.subWeapon) { // not zero
                    context.drawImage(
                        subWeaponImages[this.subWeapon],
                        0,
                        yy,
                        this.image.width,
                        this.image.height
                    );
                }
            },
        });
        entities.push(entity);
    }

    function spawnWithPortal(spawnEntity, { x, y }) {
        portals.push({
            // #IfDev
            name: 'portal',
            // #EndIfDev
            x,
            y,
            untilTime: Date.now() + 2000,
            ...portalPrototype,
            spawnEntity,
        });
    }

    function HandleSpawnTick() {
        if (nextSpawnTick == -1 || nextSpawnTick > Date.now()) return;

        for (let trial = 0; trial < 10; trial++) {
            const x = Math.random() * (canvas.width - 100) + 50;
            const y = Math.random() * (canvas.height - 100) + 50;
            const spawnWidth = 64;

            if (!entities.some(entity => Math.hypot(x - entity.x, y - entity.y) < entity.width / 2 + spawnWidth / 2)) {
                spawnWithPortal(spawnBasicEnemy, { x, y });
                break;
            }
        }

        nextSpawnTick = Date.now() + 1500 + Math.random() * 2000;
    }
    function bulletUpdate(dt) {
        this.advance(dt);
        const entity = entities
            .filter(entity => entity.hp && entity.team === this.team && entity.dimension === this.dimension)
            .find(entity => Math.hypot(this.x - entity.x, this.y - entity.y) < entity.width / 2 + this.width / 2)
            ;
        if (entity) {
            console.log('collision');

            // damage enemy
            entity.hp -= 1;
            entity.hitEffectUntil = Date.now() + 30;
            if (entity.hp <= 0) {
                score += 10 * scoreMultiplier;
                entity.ttl = 0;
                audio.play('explosion');
                entity.onDeathSpawn?.();
            }
            // destroy bullet
            audio.play('hit');
            this.ttl = 0;

        }
    }

    // spawnWithPortal(spawnBasicEnemy, {
    //     x: 200,
    //     y: 200,
    // });
    // spawnWithPortal(spawnBasicEnemy, {
    //     x: 250,
    //     y: 200,
    // });
    // spawnWithPortal(spawnBasicEnemy, {
    //     x: 250,
    //     y: 100,
    // });
    spawnBox(canvas.width / 2, canvas.height / 2, MAIN_DUAL_PISTOL);

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
            audio.play('test');
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

                // knockback ticks
                if (e.knockDx) {
                    e.x += e.knockDx;
                    e.knockDx *= 0.85;
                }
                if (e.knockDy) {
                    // console.log('e.knockDy', e.knockDy);
                    e.y += e.knockDy;
                    e.knockDy *= 0.85;
                }

                // ai targeting: chase, avoid, wander
                if (e.targetX != null) {
                    // choose target
                    if (e.b?.includes('<') && Date.now() > e.aiNextTick && e.dimension == player.dimension) {
                        e.targetX = player.x, e.targetY = player.y;
                        e.speed = 1;
                    } else if (e.b?.includes('>') && e.dimension == player.dimension) {
                        const dist = Math.hypot(e.x - player.x, e.y - player.y);
                        if (dist < 100) {
                            e.targetX = e.x + (e.x - player.x) / dist * 100;
                            e.targetY = e.y + (e.y - player.y) / dist * 100;
                            e.speed = 0.5;
                            e.aiNextTick = Date.now() + 2000;
                        } else if (Date.now() > e.aiNextTick) {
                            const randomVector = randomUnitVector();
                            const randomDistance = Math.random() * 32 + 16;
                            e.targetX = e.x + randomVector.x * randomDistance;
                            e.targetY = e.y + randomVector.y * randomDistance;
                            e.speed = 0.5;
                            e.aiNextTick = Date.now() + 2000;
                        }
                    } else if (e.b?.includes('.') && Date.now() > e.aiNextTick) {
                        const randomVector = randomUnitVector();
                        const randomDistance = Math.random() * 32 + 16;
                        e.targetX = e.x + randomVector.x * randomDistance;
                        e.targetY = e.y + randomVector.y * randomDistance;
                        e.speed = 0.5;
                        e.aiNextTick = Date.now() + 2000;
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

                // ai respawn
                if (e.returnHp) {
                    e.hp++;
                    if (e.hp >= e.returnHp) {
                        e.spawnEntity();
                        e.ttl = 0;
                    }
                }
                e.update();


                // collision
                const collisions = entities.filter(entity => entity != e && Math.hypot(e.x - entity.x, e.y - entity.y) < entity.width / 2 + e.width / 2);

                const enemyCollideWithPlayer = collisions.some(entity => entity == player);
                // if spectral enemy collides spectral player
                if (enemyCollideWithPlayer && player.dimension == SPECTRAL_DIMENSION && e.returnHp) {
                    // eat ghostFire
                    audio.play('coin');
                    respawnEnergy++;
                    e.ttl = 0;

                    // add to resurrection energy
                }

                // if physical enemy collides physical player
                if (enemyCollideWithPlayer && player.dimension == PHYSICAL_DIMENSION && e.dimension == PHYSICAL_DIMENSION) {
                    // kill player into spectral dimension

                    currentDimension = BETWEEN_DIMENSION1;
                    player.dimension = currentDimension;

                    dimensionAlpha = 0;
                    dimensionTransitionUntil = Date.now() + DIMENSION_TRANSITION_LENGTH1;
                    // console.log('currentDimension', currentDimension);

                    player.dx = 0;
                    player.dy = 0;
                    respawnEnergy = 0;

                    audio.play('death');
                }

                // if physical enemy collides spectral player
                if (enemyCollideWithPlayer && player.dimension == SPECTRAL_DIMENSION && e.dimension == PHYSICAL_DIMENSION) {
                    // damage enemy
                    audio.play('hit');
                    e.hp -= 3;
                    if (e.hp <= 0) {
                        score += 10 * scoreMultiplier;
                        audio.play('explosion');
                        e.ttl = 0;
                        e.onDeathSpawn?.();
                    }
                    // knockback player

                    const dist = Math.hypot(player.x - e.x, player.y - e.y);
                    player.knockDx = (player.x - e.x) / dist * 12;
                    player.knockDy = (player.y - e.y) / dist * 12;
                    console.log('knock player', player.knockDx, player.knockDy);
                }

                if (e != player && collisions.length) {
                    const closest = collisions[0];
                    const dist = Math.hypot(e.x - closest.x, e.y - closest.y);
                    if (dist > 0.01) {
                        e.x += (e.x - closest.x) / dist * 0.2;
                        e.y += (e.y - closest.y) / dist * 0.2;
                    }
                }
                if (e.x - e.width / 2 < 0) e.x = e.width / 2;
                if (e.x + e.width / 2 > canvas.width) e.x = canvas.width - e.width / 2;
                if (e.y - e.height / 2 < 0) e.y = e.height / 2;
                if (e.y + e.height / 2 > canvas.height) e.y = canvas.height - e.height / 2;
            });
            entities = entities.filter(e => e.ttl > 0);

            if (currentDimension == PHYSICAL_DIMENSION || currentDimension == SPECTRAL_DIMENSION) {
                const pointer = getPointer();
                const rotation = angleToTarget(player, pointer) - Math.PI / 2;
                // const keyboardRotation = Math.atan2(
                //     input.u ? -1 : input.d ? +1 : 0,
                //     input.l ? -1 : input.r ? +1 : 0
                // );
                // if (input.u || input.d || input.l || input.r) {
                //     player.frontRotation = lerpRadians(player.frontRotation, keyboardRotation, 0.1);
                // }
                player.frontRotation = lerpRadians(player.frontRotation, rotation, 0.2);

                player.dy = input.u ? -player.speed : input.d ? +player.speed : 0;
                player.dx = input.l ? -player.speed : input.r ? +player.speed : 0;

                if (player.dimension == SPECTRAL_DIMENSION) {
                    player.dx += Math.cos(player.frontRotation) * player.speed * 2;
                    player.dy += Math.sin(player.frontRotation) * player.speed * 2;
                }

                if (pointerPressed('left') && Date.now() >= player.nextCanShoot) {
                    // console.log('pointerPressed', mainWeapon);
                    if (mainWeapon == MAIN_DUAL_PISTOL && player.dimension == PHYSICAL_DIMENSION) { // dual pistol
                        const bulletSpeed = 20;
                        const bullet = playerBulletPool.get({
                            // #IfDev
                            name: 'bullet',
                            // #EndIfDev
                            x: player.x + Math.cos(rotation + gunSide * 0.4) * 12,               // starting x,y position of the sprite
                            y: player.y + Math.sin(rotation + gunSide * 0.4) * 12,
                            color: colors.white,  // fill color of the sprite rectangle
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
                        gunSide = -gunSide;
                        player.nextCanShoot = Date.now() + 200;
                        audio.play('shoot');
                    }
                }
            }
            HandleSpawnTick();


            // respawn
            if (respawnEnergy >= respawnEnergyGoal) {
                currentDimension = PHYSICAL_DIMENSION;
                player.dimension = currentDimension;
                respawnEnergyGoal = Math.floor(respawnEnergyGoal * DIFFICULTY_RATIO);
                audio.play('respawn');

                entities
                    .filter(entity => entity != player && Math.hypot(player.x - entity.x, player.y - entity.y) < 100)
                    .forEach(entity => {

                        const dist = Math.hypot(player.x - entity.x, player.y - entity.y);
                        entity.knockDx = (entity.x - player.x) / dist * 12;
                        entity.knockDy = (entity.y - player.y) / dist * 12;
                    });
            }

            // dimension change
            if (currentDimension == BETWEEN_DIMENSION1 && Date.now() >= dimensionTransitionUntil) {
                // silence
                currentDimension = BETWEEN_DIMENSION2;
                dimensionTransitionUntil = Date.now() + DIMENSION_TRANSITION_LENGTH2;
                player.dimension = currentDimension;
            }
            else if (currentDimension == BETWEEN_DIMENSION2 && Date.now() >= dimensionTransitionUntil) {
                currentDimension = BETWEEN_DIMENSION3;
                dimensionTransitionUntil = Date.now() + DIMENSION_TRANSITION_LENGTH3;
                player.dimension = currentDimension;
                audio.play('enter_spectral');
            }
            else if (currentDimension == BETWEEN_DIMENSION3 && Date.now() >= dimensionTransitionUntil) {
                currentDimension = SPECTRAL_DIMENSION;
                player.dimension = currentDimension;
            }
        },
        render() { // render the game state
            // background
            context.fillStyle = BACKGROUND_COLOR;
            context.fillRect(0, 0, canvas.width, canvas.height);
            const gradient = context.createRadialGradient(
                canvas.width / 2, canvas.height / 2, 30,
                canvas.width / 2, canvas.height / 2, 300);
            gradient.addColorStop(0, colors.darkBlue);
            gradient.addColorStop(1, colors.black);


            // background fade-in-out
            if (currentDimension == SPECTRAL_DIMENSION || currentDimension == PHYSICAL_DIMENSION) {
                dimensionAlpha = currentDimension;
            } else if (currentDimension == BETWEEN_DIMENSION3 && dimensionTransitionUntil - Date.now() < DIMENSION_TRANSITION_LENGTH3) {
                dimensionAlpha = 1 - (dimensionTransitionUntil - Date.now()) / DIMENSION_TRANSITION_LENGTH3 // Math.sign(currentDimension - dimensionAlpha) * 0.05;
            }

            // spectral background
            context.fillStyle = gradient;
            context.globalAlpha = dimensionAlpha; // FIXME: alpha does not work with firefox https://bugzilla.mozilla.org/show_bug.cgi?id=1164912
            context.fillRect(0, 0, canvas.width, canvas.height);
            // context.globalAlpha = 1;

            // render some tiles
            context.globalAlpha = 0.4;
            [
                [16 * 5, 16 * 6],
                [16 * 5, 16 * 7],
                [16 * 6, 16 * 7],
                [16 * 7, 16 * 7],
                [16 * 6, 16 * 8],

                [16 * 15, 16 * 3],

                [16 * 15, 16 * 7],
                [16 * 16, 16 * 7],
                [16 * 17, 16 * 7],
                [16 * 17, 16 * 8],
                [16 * 18, 16 * 8],
                [16 * 16, 16 * 8],

                [16 * 25, 16 * 2],
                [16 * 25, 16 * 3],
                [16 * 25, 16 * 4],
                [16 * 25, 16 * 5],
                [16 * 25, 16 * 6],
                [16 * 26, 16 * 3],
                [16 * 26, 16 * 4],
                [16 * 26, 16 * 5],
                [16 * 26, 16 * 6],
                [16 * 26, 16 * 7],

                [16 * 10, 16 * 13],
                [16 * 11, 16 * 13],
                [16 * 12, 16 * 13],
                [16 * 13, 16 * 14],
                [16 * 13, 16 * 15],
                [16 * 14, 16 * 14],
            ].forEach(([x, y]) => context.drawImage(images.floorTile1, x, y));
            context.globalAlpha = 1;

            // render all entities
            [
                ...portals,
                ...entities,
                playerBulletPool,
                ...enemyBullets
            ].forEach(e => {
                if (e != player || currentDimension == PHYSICAL_DIMENSION || currentDimension == SPECTRAL_DIMENSION) e.render();

                // draw a bar for respawning spectral entities
                if (e.returnHp) {
                    context.fillStyle = colors.lightGray;
                    context.globalAlpha = 0.3;
                    context.fillRect(e.x - e.width / 2, e.y + 12, e.width, 2);
                    context.globalAlpha = 1;
                    context.fillRect(e.x - e.width / 2, e.y + 12, e.width * e.hp / e.returnHp, 2);
                }
            });


            if (currentDimension == BETWEEN_DIMENSION1) {
                // death? animation
                let progress = 1 - (dimensionTransitionUntil - Date.now()) / DIMENSION_TRANSITION_LENGTH1;
                progress *= progress;
                const ww = player.image.width + 10000 * progress;
                const hh = player.image.height * (1 - progress);
                context.drawImage(player.image, player.x - ww / 2, player.y - hh / 2, ww, hh);
            } else if (currentDimension == BETWEEN_DIMENSION3) {
                // death? animation
                let progress = (dimensionTransitionUntil - Date.now()) / DIMENSION_TRANSITION_LENGTH3;
                progress *= progress;
                const ww = player.image.width + 10000 * progress;
                const hh = player.image.height * (1 - progress);
                context.drawImage(player.image, player.x - ww / 2, player.y - hh / 2, ww, hh);
            } else {
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

                context.beginPath();
                context.moveTo(xx, yy);
                context.lineTo(xx + Math.cos(player.frontRotation) * 16, yy + Math.sin(player.frontRotation) * 16);
                context.stroke();
                context.restore();
            }

            // score
            context.fillStyle = currentDimension == SPECTRAL_DIMENSION ? colors.white : colors.black;
            context.fillText(score, 10, 10);
        }
    });

    loop.start();    // start the game
})();