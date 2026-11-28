
import React, { useState } from 'react';
import { X, Delete, Divide, Minus, Plus, Equal, Percent, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CalculatorProps {
  onClose: () => void;
}

export const Calculator: React.FC<CalculatorProps> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [isFinished, setIsFinished] = useState(false);

  const handleNumber = (num: string) => {
    if (isFinished) {
      setDisplay(num);
      setIsFinished(false);
    } else {
      setDisplay(prev => prev === '0' ? num : prev + num);
    }
  };

  const handleOperator = (op: string) => {
    setEquation(display + ' ' + op + ' ');
    setDisplay('0');
    setIsFinished(false);
  };

  const calculate = () => {
    try {
      const fullEquation = equation + display;
      // Using Function constructor as a safer alternative to eval for simple math
      const result = new Function(`return ${fullEquation.replace('×', '*').replace('÷', '/')}`)();
      setDisplay(String(Number(result.toFixed(8))));
      setEquation('');
      setIsFinished(true);
    } catch (error) {
      setDisplay('Error');
      setEquation('');
      setIsFinished(true);
    }
  };

  const clear = () => {
    setDisplay('0');
    setEquation('');
    setIsFinished(false);
  };

  const backspace = () => {
    if (display.length > 1) {
      setDisplay(prev => prev.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const toggleSign = () => {
    setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
  };

  const percent = () => {
    setDisplay(prev => String(parseFloat(prev) / 100));
  };

  const btnClass = "h-14 rounded-2xl font-semibold text-lg transition-all flex items-center justify-center";
  const numClass = `${btnClass} bg-slate-50 text-text hover:bg-slate-100 border border-slate-100`;
  const opClass = `${btnClass} bg-brand/10 text-brand hover:bg-brand hover:text-white border border-brand/10`;
  const actionClass = `${btnClass} bg-slate-100 text-muted hover:bg-slate-200 border border-slate-200`;
  const equalClass = `${btnClass} bg-brand text-white col-span-2`;

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-[340px] rounded-[32px] shadow-md overflow-hidden border border-border"
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-brand rounded-full" />
            <h3 className="text-[11px] font-semibold text-text">Kalkulyator</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Display */}
        <div className="p-8 bg-slate-50/50 text-right space-y-1">
          <div className="h-6 text-muted text-xs font-medium overflow-hidden truncate">
            {equation}
          </div>
          <div className="text-4xl font-semibold text-text tracking-tight overflow-hidden truncate">
            {display}
          </div>
        </div>

        {/* Keypad */}
        <div className="p-6 grid grid-cols-4 gap-3">
          <button onClick={clear} className={actionClass}><RotateCcw className="w-5 h-5" /></button>
          <button onClick={toggleSign} className={actionClass}>+/-</button>
          <button onClick={percent} className={actionClass}><Percent className="w-5 h-5" /></button>
          <button onClick={() => handleOperator('/')} className={opClass}><Divide className="w-5 h-5" /></button>

          <button onClick={() => handleNumber('7')} className={numClass}>7</button>
          <button onClick={() => handleNumber('8')} className={numClass}>8</button>
          <button onClick={() => handleNumber('9')} className={numClass}>9</button>
          <button onClick={() => handleOperator('*')} className={opClass}>×</button>

          <button onClick={() => handleNumber('4')} className={numClass}>4</button>
          <button onClick={() => handleNumber('5')} className={numClass}>5</button>
          <button onClick={() => handleNumber('6')} className={numClass}>6</button>
          <button onClick={() => handleOperator('-')} className={opClass}><Minus className="w-5 h-5" /></button>

          <button onClick={() => handleNumber('1')} className={numClass}>1</button>
          <button onClick={() => handleNumber('2')} className={numClass}>2</button>
          <button onClick={() => handleNumber('3')} className={numClass}>3</button>
          <button onClick={() => handleOperator('+')} className={opClass}><Plus className="w-5 h-5" /></button>

          <button onClick={() => handleNumber('0')} className={numClass}>0</button>
          <button onClick={() => handleNumber('.')} className={numClass}>.</button>
          <button onClick={calculate} className={equalClass}><Equal className="w-6 h-6" /></button>
        </div>
      </motion.div>
    </div>
  );
};
