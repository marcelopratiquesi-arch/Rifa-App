import { 
  CurrencyCircleDollar, Ticket, Medal, Target, 
  RocketLaunch, Storefront, DownloadSimple, FilePdf, Trophy,
  WhatsappLogo
} from '@phosphor-icons/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Configurações e Funções Auxiliares Isoladas
const TOTAL_COTAS = 1000;
const META_POR_VENDEDOR = 20; // 🎯 Meta individual ajustada para 20 cotas
const fmtValor = (v) => Number(v).toFixed(2).replace('.', ',');
const fmtData  = (ts) => new Date(ts).toLocaleString('pt-BR');

export default function AbaDashboard({ pedidos, vendedores }) {
  
  // ─── CÁLCULOS MATEMÁTICOS E FINANCEIROS ──────────────────────
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
  const calcularTopPacote = () => {
    const contagem = {};
    pedidosAprovados.forEach(p => {
      const qtd = (p.nums || []).length;
      if (qtd > 0) contagem[qtd] = (contagem[qtd] || 0) + 1;
    });
    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    return ordenado.length > 0 ? { qtd: ordenado[0][0], vezes: ordenado[0][1] } : null;
  };
  const topPacote = calcularTopPacote();

  // Relaciona Vendedores e Unidades
  const mapaVendedores = Object.fromEntries(vendedores.map((v) => [v.nome, v.unidade || 'Desconhecida']));

  const calcularRanking = () => {
    const rv = {}, ru = { 'Santa Inês 1': { valor: 0, cotas: 0 }, 'Santa Inês 2': { valor: 0, cotas: 0 } };
    
    // 1. INJETA TODOS OS VENDEDORES ATIVOS PRIMEIRO (Para os zerados aparecerem)
    vendedores.forEach(v => {
      if (v.ativo !== false) {
        rv[v.nome] = { valor: 0, cotas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: v.unidade || 'Santa Inês 1' };
      }
    });

    pedidosAprovados.forEach((p) => {
      const vend = p.vendedor || 'Venda Direta';
      const und  = mapaVendedores[vend] || 'Venda Direta';
      if (!rv[vend]) rv[vend] = { valor: 0, cotas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: und };
      rv[vend].valor += Number(p.valor);
      rv[vend].cotas += (p.nums || []).length;
      rv[vend].pedidosPagos += 1;
      if (ru[und]) { ru[und].valor += Number(p.valor); ru[und].cotas += (p.nums || []).length; }
    });

    pedidos.forEach(p => {
      const vend = p.vendedor || 'Venda Direta';
      if (!rv[vend]) rv[vend] = { valor: 0, cotas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: mapaVendedores[vend] || 'Venda Direta' };
      rv[vend].pedidosCriados += 1;
    });

    return {
      // Ordena por Quantidade de Cotas primeiro, depois por Valor
      vendedores: Object.entries(rv).map(([n, d]) => ({ 
        nome: n, ...d, conversao: d.pedidosCriados > 0 ? ((d.pedidosPagos / d.pedidosCriados) * 100).toFixed(0) : 0 
      })).sort((a, b) => b.cotas - a.cotas || b.valor - a.valor),
      unidades:   Object.entries(ru).map(([n, d]) => ({ nome: n, ...d })).sort((a, b) => b.valor - a.valor),
    };
  };

  const { vendedores: rankVend, unidades: rankUnit } = calcularRanking();

  // ─── MENSAGEM DO WHATSAPP (A COBRANÇA DA EQUIPE) ──────────────
  const enviarRankingWhatsApp = () => {
    // Removemos 'Venda Direta' para não cobrar o fantasma no grupo
    const rankingEquipe = rankVend.filter(v => v.nome !== 'Venda Direta');
    
    const pontuaram = rankingEquipe.filter(v => v.cotas > 0);
    const zerados = rankingEquipe.filter(v => v.cotas === 0);
    
    const metaGlobal = rankingEquipe.length * META_POR_VENDEDOR;
    const totalVendidoEquipe = rankingEquipe.reduce((acc, v) => acc + v.cotas, 0);

    const getEmoji = (cotas) => {
      if (cotas >= 20) return "🟢🟢🟢";
      if (cotas >= 10) return "🟢🟢❌";
      if (cotas > 0)  return "🟢❌❌";
      return "❌❌❌";
    };

    let msg = `*🏆 Ranking de Vendas da Rifa 🏆*\n`;
    msg += `*Total de Vendas:* ${totalVendidoEquipe.toString().padStart(2, '0')} / ${metaGlobal}\n\n`;

    let pos = 1;
    
    // Lista de quem já vendeu algo
    pontuaram.forEach((v) => {
      const primeiroNome = v.nome.split(' ')[0].toUpperCase();
      const cotasStr = v.cotas.toString().padStart(2, '0');
      msg += `${pos} ${getEmoji(v.cotas)} ${primeiroNome} ${cotasStr}\n`;
      pos++;
    });

    // Lista da Vergonha (Zerados)
    if (zerados.length > 0) {
      msg += `\n➖➖➖➖➖➖➖➖➖➖\n`;
      msg += `*🚨 BORA ACELERAR, GALERA! 🚀*\n`;
      msg += `_Todos abaixo ainda não pontuaram hoje._\n`;
      msg += `*SOCORRO, DEUS!!! 🙏*\n\n`;

      zerados.forEach((v) => {
        const primeiroNome = v.nome.split(' ')[0].toUpperCase();
        msg += `${pos} ❌❌❌ ${primeiroNome}\n`;
        pos++;
      });
    }

    // Abre o WhatsApp no celular/computador sem número específico, para você selecionar o grupo da equipe
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ─── EXPORTAÇÃO DE RELATÓRIOS ─────────────────────────────────
  const exportarExcel = () => {
    const dados = pedidos.map((p) => ({
      ID: p.id, Data: fmtData(p.ts), Nome: p.nome, Telefone: p.tel, CPF: p.cpf || '-',
      Vendedor: p.vendedor || 'Direto', Unidade: mapaVendedores[p.vendedor] || 'Venda Direta',
      Status: p.status.toUpperCase(), Qtd: (p.nums || []).length, 'Valor R$': Number(p.valor),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    XLSX.writeFile(wb, `Rifa_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportarPDF = () => {
    const pdf = new jsPDF('landscape');
    pdf.text('Relatório — Rifa Pratique', 14, 15);
    pdf.autoTable({
      head: [['ID','Data','Nome','Vendedor','Unidade','Status','Qtd','Valor']],
      body: pedidos.map((p) => [
        p.id, fmtData(p.ts), p.nome, p.vendedor || '-',
        mapaVendedores[p.vendedor] || '-', p.status.toUpperCase(),
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
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Média Cotas</p>
            <Ticket size={20} className="text-orange-500" />
          </div>
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{mediaCotas.toFixed(1)} <span className="text-sm text-zinc-500 font-normal">/ venda</span></h3>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Top Pacote</p>
            <Medal size={20} className="text-yellow-500" />
          </div>
          {topPacote ? (
            <div>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{topPacote.qtd} <span className="text-sm font-normal text-zinc-500">cotas</span></h3>
              <p className="text-[10px] text-zinc-400 mt-1">{topPacote.vezes} vendas</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Sem dados</p>
          )}
        </div>

        <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 dark:from-zinc-950 dark:to-black p-5 rounded-xl border border-zinc-700 shadow-sm flex flex-col justify-between text-white">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Projeção Final</p>
            <Target size={20} className="text-blue-400" />
          </div>
          <h3 className="text-2xl font-black text-white">R$ {fmtValor(projecaoFaturamento)}</h3>
          <p className="text-[10px] text-zinc-500 mt-1">Se mantiver este ticket médio</p>
        </div>
      </div>

      {/* ── TERMÔMETRO DA CAMPANHA ── */}
      <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-2">
          <div>
            <h3 className="font-black text-xl text-zinc-900 dark:text-white flex items-center gap-2">
              <RocketLaunch className="text-orange-500" weight="fill" /> Meta da Campanha
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Faltam apenas <strong className="text-orange-500">{TOTAL_COTAS - totalCotasVendidas}</strong> cotas para o esgotamento total.
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-black text-zinc-900 dark:text-white">{pctTotal}%</span>
            <span className="text-sm text-zinc-500 ml-2">ocupado</span>
          </div>
        </div>

        <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-8 overflow-hidden mb-3 relative border border-zinc-200 dark:border-zinc-700 shadow-inner">
          <div className="h-full flex rounded-full overflow-hidden absolute inset-0">
            <div
              className="bg-green-500 h-full transition-all duration-1000 ease-out flex items-center justify-end px-2"
              style={{ width: `${pctVendidas}%` }}
            />
            <div
              className="bg-yellow-400 h-full transition-all duration-1000 ease-out"
              style={{ width: `${pctReservadas}%` }}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold drop-shadow-md text-white mix-blend-difference">
            {totalCotasVendidas + totalCotasReservadas} / {TOTAL_COTAS}
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 text-xs text-zinc-500 mt-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-500 shadow-sm" />
            <strong className="text-green-600 dark:text-green-400">{totalCotasVendidas}</strong> pagas ({pctVendidas}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-yellow-400 shadow-sm" />
            <strong className="text-yellow-600 dark:text-yellow-400">{totalCotasReservadas}</strong> reservadas ({pctReservadas}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-zinc-200 dark:bg-zinc-700 shadow-sm" />
            <strong>{TOTAL_COTAS - totalCotasVendidas - totalCotasReservadas}</strong> disponíveis
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* ── BATALHA DAS UNIDADES ── */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-xl text-zinc-900 dark:text-white">
            <Medal className="text-orange-500" size={24} weight="fill" /> Batalha das Unidades
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {['Santa Inês 1', 'Santa Inês 2'].map((unidade) => {
              const dados     = rankUnit.find((u) => u.nome === unidade);
              const liderando = rankUnit[0]?.nome === unidade && rankUnit[0]?.valor > 0;
              return (
                <div key={unidade} className={`p-4 rounded-xl border-2 text-center transition-all ${liderando ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10 scale-105 shadow-lg relative' : 'border-zinc-200 dark:border-zinc-800'}`}>
                  {liderando && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap shadow-md animate-pulse">
                      Líder
                    </div>
                  )}
                  <Storefront size={28} className="mx-auto mb-2 text-zinc-400" />
                  <h4 className="font-bold text-zinc-900 dark:text-white text-sm">{unidade}</h4>
                  <p className="text-xl font-black text-green-600 dark:text-green-400 mt-1">R$ {fmtValor(dados?.valor || 0)}</p>
                  <p className="text-xs text-zinc-500 mt-1">{dados?.cotas || 0} cotas</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── FLUXO DE CAIXA E EXPORTAÇÕES ── */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-1">
              <p className="text-xs font-semibold text-zinc-500 mb-1">Caixa Aprovado</p>
              <h3 className="text-2xl font-black text-green-500">R$ {fmtValor(totalFaturado)}</h3>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-1">
              <p className="text-xs font-semibold text-zinc-500 mb-1">Pendente</p>
              <h3 className="text-2xl font-black text-yellow-500">R$ {fmtValor(totalPendente)}</h3>
            </div>
          </div>
          
          {/* BOTÕES DE EXPORTAÇÃO E WHATSAPP AQUI */}
          <div className="flex flex-col xl:flex-row gap-3">
            <button onClick={exportarExcel} className="flex-1 bg-[#107C41] hover:bg-[#0d6535] text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm">
              <DownloadSimple size={18} /> Planilha
            </button>
            <button onClick={exportarPDF} className="flex-1 bg-[#E53E3E] hover:bg-[#c53030] text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm">
              <FilePdf size={18} /> Relatório
            </button>
            <button onClick={enviarRankingWhatsApp} className="flex-1 bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm shadow-md">
              <WhatsappLogo size={18} weight="fill" /> Enviar Grupo
            </button>
          </div>
        </div>
      </div>

      {/* ── RANKING GERAL E CONVERSÃO ── */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-white text-lg">
          <Trophy className="text-yellow-500" size={24} weight="fill" /> Desempenho da Equipe
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 bg-zinc-50 dark:bg-zinc-950/50">
                <th className="p-3 font-bold">Pos</th>
                <th className="p-3 font-bold">Vendedor</th>
                <th className="p-3 font-bold">Unidade</th>
                <th className="p-3 font-bold text-center">Cotas</th>
                <th className="p-3 font-bold text-center">Conversão</th>
                <th className="p-3 font-bold text-right">Faturado</th>
              </tr>
            </thead>
            <tbody>
              {rankVend.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-zinc-500">Nenhuma venda aprovada ainda.</td>
                </tr>
              ) : (
                rankVend.map((v, i) => (
                  <tr key={v.nome} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3 font-black text-orange-500">
                      {i === 0 ? '🥇 1º' : i === 1 ? '🥈 2º' : i === 2 ? '🥉 3º' : `#${i + 1}`}
                    </td>
                    <td className="p-3 font-bold text-zinc-900 dark:text-white">{v.nome}</td>
                    <td className="p-3 text-xs font-semibold text-zinc-500">{v.unidade}</td>
                    <td className="p-3 text-center text-zinc-700 dark:text-zinc-300 font-mono">{v.cotas}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-bold w-10 text-right">{v.conversao}%</span>
                        <div className="w-16 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${Number(v.conversao) >= 70 ? 'bg-green-500' : Number(v.conversao) >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                            style={{ width: `${Math.min(v.conversao, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right font-black text-green-600 dark:text-green-400">R$ {fmtValor(v.valor)}</td>
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