// Simple 8-puzzle solver demonstrating A* and Backtracking (IDDFS)
// Usage: ./solver <astar|backtracking> 9_numbers (0 represents blank)
// Example: ./solver astar 1 2 3 4 5 6 7 8 0

#include <iostream>
#include <vector>
#include <array>
#include <algorithm>
#include <unordered_set>
#include <unordered_map>
#include <queue>
#include <memory>
#include <chrono>
#include <cmath>
#include <string>

using namespace std;

struct PuzzleState {
    array<int, 9> tiles; // 0 represents blank
    int blankIdx;       // cached index of blank (0)

    PuzzleState() : tiles{}, blankIdx(0) {}
    explicit PuzzleState(const array<int, 9>& t) : tiles(t) {
        blankIdx = find(tiles.begin(), tiles.end(), 0) - tiles.begin();
    }

    bool operator==(const PuzzleState& other) const {
        return tiles == other.tiles;
    }

    bool isGoal() const {
        static const array<int, 9> goal{1,2,3,4,5,6,7,8,0};
        return tiles == goal;
    }

    vector<PuzzleState> neighbors() const {
        static const array<pair<int,int>, 4> moves{ { {0,-1}, {0,1}, {-1,0}, {1,0} } }; // left,right,up,down
        vector<PuzzleState> nbrs;
        int r = blankIdx / 3;
        int c = blankIdx % 3;
        for (const auto& mv : moves) {
            int dr = mv.first;
            int dc = mv.second;
            int nr = r + dr;
            int nc = c + dc;
            if (nr < 0 || nr >= 3 || nc < 0 || nc >= 3) continue;
            int nIdx = nr * 3 + nc;
            PuzzleState next = *this;
            swap(next.tiles[blankIdx], next.tiles[nIdx]);
            next.blankIdx = nIdx;
            nbrs.push_back(next);
        }
        return nbrs;
    }

    string toString() const {
        string s;
        for (int i = 0; i < 9; ++i) {
            s += to_string(tiles[i]);
            if (i != 8) s += " ";
        }
        return s;
    }
};

struct PuzzleStateHasher {
    size_t operator()(const PuzzleState& s) const noexcept {
        size_t h = 0;
        for (int x : s.tiles) {
            h = h * 31 + x;
        }
        return h;
    }
};

// Utility: check if puzzle is solvable (inversion parity)
bool isSolvable(const PuzzleState& s) {
    int inv = 0;
    for (int i = 0; i < 9; ++i) {
        for (int j = i + 1; j < 9; ++j) {
            if (s.tiles[i] && s.tiles[j] && s.tiles[i] > s.tiles[j]) ++inv;
        }
    }
    return inv % 2 == 0; // For 3x3, solvable if inversions is even
}

// ---------------- Backtracking (DFS) Solver ----------------

bool dfs(const PuzzleState& current, unordered_set<PuzzleState, PuzzleStateHasher>& visited,
         vector<PuzzleState>& path, int depth, int depthLimit) {
    if (current.isGoal()) return true;
    if (depth >= depthLimit) return false;

    visited.insert(current);
    for (const auto& nxt : current.neighbors()) {
        if (visited.count(nxt)) continue;
        path.push_back(nxt);
        if (dfs(nxt, visited, path, depth + 1, depthLimit)) return true;
        path.pop_back();
    }
    visited.erase(current);
    return false;
}

vector<PuzzleState> solveBacktracking(const PuzzleState& start, int maxDepth = 50) {
    for (int depthLim = 0; depthLim <= maxDepth; ++depthLim) {
        unordered_set<PuzzleState, PuzzleStateHasher> visited;
        vector<PuzzleState> path{start};
        if (dfs(start, visited, path, 0, depthLim)) return path;
    }
    return {};
}

// ---------------- A* Solver ----------------

int manhattan(const PuzzleState& s) {
    int d = 0;
    for (int idx = 0; idx < 9; ++idx) {
        int val = s.tiles[idx];
        if (val == 0) continue;
        int goalIdx = val - 1;
        d += abs(idx/3 - goalIdx/3) + abs(idx%3 - goalIdx%3);
    }
    return d;
}

struct Node {
    PuzzleState state;
    int g; // cost so far
    int h; // heuristic
    int f; // g + h
    shared_ptr<Node> parent;

    Node(const PuzzleState& s, int g_, int h_, shared_ptr<Node> p)
        : state(s), g(g_), h(h_), f(g_ + h_), parent(std::move(p)) {}
};

struct NodeCmp {
    bool operator()(const shared_ptr<Node>& a, const shared_ptr<Node>& b) const {
        return a->f > b->f; // min-heap
    }
};

vector<PuzzleState> solveAStar(const PuzzleState& start) {
    priority_queue<shared_ptr<Node>, vector<shared_ptr<Node>>, NodeCmp> open;
    unordered_map<PuzzleState, int, PuzzleStateHasher> bestG;

    auto h0 = manhattan(start);
    auto startNode = make_shared<Node>(start, 0, h0, nullptr);
    open.push(startNode);
    bestG[start] = 0;

    while (!open.empty()) {
        auto node = open.top();
        open.pop();

        if (node->state.isGoal()) {
            // reconstruct
            vector<PuzzleState> path;
            for (auto n = node; n != nullptr; n = n->parent) path.push_back(n->state);
            reverse(path.begin(), path.end());
            return path;
        }

        for (const auto& nbr : node->state.neighbors()) {
            int tentativeG = node->g + 1;
            if (!bestG.count(nbr) || tentativeG < bestG[nbr]) {
                bestG[nbr] = tentativeG;
                auto nbrNode = make_shared<Node>(nbr, tentativeG, manhattan(nbr), node);
                open.push(nbrNode);
            }
        }
    }
    return {};
}

// ---------------- Terminal I/O ----------------

int main() {
    string alg;
    array<int, 9> tiles{};

    int method = -1;
    cout << "Choose solver: 0 = A* , 1 = Backtracking : ";
    cin >> method;
    alg = (method == 0) ? "astar" : "backtracking";
    cout << "Enter the 9 puzzle numbers separated by spaces (use 0 for blank): ";
    for (int i = 0; i < 9; ++i) {
        cin >> tiles[i];
    }
    PuzzleState start(tiles);

    if (!isSolvable(start)) {
        cout << "The given puzzle is unsolvable.\n";
        return 0;
    }

    vector<PuzzleState> solution;
    auto begin = chrono::steady_clock::now();
    if (alg == "astar") {
        solution = solveAStar(start);
    } else if (alg == "backtracking") {
        solution = solveBacktracking(start, 50);
    } else {
        cout << "Unknown algorithm. Use 'astar' or 'backtracking'.\n";
        return 1;
    }
    auto end = chrono::steady_clock::now();

    if (solution.empty()) {
        cout << "No solution found within limits.\n";
        return 0;
    }

    cout << "Solution found in " << solution.size() - 1 << " moves.\n";
    cout << "Time taken: " << chrono::duration_cast<chrono::milliseconds>(end-begin).count() << " ms\n";
    cout << "Steps:\n";
    for (size_t step = 0; step < solution.size(); ++step) {
        cout << "Step " << step << ": " << solution[step].toString() << "\n";
    }

    return 0;
}
