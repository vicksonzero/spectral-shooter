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
 * w=walk(strafe, speed, targetX, targetY), // infinite aggro range
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

const DIFFICULTY_RATIO = 1.1; // GoldenRatio=1.618

const BACKGROUND_COLOR = colors.bgBrown;
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


const ENEMY_RESPAWN_TIME = 25;
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

let energy = 0;
let respawnEnergyGoal = 5;
let respawnEnergyTimeLimit = 0;
let levelUpEnergyGoal = 15;

let nextSpawnTick = -1;
let enemyCount = 0;

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
    // audio.volume = 0; // TODO: make mute button

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
            strafe: 0,
            onDeathSpawn() { spawnGhostFire.call(this, randomUnitVector(), spawnBasicEnemy); },
            targetX: this.x,
            targetY: this.y,
            speed: 1,
            aiNextTick: Date.now(),
            hitEffectUntil: Date.now(),
            team: TEAM_ENEMY,
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

                // if (this.color) {
                //     context.fillStyle = this.color;
                //     //@ts-ignore
                //     context.fillRect(0, 0, this.width, this.height);
                // }
                context.globalAlpha = 1;
            },
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };
    function spawnShooterEnemy() {
        // console.log('spawnShooterEnemy', this.x, this.y);
        const entity = Sprite({
            // #IfDev
            name: 'ShooterEnemy',
            // #EndIfDev
            x: this.x,
            y: this.y,
            image: images.shooterEnemyPhysical,
            anchor: { x: 0.5, y: 0.5 },

            // custom properties
            hp: 3,
            team: TEAM_ENEMY,
            images: [images.shooterEnemyPhysical, images.shooterEnemySpectral],
            dimension: PHYSICAL_DIMENSION,
            b: 'dw<.s',
            strafe: 150,
            onDeathSpawn() { spawnGhostFire.call(this, randomUnitVector(), spawnShooterEnemy); },
            targetX: this.x,
            targetY: this.y,
            speed: 1,
            aiNextTick: Date.now(),
            hitEffectUntil: Date.now(),
            team: TEAM_ENEMY,
            nextCanShoot: Date.now() + 1500,
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

                // if (this.color) {
                //     context.fillStyle = this.color;
                //     //@ts-ignore
                //     context.fillRect(0, 0, this.width, this.height);
                // }
                context.globalAlpha = 1;
            },
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };
    function spawnGhostFire(knockbackDir, spawnEntity) {
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
                    if (currentDimension == PHYSICAL_DIMENSION && this.hp / this.returnHp < 0.7) context.globalAlpha = 0.3;
                    context.drawImage(
                        this.image,
                        0,
                        yy,
                        this.image.width,
                        this.image.height
                    );
                    context.globalAlpha = 1;
                }
                // @endif

                if (this.color) {
                    context.fillStyle = this.color;
                    //@ts-ignore
                    context.fillRect(0, 0, this.width, this.height);
                }
            },

            // custom properties
            team: TEAM_ENEMY,
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
            spawnEntity,
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
        return entity;
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
                        // console.log(mainWeapon);
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

    function HandleSpawnTick() {
        // spawner
        if (nextSpawnTick == -1 || nextSpawnTick > Date.now()) return;

        for (let i = 0; i < (enemyCount > levelUpEnergyGoal ? 2 : 3); i++) {
            for (let trial = 0; trial < 10; trial++) {
                const x = Math.random() * (canvas.width - 100) + 50;
                const y = Math.random() * (canvas.height - 100) + 50;
                const spawnWidth = 64;
                const list = [
                    spawnBasicEnemy,
                    spawnShooterEnemy,
                ];

                if (!entities.some(entity => Math.hypot(x - entity.x, y - entity.y) < entity.width / 2 + spawnWidth / 2)) {
                    spawnGhostFire.call({ x, y }, { x: 0, y: 0 }, list[Math.floor(Math.random() * list.length)]).hp = 50 * ENEMY_RESPAWN_TIME;
                    enemyCount++;
                    break;
                }
            }
        }

        nextSpawnTick = Date.now() + 6000 + Math.random() * 2000;
    }
    function bulletUpdate(dt) {
        this.advance(dt);
        const entity = entities
            .filter(entity => entity.hp && entity.team !== this.team && entity.dimension === this.dimension)
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
                energy++;
                audio.play('explosion');
                entity.onDeathSpawn?.();
            }
            // destroy bullet
            audio.play('hit');
            this.ttl = 0;

        }
        if (currentDimension == PHYSICAL_DIMENSION && Math.hypot(this.x - player.x, this.y - player.y) < player.width / 2 + this.width / 2) {
            enemyBulletPool.getAliveObjects().forEach(b => b.ttl = 0);
            // kill player into spectral dimension

            currentDimension = BETWEEN_DIMENSION1;
            player.dimension = currentDimension;

            dimensionAlpha = 0;
            dimensionTransitionUntil = Date.now() + DIMENSION_TRANSITION_LENGTH1;
            // console.log('currentDimension', currentDimension);

            player.dx = 0;
            player.dy = 0;
            energy = 0;
            respawnEnergyTimeLimit = Date.now() + 13 * 1000;

            audio.play('death');
        }
    }

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
                enemyBulletPool,
            ].forEach(thisEntity => {
                thisEntity.image = thisEntity.images?.[currentDimension] ?? thisEntity.image;

                // knockback ticks
                if (thisEntity.knockDx) {
                    thisEntity.x += thisEntity.knockDx;
                    thisEntity.knockDx *= 0.85;
                }
                if (thisEntity.knockDy) {
                    // console.log('e.knockDy', e.knockDy);
                    thisEntity.y += thisEntity.knockDy;
                    thisEntity.knockDy *= 0.85;
                }

                // ai targeting: chase, avoid, wander
                if (thisEntity.targetX != null) {
                    const distToPlayer = Math.hypot(thisEntity.x - player.x, thisEntity.y - player.y);

                    if (thisEntity.b?.includes('<') && Date.now() > thisEntity.aiNextTick && thisEntity.dimension == player.dimension) {
                        // chase target
                        const rotation = angleToTarget(player, thisEntity) - Math.PI / 2 + Math.random() - 0.5;
                        thisEntity.targetX = player.x + Math.cos(rotation) * thisEntity.strafe;
                        thisEntity.targetY = player.y + Math.sin(rotation) * thisEntity.strafe;
                        thisEntity.speed = 1;
                        if (thisEntity.strafe > 0) thisEntity.aiNextTick = Date.now() + 3000;

                    } else if (thisEntity.b?.includes('>') && thisEntity.dimension == player.dimension) {
                        // avoid target
                        if (distToPlayer < 100) {
                            thisEntity.targetX = thisEntity.x + (thisEntity.x - player.x) / distToPlayer * 100;
                            thisEntity.targetY = thisEntity.y + (thisEntity.y - player.y) / distToPlayer * 100;
                            thisEntity.speed = 0.5;
                            thisEntity.aiNextTick = Date.now() + 2000;

                        } else if (Date.now() > thisEntity.aiNextTick) {
                            const randomVector = randomUnitVector();
                            const randomDistance = Math.random() * 32 + 16;
                            thisEntity.targetX = thisEntity.x + randomVector.x * randomDistance;
                            thisEntity.targetY = thisEntity.y + randomVector.y * randomDistance;
                            thisEntity.speed = 0.5;
                            thisEntity.aiNextTick = Date.now() + 2000;
                        }
                    } else if (thisEntity.b?.includes('.') && Date.now() > thisEntity.aiNextTick) {
                        // wander
                        const randomVector = randomUnitVector();
                        const randomDistance = Math.random() * 32 + 16;
                        thisEntity.targetX = thisEntity.x + randomVector.x * randomDistance;
                        thisEntity.targetY = thisEntity.y + randomVector.y * randomDistance;
                        thisEntity.speed = 0.5;
                        thisEntity.aiNextTick = Date.now() + 2000;
                    }
                    // shoot enemy bullet
                    if (thisEntity.b?.includes('s') && currentDimension == thisEntity.dimension && distToPlayer < 250 && Date.now() >= thisEntity.nextCanShoot) {
                        console.log('enemy shoot');
                        const rotation = angleToTarget(thisEntity, player) - Math.PI / 2;

                        const bulletSpeed = 1.2;
                        const enemyBullet = enemyBulletPool.get({
                            // #IfDev
                            name: 'EnemyBullet',
                            // #EndIfDev
                            x: thisEntity.x + Math.cos(rotation) * 12, // starting x,y position of the sprite
                            y: thisEntity.y + Math.sin(rotation) * 12,
                            width: 5,              // width and height of the sprite rectangle
                            height: 5,
                            dx: Math.cos(rotation) * bulletSpeed,
                            dy: Math.sin(rotation) * bulletSpeed,
                            render() {
                                context.fillStyle = colors.orange;
                                context.beginPath();
                                context.ellipse(this.width / 2, this.height / 2, 5, 3, /*this.seed * Math.PI +*/ Math.PI * 2 * (Date.now() % 1000) / 1000, 0, 2 * Math.PI);
                                context.fill();
                            },

                            ttl: 3000,
                            anchor: { x: 0.5, y: 0.5 },
                            update: bulletUpdate,
                            // custom properties
                            seed: Math.random(),
                            dimension: player.dimension,
                            bulletSpeed,
                            team: TEAM_ENEMY,
                        });
                        thisEntity.nextCanShoot = Date.now() + 2000;
                    }
                    // move
                    const distToTarget = Math.hypot(thisEntity.x - thisEntity.targetX, thisEntity.y - thisEntity.targetY);
                    if (distToTarget < thisEntity.speed) {
                        thisEntity.x = thisEntity.targetX, thisEntity.y = thisEntity.targetY;
                    } else {
                        thisEntity.x += (thisEntity.targetX - thisEntity.x) / distToTarget * thisEntity.speed;
                        thisEntity.y += (thisEntity.targetY - thisEntity.y) / distToTarget * thisEntity.speed;
                    }
                }

                // ai respawn
                if (thisEntity.returnHp) {
                    thisEntity.hp++;
                    if (thisEntity.hp >= thisEntity.returnHp) {
                        thisEntity.spawnEntity();
                        thisEntity.ttl = 0;
                    }
                }
                thisEntity.update();


                // collision
                const collisions = entities.filter(entity => entity != thisEntity && Math.hypot(thisEntity.x - entity.x, thisEntity.y - entity.y) < entity.width / 2 + thisEntity.width / 2);

                const enemyCollideWithPlayer = collisions.some(entity => entity == player);
                // if spectral enemy collides spectral player
                if (enemyCollideWithPlayer && player.dimension == SPECTRAL_DIMENSION && thisEntity.returnHp) {
                    // eat ghostFire
                    audio.play('coin');
                    energy++;
                    enemyCount--;
                    thisEntity.ttl = 0;

                    // add to resurrection energy
                }

                // if physical enemy collides physical player
                if (enemyCollideWithPlayer && player.dimension == PHYSICAL_DIMENSION && thisEntity.dimension == PHYSICAL_DIMENSION) {
                    // kill player into spectral dimension

                    currentDimension = BETWEEN_DIMENSION1;
                    player.dimension = currentDimension;

                    dimensionAlpha = 0;
                    dimensionTransitionUntil = Date.now() + DIMENSION_TRANSITION_LENGTH1;
                    // console.log('currentDimension', currentDimension);

                    player.dx = 0;
                    player.dy = 0;
                    energy = 0;
                    respawnEnergyTimeLimit = Date.now() + 13 * 1000;

                    audio.play('death');
                }

                // if physical enemy collides spectral player
                if (enemyCollideWithPlayer && player.dimension == SPECTRAL_DIMENSION && thisEntity.dimension == PHYSICAL_DIMENSION) {
                    // damage enemy
                    audio.play('hit');
                    thisEntity.hp -= 3;
                    if (thisEntity.hp <= 0) {
                        score += 10 * scoreMultiplier;
                        audio.play('explosion');
                        thisEntity.ttl = 0;
                        thisEntity.onDeathSpawn?.();
                    }
                    // knockback player

                    const dist = Math.hypot(player.x - thisEntity.x, player.y - thisEntity.y);
                    player.knockDx = (player.x - thisEntity.x) / dist * 12;
                    player.knockDy = (player.y - thisEntity.y) / dist * 12;
                    console.log('knock player', player.knockDx, player.knockDy);
                }

                if (thisEntity != player && collisions.length) {
                    const closest = collisions[0];
                    const dist = Math.hypot(thisEntity.x - closest.x, thisEntity.y - closest.y);
                    if (dist > 0.01) {
                        thisEntity.x += (thisEntity.x - closest.x) / dist * 0.2;
                        thisEntity.y += (thisEntity.y - closest.y) / dist * 0.2;
                    }
                }
                if (thisEntity.x - thisEntity.width / 2 < 0) thisEntity.x = thisEntity.width / 2;
                if (thisEntity.x + thisEntity.width / 2 > canvas.width) thisEntity.x = canvas.width - thisEntity.width / 2;
                if (thisEntity.y - thisEntity.height / 2 < 0) thisEntity.y = thisEntity.height / 2;
                if (thisEntity.y + thisEntity.height / 2 > canvas.height) thisEntity.y = canvas.height - thisEntity.height / 2;
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
                            team: TEAM_PLAYER,
                        });
                        gunSide = -gunSide;
                        player.nextCanShoot = Date.now() + 200;
                        audio.play('shoot');
                    }
                }
            }
            HandleSpawnTick();


            // if (currentDimension == PHYSICAL_DIMENSION && energy >= respawnEnergyGoal) {
            //     audio.play('respawn');

            // }
            // time's up
            if (currentDimension == SPECTRAL_DIMENSION && Date.now() >= respawnEnergyTimeLimit) {
                if (energy < respawnEnergyGoal) {
                    // game over

                    audio.play('game_over');
                } else {
                    // respawn

                    currentDimension = PHYSICAL_DIMENSION;
                    player.dimension = currentDimension;
                    energy = 0;
                    respawnEnergyGoal = Math.ceil(respawnEnergyGoal * DIFFICULTY_RATIO);
                    console.log('new respawnEnergyGoal', respawnEnergyGoal);
                    audio.play('respawn');

                    // radial knockback
                    entities
                        .filter(entity => entity != player && Math.hypot(player.x - entity.x, player.y - entity.y) < 100)
                        .forEach(entity => {
                            const dist = Math.hypot(player.x - entity.x, player.y - entity.y);
                            entity.knockDx = (entity.x - player.x) / dist * 12;
                            entity.knockDy = (entity.y - player.y) / dist * 12;
                        });
                    entities
                        .filter(entity => entity.b?.includes('s'))
                        .forEach(entity => {
                            entity.nextCanShoot = Date.now() + 1000 + Math.random() * 1000;
                        });
                }
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
                enemyBulletPool,
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

            // energy bar

            const padding = 20;
            const barWidth = (canvas.width - padding - padding) * Math.min(1, energy / levelUpEnergyGoal);
            const respawnEnergyGoalX = Math.floor(padding + (canvas.width - padding - padding) * respawnEnergyGoal / levelUpEnergyGoal);
            const levelUpEnergyGoalX = Math.floor(padding + (canvas.width - padding - padding));

            context.globalAlpha = 0.7;
            context.fillStyle = colors.gray;
            context.fillRect(padding + barWidth, 280 + 2, canvas.width - padding - padding - barWidth, 4);

            context.fillStyle = currentDimension == SPECTRAL_DIMENSION ? colors.blue : colors.orange;
            context.fillRect(padding, 280, barWidth, 8);


            context.strokeStyle = currentDimension ? colors.blue : colors.orange;
            context.lineWidth = 1;

            context.beginPath();
            context.moveTo(respawnEnergyGoalX, 280 - 4);
            context.lineTo(respawnEnergyGoalX, 280 + 8 + 4);
            context.stroke();

            context.beginPath();
            context.moveTo(levelUpEnergyGoalX, 280 - 4);
            context.lineTo(levelUpEnergyGoalX, 280 + 8 + 4);
            context.stroke();

            context.globalAlpha = 1;

            context.fillStyle = colors.white;
            context.textAlign = 'right';
            context.fillText('1-up', respawnEnergyGoalX - 2, 280 - 4);
            context.fillText('Level up', levelUpEnergyGoalX - 2, 280 - 4);


            // score
            context.textAlign = 'left';
            context.fillStyle = colors.white;
            context.font = '10px sans-serif';
            context.fillText('Score', 20, 14);
            context.font = '20px sans-serif';
            context.fillText(score, 20, 36);



            if (currentDimension == SPECTRAL_DIMENSION && Date.now() < respawnEnergyTimeLimit) {
                context.font = '48px sans-serif';
                context.textAlign = 'center';
                context.fillStyle = colors.white;
                context.globalAlpha = 0.5;
                context.fillText(Math.floor((respawnEnergyTimeLimit - Date.now()) / 1000), canvas.width / 2, canvas.height / 2);
            }
            context.textAlign = 'left';
            context.globalAlpha = 1;
            context.font = '10px sans-serif';
        }
    });

    loop.start();    // start the game
})();