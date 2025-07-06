// Web Worker to run heavy puzzle solving algorithms off the main UI thread

/*
  Expected inbound message format:
  {
      state: Array<number>,  // length 9, 0 represents blank
      algorithm: 'backtracking' | 'astar'
  }

  Outbound message format:
  {
      status: 'done' | 'progress' | 'error',
      path?: Array<{state: number[], movedTile: number, direction: string}>,
      message?: string,
      nodesSearched?: number
  }
*/

self.addEventListener('message', (e) => {
    const { state, algorithm } = e.data;
    try {
        if (algorithm === 'backtracking') {
            const path = solveBacktracking(state);
            self.postMessage({ status: 'done', path });
        } else if (algorithm === 'astar') {
            const path = solveAStar(state);
            self.postMessage({ status: 'done', path });
        } else {
            self.postMessage({ status: 'error', message: 'Unknown algorithm' });
        }
    } catch (err) {
        self.postMessage({ status: 'error', message: err.message || String(err) });
    }
});

function getNeighbors(state) {
    const moves = [];
    const blankIndex = state.indexOf(0);
    const [row, col] = [Math.floor(blankIndex / 3), blankIndex % 3];
    const directions = { 'Up': [-1, 0], 'Down': [1, 0], 'Left': [0, -1], 'Right': [0, 1] };

    for (const [name, [dr, dc]] of Object.entries(directions)) {
        const newRow = row + dr, newCol = col + dc;
        if (newRow >= 0 && newRow < 3 && newCol >= 0 && newCol < 3) {
            const newIndex = newRow * 3 + newCol;
            const newState = [...state];
            const movedTile = newState[newIndex];
            [newState[blankIndex], newState[newIndex]] = [newState[newIndex], newState[blankIndex]];
            moves.push({ state: newState, movedTile, direction: name });
        }
    }
    return moves;
}

function manhattan(state) {
    let distance = 0;
    for (let i = 0; i < 9; i++) {
        if (state[i] !== 0) {
            const goalIndex = state[i] - 1;
            const [row, col] = [Math.floor(i / 3), i % 3];
            const [goalRow, goalCol] = [Math.floor(goalIndex / 3), goalIndex % 3];
            distance += Math.abs(row - goalRow) + Math.abs(col - goalCol);
        }
    }
    return distance;
}

// Simple priority queue for A* inside worker
class PQ {
    constructor() { this.arr = []; }
    push(node, priority) {
        this.arr.push({ node, priority });
        this.arr.sort((a, b) => a.priority - b.priority);
    }
    pop() { return this.arr.shift().node; }
    isEmpty() { return this.arr.length === 0; }
}

function solveAStar(initialState) {
    const frontier = new PQ();
    const initialNode = { state: initialState, parent: null, movedTile: null, direction: null };
    frontier.push(initialNode, manhattan(initialState));

    const cameFrom = new Map();
    const costSoFar = new Map();
    const key = JSON.stringify(initialState);
    cameFrom.set(key, null);
    costSoFar.set(key, 0);

    while (!frontier.isEmpty()) {
        const current = frontier.pop();
        const currentKey = JSON.stringify(current.state);
        if (currentKey === JSON.stringify([1,2,3,4,5,6,7,8,0])) {
            // reconstruct path
            const path = [];
            let temp = current;
            while (temp) { path.unshift(temp); temp = temp.parent; }
            return path;
        }
        for (const move of getNeighbors(current.state)) {
            const nextKey = JSON.stringify(move.state);
            const newCost = costSoFar.get(currentKey) + 1;
            if (!costSoFar.has(nextKey) || newCost < costSoFar.get(nextKey)) {
                costSoFar.set(nextKey, newCost);
                const priority = newCost + manhattan(move.state);
                frontier.push({ state: move.state, parent: current, movedTile: move.movedTile, direction: move.direction }, priority);
                cameFrom.set(nextKey, current);
            }
        }
    }
    return null;
}

function solveBacktracking(initialState) {
    const visited = new Set();
    const maxDepth = 35;
    let solutionPath = [];

    function dfs(node, depth) {
        if (depth > maxDepth) return false;
        const key = JSON.stringify(node.state);
        if (visited.has(key)) return false;
        visited.add(key);

        if (key === JSON.stringify([1,2,3,4,5,6,7,8,0])) {
            solutionPath = [node];
            return true;
        }
        for (const move of getNeighbors(node.state)) {
            const child = { state: move.state, parent: node, movedTile: move.movedTile, direction: move.direction };
            if (dfs(child, depth + 1)) {
                solutionPath.unshift(node);
                return true;
            }
        }
        return false;
    }

    const root = { state: initialState, parent: null, movedTile: null, direction: null };
    if (dfs(root, 0)) return solutionPath;
    return null;
}
