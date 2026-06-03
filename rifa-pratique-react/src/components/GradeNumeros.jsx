import React, { useMemo } from 'react';

const NumeroBotao = React.memo(({ num, estado, onAlternarNumero }) => {
  const classesBase = "aspect-square flex items-center justify-center font-bold rounded-lg transition-all duration-200 select-none text-base sm:text-lg border focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2";
  let classesEstado = "";
  let labelDescritivo = "Livre";

  if (estado === 'pago') {
    classesEstado = "bg-green-500 dark:bg-green-600 text-white border-green-600 dark:border-green-800 cursor-not-allowed opacity-90 shadow-sm";
    labelDescritivo = "Vendido";
  } else if (estado === 'pendente') {
    classesEstado = "bg-yellow-400 dark:bg-yellow-500 text-zinc-900 dark:text-white border-yellow-500 dark:border-yellow-700 cursor-not-allowed opacity-90 shadow-sm";
    labelDescritivo = "Reserva Pendente";
  } else if (estado === 'selecionado') {
    classesEstado = "bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-800 transform scale-105 shadow-[0_0_15px_rgba(249,115,22,0.4)] cursor-pointer";
    labelDescritivo = "Selecionado por você";
  } else {
    // Cores dinâmicas: Fundo branco no Light Mode, Fundo escuro no Dark Mode
    classesEstado = "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:scale-105 hover:border-orange-500 dark:hover:border-orange-500 cursor-pointer shadow-sm dark:shadow-none";
  }

  return (
    <button
      type="button"
      title={`Número ${num} - ${labelDescritivo}`}
      aria-label={`Número ${num} - ${labelDescritivo}`}
      disabled={estado === 'pago' || estado === 'pendente'} 
      className={`${classesBase} ${classesEstado}`}
      onClick={() => onAlternarNumero(num)}
    >
      {num}
    </button>
  );
});

export default function GradeNumeros({ selecionados, onAlternarNumero, pagos = [], pendentes = [] }) {
  
  const numeros = useMemo(() => {
    return Array.from({ length: 1000 }, (_, i) => String(i + 1).padStart(3, '0'));
  }, []);

  const setPagos = useMemo(() => new Set(pagos), [pagos]);
  const setPendentes = useMemo(() => new Set(pendentes), [pendentes]);
  const setSelecionados = useMemo(() => new Set(selecionados), [selecionados]);

  return (
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3 mb-2 max-h-[500px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
      {numeros.map((num) => {
        let estado = 'livre';
        if (setPagos.has(num)) estado = 'pago';
        else if (setPendentes.has(num)) estado = 'pendente';
        else if (setSelecionados.has(num)) estado = 'selecionado';

        return (
          <NumeroBotao 
            key={num} 
            num={num} 
            estado={estado} 
            onAlternarNumero={onAlternarNumero} 
          />
        );
      })}
    </div>
  );
}