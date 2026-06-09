import React, { useMemo, useEffect, useRef, useState } from 'react';

// ─── CONSTANTES GLOBAIS DE PERFORMANCE ────────────────────
const EMPTY_SET = new Set();
const TOTAL_NUMEROS = 1000;

// ══════════════════════════════════════════════════════════
// NumeroBotao — Otimizado com React.memo
// ⚠️ O componente pai deve passar 'onAlternarNumero' via useCallback
// ══════════════════════════════════════════════════════════
const NumeroBotao = React.memo(({ num, estado, onAlternarNumero, pulsar }) => {
  const classesBase =
    "aspect-square flex items-center justify-center font-bold rounded-xl transition-all duration-300 select-none text-base sm:text-lg border focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900";

  let classesEstado = "";
  let labelDescritivo = "Livre";

  if (estado === 'pago') {
    classesEstado =
      "bg-green-500 dark:bg-green-600 text-white border-green-600 dark:border-green-800 cursor-not-allowed opacity-90 shadow-sm";
    labelDescritivo = "Vendido";

  } else if (estado === 'pendente') {
    classesEstado =
      "bg-yellow-400 dark:bg-yellow-500 text-zinc-900 dark:text-zinc-900 border-yellow-500 dark:border-yellow-600 cursor-not-allowed opacity-90 shadow-sm";
    labelDescritivo = "Reserva Pendente";

  } else if (estado === 'selecionado') {
    classesEstado = pulsar
      ? "bg-orange-500 dark:bg-orange-500 text-white border-orange-400 dark:border-orange-400 transform scale-110 shadow-[0_0_20px_rgba(249,115,22,0.8)] cursor-pointer z-10 relative"
      : "bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-700 transform scale-[1.03] shadow-[0_4px_10px_rgba(249,115,22,0.3)] cursor-pointer z-0";
    labelDescritivo = "Selecionado por você";

  } else {
    classesEstado =
      "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 hover:bg-orange-50 dark:hover:bg-zinc-700 hover:scale-[1.02] hover:border-orange-300 dark:hover:border-orange-500/50 cursor-pointer shadow-sm dark:shadow-none active:scale-95";
  }

  // Se o botão estiver desabilitado, removemos do fluxo de navegação por teclado (tabIndex)
  const desabilitado = estado === 'pago' || estado === 'pendente';

  return (
    <button
      type="button"
      data-num={num}
      title={`Número ${num} - ${labelDescritivo}`}
      aria-label={`Número ${num} - ${labelDescritivo}`}
      aria-pressed={estado === 'selecionado'}
      disabled={desabilitado}
      tabIndex={desabilitado ? -1 : 0}
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
  const prevSelecionados   = useRef(EMPTY_SET); 
  const [recemSelecionados, setRecemSelecionados] = useState(EMPTY_SET);

  // 🚀 Formatação estrita com padStart(3, '0') para evitar o bug de '1' vs '001'
  const numeros = useMemo(() => {
    return Array.from({ length: TOTAL_NUMEROS }, (_, i) => String(i + 1).padStart(3, '0'));
  }, []);

  const setPagos        = useMemo(() => new Set(pagos.map(n => String(n).padStart(3, '0'))), [pagos]);
  const setPendentes    = useMemo(() => new Set(pendentes.map(n => String(n).padStart(3, '0'))), [pendentes]);
  const setSelecionados = useMemo(() => new Set(selecionados.map(n => String(n).padStart(3, '0'))), [selecionados]);

  // ── Contadores ────────────────────────────────────────────
  const qtdPagos        = setPagos.size;
  const qtdPendentes    = setPendentes.size;
  const qtdSelecionados = setSelecionados.size;
  const qtdDisponiveis  = TOTAL_NUMEROS - qtdPagos - qtdPendentes;

  // ── Scroll + Pulse Otimizado ────────────────────────────
  useEffect(() => {
    // Correção: Bug do Reset (Se o usuário limpar o carrinho ou comprar, zera tudo)
    if (selecionados.length === 0) {
      prevSelecionados.current = EMPTY_SET;
      setRecemSelecionados(EMPTY_SET);
      return;
    }

    const setAtual = new Set(selecionados);
    const setPrev  = prevSelecionados.current;

    const novos = selecionados.filter((n) => !setPrev.has(n));
    prevSelecionados.current = setAtual;

    if (novos.length === 0) return;

    // Só faz a animação de pulso se foi uma "Surpresinha" (pacote com mais de 1)
    let timer;
    if (novos.length > 1) {
      setRecemSelecionados(new Set(novos));
      timer = setTimeout(() => setRecemSelecionados(EMPTY_SET), 700);
    }

    // Rola para o primeiro número da seleção, usando 'nearest' para não sacudir a tela
    if (gradeRef.current) {
      const btn = gradeRef.current.querySelector(`[data-num="${novos[0]}"]`);
      if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [selecionados]);

  return (
    <div className="relative">
      {/* Barra de contadores STICKY */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md pb-4 pt-1 mb-2 -mx-2 px-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 border-b border-transparent dark:border-transparent shadow-[0_10px_10px_-10px_rgba(0,0,0,0.05)] dark:shadow-[0_10px_10px_-10px_rgba(0,0,0,0.5)]">

        <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition-colors">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600 inline-block shadow-inner" />
          <span className="font-black text-zinc-900 dark:text-white">{qtdDisponiveis}</span> livres
        </div>

        {qtdSelecionados > 0 && (
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700/50 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold text-orange-700 dark:text-orange-300 animate-fade-in">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
            <span className="font-black">{qtdSelecionados}</span> seus
          </div>
        )}

        {qtdPendentes > 0 && (
          <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700/50 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold text-yellow-700 dark:text-yellow-400">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
            <span className="font-black">{qtdPendentes}</span> na fila
          </div>
        )}

        {qtdPagos > 0 && (
          <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold text-green-700 dark:text-green-400">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <span className="font-black">{qtdPagos}</span> pagos
          </div>
        )}

      </div>

      {/* ── Grade de números com Acessibilidade e Alturas de Segurança ── */}
      <div
        ref={gradeRef}
        role="group"
        aria-label="Grade de números da rifa"
        className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3 max-h-[60vh] min-h-[200px] sm:max-h-[500px] overflow-y-auto px-1 pb-4 pt-1 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent rounded-xl"
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