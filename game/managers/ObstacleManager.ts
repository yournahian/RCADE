import Phaser, { Scene, GameObjects } from 'phaser';

export class ObstacleManager {
    scene: Scene;
    obstacles: GameObjects.Rectangle[];
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.obstacles = [];
    }

    spawnObstacles(count: number, types: ('static' | 'moving' | 'rotating')[], width: number, height: number, snakeX: number, snakeY: number) {
        if (count === 0 || types.length === 0) return;

        for (let i = 0; i < count; i++) {
            const type = types[Phaser.Math.Between(0, types.length - 1)];
            let x = 0;
            let y = 0;
            let valid = false;

            // Find valid spawn point away from snake
            while (!valid) {
                x = Phaser.Math.Between(80, width - 80);
                y = Phaser.Math.Between(80, height - 80);
                if (Phaser.Math.Distance.Between(x, y, snakeX, snakeY) > 200) {
                    valid = true;
                }
            }

            const obs = this.scene.add.rectangle(x, y, 32, 32, 0x111122, 0.8);
            obs.setStrokeStyle(2, 0xb026ff);
            obs.setDepth(5);
            this.obstacles.push(obs);

            if (type === 'moving') {
                const dir = Phaser.Math.Between(0, 1) === 0 ? 'x' : 'y';
                const dist = Phaser.Math.Between(100, 200);
                this.scene.tweens.add({
                    targets: obs,
                    [dir]: dir === 'x' ? x + dist : y + dist,
                    duration: Phaser.Math.Between(1500, 3000),
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            } else if (type === 'rotating') {
                obs.setSize(120, 16);
                obs.setDisplaySize(120, 16);
                obs.setStrokeStyle(2, 0xffa500); // Orange for rotating
                this.scene.tweens.add({
                    targets: obs,
                    angle: 360,
                    duration: Phaser.Math.Between(2000, 4000),
                    repeat: -1,
                    ease: 'Linear'
                });
            }
        }
    }

    checkCollision(headX: number, headY: number, headRadius: number): boolean {
        const headCircle = new Phaser.Geom.Circle(headX, headY, headRadius);
        for (const obs of this.obstacles) {
            if (obs.angle === 0) {
                const obsRect = new Phaser.Geom.Rectangle(obs.x - obs.displayWidth/2, obs.y - obs.displayHeight/2, obs.displayWidth, obs.displayHeight);
                if (Phaser.Geom.Intersects.CircleToRectangle(headCircle, obsRect)) return true;
            } else {
                // Approximate check for rotating barrier (line segment)
                const rad = Phaser.Math.DegToRad(obs.angle);
                const halfW = obs.displayWidth / 2;
                const p1 = { x: obs.x - Math.cos(rad)*halfW, y: obs.y - Math.sin(rad)*halfW };
                const p2 = { x: obs.x + Math.cos(rad)*halfW, y: obs.y + Math.sin(rad)*halfW };
                
                const segments = 10;
                for (let i = 0; i <= segments; i++) {
                    const t = i / segments;
                    const px = p1.x + t * (p2.x - p1.x);
                    const py = p1.y + t * (p2.y - p1.y);
                    if (Phaser.Math.Distance.Between(headX, headY, px, py) < headRadius + (obs.displayHeight/2)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
