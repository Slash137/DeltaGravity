interface ActiveTurn {
  abortController: AbortController;
  startedAt: number;
}

const activeTurns = new Map<string, ActiveTurn>();

export const hasActiveTurn = (contextKey: string): boolean => activeTurns.has(contextKey);

export const beginTurn = (contextKey: string): AbortController => {
  if (activeTurns.has(contextKey)) {
    throw new Error('Ya hay una ejecucion en curso en este contexto.');
  }

  const abortController = new AbortController();
  activeTurns.set(contextKey, {
    abortController,
    startedAt: Date.now(),
  });
  return abortController;
};

export const finishTurn = (contextKey: string): void => {
  activeTurns.delete(contextKey);
};

export const abortTurn = (contextKey: string): boolean => {
  const turn = activeTurns.get(contextKey);
  if (!turn) {
    return false;
  }

  turn.abortController.abort();
  return true;
};
