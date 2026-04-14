import React, { useState, useEffect, useCallback } from 'react';
import { getSudoku } from 'sudoku-gen';
import { RefreshCw, Eraser, Trophy } from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export default function SudokuGame() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [initialGrid, setInitialGrid] = useState<string[]>(Array(81).fill('-'));
  const [userGrid, setUserGrid] = useState<string[]>(Array(81).fill('-'));
  const [solution, setSolution] = useState<string[]>(Array(81).fill('-'));
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<Set<number>>(new Set());
  const [isWon, setIsWon] = useState(false);

  const startNewGame = useCallback((diff: Difficulty) => {
    const sudoku = getSudoku(diff);
    const initial = sudoku.puzzle.split('');
    setInitialGrid(initial);
    setUserGrid(initial);
    setSolution(sudoku.solution.split(''));
    setSelectedCell(null);
    setConflicts(new Set());
    setIsWon(false);
    setDifficulty(diff);
  }, []);

  useEffect(() => {
    startNewGame('easy');
  }, [startNewGame]);

  const checkConflicts = (grid: string[]) => {
    const newConflicts = new Set<number>();
    for (let i = 0; i < 81; i++) {
      const val = grid[i];
      if (val === '-') continue;
      const row = Math.floor(i / 9);
      const col = i % 9;
      const boxRow = Math.floor(row / 3);
      const boxCol = Math.floor(col / 3);

      for (let j = 0; j < 81; j++) {
        if (i === j) continue;
        if (grid[j] === val) {
          const r = Math.floor(j / 9);
          const c = j % 9;
          const br = Math.floor(r / 3);
          const bc = Math.floor(c / 3);
          if (row === r || col === c || (boxRow === br && boxCol === bc)) {
            newConflicts.add(i);
            newConflicts.add(j);
          }
        }
      }
    }
    return newConflicts;
  };

  const handleNumberInput = useCallback((num: string) => {
    if (selectedCell === null || initialGrid[selectedCell] !== '-' || isWon) return;

    const newGrid = [...userGrid];
    newGrid[selectedCell] = num;
    setUserGrid(newGrid);

    const newConflicts = checkConflicts(newGrid);
    setConflicts(newConflicts);

    if (newConflicts.size === 0 && !newGrid.includes('-')) {
      // Check if it matches solution (or is just valid and full)
      if (newGrid.join('') === solution.join('')) {
        setIsWon(true);
      }
    }
  }, [selectedCell, initialGrid, userGrid, solution, isWon]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (selectedCell === null || isWon) return;

    if (e.key >= '1' && e.key <= '9') {
      handleNumberInput(e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      handleNumberInput('-');
    } else if (e.key === 'ArrowUp') {
      setSelectedCell((prev) => (prev !== null && prev >= 9 ? prev - 9 : prev));
    } else if (e.key === 'ArrowDown') {
      setSelectedCell((prev) => (prev !== null && prev < 72 ? prev + 9 : prev));
    } else if (e.key === 'ArrowLeft') {
      setSelectedCell((prev) => (prev !== null && prev % 9 !== 0 ? prev - 1 : prev));
    } else if (e.key === 'ArrowRight') {
      setSelectedCell((prev) => (prev !== null && prev % 9 !== 8 ? prev + 1 : prev));
    }
  }, [selectedCell, isWon, handleNumberInput]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isRelated = (index: number) => {
    if (selectedCell === null) return false;
    const row1 = Math.floor(selectedCell / 9);
    const col1 = selectedCell % 9;
    const row2 = Math.floor(index / 9);
    const col2 = index % 9;
    const box1 = Math.floor(row1 / 3) * 3 + Math.floor(col1 / 3);
    const box2 = Math.floor(row2 / 3) * 3 + Math.floor(col2 / 3);
    return row1 === row2 || col1 === col2 || box1 === box2;
  };

  const isSameNumber = (index: number) => {
    if (selectedCell === null || userGrid[selectedCell] === '-') return false;
    return userGrid[index] === userGrid[selectedCell];
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-white font-sans w-full max-w-2xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center w-full mb-8 gap-4">
        <h2 className="text-3xl font-light tracking-[0.3em]">SUDOKU</h2>
        
        <div className="flex items-center gap-2">
          {(['easy', 'medium', 'hard', 'expert'] as Difficulty[]).map((diff) => (
            <button
              key={diff}
              onClick={() => startNewGame(diff)}
              className={`px-3 py-1 text-xs tracking-widest uppercase rounded-full border transition-all ${
                difficulty === diff 
                  ? 'bg-white text-black border-white' 
                  : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
              }`}
            >
              {diff}
            </button>
          ))}
        </div>
      </div>

      {/* Game Board */}
      <div className="relative bg-white/5 p-2 md:p-4 rounded-xl border border-white/10 shadow-2xl mb-8">
        <div className="grid grid-cols-9 gap-0 bg-gray-600 border-2 border-gray-400">
          {userGrid.map((val, index) => {
            const row = Math.floor(index / 9);
            const col = index % 9;
            const isRightBorder = col === 2 || col === 5;
            const isBottomBorder = row === 2 || row === 5;
            const isSelected = selectedCell === index;
            const related = isRelated(index);
            const sameNum = isSameNumber(index);
            const isConflict = conflicts.has(index);
            const isGiven = initialGrid[index] !== '-';

            let bgColor = 'bg-[#1a1a1a]';
            if (isSelected) bgColor = 'bg-blue-600/40';
            else if (sameNum) bgColor = 'bg-blue-500/30';
            else if (related) bgColor = 'bg-white/10';

            let textColor = 'text-white';
            if (isConflict) textColor = 'text-red-400 font-bold';
            else if (!isGiven) textColor = 'text-blue-300';

            return (
              <div
                key={index}
                onClick={() => setSelectedCell(index)}
                className={`
                  w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center text-lg md:text-2xl cursor-pointer select-none transition-colors
                  ${bgColor} ${textColor}
                  ${isRightBorder ? 'border-r-2 border-r-gray-400' : 'border-r border-r-gray-600'}
                  ${isBottomBorder ? 'border-b-2 border-b-gray-400' : 'border-b border-b-gray-600'}
                  ${!isRightBorder && col === 8 ? 'border-r-0' : ''}
                  ${!isBottomBorder && row === 8 ? 'border-b-0' : ''}
                `}
              >
                {val !== '-' ? val : ''}
              </div>
            );
          })}
        </div>

        {isWon && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl z-10 animate-in fade-in duration-500">
            <Trophy size={48} className="text-yellow-400 mb-4" />
            <h3 className="text-2xl font-light tracking-[0.2em] text-white mb-6">PUZZLE SOLVED</h3>
            <button
              onClick={() => startNewGame(difficulty)}
              className="flex items-center gap-2 px-6 py-3 bg-white text-black text-xs tracking-widest rounded-full hover:bg-gray-200 transition-colors"
            >
              <RefreshCw size={14} />
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        <div className="grid grid-cols-5 gap-2 w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberInput(num.toString())}
              className="h-12 bg-white/10 hover:bg-white/20 rounded-lg text-xl font-light transition-colors"
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => handleNumberInput('-')}
            className="h-12 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg flex items-center justify-center transition-colors"
          >
            <Eraser size={20} />
          </button>
        </div>
        
        <div className="flex justify-between w-full mt-4">
          <button
            onClick={() => startNewGame(difficulty)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white tracking-widest transition-colors"
          >
            <RefreshCw size={14} />
            RESTART
          </button>
        </div>
      </div>
    </div>
  );
}
