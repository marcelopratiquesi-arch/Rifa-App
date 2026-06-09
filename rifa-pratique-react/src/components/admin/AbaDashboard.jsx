import { useState, useMemo } from 'react';
import { 
  CurrencyCircleDollar, Ticket, Medal, Target, 
  Storefront, DownloadSimple, FilePdf, Trophy,
  WhatsappLogo, FunnelSimple, CaretUp, CaretDown, Fire, X, Copy
} from '@phosphor-icons/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

// Configurações e Funções Auxiliares Isoladas
const TOTAL_RIFAS = 1000;
const META_POR_VENDEDOR = 20; 
const fmtValor = (v) => Number(v).toFixed(2).replace('.', ',');
const fmtData  = (ts) => new Date(ts).toLocaleString('pt-BR');

// Limpador absoluto de strings (mata espaços invisíveis e diferenças de maiúsculas)
const normalizarTexto = (texto) => String(texto || '').trim().toUpperCase();

export default function AbaDashboard({ pedidos, vendedores }) {
  
  // ─── ESTADOS DE FILTRO E ORDENAÇÃO ────────────────────────────
  const [filtroUnidade, setFiltroUnidade] = useState('Todas');
  const [ordenacao, setOrdenacao]         = useState('rifas'); // 🚀 Alterado de 'cotas' para 'rifas'
  const [ordemDirecao, setOrdemDirecao]   = useState('desc');  

  // 🚀 ESTADOS DO PREVIEW DO WHATSAPP
  const [modalWhatsAppOpen, setModalWhatsAppOpen] = useState(false);
  const [mensagemZap, setMensagemZap]             = useState('');
  const [textoCopiado, setTextoCopiado]           = useState(false); 

  // ─── 1. PERFORMANCE: USEMEMO (Evita travamentos na interface) ──
  const dadosMemoizados = useMemo(() => {
    const pedidosAprovados = pedidos.filter((p) => p.status === 'pago');
    const pedidosPendentes = pedidos.filter((p) => p.status === 'pendente');
    
    const totalFaturado    = pedidosAprovados.reduce((s, p) => s + Number(p.valor), 0);
    const totalPendente    = pedidosPendentes.reduce((s, p) => s + Number(p.valor), 0);

    const totalRifasVendidas   = pedidosAprovados.reduce((s, p) => s + (p.nums || []).length, 0);
    const totalRifasReservadas = pedidosPendentes.reduce((s, p) => s + (p.nums || []).length, 0);
    
    const pctVendidas          = Math.min((totalRifasVendidas / TOTAL_RIFAS) * 100, 100).toFixed(1);
    const pctReservadas        = Math.min((totalRifasReservadas / TOTAL_RIFAS) * 100, 100).toFixed(1);
    const pctTotal             = Math.min(((totalRifasVendidas + totalRifasReservadas) / TOTAL_RIFAS) * 100, 100).toFixed(1);

    const ticketMedio = pedidosAprovados.length > 0 ? (totalFaturado / pedidosAprovados.length) : 0;
    const mediaRifas = pedidosAprovados.length > 0 ? (totalRifasVendidas / pedidosAprovados.length) : 0;
    const projecaoFaturamento = totalRifasVendidas > 0 ? (totalFaturado / totalRifasVendidas) * TOTAL_RIFAS : 0;

    // Descobre o pacote mais vendido
    const contagem = {};
    pedidosAprovados.forEach(p => {
      const qtd = (p.nums || []).length;
      if (qtd > 0) contagem[qtd] = (contagem[qtd] || 0) + 1;
    });
    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    const topPacote = ordenado.length > 0 ? { qtd: ordenado[0][0], vezes: ordenado[0][1] } : null;

    // ─── CORREÇÃO DE CASING (Unidades padronizadas blindadas) ────────
    const mapaVendedores = {};
    vendedores.forEach((v) => {
      const chaveNome = normalizarTexto(v.nome);
      let chaveUnidade = normalizarTexto(v.unidade || 'SANTA INÊS 1');
      if (chaveUnidade === 'SANTA INES 1') chaveUnidade = 'SANTA INÊS 1';
      if (chaveUnidade === 'SANTA INES 2') chaveUnidade = 'SANTA INÊS 2';
      mapaVendedores[chaveNome] = chaveUnidade;
    });

    const rv = {};
    const ru = { 'SANTA INÊS 1': { valor: 0, rifas: 0 }, 'SANTA INÊS 2': { valor: 0, rifas: 0 }, 'VENDA DIRETA': { valor: 0, rifas: 0 } };
    
    // Injeta ativos primeiro para eles sempre aparecerem, mesmo zerados
    vendedores.forEach(v => {
      if (v.ativo !== false) {
        const chaveNome = normalizarTexto(v.nome);
        rv[chaveNome] = { valor: 0, rifas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: mapaVendedores[chaveNome] };
      }
    });

    pedidosAprovados.forEach((p) => {
      const vendChave = normalizarTexto(p.vendedor);
      const chaveFinal = vendChave && mapaVendedores[vendChave] ? vendChave : (vendChave === '' ? 'VENDA DIRETA' : vendChave);
      const und = mapaVendedores[chaveFinal] || 'VENDA DIRETA';
      
      if (!rv[chaveFinal]) rv[chaveFinal] = { valor: 0, rifas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: und };
      
      rv[chaveFinal].valor += Number(p.valor);
      rv[chaveFinal].rifas += (p.nums || []).length;
      rv[chaveFinal].pedidosPagos += 1;
      
      if (!ru[und]) ru[und] = { valor: 0, rifas: 0 };
      ru[und].valor += Number(p.valor);
      ru[und].rifas += (p.nums || []).length;
    });

    pedidos.forEach(p => {
      const vendChave = normalizarTexto(p.vendedor);
      const chaveFinal = vendChave && mapaVendedores[vendChave] ? vendChave : (vendChave === '' ? 'VENDA DIRETA' : vendChave);
      const und = mapaVendedores[chaveFinal] || 'VENDA DIRETA';

      if (!rv[chaveFinal]) rv[chaveFinal] = { valor: 0, rifas: 0, pedidosCriados: 0, pedidosPagos: 0, unidade: und };
      rv[chaveFinal].pedidosCriados += 1;
    });

    const rankVend = Object.entries(rv).map(([n, d]) => ({ 
      nome: n,
      ...d, 
      conversao: d.pedidosCriados > 0 ? Number(((d.pedidosPagos / d.pedidosCriados) * 100).toFixed(0)) : 0 
    }));

    const rankUnit = Object.entries(ru)
      .filter(([n]) => n === 'SANTA INÊS 1' || n === 'SANTA INÊS 2')
      .map(([n, d]) => ({ nome: n, ...d }))
      .sort((a, b) => b.valor - a.valor);

    return {
      totalFaturado, totalPendente, ticketMedio, mediaRifas, projecaoFaturamento,
      topPacote, rankVend, rankUnit
    };
  }, [pedidos, vendedores]); 

  const {
    totalFaturado, totalPendente, ticketMedio, mediaRifas, projecaoFaturamento,
    topPacote, rankVend, rankUnit
  } = dadosMemoizados;

  const vendedoresFiltrados = filtroUnidade === 'Todas' 
    ? rankVend 
    : rankVend.filter(v => v.unidade === normalizarTexto(filtroUnidade));

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

  const top3Vendedores = useMemo(() => {
    return [...vendedoresFiltrados]
      .filter(v => v.nome !== 'VENDA DIRETA' && v.rifas > 0)
      .sort((a, b) => b.rifas - a.rifas || b.valor - a.valor)
      .slice(0, 3);
  }, [vendedoresFiltrados]);

  let msgBatalhaUnidades = null;
  if (rankUnit.length >= 2 && rankUnit[0].valor > 0) {
    const diferencaValor = rankUnit[0].valor - rankUnit[1].valor;
    if (diferencaValor > 0) {
      const rifasAprox = Math.ceil(diferencaValor / 10);
      msgBatalhaUnidades = `🔥 Faltam apenas R$ ${fmtValor(diferencaValor)} (${rifasAprox} rifas) para a unidade ${rankUnit[1].nome} virar o jogo!`;
    } else {
      msgBatalhaUnidades = `🔥 EMPATE TÉCNICO! Quem vai desempatar essa guerra?`;
    }
  }

  const prepararRankingWhatsApp = () => {
    const rankingInquebravel = [...vendedoresFiltrados]
      .filter(v => v.nome !== 'VENDA DIRETA')
      .sort((a, b) => b.rifas - a.rifas || b.valor - a.valor);

    const pontuaram          = rankingInquebravel.filter(v => v.rifas > 0);
    const zerados            = rankingInquebravel.filter(v => v.rifas === 0);
    const metaGlobal         = rankingInquebravel.length * META_POR_VENDEDOR;
    const totalVendidoEquipe = rankingInquebravel.reduce((acc, v) => acc + v.rifas, 0);

    const tituloRanking = filtroUnidade === 'Todas' ? 'GERAL' : normalizarTexto(filtroUnidade);

    const linhas = [];

    linhas.push(`*RANKING DE VENDAS - ${tituloRanking}*`);
    linhas.push(`*Total da Equipe:* ${totalVendidoEquipe} / ${metaGlobal} rifas`);
    linhas.push('');

    let pos = 1;

    if (pontuaram.length > 0) {
      linhas.push('*VENDAS REALIZADAS:*');
      pontuaram.forEach((v) => {
        const nome  = v.nome.split(' ')[0];
        const rifas = String(v.rifas).padStart(2, '0');
        linhas.push(`${pos}º ${nome} - ${rifas} rifas`);
        pos++;
      });
    }

    if (zerados.length > 0) {
      linhas.push('');
      linhas.push('*AINDA NÃO PONTUARAM:*');
      zerados.forEach((v) => {
        const nome = v.nome.split(' ')[0];
        linhas.push(`${pos}º ${nome} - 0 rifas`);
        pos++;
      });
    }

    setMensagemZap(linhas.join('\n'));
    setModalWhatsAppOpen(true);
  };

  const confirmarEnvioWhatsApp = () => {
    window.open('https://wa.me/?text=' + encodeURIComponent(mensagemZap), '_blank');
    setModalWhatsAppOpen(false);
  };

  const copiarTextoWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(mensagemZap);
      setTextoCopiado(true);
      setTimeout(() => setTextoCopiado(false), 2000); 
    } catch (err) {
      console.error("Falha ao copiar texto: ", err);
    }
  };

  const pegarUnidadeDoVendedor = (nomeVendedor) => {
    const chave = normalizarTexto(nomeVendedor);
    const found = vendedores.find(v => normalizarTexto(v.nome) === chave);
    return found && found.unidade ? normalizarTexto(found.unidade) : 'VENDA DIRETA';
  };

  const exportarExcel = () => {
    const dados = pedidos.map((p) => {
      const vendFinal = normalizarTexto(p.vendedor) || 'VENDA DIRETA';
      return {
        ID: p.id, 
        Data: fmtData(p.ts), 
        Nome: normalizarTexto(p.nome), 
        Telefone: p.tel, 
        CPF: p.cpf || '-',
        Vendedor: vendFinal, 
        Unidade: pegarUnidadeDoVendedor(vendFinal),
        Status: normalizarTexto(p.status), 
        Números: (p.nums || []).join(', '), 
        Qtd: (p.nums || []).length, 
        'Valor R$': Number(p.valor),
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas Gerais');
    XLSX.writeFile(wb, `Rifa_Geral_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportarExcelNumerosPagos = () => {
    const pagos = pedidos.filter(p => p.status === 'pago');
    const linhas = [];

    pagos.forEach(p => {
      const vendFinal = normalizarTexto(p.vendedor) || 'VENDA DIRETA';
      const unidade = pegarUnidadeDoVendedor(vendFinal);
      
      if (p.nums && Array.isArray(p.nums)) {
        p.nums.forEach(num => {
          linhas.push({
            'Número': String(num).padStart(3, '0'),
            'Nome Cliente': normalizarTexto(p.nome),
            'CPF': p.cpf || '-',
            'Vendedor': vendFinal,
            'Unidade': unidade,
            'Status': 'PAGO',
            'ID Pedido': p.id
          });
        });
      }
    });

    linhas.sort((a, b) => parseInt(a['Número'], 10) - parseInt(b['Número'], 10));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Numeros Pagos');
    XLSX.writeFile(wb, `Auditoria_Numeros_Pagos_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportarPDF = () => {
    try {
      const pdf = new jsPDF('landscape');
      pdf.text('RELATÓRIO DE NÚMEROS — RIFA PRATIQUE', 14, 15);
      
      const linhasParaPDF = [];

      pedidos.forEach(p => {
        const vendFinal = normalizarTexto(p.vendedor) || 'VENDA DIRETA';
        const unidade = pegarUnidadeDoVendedor(vendFinal);
        
        if (p.nums && Array.isArray(p.nums)) {
          p.nums.forEach(num => {
            linhasParaPDF.push({
              numeroInt: parseInt(num, 10), 
              numeroStr: String(num).padStart(3, '0'),
              nome: normalizarTexto(p.nome) || 'SEM NOME',
              cpf: p.cpf || '-',
              vendedor: vendFinal,
              unidade: unidade,
              status: normalizarTexto(p.status) || 'PENDENTE',
              idPedido: p.id || '-'
            });
          });
        }
      });

      linhasParaPDF.sort((a, b) => a.numeroInt - b.numeroInt);

      const body = linhasParaPDF.map(linha => [
        linha.numeroStr,
        linha.nome,
        linha.cpf,
        linha.vendedor,
        linha.unidade,
        linha.status,
        linha.idPedido
      ]);

      autoTable(pdf, {
        head: [['NÚMERO', 'NOME', 'CPF', 'VENDEDOR', 'UNIDADE', 'STATUS', 'ID PEDIDO']],
        body: body,
        startY: 22, 
        styles: { fontSize: 8 }, 
        headStyles: { fillColor: [234, 88, 12] },
      });
      
      pdf.save(`Auditoria_Completa_Rifa_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (erro) {
      console.error("Erro ao gerar PDF:", erro);
      alert("Houve um erro ao gerar o PDF. Verifique o console de desenvolvedor.");
    }
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
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{mediaRifas.toFixed(1)} <span className="text-sm text-zinc-500 font-normal uppercase">/ venda</span></h3>
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
        
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-xl text-zinc-900 dark:text-white uppercase">
            <Medal className="text-orange-500" size={24} weight="fill" /> Batalha das Unidades
          </h3>
          <div className="grid grid-cols-2 gap-4 flex-1">
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
                  <p className="text-xs text-zinc-500 mt-1 uppercase font-bold">{dados?.rifas || 0} RIFAS</p>
                </div>
              );
            })}
          </div>
          
          {msgBatalhaUnidades && (
            <div className="mt-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-3 rounded-lg text-center animate-fade-in">
              <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center justify-center gap-1">
                <Fire weight="fill" /> {msgBatalhaUnidades}
              </p>
            </div>
          )}
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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-auto">
            <button onClick={exportarExcel} className="w-full bg-[#107C41] hover:bg-[#0d6535] text-white font-black py-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm uppercase tracking-wide">
              <DownloadSimple size={20} weight="bold" /> PLANILHA
            </button>
            
            <button onClick={exportarExcelNumerosPagos} className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white font-black py-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm uppercase tracking-wide shadow-md">
              <Ticket size={20} weight="bold" /> AUDITORIA
            </button>
            
            <button onClick={exportarPDF} className="w-full bg-[#E53E3E] hover:bg-[#c53030] text-white font-black py-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm uppercase tracking-wide">
              <FilePdf size={20} weight="bold" /> PDF
            </button>
            
            <button onClick={prepararRankingWhatsApp} className="w-full bg-[#25D366] hover:bg-[#1ebe57] text-white font-black py-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm shadow-md uppercase tracking-wide">
              <WhatsappLogo size={20} weight="fill" /> GRUPO
            </button>
          </div>
        </div>
      </div>

      {/* ── RANKING GERAL E CONVERSÃO COM FILTRO ── */}
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

        {top3Vendedores.length > 0 && (
          <div className="mb-10 mt-4 flex flex-row justify-center items-end gap-2 sm:gap-4 px-2">
            {top3Vendedores[1] && (
              <div className="flex-1 max-w-[150px] bg-zinc-50 dark:bg-zinc-800/40 rounded-t-2xl p-4 flex flex-col items-center justify-end border-b-4 border-zinc-400 h-[120px] sm:h-[140px] shadow-sm">
                <span className="text-2xl sm:text-3xl mb-1 drop-shadow-md">🥈</span>
                <span className="font-black text-zinc-800 dark:text-zinc-200 text-xs sm:text-sm text-center truncate w-full uppercase">{top3Vendedores[1].nome.split(' ')[0]}</span>
                <span className="text-zinc-500 text-[10px] sm:text-xs font-bold">{top3Vendedores[1].rifas} RIFAS</span>
              </div>
            )}
            
            {top3Vendedores[0] && (
              <div className="flex-1 max-w-[170px] bg-gradient-to-t from-orange-50 to-white dark:from-orange-900/20 dark:to-zinc-900 rounded-t-2xl p-4 flex flex-col items-center justify-end border-b-4 border-yellow-500 h-[150px] sm:h-[180px] shadow-xl z-10 transform -translate-y-2">
                <span className="text-4xl sm:text-5xl mb-2 drop-shadow-lg">🥇</span>
                <span className="font-black text-orange-600 dark:text-orange-500 text-sm sm:text-base text-center truncate w-full uppercase">{top3Vendedores[0].nome.split(' ')[0]}</span>
                <span className="text-orange-800 dark:text-orange-300 text-xs sm:text-sm font-black">{top3Vendedores[0].rifas} RIFAS</span>
              </div>
            )}
            
            {top3Vendedores[2] && (
              <div className="flex-1 max-w-[150px] bg-zinc-50 dark:bg-zinc-800/40 rounded-t-2xl p-4 flex flex-col items-center justify-end border-b-4 border-orange-700 h-[100px] sm:h-[120px] shadow-sm">
                <span className="text-xl sm:text-2xl mb-1 drop-shadow-md">🥉</span>
                <span className="font-black text-zinc-800 dark:text-zinc-200 text-xs sm:text-sm text-center truncate w-full uppercase">{top3Vendedores[2].nome.split(' ')[0]}</span>
                <span className="text-zinc-500 text-[10px] sm:text-xs font-bold">{top3Vendedores[2].rifas} RIFAS</span>
              </div>
            )}
          </div>
        )}
        
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
                  onClick={() => handleSort('rifas')}
                >
                  <div className="flex items-center justify-center gap-1">QTD RIFAS {ordenacao === 'rifas' && (ordemDirecao === 'asc' ? <CaretUp weight="bold"/> : <CaretDown weight="bold"/>)}</div>
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
                    <td className="p-4 font-black text-zinc-500 dark:text-zinc-400 text-base">
                      #{i + 1}
                    </td>
                    <td className="p-4 font-black text-zinc-900 dark:text-white uppercase tracking-wide text-[15px]">{v.nome}</td>
                    <td className="p-4 text-xs font-black text-zinc-400 uppercase tracking-widest">{v.unidade}</td>
                    <td className="p-4 text-center text-zinc-800 dark:text-zinc-200 font-mono text-xl font-black bg-zinc-50 dark:bg-zinc-900/50 group-hover:bg-transparent transition-colors">
                      {v.rifas}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-3">
                        <span className="font-black text-sm w-12 text-right">{v.conversao}%</span>
                        <div className="relative w-24 h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full ${Number(v.conversao) >= 70 ? 'bg-green-500' : Number(v.conversao) >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                            style={{ width: `${Math.min(v.conversao, 100)}%` }}
                          />
                          <div 
                            className="absolute top-0 bottom-0 w-[2px] bg-zinc-900 dark:bg-zinc-300 z-10 opacity-70" 
                            style={{ left: '70%' }} 
                            title="Meta Esperada: 70%" 
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

      {/* 🚀 MODAL DE PREVIEW DO WHATSAPP */}
      {modalWhatsAppOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col transform transition-all">
            
            <div className="bg-[#25D366] p-4 flex justify-between items-center text-white">
              <h3 className="font-black flex items-center gap-2">
                <WhatsappLogo size={24} weight="fill" /> Preview da Mensagem
              </h3>
              <button 
                onClick={() => setModalWhatsAppOpen(false)} 
                className="hover:bg-white/20 p-1.5 rounded-full transition-colors"
              >
                <X size={20} weight="bold" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                Você pode editar a mensagem ou adicionar um recado antes de enviar para o grupo:
              </p>
              
              <textarea
                className="w-full h-64 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl p-4 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] resize-none scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700"
                value={mensagemZap}
                onChange={(e) => setMensagemZap(e.target.value)}
              />
              
              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <button 
                  onClick={() => setModalWhatsAppOpen(false)} 
                  className="flex-1 py-3.5 font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                
                <button 
                  onClick={copiarTextoWhatsApp} 
                  className="flex-1 py-3.5 font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800/30 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Copy size={20} weight="bold" />
                  {textoCopiado ? 'Copiado!' : 'Copiar'}
                </button>

                <button 
                  onClick={confirmarEnvioWhatsApp} 
                  className="flex-[2] py-3.5 font-black text-white bg-[#25D366] hover:bg-[#1ebe57] rounded-xl transition-colors shadow-lg shadow-[#25D366]/30 flex items-center justify-center gap-2"
                >
                  <WhatsappLogo size={22} weight="bold" /> Enviar Agora
                </button>
              </div>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}