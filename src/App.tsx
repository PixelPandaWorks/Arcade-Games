/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Activity, Dna, Infinity as InfinityIcon, Moon, Lock, Dices, Grid3x3, CircleDashed, Terminal, Layers } from 'lucide-react';
import SonarGame from './components/SonarGame';
import SymbiosisGame from './components/SymbiosisGame';
import ParadoxGame from './components/ParadoxGame';
import UmbraGame from './components/UmbraGame';
import CipherGame from './components/CipherGame';
import YahtzeeGame from './components/YahtzeeGame';
import SudokuGame from './components/SudokuGame';
import EclipseGame from './components/EclipseGame';
import EnigmaGame from './components/EnigmaGame';
import OverrideGame from './components/OverrideGame';

export default function App() {
  const [activeGame, setActiveGame] = useState<'menu' | 'sonar' | 'symbiosis' | 'paradox' | 'umbra' | 'cipher' | 'yahtzee' | 'sudoku' | 'eclipse' | 'enigma' | 'override'>(() => {
    const params = new URLSearchParams(window.location.search);
    const gameParam = params.get('game');
    const validGames = ['sonar', 'symbiosis', 'paradox', 'umbra', 'cipher', 'yahtzee', 'sudoku', 'eclipse', 'enigma', 'override'];
    if (gameParam && validGames.includes(gameParam)) {
      return gameParam as any;
    }
    return 'menu';
  });

  const [joinId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join');
  });

  const [challengeId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('challenge');
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('join') || params.has('game') || params.has('challenge')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      url.searchParams.delete('game');
      url.searchParams.delete('challenge');
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
        <EnigmaGame initialChallenge={challengeId} />
      </div>
    );
  }

  if (activeGame === 'override') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden relative">
        <button 
          onClick={() => setActiveGame('menu')} 
          className="absolute top-8 right-8 z-50 text-white/50 hover:text-white text-xs tracking-[0.2em] transition-colors"
        >
          EXIT
        </button>
        <OverrideGame initialJoinId={joinId} />
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black font-sans text-white select-none overflow-x-hidden overflow-y-auto">
      <div className="w-full min-h-full flex flex-col">
        <div className="m-auto flex flex-col items-center py-16 px-4 w-full max-w-2xl">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-[0.3em] mb-4 text-center leading-tight drop-shadow-md">
            GUDDU'S <br className="md:hidden" /> ARCADIA
          </h1>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase text-center">Select Protocol</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <button 
          onClick={() => setActiveGame('sonar')}
          className="px-6 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-xl hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <Activity size={18} className="opacity-50 group-hover:opacity-100" />
            <span>SONAR</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('symbiosis')}
          className="px-6 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-xl hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <Dna size={18} className="opacity-50 group-hover:opacity-100" />
            <span>SYMBIOSIS</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('paradox')}
          className="px-6 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-xl hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <InfinityIcon size={18} className="opacity-50 group-hover:opacity-100" />
            <span>PARADOX</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('umbra')}
          className="px-6 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-xl hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <Moon size={18} className="opacity-50 group-hover:opacity-100" />
            <span>UMBRA</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('cipher')}
          className="px-6 py-4 border border-white/30 text-xs tracking-[0.3em] rounded-xl hover:bg-white hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <Lock size={18} className="opacity-50 group-hover:opacity-100" />
            <span>CIPHER</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('yahtzee')}
          className="px-6 py-4 border border-green-500/50 text-green-400 text-xs tracking-[0.3em] rounded-xl hover:bg-green-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <Dices size={18} className="opacity-50 group-hover:opacity-100" />
            <span>YAHTZEE</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('sudoku')}
          className="px-6 py-4 border border-blue-500/50 text-blue-400 text-xs tracking-[0.3em] rounded-xl hover:bg-blue-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <Grid3x3 size={18} className="opacity-50 group-hover:opacity-100" />
            <span>SUDOKU</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('eclipse')}
          className="px-6 py-4 border border-cyan-500/50 text-cyan-400 text-xs tracking-[0.3em] rounded-xl hover:bg-cyan-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <CircleDashed size={18} className="opacity-50 group-hover:opacity-100" />
            <span>ECLIPSE</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('enigma')}
          className="px-6 py-4 border border-fuchsia-500/50 text-fuchsia-400 text-xs tracking-[0.3em] rounded-xl hover:bg-fuchsia-500 hover:text-black transition-all duration-300 flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <Terminal size={18} className="opacity-50 group-hover:opacity-100" />
            <span>ENIGMA</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button 
          onClick={() => setActiveGame('override')}
          className="px-6 py-4 border border-purple-500/50 text-purple-400 text-xs tracking-[0.3em] rounded-xl hover:bg-purple-500 hover:text-black transition-all duration-300 flex justify-between items-center group shadow-[0_0_15px_rgba(168,85,247,0.2)]"
        >
          <div className="flex items-center gap-3">
            <Layers size={18} className="opacity-50 group-hover:opacity-100" />
            <span>OVERRIDE</span>
          </div>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
      </div>
      </div>
      </div>
    </div>
  );
}
