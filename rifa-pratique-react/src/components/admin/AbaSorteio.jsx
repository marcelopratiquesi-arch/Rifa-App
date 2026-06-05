import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Gift, Ticket, SpinnerGap, Trophy, WhatsappLogo, LockKey, 
  WarningCircle, CheckCircle, FileText, X 
} from '@phosphor-icons/react';
import confetti from 'canvas-confetti';
import { doc, getDoc, updateDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
// IMPORTANTE: Ajuste o caminho abaixo para a sua instância do Firebase exportada
import { db } from '../../services/firebase'; 

export default function AbaSorteio({ pedidos }) {
  const [rifaStatus, setRifaStatus] = useState('aberta');
  const [loadingStatus, setLoadingStatus] = useState(true);
  
  // Estados do Sorteio
  const [modalOpen, setModalOpen] = useState(false);
  const [faseSorteio, setFaseSorteio] = useState('ocioso'); // ocioso, contagem, rolando, resultado
  const [numeroAnimado, setNumeroAnimado] = useState('000');
  const [ganhadores, setGanhadores] = useState(null);
  const [sorteioInfo, setSorteioInfo] = useState(null);

  // ─── 1. AUDITORIA E PERFORMANCE (useMemo) ───────────────────────────────────
  const auditoria = useMemo(() => {
    let pagos = 0;
    let pendentes = 0;
    let cancelados = 0;
    const pool = [];
    const compradores = new Set();

    pedidos.forEach(p => {
      const qtd = p.nums ? p.nums.length : 0;
      if (p.status === 'pago') {
        pagos += qtd;
        compradores.add(p.tel);
        (p.nums || []).forEach(num => pool.push({ numero: num, pedido: p }));
      } else if (p.status === 'pendente') {
        pendentes += qtd;
      } else if (p.status === 'cancelado') {
        cancelados += qtd;
      }
    });

    return {
      totalPedidos: pedidos.length,
      totalCompradores: compradores.size,
      pagos,
      pendentes,
      cancelados,
      participantesValidos: pool.length,
      pool
    };
  }, [pedidos]);

  // ─── 2. SINCRONIZAÇÃO DE STATUS GLOBAL (Firestore) ──────────────────────────
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const docRef = doc(db, 'configuracoes', 'sistema');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().rifaStatus) {
          setRifaStatus(docSnap.data().rifaStatus);
        } else {
          // Cria o documento base se não existir
          await setDoc(docRef, { rifaStatus: 'aberta' }, { merge: true });
        }
      } catch (error) {
        console.error("Erro ao buscar status:", error);
      } finally {
        setLoadingStatus(false);
      }
    };
    fetchStatus();
  }, []);

  const alterarStatusRifa = async (novoStatus) => {
    if (!window.confirm(`Confirma a alteração do status da rifa para: ${novoStatus.toUpperCase()}?`)) return;
    
    setLoadingStatus(true);
    try {
      const docRef = doc(db, 'configuracoes', 'sistema');
      await updateDoc(docRef, { rifaStatus: novoStatus });
      setRifaStatus(novoStatus);
    } catch (error) {
      alert("Erro ao alterar status. Verifique as permissões do banco de dados.");
    } finally {
      setLoadingStatus(false);
    }
  };

  // ─── 3. LÓGICA CRIPTOGRÁFICA DE SORTEIO ──────────────────────────────────────
  const embaralharSeguro = (array) => {
    const misturados = [...array];
    for (let i = misturados.length - 1; i > 0; i--) {
      const randomBuffer = new Uint32Array(1);
      window.crypto.getRandomValues(randomBuffer);
      const j = randomBuffer[0] % (i + 1);
      [misturados[i], misturados[j]] = [misturados[j], misturados[i]];
    }
    return misturados;
  };

  const iniciarSorteio = useCallback(async () => {
    setModalOpen(false);
    setFaseSorteio('contagem');
    
    // Contagem Regressiva
    let contagem = 3;
    setNumeroAnimado(contagem.toString());
    
    const intervalContagem = setInterval(() => {
      contagem--;
      if (contagem > 0) {
        setNumeroAnimado(contagem.toString());
      } else {
        clearInterval(intervalContagem);
        setNumeroAnimado('SORTEANDO...');
        executarAnimacaoPrincipal();
      }
    }, 1000);
  }, [auditoria.pool]);

  const executarAnimacaoPrincipal = () => {
    setFaseSorteio('rolando');
    const { pool } = auditoria;
    
    let tempoDecorrido = 0;
    const duracaoSorteio = 8000; // 8 segundos
    
    const intervalSorteio = setInterval(() => {
      tempoDecorrido += 60;
      // Seleciona um número aleatório (apenas visual)
      const visualNum = pool[Math.floor(Math.random() * pool.length)].numero;
      setNumeroAnimado(visualNum);

      if (tempoDecorrido >= duracaoSorteio) {
        clearInterval(intervalSorteio);
        finalizarSorteioOficial();
      }
    }, 60);
  };

  const finalizarSorteioOficial = async () => {
    const poolSeguro = embaralharSeguro(auditoria.pool);
    const primeiro = poolSeguro[0];
    const segundo = poolSeguro.find(i => i.numero !== primeiro.numero);

    const resultados = { primeiro, segundo };
    setGanhadores(resultados);
    setFaseSorteio('resultado');
    
    // Efeito Visual
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, zIndex: 9999 });

    // Salvar no Banco
    try {
      const payload = {
        data: new Date().toISOString(),
        timestamp: serverTimestamp(),
        primeiroLugar: primeiro,
        segundoLugar: segundo,
        participantes: auditoria.totalCompradores,
        totalPagos: auditoria.pagos,
        administrador: "Admin" // Pode ser substituído pelo Auth do Firebase atual
      };
      
      const docRef = await addDoc(collection(db, 'sorteios'), payload);
      setSorteioInfo({ id: docRef.id, ...payload });

      // Trava sistema permanentemente
      await updateDoc(doc(db, 'configuracoes', 'sistema'), { rifaStatus: 'finalizada' });
      setRifaStatus('finalizada');
      
    } catch (error) {
      console.error("Erro ao salvar ata oficial no Firebase:", error);
    }
  };

  // ─── 4. GERAÇÃO DE ATA (SHA-256) ─────────────────────────────────────────────
  const gerarHash = async (texto) => {
    const msgUint8 = new TextEncoder().encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const baixarAta = async () => {
    if (!ganhadores) return;

    const conteudo = `
===================================================
ATA OFICIAL DE SORTEIO - SISTEMA DE ALTA INTEGRIDADE
===================================================
Data/Hora da Emissão: ${new Date().toLocaleString('pt-BR')}

[MÉTRICAS DO EVENTO]
Participantes Válidos: ${auditoria.participantesValidos}
Total de Cotas Pagas: ${auditoria.pagos}

[PRIMEIRO LUGAR - CESTA OURO]
Número: ${ganhadores.primeiro.numero}
Nome: ${ganhadores.primeiro.pedido.nome}
Telefone: ${ganhadores.primeiro.pedido.tel}
Vendedor: ${ganhadores.primeiro.pedido.vendedor || 'Direto'}

[SEGUNDO LUGAR - CESTA PRATA]
Número: ${ganhadores.segundo.numero}
Nome: ${ganhadores.segundo.pedido.nome}
Telefone: ${ganhadores.segundo.pedido.tel}
Vendedor: ${ganhadores.segundo.pedido.vendedor || 'Direto'}
===================================================
Algoritmo de Sorteio: Fisher-Yates (Crypto.getRandomValues)
`;

    const hash = await gerarHash(conteudo);
    const conteudoFinal = conteudo + `\nHASH DE INTEGRIDADE (SHA-256):\n${hash}\n===================================================`;

    const blob = new Blob([conteudoFinal], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ata_Sorteio_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── 5. UX E MENSAGENS ───────────────────────────────────────────────────────
  const parabenizarVencedor = (ganhador, lugar) => {
    const tel = ganhador.pedido.tel.replace(/\D/g, '');
    const nome = ganhador.pedido.nome.split(' ')[0];
    const premio = lugar === 1 ? 'Cesta Ouro (1º lugar)' : 'Cesta Prata (2º lugar)';
    
    const msgs = `Olá *${nome}*!\n\nAqui é o Comando do Sistema de Rifas.\n\nTenho uma EXCELENTE notícia:\nO número *${ganhador.numero}* foi sorteado e você GANHOU a *${premio}*!\n\nPor favor, confirme seus dados para entrega do prêmio.\n\nParabéns!`;
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msgs)}`, '_blank');
  };

  if (loadingStatus) {
    return <div className="flex justify-center p-12"><SpinnerGap size={48} className="animate-spin text-purple-600" /></div>;
  }

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* 1. TRAVA DE VENDAS E STATUS GLOBAL */}
      <div className={`p-6 rounded-xl border flex items-center justify-between shadow-sm ${
        rifaStatus === 'aberta' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' :
        rifaStatus === 'encerrada' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800' :
        'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800'
      }`}>
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            {rifaStatus === 'aberta' && <><CheckCircle className="text-green-600" /> Vendas Abertas</>}
            {rifaStatus === 'encerrada' && <><LockKey className="text-yellow-600" /> Vendas Encerradas</>}
            {rifaStatus === 'finalizada' && <><Trophy className="text-purple-600" /> Sorteio Realizado</>}
          </h3>
          <p className="text-sm mt-1 opacity-80">
            {rifaStatus === 'aberta' && "O sistema está recebendo novos pedidos normalmente."}
            {rifaStatus === 'encerrada' && "Sistema bloqueado para novas compras. Conferindo pagamentos."}
            {rifaStatus === 'finalizada' && "O evento foi concluído e os dados estão selados no banco."}
          </p>
        </div>
        
        {rifaStatus === 'aberta' && (
          <button 
            onClick={() => alterarStatusRifa('encerrada')}
            className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-lg font-bold shadow transition flex items-center gap-2"
          >
            <LockKey weight="bold" /> Encerrar Oficialmente
          </button>
        )}
      </div>

      {/* 2. PAINEL DE AUDITORIA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center">
          <p className="text-sm text-zinc-500 uppercase font-bold">Total Pedidos</p>
          <p className="text-3xl font-black mt-2 text-zinc-800 dark:text-zinc-100">{auditoria.totalPedidos}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center">
          <p className="text-sm text-zinc-500 uppercase font-bold">Cotas Pagas</p>
          <p className="text-3xl font-black mt-2 text-green-600 dark:text-green-500">{auditoria.pagos}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center relative overflow-hidden">
          <p className="text-sm text-zinc-500 uppercase font-bold relative z-10">Pendentes</p>
          <p className={`text-3xl font-black mt-2 relative z-10 ${auditoria.pendentes > 0 ? 'text-red-600' : 'text-zinc-800 dark:text-zinc-100'}`}>
            {auditoria.pendentes}
          </p>
          {auditoria.pendentes > 0 && <div className="absolute inset-0 bg-red-100 dark:bg-red-900/20 opacity-50"></div>}
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center">
          <p className="text-sm text-zinc-500 uppercase font-bold">Cancelados</p>
          <p className="text-3xl font-black mt-2 text-zinc-400">{auditoria.cancelados}</p>
        </div>
      </div>

      {/* 3. BLOQUEIO E BOTÃO DE SORTEIO */}
      {rifaStatus === 'finalizada' ? (
        <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 p-6 rounded-xl text-center font-bold text-lg border border-purple-200 dark:border-purple-800">
          Sorteio Oficial já realizado para esta edição.
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center max-w-3xl mx-auto mt-8">
          <Gift size={56} weight="fill" className="text-purple-500 mx-auto mb-4" />
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white mb-2">Painel de Sorteio Oficial</h2>
          
          {auditoria.pendentes > 0 ? (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-start gap-3 text-left mb-6 border border-red-200 dark:border-red-800/50">
              <WarningCircle size={24} weight="fill" className="mt-0.5 shrink-0" />
              <div>
                <strong className="block mb-1">Atenção! Protocolo Bloqueado.</strong>
                Existem <b>{auditoria.pendentes}</b> pagamentos pendentes. Confirme os pagamentos ou cancele os pedidos pendentes para liberar o sorteio.
              </div>
            </div>
          ) : rifaStatus === 'aberta' ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 p-4 rounded-lg flex items-center gap-3 text-left mb-6 border border-yellow-200 dark:border-yellow-800/50">
              <WarningCircle size={24} weight="fill" className="shrink-0" />
              <span>Você precisa <b>Encerrar as Vendas</b> no painel superior antes de realizar o sorteio.</span>
            </div>
          ) : auditoria.pagos < 2 ? (
            <div className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 p-4 rounded-lg flex items-center gap-3 text-left mb-6 border border-orange-200 dark:border-orange-800/50">
              <WarningCircle size={24} weight="fill" className="shrink-0" />
              <span>Necessário mínimo de 2 cotas pagas para realizar o evento.</span>
            </div>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400 mb-8">
              Sistema validado e pronto. Algoritmo Criptográfico Seguro preparado.
            </p>
          )}

          <button 
            onClick={() => setModalOpen(true)} 
            disabled={auditoria.pendentes > 0 || rifaStatus !== 'encerrada' || auditoria.pagos < 2}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-black py-4 px-8 rounded-xl shadow-lg text-xl transition-all flex justify-center items-center gap-3 mx-auto w-full md:w-auto"
          >
            <Ticket size={28} weight="fill" /> Iniciar Sorteio
          </button>
        </div>
      )}

      {/* 4. MODAL DE CONFIRMAÇÃO */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-slide-up">
            <div className="bg-red-600 p-6 text-center">
              <WarningCircle size={48} className="text-white mx-auto mb-2" weight="fill" />
              <h3 className="text-white text-2xl font-black">CONFIRMAÇÃO FINAL</h3>
            </div>
            <div className="p-6">
              <ul className="space-y-3 mb-6">
                <li className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <span className="text-zinc-500 font-medium">Cotas Pagas Válidas:</span>
                  <span className="font-black text-lg">{auditoria.pagos}</span>
                </li>
                <li className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <span className="text-zinc-500 font-medium">Cotas Pendentes:</span>
                  <span className="font-black text-lg text-green-600">0 (Limpo)</span>
                </li>
                <li className="flex justify-between pb-2">
                  <span className="text-zinc-500 font-medium">Participantes:</span>
                  <span className="font-black text-lg">{auditoria.totalCompradores}</span>
                </li>
              </ul>
              
              <div className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg text-sm text-center text-zinc-600 dark:text-zinc-300 mb-6">
                <strong>Atenção:</strong> Esta ação não poderá ser desfeita. O algoritmo registrará o resultado na blockchain interna (Firestore).
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-3 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white font-bold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button 
                  onClick={iniciarSorteio}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition"
                >
                  AUTORIZAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. EXPERIÊNCIA VISUAL FULL-SCREEN (EVENTO DE SORTEIO) */}
      {(faseSorteio === 'contagem' || faseSorteio === 'rolando') && (
        <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center">
          <div className="text-center animate-pulse-fast">
            <h1 className="text-zinc-500 text-2xl font-black uppercase tracking-[0.3em] mb-8">
              {faseSorteio === 'contagem' ? 'Preparando Algoritmo' : 'Selecionando Ganhadores'}
            </h1>
            <div className="text-[12rem] md:text-[18rem] font-black text-white leading-none tabular-nums drop-shadow-[0_0_30px_rgba(168,85,247,0.5)]">
              {numeroAnimado}
            </div>
          </div>
        </div>
      )}

      {/* 7. RESULTADOS E ATA */}
      {ganhadores && faseSorteio === 'resultado' && (
        <div className="mt-12 mb-8 animate-slide-up border-t border-zinc-200 dark:border-zinc-800 pt-12">
          
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <h2 className="text-3xl font-black text-zinc-900 dark:text-white flex items-center gap-3">
              <Trophy size={32} className="text-yellow-500" weight="fill" />
              RESULTADO OFICIAL
            </h2>
            <button 
              onClick={baixarAta}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 px-6 rounded-lg transition flex items-center gap-2 shadow-lg"
            >
              <FileText size={20} /> Baixar Ata Oficial
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            {/* 1º LUGAR */}
            <div className="bg-gradient-to-br from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-900/10 border-2 border-yellow-400 dark:border-yellow-600 rounded-2xl p-8 relative overflow-hidden shadow-xl hover:scale-[1.02] transition-transform">
              <div className="absolute top-0 right-0 bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-white font-black text-sm px-6 py-2 rounded-bl-xl shadow-md">
                1º LUGAR OFICIAL
              </div>
              <h3 className="text-2xl font-black text-yellow-600 dark:text-yellow-500 mb-6 mt-4 flex items-center gap-2">
                <Trophy weight="fill" size={28} /> Cesta Ouro
              </h3>
              <p className="text-7xl font-black text-zinc-900 dark:text-white mb-6 tracking-tighter">{ganhadores.primeiro.numero}</p>
              
              <div className="space-y-2 mb-8 bg-white/50 dark:bg-black/20 p-4 rounded-xl border border-yellow-200/50 dark:border-yellow-800/50">
                <p className="text-zinc-900 dark:text-white font-black text-2xl uppercase">{ganhadores.primeiro.pedido.nome}</p>
                <p className="text-md text-zinc-700 dark:text-zinc-300"><strong>Contato:</strong> {ganhadores.primeiro.pedido.tel}</p>
                <p className="text-md text-zinc-700 dark:text-zinc-300"><strong>Origem:</strong> {ganhadores.primeiro.pedido.vendedor || 'Direto/Sistema'}</p>
              </div>

              <button
                onClick={() => parabenizarVencedor(ganhadores.primeiro, 1)}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white font-black py-4 rounded-xl transition-colors text-lg shadow-lg"
              >
                <WhatsappLogo size={24} weight="fill" /> Notificar Comandante Vencedor
              </button>
            </div>

            {/* 2º LUGAR */}
            <div className="bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800/50 dark:to-zinc-900/50 border-2 border-zinc-300 dark:border-zinc-600 rounded-2xl p-8 relative overflow-hidden shadow-xl hover:scale-[1.02] transition-transform mt-4 md:mt-0">
              <div className="absolute top-0 right-0 bg-zinc-300 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 font-black text-sm px-6 py-2 rounded-bl-xl shadow-md">
                2º LUGAR OFICIAL
              </div>
              <h3 className="text-2xl font-black text-zinc-600 dark:text-zinc-400 mb-6 mt-4 flex items-center gap-2">
                <Gift weight="fill" size={28} /> Cesta Prata
              </h3>
              <p className="text-7xl font-black text-zinc-900 dark:text-white mb-6 tracking-tighter">{ganhadores.segundo.numero}</p>
              
              <div className="space-y-2 mb-8 bg-white/50 dark:bg-black/20 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-700/50">
                <p className="text-zinc-900 dark:text-white font-black text-2xl uppercase">{ganhadores.segundo.pedido.nome}</p>
                <p className="text-md text-zinc-700 dark:text-zinc-300"><strong>Contato:</strong> {ganhadores.segundo.pedido.tel}</p>
                <p className="text-md text-zinc-700 dark:text-zinc-300"><strong>Origem:</strong> {ganhadores.segundo.pedido.vendedor || 'Direto/Sistema'}</p>
              </div>

              <button
                onClick={() => parabenizarVencedor(ganhadores.segundo, 2)}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white font-black py-4 rounded-xl transition-colors text-lg shadow-lg"
              >
                <WhatsappLogo size={24} weight="fill" /> Notificar Recruta Vencedor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}