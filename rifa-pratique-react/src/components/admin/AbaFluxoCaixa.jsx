import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash, Coins, TrendUp, TrendDown, PencilSimple,
  CheckCircle, WarningCircle, Info, Target, ListNumbers, 
  CheckSquare, Wallet, ChartPieSlice, Link, WhatsappLogo,
  FilePdf, DownloadSimple, RocketLaunch, Crosshair, Percent
} from '@phosphor-icons/react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

const PRECO_UNITARIO = 10; // Usado para cálculos de projeção

const fmtValor = (v) => {
  const num = Number(v);
  if (isNaN(num)) return 'R$ 0,00';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const fmtData  = (ts) => new Date(ts).toLocaleString('pt-BR');

const CATEGORIAS = ['PREMIAÇÃO', 'MARKETING', 'ESTRUTURA', 'EQUIPE', 'OUTROS'];
const CORES_CATEGORIA = {
  'PREMIAÇÃO': '#eab308', // yellow-500
  'MARKETING': '#3b82f6', // blue-500
  'ESTRUTURA': '#a855f7', // purple-500
  'EQUIPE':    '#22c55e', // green-500
  'OUTROS':    '#64748b'  // slate-500
};

export default function AbaFluxoCaixa({ pedidos }) {
  const [itens, setItens] = useState([]);
  const [abasSubAtiva, setAbasSubAtiva] = useState('geral'); 
  const [aCarregar, setACarregar] = useState(false);

  // Estados dos Formulários
  const [descricao, setDescricao]     = useState('');
  const [valor, setValor]             = useState('');
  const [categoria, setCategoria]     = useState('OUTROS');
  const [comprovante, setComprovante] = useState('');
  const [jaPago, setJaPago]           = useState(false); 
  
  const [itemEmEdicao, setItemEmEdicao] = useState(null);

  // ─── BUSCAR MOVIMENTAÇÕES ──────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'fluxoCaixa'), (snapshot) => {
      const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => b.ts - a.ts);
      setItens(lista);
    });
    return () => unsub();
  }, []);

  // ─── CÁLCULO DO CAIXA BRUTO E RIFAS ────────────────────────────
  const { caixaArrecadado, totalRifasVendidas } = useMemo(() => {
    if (!pedidos || !Array.isArray(pedidos)) return { caixaArrecadado: 0, totalRifasVendidas: 0 };
    
    const pagos = pedidos.filter(p => p.status === 'pago');
    const arrecadado = pagos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
    const rifas = pagos.reduce((acc, p) => acc + (p.nums || []).length, 0);
    
    return { caixaArrecadado: arrecadado, totalRifasVendidas: rifas };
  }, [pedidos]);

  // ─── PROCESSAMENTO FINANCEIRO E INTELIGÊNCIA ───────────────────
  const fluxoMemoizado = useMemo(() => {
    const objetivos = itens.filter(i => i.tipo === 'objetivo');
    const gastos    = itens.filter(i => i.tipo === 'gasto');

    const totalGastosRealizados = gastos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    const totalMetasNecessario  = objetivos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    const saldoDisponivelAtual  = caixaArrecadado - totalGastosRealizados;

    // Agrupamento para o Gráfico Pizza e CAC
    const gastosPorCategoria = gastos.reduce((acc, g) => {
      const cat = g.categoria || 'OUTROS';
      acc[cat] = (acc[cat] || 0) + Number(g.valor || 0);
      return acc;
    }, {});

    // 🚀 INTELIGÊNCIA: Ponto de Equilíbrio (Breakeven) e CAC/Margem
    const custoTotalProjeto = totalGastosRealizados + totalMetasNecessario;
    const receitasFaltantes = Math.max(custoTotalProjeto - caixaArrecadado, 0);
    const rifasFaltantesBreakeven = Math.ceil(receitasFaltantes / PRECO_UNITARIO);
    
    const custoMarketing = gastosPorCategoria['MARKETING'] || 0;
    const cac = totalRifasVendidas > 0 ? custoMarketing / totalRifasVendidas : 0;
    const margemLucro = caixaArrecadado > 0 ? (saldoDisponivelAtual / caixaArrecadado) * 100 : 0;

    // Cascata Progressiva
    let saldoRestanteVirtual = saldoDisponivelAtual;
    const objetivosOrdenadosCascata = [...objetivos].sort((a, b) => a.ts - b.ts);

    const objetivosComProgresso = objetivosOrdenadosCascata.map((obj) => {
      const vObj = Number(obj.valor || 0);
      let arrecadado = 0;

      if (saldoRestanteVirtual >= vObj) {
        arrecadado = vObj;
        saldoRestanteVirtual -= vObj;
      } else if (saldoRestanteVirtual > 0) {
        arrecadado = saldoRestanteVirtual;
        saldoRestanteVirtual = 0;
      } else {
        arrecadado = 0;
      }

      const pct = vObj > 0 ? (arrecadado / vObj) * 100 : 0;
      const faltando = Math.max(vObj - arrecadado, 0);

      return {
        ...obj,
        arrecadado,
        faltando,
        porcentagem: Number(pct.toFixed(0))
      };
    });

    return {
      objetivos: objetivosComProgresso.sort((a, b) => b.ts - a.ts),
      gastos,
      totalGastosRealizados,
      totalMetasNecessario,
      saldoDisponivelAtual,
      gastosPorCategoria,
      custoTotalProjeto,
      rifasFaltantesBreakeven,
      cac,
      margemLucro,
      custoMarketing
    };
  }, [itens, caixaArrecadado, totalRifasVendidas]);

  const { 
    objetivos, gastos, totalGastosRealizados, totalMetasNecessario, 
    saldoDisponivelAtual, gastosPorCategoria, custoTotalProjeto, 
    rifasFaltantesBreakeven, cac, margemLucro, custoMarketing 
  } = fluxoMemoizado;

  // ─── SALVAR OU ATUALIZAR ITEM ──────────────────────────────────
  const handleSalvarItem = async (e) => {
    e.preventDefault();
    const valorTratado = Number(String(valor).replace(',', '.'));

    if (!descricao.trim() || isNaN(valorTratado) || valorTratado <= 0) {
      alert('Preencha os campos corretamente com valores maiores que zero.');
      return;
    }

    setACarregar(true);
    try {
      const payload = {
        descricao: descricao.trim().toUpperCase(),
        valor: valorTratado,
        categoria: categoria,
        comprovante: comprovante.trim()
      };

      if (itemEmEdicao) {
        await updateDoc(doc(db, 'fluxoCaixa', itemEmEdicao.id), payload);
        alert('Lançamento atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'fluxoCaixa'), {
          ...payload,
          tipo: jaPago ? 'gasto' : 'objetivo',
          ts: Date.now(),
          tsPagamento: jaPago ? Date.now() : null
        });
        alert('Lançamento registrado com sucesso!');
      }
      cancelarEdicao();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar movimentação.');
    } finally {
      setACarregar(false);
    }
  };

  // ─── DAR BAIXA (OBJETIVO -> GASTO) ─────────────────────────────
  const handlePagarObjetivo = async (item) => {
    if (!window.confirm(`Confirmar o pagamento de "${item.descricao}"?\nEle sairá das Metas e irá para os Gastos Reais efetivados.`)) return;
    try {
      await updateDoc(doc(db, 'fluxoCaixa', item.id), {
        tipo: 'gasto',
        tsPagamento: Date.now()
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao confirmar pagamento.');
    }
  };

  // ─── PREPARAR EDIÇÃO E EXCLUSÃO ────────────────────────────────
  const iniciarEdicao = (item) => {
    setDescricao(item.descricao);
    setValor(item.valor);
    setCategoria(item.categoria || 'OUTROS');
    setComprovante(item.comprovante || '');
    setItemEmEdicao(item);
    setAbasSubAtiva('gastos'); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicao = () => {
    setDescricao('');
    setValor('');
    setCategoria('OUTROS');
    setComprovante('');
    setJaPago(false);
    setItemEmEdicao(null);
  };

  const handleExcluirItem = async (id, desc) => {
    if (!window.confirm(`Deseja realmente excluir o lançamento "${desc}"?`)) return;
    try {
      await deleteDoc(doc(db, 'fluxoCaixa', id));
      if (itemEmEdicao && itemEmEdicao.id === id) cancelarEdicao();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir item.');
    }
  };

  // ─── GERAÇÃO DO GRÁFICO PIZZA (CSS CONIC-GRADIENT) ─────────────
  const gerarGradientPizza = () => {
    if (totalGastosRealizados === 0) return 'conic-gradient(#f4f4f5 0% 100%)'; 
    let acumulado = 0;
    const stops = Object.entries(gastosPorCategoria).map(([cat, val]) => {
      const pct = (val / totalGastosRealizados) * 100;
      const cor = CORES_CATEGORIA[cat] || CORES_CATEGORIA['OUTROS'];
      const stop = `${cor} ${acumulado}% ${acumulado + pct}%`;
      acumulado += pct;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  };

  // ─── EXPORTAÇÕES DO BALANÇO ────────────────────────────────────
  const gerarRelatorioWhatsApp = () => {
    const linhas = [
      `*📊 BALANÇO DE CAIXA - RIFA PRATIQUE*`,
      ``,
      `*RESUMO FINANCEIRO:*`,
      `💰 *Arrecadado:* ${fmtValor(caixaArrecadado)}`,
      `💸 *Custos Pagos:* ${fmtValor(totalGastosRealizados)}`,
      `🟢 *Saldo Líquido:* ${fmtValor(saldoDisponivelAtual)}`,
      ``,
      `*INTELIGÊNCIA ESTRATÉGICA:*`,
      `🚀 *Status:* ${rifasFaltantesBreakeven === 0 ? 'LUCRO PURO ALCANÇADO!' : `Faltam ${rifasFaltantesBreakeven} rifas para cobrir os custos.`}`,
      `📈 *Margem de Lucro:* ${margemLucro.toFixed(1)}%`,
      custoMarketing > 0 ? `🎯 *CAC (Custo Marketing):* ${fmtValor(cac)} / rifa` : '',
      ``,
      `*DISTRIBUIÇÃO DOS GASTOS:*`
    ];

    if (totalGastosRealizados === 0) {
      linhas.push(`Nenhum gasto registrado.`);
    } else {
      Object.entries(gastosPorCategoria).forEach(([cat, val]) => {
        const pct = ((val / totalGastosRealizados) * 100).toFixed(1);
        linhas.push(`- ${cat}: ${fmtValor(val)} (${pct}%)`);
      });
    }

    linhas.push(``);
    linhas.push(`*ALVOS PENDENTES:* ${fmtValor(totalMetasNecessario)} em ${objetivos.length} objetivos.`);
    
    // Limpa linhas vazias do array (caso CAC não exista)
    const textoFormatado = linhas.filter(l => l !== '').join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(textoFormatado)}`, '_blank');
  };

  const exportarPDFBalanco = () => {
    try {
      const pdf = new jsPDF('portrait');
      pdf.setFontSize(16);
      pdf.text('BALANÇO FINANCEIRO E ESTRATÉGICO — RIFA PRATIQUE', 14, 15);
      
      pdf.setFontSize(10);
      pdf.text(`Total Arrecadado: ${fmtValor(caixaArrecadado)}`, 14, 25);
      pdf.text(`Custos Pagos: ${fmtValor(totalGastosRealizados)}`, 14, 30);
      pdf.text(`Saldo Líquido: ${fmtValor(saldoDisponivelAtual)}`, 14, 35);
      pdf.text(`Margem de Lucro Atual: ${margemLucro.toFixed(1)}%`, 14, 40);
      
      const statusBreakeven = rifasFaltantesBreakeven === 0 ? 'LUCRO PURO ALCANÇADO!' : `Faltam ${rifasFaltantesBreakeven} rifas vendidas`;
      pdf.text(`Ponto de Equilíbrio: ${statusBreakeven}`, 14, 45);
      
      // Tabela de Gastos Reais
      const bodyGastos = gastos.map(g => [
        g.descricao, g.categoria || 'OUTROS', fmtValor(g.valor), fmtData(g.tsPagamento || g.ts).split(' ')[0]
      ]);

      autoTable(pdf, {
        head: [['DESPESA PAGA', 'CATEGORIA', 'VALOR', 'DATA']],
        body: bodyGastos,
        startY: 55,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [239, 68, 68] }, // Red
      });

      // Tabela de Objetivos
      const finalY = pdf.lastAutoTable.finalY || 55;
      const bodyObjetivos = objetivos.map(o => [
        o.descricao, o.categoria || 'OUTROS', fmtValor(o.valor), `${o.porcentagem}%`
      ]);

      autoTable(pdf, {
        head: [['OBJETIVO PENDENTE', 'CATEGORIA', 'ORÇADO', 'COBERTURA']],
        body: bodyObjetivos,
        startY: finalY + 10,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [249, 115, 22] }, // Orange
      });

      pdf.save(`Balanco_Estrategico_Rifa_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar PDF.");
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* ── SELETOR DE SUB-ABAS ── */}
      <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl max-w-md border border-zinc-200 dark:border-zinc-800">
        {[
          { id: 'geral', label: 'Dashboard 📊' },
          { id: 'objetivos', label: 'Metas / Alvos 🎯' },
          { id: 'gastos', label: 'Lançamentos 💸' }
        ].map(aba => (
          <button
            key={aba.id}
            onClick={() => { setAbasSubAtiva(aba.id); cancelarEdicao(); }}
            className={`flex-1 py-2 px-3 text-xs font-black uppercase rounded-lg tracking-wider transition-all ${
              abasSubAtiva === aba.id
                ? 'bg-white dark:bg-zinc-900 text-orange-500 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {/* ── CARDS DE RESUMO ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-1">
            <TrendUp size={14} className="text-blue-500" weight="bold"/> Bruto Arrecadado
          </p>
          <h3 className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400">{fmtValor(caixaArrecadado)}</h3>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-1">
            <TrendDown size={14} className="text-red-500" weight="bold"/> Custos Pagos
          </p>
          <h3 className="text-xl sm:text-2xl font-black text-red-500">{fmtValor(totalGastosRealizados)}</h3>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-white dark:from-green-900/10 dark:to-zinc-900 p-5 rounded-xl border border-green-200 dark:border-green-800 shadow-sm flex flex-col justify-between transform scale-[1.02] z-10">
          <p className="text-[10px] font-bold text-green-700 dark:text-green-500 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Wallet size={16} weight="fill"/> Saldo Líquido
          </p>
          <h3 className={`text-xl sm:text-2xl font-black ${saldoDisponivelAtual >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
            {fmtValor(saldoDisponivelAtual)}
          </h3>
        </div>

        <div className="bg-zinc-900 dark:bg-black p-5 rounded-xl border border-zinc-800 text-white shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Target size={14} className="text-orange-400" weight="bold"/> Alvos Pendentes
          </p>
          <h3 className="text-xl sm:text-2xl font-black text-orange-400">{fmtValor(totalMetasNecessario)}</h3>
        </div>
      </div>

      {/* ── VISÃO GERAL (DASHBOARD) ── */}
      {abasSubAtiva === 'geral' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          <div className="lg:col-span-2 space-y-6">
            {/* 🚀 INTELIGÊNCIA ESTRATÉGICA (Breakeven e Smart Card) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* CARD: Ponto de Equilíbrio */}
              <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/20 dark:to-zinc-900 p-6 rounded-xl border border-indigo-200 dark:border-indigo-800/50 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <RocketLaunch size={64} weight="fill" className="text-indigo-500" />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Crosshair size={16} weight="bold"/> Ponto de Equilíbrio
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-black text-indigo-700 dark:text-indigo-300">
                    {rifasFaltantesBreakeven === 0 ? 'LUCRO PURO! 🎉' : `Faltam ${rifasFaltantesBreakeven} Rifas`}
                  </h3>
                  <p className="text-[10px] text-indigo-500 dark:text-indigo-400/80 mt-2 uppercase font-bold">
                    {rifasFaltantesBreakeven === 0 
                      ? 'O evento já pagou todos os custos projetados' 
                      : `Para cobrir R$ ${fmtValor(custoTotalProjeto)} do projeto`}
                  </p>
                </div>
              </div>

              {/* 🚀 SMART CARD: CAC ou Margem de Lucro */}
              {custoMarketing > 0 ? (
                <div className="bg-gradient-to-br from-teal-50 to-white dark:from-teal-900/20 dark:to-zinc-900 p-6 rounded-xl border border-teal-200 dark:border-teal-800/50 shadow-sm flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <TrendDown size={64} weight="fill" className="text-teal-500" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                      <Coins size={16} weight="bold"/> Custo por Venda (CAC)
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-300">
                      {fmtValor(cac)} <span className="text-sm font-bold uppercase text-teal-600/70">/ rifa</span>
                    </h3>
                    <p className="text-[10px] text-teal-500 dark:text-teal-400/80 mt-2 uppercase font-bold">
                      Investimento de Marketing ({fmtValor(custoMarketing)}) dividido por {totalRifasVendidas} vendas
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-zinc-900 p-6 rounded-xl border border-emerald-200 dark:border-emerald-800/50 shadow-sm flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Percent size={64} weight="fill" className="text-emerald-500" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                      <TrendUp size={16} weight="bold"/> Saúde Financeira
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300">
                      {margemLucro.toFixed(1)}% <span className="text-sm font-bold uppercase text-emerald-600/70">margem</span>
                    </h3>
                    <p className="text-[10px] text-emerald-500 dark:text-emerald-400/80 mt-2 uppercase font-bold">
                      A cada R$ 100 arrecadados, R$ {((margemLucro/100)*100).toFixed(0)} ficam limpos no caixa.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* LÓGICA CASCATA DE METAS */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <h3 className="font-black text-lg text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                <Target size={22} className="text-orange-500" /> Progresso dos Alvos
              </h3>
              
              {objetivos.length === 0 ? (
                <p className="text-sm text-zinc-400 italic py-6 text-center">Nenhum objetivo pendente.</p>
              ) : (
                <div className="space-y-4 pt-2">
                  {objetivos.map((obj) => {
                    const statusCor = obj.porcentagem >= 100 ? 'text-green-500' : obj.porcentagem > 0 ? 'text-yellow-500' : 'text-red-500';
                    const barraCor  = obj.porcentagem >= 100 ? 'bg-green-500' : obj.porcentagem > 0 ? 'bg-yellow-500' : 'bg-red-500';
                    
                    return (
                      <div key={obj.id} className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                              {obj.porcentagem >= 100 ? <CheckCircle size={16} className="text-green-500" weight="fill" /> : <WarningCircle size={16} className={statusCor} weight="fill" />}
                              {obj.descricao}
                            </h4>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">Custo Alvo: {fmtValor(obj.valor)}</span>
                          </div>
                          <div className="text-right">
                            <span className={`text-base font-black ${statusCor}`}>{obj.porcentagem}%</span>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase">
                              {obj.porcentagem >= 100 ? 'Pronto para Pagar!' : `Falta ${fmtValor(obj.faltando)}`}
                            </p>
                          </div>
                        </div>
                        <div className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                          <div className={`h-full ${barraCor} transition-all duration-500`} style={{ width: `${obj.porcentagem}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* GRÁFICO PIZZA E PRESTAÇÃO DE CONTAS */}
          <div className="space-y-6">
            
            {/* GRÁFICO PIZZA (DONUT) */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <h3 className="font-black text-lg text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-6">
                <ChartPieSlice size={22} className="text-orange-500" /> Distribuição de Gastos
              </h3>
              
              <div className="flex flex-col items-center gap-6">
                {/* O Donut CSS Mágico */}
                <div className="relative w-40 h-40 rounded-full flex items-center justify-center shadow-inner" style={{ background: gerarGradientPizza() }}>
                  <div className="absolute w-24 h-24 bg-white dark:bg-zinc-900 rounded-full flex flex-col items-center justify-center shadow-md">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Pago</span>
                    <span className="font-black text-zinc-900 dark:text-white text-sm">{fmtValor(totalGastosRealizados)}</span>
                  </div>
                </div>

                {/* Legenda do Gráfico */}
                <div className="w-full space-y-2">
                  {Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                    <div key={cat} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: CORES_CATEGORIA[cat] || CORES_CATEGORIA['OUTROS'] }}></span>
                        <span className="font-bold text-zinc-600 dark:text-zinc-400 uppercase">{cat}</span>
                      </div>
                      <span className="font-black text-zinc-900 dark:text-white">{((val / totalGastosRealizados) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                  {Object.keys(gastosPorCategoria).length === 0 && <p className="text-xs text-center text-zinc-400 italic">Nenhum gasto lançado.</p>}
                </div>
              </div>
            </div>

            {/* BOTÕES DE PRESTAÇÃO DE CONTAS */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <h3 className="font-black text-lg text-zinc-900 dark:text-white uppercase tracking-tight mb-2 flex items-center gap-2">
                <ListNumbers size={22} className="text-orange-500"/> Exportar Balanço
              </h3>
              <button onClick={gerarRelatorioWhatsApp} className="w-full bg-[#25D366] hover:bg-[#1ebe57] text-white font-black py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm text-sm uppercase">
                <WhatsappLogo size={20} weight="fill" /> Texto de Auditoria
              </button>
              <button onClick={exportarPDFBalanco} className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm text-sm uppercase">
                <FilePdf size={20} weight="fill" /> PDF Fechamento
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── FORMULÁRIOS E TABELAS (METAS E GASTOS) ── */}
      {abasSubAtiva !== 'geral' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LANÇADOR DE MOVIMENTAÇÕES COM CATEGORIAS E COMPROVANTE */}
          <div className={`p-6 rounded-xl border shadow-sm transition-colors ${itemEmEdicao ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
            <h3 className="font-black text-lg text-zinc-900 dark:text-white uppercase tracking-tight mb-4 flex items-center gap-2">
              {itemEmEdicao ? <><PencilSimple size={22} className="text-orange-500"/> Editar Registro</> : 'Lançamento Manual'}
            </h3>
            
            <form onSubmit={handleSalvarItem} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 mb-1">Descrição</label>
                <input required type="text" placeholder="EX: PAGAR DJ..." value={descricao} onChange={(e) => setDescricao(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none uppercase font-bold shadow-inner" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase text-zinc-400 mb-1">Valor (R$)</label>
                  <input required type="number" step="0.01" placeholder="0.00" value={valor} onChange={(e) => setValor(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none font-mono font-bold shadow-inner" />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase text-zinc-400 mb-1">Categoria</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none font-bold uppercase shadow-inner">
                    {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 mb-1">Link do Comprovante (Opcional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link size={16} className="text-zinc-400" />
                  </div>
                  <input type="url" placeholder="Link do Drive, Foto, etc." value={comprovante} onChange={(e) => setComprovante(e.target.value)}
                    className="w-full pl-9 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none shadow-inner" />
                </div>
              </div>

              {!itemEmEdicao && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors" onClick={() => setJaPago(!jaPago)}>
                  <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)}
                    className="w-4 h-4 text-orange-500 bg-white border-zinc-300 rounded focus:ring-orange-500" />
                  <label className="text-[11px] font-black text-zinc-700 dark:text-zinc-300 uppercase cursor-pointer select-none">
                    Já efetuei esse pagamento
                  </label>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {itemEmEdicao && (
                  <button type="button" onClick={cancelarEdicao} className="flex-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-lg text-sm uppercase transition-colors">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={aCarregar} className={`flex-[2] text-white font-black py-3 rounded-lg text-sm uppercase transition-all shadow-md ${itemEmEdicao ? 'bg-orange-600 hover:bg-orange-500' : 'bg-zinc-900 dark:bg-white dark:text-zinc-900 hover:bg-zinc-800'}`}>
                  {aCarregar ? 'Salvando...' : itemEmEdicao ? 'Atualizar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>

          {/* TABELA DE REGISTROS COM COMPROVANTE */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm lg:col-span-2 overflow-hidden">
            <h3 className="font-black text-lg text-zinc-900 dark:text-white uppercase tracking-tight mb-4 flex items-center gap-2">
              {abasSubAtiva === 'objetivos' ? <><Target size={22} className="text-orange-500"/> Metas Pendentes</> : <><TrendDown size={22} className="text-red-500"/> Gastos Registrados</>}
            </h3>

            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-black uppercase text-xs">
                    <th className="p-4">Descrição</th>
                    <th className="p-4 text-center">Cat</th>
                    <th className="p-4 text-center">Data</th>
                    <th className="p-4 text-right">Valor</th>
                    <th className="p-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(abasSubAtiva === 'objetivos' ? objetivos : gastos).length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-zinc-400 italic font-medium">Nenhum registro encontrado.</td>
                    </tr>
                  ) : (
                    (abasSubAtiva === 'objetivos' ? objetivos : gastos).map((item) => (
                      <tr key={item.id} className={`border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-950/40 transition-colors ${itemEmEdicao?.id === item.id ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                        <td className="p-4 font-black text-zinc-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
                          {item.descricao}
                          {item.comprovante && (
                            <a href={item.comprovante} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400" title="Ver Comprovante">
                              <Link size={16} weight="bold" />
                            </a>
                          )}
                        </td>
                        <td className="p-4 text-center">
                           <span className="text-[10px] font-black uppercase px-2 py-1 rounded-md text-white shadow-sm" style={{ backgroundColor: CORES_CATEGORIA[item.categoria] || CORES_CATEGORIA['OUTROS'] }}>
                             {item.categoria || 'OUTROS'}
                           </span>
                        </td>
                        <td className="p-4 text-center text-zinc-500 font-medium text-[11px] uppercase tracking-wider">
                          {fmtData(item.tsPagamento || item.ts).split(' ')[0]}
                        </td>
                        <td className={`p-4 text-right font-mono font-black text-base ${item.tipo === 'gasto' ? 'text-red-500' : 'text-orange-500'}`}>
                          {fmtValor(item.valor)}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-1">
                            {item.tipo === 'objetivo' && (
                              <button onClick={() => handlePagarObjetivo(item)} className="p-2 text-green-600 hover:text-white bg-green-50 hover:bg-green-500 rounded-lg transition-all shadow-sm" title="Dar baixa">
                                <CheckSquare size={18} weight="bold" />
                              </button>
                            )}
                            <button onClick={() => iniciarEdicao(item)} className="p-2 text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-500 rounded-lg transition-all shadow-sm" title="Editar">
                              <PencilSimple size={18} weight="bold" />
                            </button>
                            <button onClick={() => handleExcluirItem(item.id, item.descricao)} className="p-2 text-red-600 hover:text-white bg-red-50 hover:bg-red-500 rounded-lg transition-all shadow-sm" title="Excluir">
                              <Trash size={18} weight="bold" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}