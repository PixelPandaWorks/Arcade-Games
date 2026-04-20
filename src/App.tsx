/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import SonarGame from './components/SonarGame';
import SymbiosisGame from './components/SymbiosisGame';
import ParadoxGame from './components/ParadoxGame';
import UmbraGame from './components/UmbraGame';
import CipherGame from './components/CipherGame';
import YahtzeeGame from './components/YahtzeeGame';
import SudokuGame from './components/SudokuGame';
import EclipseGame from './components/EclipseGame';
import EnigmaGame from './components/EnigmaGame';

export default function App() {
  const [activeGame, setActiveGame] = useState<'menu' | 'sonar' | 'symbiosis' | 'paradox' | 'umbra' | 'cipher' | 'yahtzee' | 'sudoku' | 'eclipse' | 'enigma'>(() => {
    const params = new URLSearchParams(window.location.search);
    const gameParam = params.get('game');
    const validGames = ['sonar', 'symbiosis', 'paradox', 'umbra', 'cipher', 'yahtzee', 'sudoku', 'eclipse', 'enigma'];
    if (gameParam && validGames.includes(gameParam)) {
      return gameParam as any;
    }
    return 'menu';
  });

  const [joinId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join');
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('join') || params.has('game')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      url.searchParams.delete('game');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  if (activeGame === 'sonar') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <SonarGame />
      </div>
    );
  }

  if (activeGame === 'symbiosis') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <SymbiosisGame />
      </div>
    );
  }

  if (activeGame === 'paradox') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <ParadoxGame />
      </div>
    );
  }

  if (activeGame === 'umbra') {
    return (
      <div className="w-full h-screen bg-white overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-black/50 hover:text-black text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <UmbraGame />
      </div>
    );
  }

  if (activeGame === 'cipher') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <CipherGame />
      </div>
    );
  }

  if (activeGame === 'yahtzee') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <YahtzeeGame initialJoinId={joinId} />
      </div>
    );
  }

  if (activeGame === 'sudoku') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <SudokuGame />
      </div>
    );
  }

  if (activeGame === 'eclipse') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <EclipseGame />
      </div>
    );
  }

  if (activeGame === 'enigma') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <EnigmaGame />
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center font-sans text-white select-none overflow-y-auto py-12">
      <h1 className="text-4xl font-light tracking-[0.4em] mb-2 ml-4">ARCADE</h1>
      <p className="text-gray-500 text-xs tracking-[0.2em] mb-16 uppercase">Select Protocol</p>
      
      <div className="flex flex-col gap-6 w-64">
        <button 
          onClick={() => setActiveGame('sonar')}
          className="px-8 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-full hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>SONAR</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('symbiosis')}
          className="px-8 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-full hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>SYMBIOSIS</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('paradox')}
          className="px-8 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-full hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>PARADOX</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('umbra')}
          className="px-8 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-full hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>UMBRA</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('cipher')}
          className="px-8 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-full hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>CIPHER</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('yahtzee')}
          className="px-8 py-4 border border-green-500/50 text-green-400 text-xs tracking-[0.3em] rounded-full hover:bg-green-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>YAHTZEE</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('sudoku')}
          className="px-8 py-4 border border-blue-500/50 text-blue-400 text-xs tracking-[0.3em] rounded-full hover:bg-blue-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>SUDOKU</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('eclipse')}
          className="px-8 py-4 border border-cyan-500/50 text-cyan-400 text-xs tracking-[0.3em] rounded-full hover:bg-cyan-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>ECLIPSE</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('enigma')}
          className="px-8 py-4 border border-fuchsia-500/50 text-fuchsia-400 text-xs tracking-[0.3em] rounded-full hover:bg-fuchsia-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <span>ENIGMA</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
      </div>
    </div>
  );
}
