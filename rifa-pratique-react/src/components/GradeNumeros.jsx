import React, { useMemo, useEffect, useRef, useState } from 'react';

// ══════════════════════════════════════════════════════════
// NumeroBotao — React.memo garante re-render apenas quando
// `estado` ou `pulsar` desse número específico muda.
//
// ✅ prop `pulsar`: true por ~700ms nos números recém
//    adicionados por um pacote rápido.
//    Efeito: scale-110 + sombra mais intensa → volta suave
//    para scale-105 + sombra normal com transition-all.
// ══════════════════════════════════════════════════════════
const NumeroBotao = React.memo(({ num, estado, onAlternarNumero, pulsar }) => {
  const classesBase =
    "aspect-square flex items-center justify-center font-bold rounded-lg transition-all duration-300 select-none text-base sm:text-lg border focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2";

  let classesEstado = "";
  let labelDescritivo = "Livre";

  if (estado === 'pago') {
    classesEstado =
      "bg-green-500 dark:bg-green-600 text-white border-green-600 dark:border-green-800 cursor-not-allowed opacity-90 shadow-sm";
    labelDescritivo = "Vendido";

  } else if (estado === 'pendente') {
    classesEstado =
      "bg-yellow-400 dark:bg-yellow-500 text-zinc-900 dark:text-white border-yellow-500 dark:border-yellow-700 cursor-not-allowed opacity-90 shadow-sm";
    labelDescritivo = "Reserva Pendente";

  } else if (estado === 'selecionado') {
    // ✅ Quando `pulsar` é true: scale maior + sombra mais brilhante
    // Quando `pulsar` vira false: transition-all dura 300ms → volta suave
    classesEstado = pulsar
      ? "bg-orange-500 dark:bg-orange-600 text-white border-orange-400 dark:border-orange-500 transform scale-110 shadow-[0_0_22px_rgba(249,115,22,0.85)] cursor-pointer z-10 relative"
      : "bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-800 transform scale-105 shadow-[0_0_15px_rgba(249,115,22,0.4)] cursor-pointer";
    labelDescritivo = "Selecionado por você";

  } else {
    classesEstado =
      "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:scale-105 hover:border-orange-500 dark:hover:border-orange-500 cursor-pointer shadow-sm dark:shadow-none";
  }

  return (
    <button
      type="button"
      data-num={num}
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

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function GradeNumeros({ selecionados, onAlternarNumero, pagos = [], pendentes = [] }) {
  const gradeRef           = useRef(null);
  const prevSelecionados   = useRef(new Set()); // Rastreia o Set anterior para detectar novos
  const [recemSelecionados, setRecemSelecionados] = useState(new Set());

  const numeros = useMemo(() => {
    return Array.from({ length: 1000 }, (_, i) => String(i + 1).padStart(3, '0'));
  }, []);

  const setPagos        = useMemo(() => new Set(pagos),        [pagos]);
  const setPendentes    = useMemo(() => new Set(pendentes),    [pendentes]);
  const setSelecionados = useMemo(() => new Set(selecionados), [selecionados]);

  // ── Contadores ────────────────────────────────────────────
  const qtdPagos        = setPagos.size;
  const qtdPendentes    = setPendentes.size;
  const qtdSelecionados = setSelecionados.size;
  const qtdDisponiveis  = 1000 - qtdPagos - qtdPendentes;

  // ── ✅ Scroll + Pulse ─────────────────────────────────────
  // Detecta números recém adicionados comparando com o Set anterior.
  // Só age quando vários foram adicionados de uma vez (pacote rápido).
  useEffect(() => {
    const setAtual = new Set(selecionados);
    const setPrev  = prevSelecionados.current;

    // Quais números são novos neste render?
    const novos = selecionados.filter((n) => !setPrev.has(n));
    prevSelecionados.current = setAtual;

    const ehPacote = novos.length > 1;
    if (!ehPacote || novos.length === 0) return;

    // Ativa pulse nos recém selecionados
    setRecemSelecionados(new Set(novos));

    // Remove pulse após 700ms — transition-all faz a saída suave
    const timer = setTimeout(() => setRecemSelecionados(new Set()), 700);

    // Rola até o primeiro número do pacote
    if (gradeRef.current) {
      const btn = gradeRef.current.querySelector(`[data-num="${novos[0]}"]`);
      if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return () => clearTimeout(timer);
  }, [selecionados]);

  return (
    <div>
      {/* ── Barra de contadores ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3 px-1">

        <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600 inline-block" />
          <span className="font-black text-zinc-900 dark:text-white">{qtdDisponiveis}</span> disponíveis
        </div>

        {qtdSelecionados > 0 && (
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 px-3 py-1.5 rounded-full text-xs font-semibold text-orange-700 dark:text-orange-300">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
            <span className="font-black">{qtdSelecionados}</span> selecionado{qtdSelecionados > 1 ? 's' : ''}
          </div>
        )}

        {qtdPendentes > 0 && (
          <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 px-3 py-1.5 rounded-full text-xs font-semibold text-yellow-700 dark:text-yellow-300">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
            <span className="font-black">{qtdPendentes}</span> reservado{qtdPendentes > 1 ? 's' : ''}
          </div>
        )}

        {qtdPagos > 0 && (
          <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 px-3 py-1.5 rounded-full text-xs font-semibold text-green-700 dark:text-green-300">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            <span className="font-black">{qtdPagos}</span> pago{qtdPagos > 1 ? 's' : ''}
          </div>
        )}

      </div>

      {/* ── Grade de números ── */}
      <div
        ref={gradeRef}
        className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3 mb-2 max-h-[500px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        {numeros.map((num) => {
          let estado = 'livre';
          if      (setPagos.has(num))        estado = 'pago';
          else if (setPendentes.has(num))    estado = 'pendente';
          else if (setSelecionados.has(num)) estado = 'selecionado';

          return (
            <NumeroBotao
              key={num}
              num={num}
              estado={estado}
              pulsar={recemSelecionados.has(num)}
              onAlternarNumero={onAlternarNumero}
            />
          );
        })}
      </div>
    </div>
  );
}