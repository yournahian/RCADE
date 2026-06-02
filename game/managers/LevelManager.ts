export interface LevelConfig {
    level: number;
    displayName: string;
    tierName: string;
    difficulty: string;
    targetScore: number;
    baseSpeed: number;
    obstacleCount: number;
    obstacleTypes: ('static' | 'moving' | 'rotating')[];
    themeColor: number;
    themeHex: string;
}

export class LevelManager {
    static getConfig(level: number): LevelConfig {
        const currentLevel = Math.min(Math.max(level, 1), 20);
        
        let targetScore = 100 + ((currentLevel - 1) * 50);
        let baseSpeed = 200 + ((currentLevel - 1) * 10);
        let obstacleCount = 0;
        let obstacleTypes: ('static' | 'moving' | 'rotating')[] = [];
        
        let tierName = "";
        let difficulty = "";
        let themeColor = 0x00f0ff;
        let themeHex = "#00f0ff";

        if (currentLevel <= 3) {
            tierName = "Rookie Zone";
            difficulty = "Easy";
            obstacleCount = currentLevel - 1;
            obstacleTypes = ['static'];
            themeColor = 0x00f0ff;
            themeHex = "#00f0ff";
        } else if (currentLevel <= 6) {
            tierName = "Neon Circuit";
            difficulty = "Medium";
            obstacleCount = currentLevel;
            obstacleTypes = ['static'];
            themeColor = 0x00ff88;
            themeHex = "#00ff88";
            baseSpeed += 20;
        } else if (currentLevel <= 10) {
            tierName = "Velocity Core";
            difficulty = "Hard";
            obstacleCount = currentLevel + 2;
            obstacleTypes = ['static', 'moving'];
            themeColor = 0xff00ff;
            themeHex = "#ff00ff";
            baseSpeed += 40;
        } else if (currentLevel <= 15) {
            tierName = "Chaos Grid";
            difficulty = "Expert";
            obstacleCount = currentLevel + 4;
            obstacleTypes = ['static', 'moving', 'rotating'];
            themeColor = 0xffa500;
            themeHex = "#ffa500";
            baseSpeed += 70;
        } else {
            tierName = "Apex Protocol";
            difficulty = "Master";
            obstacleCount = currentLevel + 6;
            obstacleTypes = ['static', 'moving', 'rotating'];
            themeColor = 0xff003c;
            themeHex = "#ff003c";
            baseSpeed += 100;
        }

        return {
            level: currentLevel,
            displayName: `Level ${currentLevel}`,
            tierName,
            difficulty,
            targetScore,
            baseSpeed,
            obstacleCount,
            obstacleTypes,
            themeColor,
            themeHex
        };
    }

    static getAllLevels(): LevelConfig[] {
        const levels: LevelConfig[] = [];
        for (let i = 1; i <= 20; i++) {
            levels.push(this.getConfig(i));
        }
        return levels;
    }
}
