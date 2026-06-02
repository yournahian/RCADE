import { GameVerifierStrategy } from './types';
import { NeonSnakeStrategy } from './NeonSnakeStrategy';
import { SpaceImpactStrategy } from './SpaceImpactStrategy';
import { SudokuStrategy } from './SudokuStrategy';
import { DefaultStrategy } from './DefaultStrategy';

const STRATEGIES: Record<number, GameVerifierStrategy> = {
  1: new NeonSnakeStrategy(),
  5: new SpaceImpactStrategy(),
  6: new SudokuStrategy()
};

export function getVerifierStrategy(gameId: number): GameVerifierStrategy {
  const strategy = STRATEGIES[gameId];
  if (!strategy) {
    console.warn(`[Arena][Verifier] No strategy registered for gameId: ${gameId}. Falling back to DefaultStrategy.`);
    return new DefaultStrategy();
  }
  return strategy;
}
