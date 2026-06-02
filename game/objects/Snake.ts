import Phaser, { Scene, GameObjects } from 'phaser';
import { EventBus } from '../EventBus';

export class Snake {
    scene: Scene;
    head: GameObjects.Image;
    body: GameObjects.Image[];
    history: {x: number, y: number}[];
    baseSpeed: number;
    currentSpeed: number;
    direction: Phaser.Math.Vector2;
    nextDirection: Phaser.Math.Vector2;
    historySize: number;
    spacing: number;
    
    particles!: GameObjects.Particles.ParticleEmitter;

    constructor(scene: Scene, x: number, y: number) {
        this.scene = scene;
        this.head = scene.add.image(x, y, 'snake_head');
        this.head.setDepth(10);
        this.body = [];
        this.history = [];
        
        this.baseSpeed = 200; 
        this.currentSpeed = 200;
        this.direction = new Phaser.Math.Vector2(1, 0);
        this.nextDirection = new Phaser.Math.Vector2(1, 0);
        
        this.spacing = 8; 
        this.historySize = 1000; 
        
        // Add trailing particles for 'juice'
        this.particles = this.scene.add.particles(0, 0, 'snake_body', {
            speed: 50,
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.5, end: 0 },
            lifespan: 400,
            blendMode: 'ADD',
            tint: 0x00f0ff
        });
        this.particles.startFollow(this.head);
        
        for (let i = 0; i < 3; i++) {
            this.grow();
        }
    }

    setDirection(dir: string) {
        if (dir === 'up' && this.direction.y !== 1) this.nextDirection.set(0, -1);
        else if (dir === 'down' && this.direction.y !== -1) this.nextDirection.set(0, 1);
        else if (dir === 'left' && this.direction.x !== 1) this.nextDirection.set(-1, 0);
        else if (dir === 'right' && this.direction.x !== -1) this.nextDirection.set(1, 0);
    }

    update(time: number, delta: number, combo: number) {
        const prevDx = this.direction.x;
        const prevDy = this.direction.y;

        this.direction.copy(this.nextDirection);

        if (prevDx !== this.direction.x || prevDy !== this.direction.y) {
            EventBus.emit('direction-changed', {
                x: this.head.x,
                y: this.head.y,
                dx: this.direction.x,
                dy: this.direction.y
            });
        }

        // Speed scaling based on combo
        this.currentSpeed = this.baseSpeed + (combo * 15);

        const distance = this.currentSpeed * (delta / 1000);
        this.head.x += this.direction.x * distance;
        this.head.y += this.direction.y * distance;

        this.history.unshift({ x: this.head.x, y: this.head.y });
        if (this.history.length > this.historySize) {
            this.history.pop();
        }

        for (let i = 0; i < this.body.length; i++) {
            const index = Math.min((i + 1) * this.spacing, this.history.length - 1);
            if (this.history[index]) {
                this.body[i].setPosition(this.history[index].x, this.history[index].y);
            }
        }
        
        // Change particle color if combo is high
        if (combo >= 3.0) {
            this.particles.setParticleTint(0xff00ff); // Magenta for high combo
        } else {
            this.particles.setParticleTint(0x00f0ff);
        }
    }

    grow() {
        const part = this.scene.add.image(-100, -100, 'snake_body');
        part.setDepth(9 - this.body.length);
        this.body.push(part);
        this.historySize = Math.max(1000, this.body.length * this.spacing + 50);
    }

    checkCollision(width: number, height: number): boolean {
        if (this.head.x < 0 || this.head.x > width || this.head.y < 0 || this.head.y > height) {
            return true;
        }

        for (let i = 10; i < this.body.length; i++) {
            const part = this.body[i];
            const dist = Phaser.Math.Distance.Between(this.head.x, this.head.y, part.x, part.y);
            if (dist < 8) return true;
        }
        return false;
    }
}
