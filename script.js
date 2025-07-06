document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const grid = document.getElementById('puzzle-grid');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const solveBtn = document.getElementById('solve-btn');
    const algorithmSelect = document.getElementById('algorithm-select');
    const moveCounter = document.getElementById('move-counter');
    const timerDisplay = document.getElementById('timer');
    const statusMessage = document.getElementById('status-message');
    const historyLog = document.getElementById('history-log');

    // --- Game State ---
    let currentState = [];
    let tileElements = {};
    let moveCount = 0;
    let timer = 0;
    let timerInterval = null;
    let isSolving = false;
    const goalState = [1, 2, 3, 4, 5, 6, 7, 8, 0];

    // --- Priority Queue for A* ---
    class PriorityQueue {
        constructor() { this.elements = []; }
        enqueue(element, priority) {
            this.elements.push({ element, priority });
            this.elements.sort((a, b) => a.priority - b.priority);
        }
        dequeue() { return this.elements.shift().element; }
        isEmpty() { return this.elements.length === 0; }
    }

    // --- Game Initialization ---
    function initializeGame() {
        grid.innerHTML = '';
        tileElements = {};
        for (let i = 1; i <= 8; i++) {
            const tileEl = document.createElement('div');
            tileEl.classList.add('puzzle-tile');
            tileEl.textContent = i;
            tileEl.dataset.value = i;
            tileEl.addEventListener('click', () => onTileClick(i));
            grid.appendChild(tileEl);
            tileElements[i] = tileEl;
        }
        loadState(goalState);
        updateStatus('Game ready. Press Shuffle to begin.');
    }

    function loadState(state) {
        currentState = [...state];
        moveCount = 0;
        stopTimer();
        resetTimer();
        clearHistory();
        updateTilePositions();
        updateMoveCounter();
    }

    // --- Rendering and Animation ---
    function updateTilePositions() {
        for (let i = 0; i < 9; i++) {
            const tileValue = currentState[i];
            if (tileValue === 0) continue;
            const tileEl = tileElements[tileValue];
            const x = i % 3;
            const y = Math.floor(i / 3);
            tileEl.style.transform = `translate(${x * 108}px, ${y * 108}px)`;
        }
    }

    // --- User Interaction ---
    function onTileClick(tileValue) {
        if (isSolving) return;
        const tileIndex = currentState.indexOf(tileValue);
        const blankIndex = currentState.indexOf(0);
        const [row, col] = [Math.floor(tileIndex / 3), tileIndex % 3];
        const [blankRow, blankCol] = [Math.floor(blankIndex / 3), blankIndex % 3];

        if (Math.abs(row - blankRow) + Math.abs(col - blankCol) === 1) {
            if (!timerInterval) startTimer();
            moveCount++;
            swapAndAnimate(tileIndex, blankIndex);
            if (isSolved()) {
                stopTimer();
                updateStatus(`Congratulations! Solved in ${moveCount} moves.`);
            }
        }
    }

    async function swapAndAnimate(indexA, indexB, isSolverMove = false, movedTile) {
        [currentState[indexA], currentState[indexB]] = [currentState[indexB], currentState[indexA]];
        updateTilePositions();
        if (isSolverMove) {
            const tileEl = tileElements[movedTile];
            tileEl.classList.add('highlight');
            await new Promise(resolve => setTimeout(resolve, 250));
            tileEl.classList.remove('highlight');
        }
        updateMoveCounter();
    }

    // --- Game Logic & Controls ---
    function isSolved() {
        return JSON.stringify(currentState) === JSON.stringify(goalState);
    }

    function shuffle() {
        let puzzle = [...goalState];
        for (let i = 0; i < 150; i++) {
            const neighbors = getNeighbors(puzzle).states;
            puzzle = neighbors[Math.floor(Math.random() * neighbors.length)];
        }
        loadState(puzzle);
        updateStatus('Shuffled! Your turn to solve.');
    }

    // --- AI Solvers ---
    async function solve() {
        if (isSolving) return;
        if (isSolved()) {
            updateStatus('Puzzle is already solved!');
            return;
        }
        isSolving = true;
        setControls(false);
        updateStatus('Solving...');
        clearHistory();

        const algorithm = algorithmSelect.value;

        if (algorithm === 'backtracking') {
            // Use web worker for heavy backtracking search
            const worker = new Worker('solver_worker.js');
            const startTime = performance.now();
            worker.postMessage({ state: currentState, algorithm: 'backtracking' });

            worker.onmessage = async (e) => {
                const { status, path, message } = e.data;
                if (status === 'done' && path) {
                    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
                    await visualizeSolution(path);
                    updateStatus(`Solved with BACKTRACKING in ${duration}s – ${path.length - 1} moves.`);
                } else if (status === 'error') {
                    updateStatus(`Error: ${message}`);
                }
                worker.terminate();
                isSolving = false;
                setControls(true);
            };
            return;
        }

        // Default to in-thread A* (fast)
        const path = solveAStar(currentState);
        if (path && path.length > 0) {
            await visualizeSolution(path);
            updateStatus(`Solved with A* in ${path.length - 1} moves.`);
        } else {
            updateStatus('No solution found. The puzzle might be too complex or unsolvable.');
        }
        isSolving = false;
        setControls(true);
    }

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
        return { states: moves.map(m => m.state), moves: moves };
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

    // --- A* Solver ---
    function solveAStar(initialState) {
        const frontier = new PriorityQueue();
        const initialNode = { state: initialState, parent: null, movedTile: null, direction: null };
        frontier.enqueue(initialNode, manhattan(initialState));
        
        const cameFrom = { [JSON.stringify(initialState)]: null };
        const costSoFar = { [JSON.stringify(initialState)]: 0 };

        addHistoryLog('Starting A* Search...', 'title');
        addHistoryLog('A* explores the most promising moves first, guaranteeing the shortest path.', 'info');

        while (!frontier.isEmpty()) {
            const current = frontier.dequeue();
            const currentStateStr = JSON.stringify(current.state);

            if (currentStateStr === JSON.stringify(goalState)) {
                addHistoryLog('Goal Reached!', 'goal-found');
                let path = [];
                let temp = current;
                while (temp) {
                    path.unshift(temp);
                    temp = temp.parent;
                }
                return path;
            }

            const { moves } = getNeighbors(current.state);
            for (const move of moves) {
                const newCost = costSoFar[currentStateStr] + 1;
                const nextStateStr = JSON.stringify(move.state);

                if (cameFrom[nextStateStr] === undefined || newCost < costSoFar[nextStateStr]) {
                    costSoFar[nextStateStr] = newCost;
                    const priority = newCost + manhattan(move.state);
                    const newNode = { state: move.state, parent: current, movedTile: move.movedTile, direction: move.direction };
                    frontier.enqueue(newNode, priority);
                    cameFrom[nextStateStr] = current;
                }
            }
        }
        return null; // No solution found
    }

    // --- Backtracking Solver (DFS) ---
    function solveBacktracking(initialState) {
        let solutionPath = [];
        const visited = new Set();
        const maxDepth = 35; // Safety limit to prevent infinite loops in very hard puzzles

        addHistoryLog('Starting Backtracking Search...', 'title');
        addHistoryLog('Backtracking explores one path deeply, then backtracks if it hits a dead end.', 'info');

        function dfs(path) {
            if (solutionPath.length > 0) return;

            const current = path[path.length - 1];
            const currentStateStr = JSON.stringify(current.state);

            if (currentStateStr === JSON.stringify(goalState)) {
                addHistoryLog('Goal Reached!', 'goal-found');
                solutionPath = [...path]; // Create a copy of the found path
                return;
            }

            if (path.length > maxDepth) {
                return;
            }

            const { moves } = getNeighbors(current.state);
            for (const move of moves) {
                const nextStateStr = JSON.stringify(move.state);
                if (!visited.has(nextStateStr)) {
                    visited.add(nextStateStr); // Mark as visited before recursing
                    const newNode = { state: move.state, parent: current, movedTile: move.movedTile, direction: move.direction };
                    path.push(newNode);
                    
                    addHistoryLog(`(Depth ${path.length - 1}) Trying: Move ${move.movedTile} ${move.direction}`, 'node-check');
                    dfs(path);

                    if (solutionPath.length > 0) return;

                    path.pop(); // Backtrack
                }
            }
        }

        const initialPath = [{ state: initialState, parent: null, movedTile: null, direction: null }];
        visited.add(JSON.stringify(initialState));
        dfs(initialPath);
        
        if (solutionPath.length === 0) {
            addHistoryLog('No solution found within the depth limit.', 'info');
        }

        return solutionPath;
    }

    async function visualizeSolution(path) {
        stopTimer();
        addHistoryLog('Visualizing the shortest path...', 'title');
        for (let i = 0; i < path.length - 1; i++) {
            const step = path[i + 1];
            const oldBlank = path[i].state.indexOf(0);
            moveCount = i + 1;
            addHistoryLog(`Step ${moveCount}: Move tile ${step.movedTile} ${step.direction}.`, 'move');
            await swapAndAnimate(oldBlank, step.state.indexOf(0), true, step.movedTile);
        }
    }

    // --- UI Updates & Helpers ---
    function setControls(enabled) {
        shuffleBtn.disabled = !enabled;
        solveBtn.disabled = !enabled;
        algorithmSelect.disabled = !enabled;
    }

    function updateStatus(msg) { statusMessage.textContent = msg; }
    function updateMoveCounter() { moveCounter.textContent = `Moves: ${moveCount}`; }

    function startTimer() {
        if (timerInterval) return;
        timer = 0;
        timerInterval = setInterval(() => {
            timer++;
            timerDisplay.textContent = `Time: ${timer}s`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    function resetTimer() {
        timer = 0;
        timerDisplay.textContent = `Time: ${timer}s`;
    }

    function addHistoryLog(message, className = '') {
        const entry = document.createElement('div');
        entry.classList.add('log-entry');
        if (className) entry.classList.add(className);
        entry.textContent = message;
        historyLog.appendChild(entry);
        historyLog.scrollTop = historyLog.scrollHeight;
    }

    function clearHistory() { historyLog.innerHTML = ''; }

    // --- Event Listeners ---
    shuffleBtn.addEventListener('click', shuffle);
    solveBtn.addEventListener('click', solve);

    // --- Initial Load ---
    initializeGame();
});
