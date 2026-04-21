# Guddu's Arcadia

**Guddu's Arcadia** is a neon-drenched, cyberpunk-inspired web arcade featuring 10 distinct, highly polished mini-games. Ranging from single-player logic puzzles to real-time multiplayer card games, the arcade brings together sleek aesthetics, fluid animations, and a responsive design.

## 🎮 The Protocols (Games)

1. **SONAR**: A strategic grid-sweeping game inspired by Minesweeper. 
2. **SYMBIOSIS**: A simulation based on cellular automata mechanics (Conway's Game of Life).
3. **PARADOX**: A sliding tile logic puzzle.
4. **UMBRA**: A stealth and memory-based maze challenge.
5. **CIPHER**: A word/code deciphering puzzle.
6. **YAHTZEE**: A real-time multiplayer implementation of the classic dice game. 
7. **SUDOKU**: A sleek, stylized version of the classic number placement puzzle.
8. **ECLIPSE**: A timing and reaction-based spatial game.
9. **ENIGMA**: A code-breaking Mastermind clone. Features "Play Computer" and "Challenge a Friend" modes where players can generate custom challenge URLs.
10. **OVERRIDE**: A fast-paced, real-time multiplayer card game built with rules similar to UNO. Features wild cards, skipped turns, "UNO" catching mechanics, and beautiful hardware-accelerated card animations.

## 🚀 Features

* **Real-time Multiplayer**: Powered by Firebase Firestore, games like *Override* and *Yahtzee* support live, serverless multiplayer lobbies where players can invite friends via shareable links.
* **Sleek Cyberpunk UI**: Every element of the arcade, from the 2-column terminal main menu to the in-game UI, leverages deep blacks, neon accents, and glowing borders.
* **Fluid Animations**: Utilizing `motion` (Framer Motion), cards physically fly across the screen during gameplay, and UI elements transition gracefully using layout IDs and presence detection.
* **Responsive Layout**: Completely mobile-friendly; carefully crafted to look gorgeous on ultra-wide desktop monitors as well as standard smartphone screens.
* **Anonymous Authentication**: Frictionless multiplayer access utilizing Firebase Anonymous Auth. Players simply enter an alias and get straight into the action.

## 🛠️ Tech Stack

* **Frontend**: React 19, TypeScript, Vite
* **Styling**: Tailwind CSS (v4)
* **Animations**: `motion` (Framer Motion)
* **Icons**: `lucide-react`
* **Backend & Networking**: Firebase (Firestore Database, Anonymous Authentication)

## 💻 Running Locally

To run the arcade locally, follow these steps:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:3000`.

*Note: Multiplayer functionality requires an active Firebase configuration to work. By default, it connects to the Arcade's provisioned cloud project.*
