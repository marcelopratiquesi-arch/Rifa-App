import { useState, useMemo } from 'react';
import { 
  CurrencyCircleDollar, Ticket, Medal, Target, 
  RocketLaunch, Storefront, DownloadSimple, FilePdf, Trophy,
  WhatsappLogo, FunnelSimple, CaretUp, CaretDown
} from '@phosphor-icons/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Configurações e Funções Auxiliares Isoladas
const TOTAL_COTAS = 1000;
const META_POR_VENDEDOR = 20; 
const fmtValor = (v) => Number(v).toFixed(2).replace('.', ',');
const fmtData  = (ts) => new Date(ts).toLocaleString('pt-BR');

export default function AbaDashboard({ pedidos, vendedores }) {
  
  // ─── ESTADOS DE FILTRO E ORDENAÇÃO ────────────────────────────
  const [filtroUnidade, setFiltroUnidade] = useState('Todas');
  const [ordenacao, setOrdenacao]         = useState('cotas'); 
  const [ordemDirecao, setOrdemDirecao]   = useState('desc');  

  // ─── 1. PERFORMANCE: USEMEMO (Evita travamentos na interface) ──
  const dadosMemoizados = useMemo(() => {
    const pedidosAprovados = pedidos.filter((p) => p.status === 'pago');
    const pedidosPendentes = pedidos.filter((p) => p.status === 'pendente');
    
    const totalFaturado    = pedidosAprovados.reduce((s, p) => s + Number(p.valor), 0);
    const totalPendente    = pedidosPendentes.reduce((s, p) => s + Number(p.valor), 0);

    const totalCotasVendidas   = pedidosAprovados.reduce((s, p) => s + (p.nums || []).length, 0);
    const totalCotasReservadas = pedidosPendentes.reduce((s, p) => s + (p.nums || []).length, 0);
    
    const pctVendidas          = Math.min((totalCotasVendidas / TOTAL_COTAS) * 100, 100).toFixed(1);
    const pctReservadas        = Math.min((totalCotasReservadas / TOTAL_COTAS) * 100, 100).toFixed(1);
    const pctTotal             = Math.min(((totalCotasVendidas + totalCotasReservadas) / TOTAL_COTAS) * 100, 100).toFixed(1);

    const ticketMedio = pedidosAprovados.length > 0 ? (totalFaturado / pedidosAprovados.length) : 0;
    const mediaCotas = pedidosAprovados.length > 0 ? (totalCotasVendidas / pedidosAprovados.length) : 0;
    const projecaoFaturamento = totalCotasVendidas > 0 ? (totalFaturado / totalCotasVendidas) * TOTAL_COTAS : 0;

    // Descobre o pacote mais vendido
    const contagem = {};
    pedidosAprovados.forEach(p => {
      const qtd = (p.nums || []).length;
      if (qtd > 0) contagem[qtd] = (contagem[qtd] || 0) + 1;
    });
    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    const topPacote = ordenado.length > 0 ? { qtd: ordenado[0][0], vezes: ordenado[0][1] } : null;

    // ─── 3. CORREÇÃO DE CASING (Unidades padronizadas) ────────
    const mapaVendedores = Object.fromEntries(vendedores.map((v) => [v.nome, String(v.unidade || 'Desconhecida').trim().toUpperCase()]));
    const rv = {};
    const ru = { 'SANTA INÊS 1': { valor: 0, cotas: 0 }, 'SANTA INÊS 2': { valor: 0, cotas: 0 } };
    
    // Injeta ativos primeiro
    vendedores.forEach(v => {
      if (v.ativo !== false) {
        rv[v.nome] = { valor: 0, cotas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: String(v.unidade || 'SANTA INÊS 1').trim().toUpperCase() };
      }
    });

    pedidosAprovados.forEach((p) => {
      const vend = p.vendedor || 'Venda Direta';
      const und  = mapaVendedores[vend] || 'VENDA DIRETA';
      if (!rv[vend]) rv[vend] = { valor: 0, cotas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: und };
      rv[vend].valor += Number(p.valor);
      rv[vend].cotas += (p.nums || []).length;
      rv[vend].pedidosPagos += 1;
      if (ru[und]) { ru[und].valor += Number(p.valor); ru[und].cotas += (p.nums || []).length; }
    });

    pedidos.forEach(p => {
      const vend = p.vendedor || 'Venda Direta';
      if (!rv[vend]) rv[vend] = { valor: 0, cotas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: mapaVendedores[vend] || 'VENDA DIRETA' };
      rv[vend].pedidosCriados += 1;
    });

    const rankVend = Object.entries(rv).map(([n, d]) => ({ 
      nome: String(n).toUpperCase(),
      ...d, 
      conversao: d.pedidosCriados > 0 ? Number(((d.pedidosPagos / d.pedidosCriados) * 100).toFixed(0)) : 0 
    }));

    const rankUnit = Object.entries(ru).map(([n, d]) => ({ nome: String(n).toUpperCase(), ...d })).sort((a, b) => b.valor - a.valor);

    return {
      totalFaturado, totalPendente, totalCotasVendidas, totalCotasReservadas,
      pctVendidas, pctReservadas, pctTotal, ticketMedio, mediaCotas, projecaoFaturamento,
      topPacote, rankVend, rankUnit
    };
  }, [pedidos, vendedores]); // Só recalcula se pedidos ou vendedores mudarem!

  const {
    totalFaturado, totalPendente, totalCotasVendidas, totalCotasReservadas,
    pctTotal, pctVendidas, pctReservadas, ticketMedio, mediaCotas, projecaoFaturamento,
    topPacote, rankVend, rankUnit
  } = dadosMemoizados;

  // Aplica o filtro de unidade na tabela de vendedores de forma blindada
  const vendedoresFiltrados = filtroUnidade === 'Todas' 
    ? rankVend 
    : rankVend.filter(v => v.unidade === String(filtroUnidade).trim().toUpperCase());

  // ─── LÓGICA DE ORDENAÇÃO VISUAL DA TABELA ────────
  const handleSort = (coluna) => {
    if (ordenacao === coluna) {
      setOrdemDirecao(ordemDirecao === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenacao(coluna);
      setOrdemDirecao('desc'); 
    }
  };

  const vendedoresOrdenados = [...vendedoresFiltrados].sort((a, b) => {
    let valA = a[ordenacao];
    let valB = b[ordenacao];

    if (ordenacao === 'nome' || ordenacao === 'unidade') {
      return ordemDirecao === 'asc' 
        ? String(valA).localeCompare(String(valB)) 
        : String(valB).localeCompare(String(valA));
    } else {
      return ordemDirecao === 'asc' 
        ? Number(valA) - Number(valB) 
        : Number(valB) - Number(valA);
    }
  });

  // ─── 2. CORREÇÃO DO WHATSAPP (Ordem blindada) ──────────────
  const enviarRankingWhatsApp = () => {
    // Sempre ordena por Cotas (do maior pro menor) independente do clique na tabela
    const rankingInquebravel = [...vendedoresFiltrados]
      .filter(v => v.nome !== 'VENDA DIRETA')
      .sort((a, b) => b.cotas - a.cotas || b.valor - a.valor);

    const pontuaram          = rankingInquebravel.filter(v => v.cotas > 0);
    const zerados            = rankingInquebravel.filter(v => v.cotas === 0);
    const metaGlobal         = rankingInquebravel.length * META_POR_VENDEDOR;
    const totalVendidoEquipe = rankingInquebravel.reduce((acc, v) => acc + v.cotas, 0);

    const tituloRanking = filtroUnidade === 'Todas' ? 'GERAL' : filtroUnidade.toUpperCase();

    const linhas = [];

    linhas.push(`*RANKING DE VENDAS - ${tituloRanking}*`);
    linhas.push(`*Total da Equipe:* ${totalVendidoEquipe} / ${metaGlobal} cotas`);
    linhas.push('');

    let pos = 1;

    if (pontuaram.length > 0) {
      linhas.push('*VENDAS REALIZADAS:*');
      pontuaram.forEach((v) => {
        const nome  = v.nome.split(' ')[0];
        const cotas = String(v.cotas).padStart(2, '0');
        linhas.push(`${pos}º ${nome} - ${cotas} cotas`);
        pos++;
      });
    }

    if (zerados.length > 0) {
      linhas.push('');
      linhas.push('*AINDA NÃO PONTUARAM:*');
      zerados.forEach((v) => {
        const nome = v.nome.split(' ')[0];
        linhas.push(`${pos}º ${nome} - 0 cotas`);
        pos++;
      });
    }

    window.open('https://wa.me/?text=' + encodeURIComponent(linhas.join('\n')), '_blank');
  };

  // ─── EXPORTAÇÃO DE RELATÓRIOS ─────────────────────────────────
  const exportarExcel = () => {
    const dados = pedidos.map((p) => ({
      ID: p.id, 
      Data: fmtData(p.ts), 
      Nome: String(p.nome).toUpperCase(), 
      Telefone: p.tel, 
      CPF: p.cpf || '-',
      Vendedor: String(p.vendedor || 'Direto').toUpperCase(), 
      Unidade: String(vendedores.find(v => v.nome === p.vendedor)?.unidade || 'Venda Direta').toUpperCase(),
      Status: p.status.toUpperCase(), 
      Números: (p.nums || []).join(', '), // ✅ Adicionado: Lista os números separados por vírgula
      Qtd: (p.nums || []).length, 
      'Valor R$': Number(p.valor),
    }));
    
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    XLSX.writeFile(wb, `Rifa_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportarPDF = () => {
    const pdf = new jsPDF('landscape');
    pdf.text('RELATÓRIO — RIFA PRATIQUE', 14, 15);
    pdf.autoTable({
      head: [['ID','DATA','NOME','VENDEDOR','UNIDADE','STATUS','QTD','VALOR']],
      body: pedidos.map((p) => [
        p.id, fmtData(p.ts), String(p.nome).toUpperCase(), String(p.vendedor || '-').toUpperCase(),
        String(vendedores.find(v => v.nome === p.vendedor)?.unidade || '-').toUpperCase(), p.status.toUpperCase(),
        (p.nums || []).length, `R$ ${fmtValor(p.valor)}`,
      ]),
      startY: 22, styles: { fontSize: 8 }, headStyles: { fillColor: [234, 88, 12] },
    });
    pdf.save(`Rifa_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="animate-fade-in space-y-6">

      {/* ── CARDS EXECUTIVOS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Ticket Médio</p>
            <CurrencyCircleDollar size={20} className="text-green-500" />
          </div>
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white">R$ {fmtValor(ticketMedio)}</h3>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Média Rifas</p>
            <Ticket size={20} className="text-orange-500" />
          </div>
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{mediaCotas.toFixed(1)} <span className="text-sm text-zinc-500 font-normal uppercase">/ venda</span></h3>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Top Pacote</p>
            <Medal size={20} className="text-yellow-500" />
          </div>
          {topPacote ? (
            <div>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{topPacote.qtd} <span className="text-sm font-normal text-zinc-500 uppercase">rifas</span></h3>
              <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold">{topPacote.vezes} vendas</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 uppercase font-bold">SEM DADOS</p>
          )}
        </div>

        <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 dark:from-zinc-950 dark:to-black p-5 rounded-xl border border-zinc-700 shadow-sm flex flex-col justify-between text-white">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Projeção Final</p>
            <Target size={20} className="text-blue-400" />
          </div>
          <h3 className="text-2xl font-black text-white">R$ {fmtValor(projecaoFaturamento)}</h3>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold">SE MANTIVER ESTE TICKET</p>
        </div>
      </div>

      {/* ── BATALHA E FLUXO DE CAIXA ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-xl text-zinc-900 dark:text-white uppercase">
            <Medal className="text-orange-500" size={24} weight="fill" /> Batalha das Unidades
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {['SANTA INÊS 1', 'SANTA INÊS 2'].map((unidade) => {
              const dados     = rankUnit.find((u) => u.nome === unidade);
              const liderando = rankUnit[0]?.nome === unidade && rankUnit[0]?.valor > 0;
              return (
                <div key={unidade} className={`p-4 rounded-xl border-2 text-center transition-all ${liderando ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10 scale-105 shadow-lg relative' : 'border-zinc-200 dark:border-zinc-800'}`}>
                  {liderando && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap shadow-md animate-pulse">
                      LÍDER
                    </div>
                  )}
                  <Storefront size={28} className="mx-auto mb-2 text-zinc-400" />
                  <h4 className="font-black text-zinc-900 dark:text-white text-sm uppercase">{unidade}</h4>
                  <p className="text-xl font-black text-green-600 dark:text-green-400 mt-1">R$ {fmtValor(dados?.valor || 0)}</p>
                  <p className="text-xs text-zinc-500 mt-1 uppercase font-bold">{dados?.cotas || 0} RIFAS</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-1">
              <p className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">CAIXA APROVADO</p>
              <h3 className="text-3xl font-black text-green-500">R$ {fmtValor(totalFaturado)}</h3>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-1">
              <p className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">PENDENTE PIX</p>
              <h3 className="text-3xl font-black text-yellow-500">R$ {fmtValor(totalPendente)}</h3>
            </div>
          </div>
          
          <div className="flex flex-col xl:flex-row gap-3">
            <button onClick={exportarExcel} className="flex-1 bg-[#107C41] hover:bg-[#0d6535] text-white font-black py-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm uppercase tracking-wide">
              <DownloadSimple size={20} weight="bold" /> PLANILHA
            </button>
            <button onClick={exportarPDF} className="flex-1 bg-[#E53E3E] hover:bg-[#c53030] text-white font-black py-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm uppercase tracking-wide">
              <FilePdf size={20} weight="bold" /> RELATÓRIO PDF
            </button>
            <button onClick={enviarRankingWhatsApp} className="flex-1 bg-[#25D366] hover:bg-[#1ebe57] text-white font-black py-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm shadow-md uppercase tracking-wide">
              <WhatsappLogo size={20} weight="fill" /> ENVIAR GRUPO
            </button>
          </div>
        </div>
      </div>

      {/* ── RANKING GERAL E CONVERSÃO COM FILTRO (A-Z E MAIOR/MENOR) ── */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h3 className="font-black flex items-center gap-2 text-zinc-900 dark:text-white text-xl uppercase tracking-tight">
            <Trophy className="text-yellow-500" size={28} weight="fill" /> DESEMPENHO DA EQUIPE
          </h3>
          
          <div className="relative w-full sm:w-auto">
            <FunnelSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <select
              value={filtroUnidade}
              onChange={(e) => setFiltroUnidade(e.target.value)}
              className="pl-9 pr-8 py-3 w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none font-bold uppercase cursor-pointer appearance-none shadow-sm tracking-wider"
            >
              <option value="Todas">🏆 TODAS AS UNIDADES</option>
              <option value="Santa Inês 1">SI1 - SANTA INÊS 1</option>
              <option value="Santa Inês 2">SI2 - SANTA INÊS 2</option>
              <option value="Venda Direta">💻 VENDA DIRETA</option>
            </select>
          </div>
        </div>
        
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                <th className="p-4 font-black uppercase text-xs tracking-wider">POS</th>
                
                <th 
                  className="p-4 font-black uppercase text-xs tracking-wider cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('nome')}
                >
                  <div className="flex items-center gap-1">VENDEDOR {ordenacao === 'nome' && (ordemDirecao === 'asc' ? <CaretUp weight="bold"/> : <CaretDown weight="bold"/>)}</div>
                </th>
                
                <th 
                  className="p-4 font-black uppercase text-xs tracking-wider cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('unidade')}
                >
                  <div className="flex items-center gap-1">UNIDADE {ordenacao === 'unidade' && (ordemDirecao === 'asc' ? <CaretUp weight="bold"/> : <CaretDown weight="bold"/>)}</div>
                </th>
                
                <th 
                  className="p-4 font-black uppercase text-xs tracking-wider text-center cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('cotas')}
                >
                  <div className="flex items-center justify-center gap-1">QTD RIFAS {ordenacao === 'cotas' && (ordemDirecao === 'asc' ? <CaretUp weight="bold"/> : <CaretDown weight="bold"/>)}</div>
                </th>
                
                <th 
                  className="p-4 font-black uppercase text-xs tracking-wider text-center cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('conversao')}
                >
                  <div className="flex items-center justify-center gap-1">CONVERSÃO {ordenacao === 'conversao' && (ordemDirecao === 'asc' ? <CaretUp weight="bold"/> : <CaretDown weight="bold"/>)}</div>
                </th>
                
                <th 
                  className="p-4 font-black uppercase text-xs tracking-wider text-right cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('valor')}
                >
                  <div className="flex items-center justify-end gap-1">FATURAMENTO {ordenacao === 'valor' && (ordemDirecao === 'asc' ? <CaretUp weight="bold"/> : <CaretDown weight="bold"/>)}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {vendedoresOrdenados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-zinc-500 font-bold uppercase tracking-widest">NENHUM DADO ENCONTRADO NESSE FILTRO.</td>
                </tr>
              ) : (
                vendedoresOrdenados.map((v, i) => (
                  <tr key={v.nome} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors group">
                    <td className="p-4 font-black text-orange-500 text-lg">
                      {ordenacao === 'cotas' && ordemDirecao === 'desc' ? (
                        i === 0 ? '🥇 1º' : i === 1 ? '🥈 2º' : i === 2 ? '🥉 3º' : `#${i + 1}`
                      ) : (
                        `#${i + 1}` // Só exibe medalha se estiver ordenado pelo ranking oficial (Cotas)
                      )}
                    </td>
                    <td className="p-4 font-black text-zinc-900 dark:text-white uppercase tracking-wide text-[15px]">{v.nome}</td>
                    <td className="p-4 text-xs font-black text-zinc-400 uppercase tracking-widest">{v.unidade}</td>
                    <td className="p-4 text-center text-zinc-800 dark:text-zinc-200 font-mono text-xl font-black bg-zinc-50 dark:bg-zinc-900/50 group-hover:bg-transparent transition-colors">
                      {v.cotas}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-3">
                        <span className="font-black text-sm w-12 text-right">{v.conversao}%</span>
                        <div className="w-20 h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full ${Number(v.conversao) >= 70 ? 'bg-green-500' : Number(v.conversao) >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                            style={{ width: `${Math.min(v.conversao, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right font-black text-green-600 dark:text-green-400 text-lg">R$ {fmtValor(v.valor)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}