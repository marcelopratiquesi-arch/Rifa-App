import { useState } from 'react';
import { Gift, Ticket, SpinnerGap, Trophy, WhatsappLogo } from '@phosphor-icons/react';

export default function AbaSorteio({ pedidos }) {
  const [sorteando, setSorteando] = useState(false);
  const [ganhadores, setGanhadores] = useState(null);

  // ─── LÓGICA DO SORTEIO ──────────────────────────────────────────
  const executarSorteio = () => {
    const pool = [];
    
    // Filtra apenas os pedidos pagos e coloca cada número individualmente na "roda"
    pedidos
      .filter((p) => p.status === 'pago')
      .forEach((p) => {
        (p.nums || []).forEach((num) => pool.push({ numero: num, pedido: p }));
      });

    if (pool.length < 2) {
      alert('Precisa de ter pelo menos 2 cotas PAGAS para sortear o 1º e o 2º lugar.');
      return;
    }

    setGanhadores(null);
    setSorteando(true);

    // Simulador de tempo para gerar suspense (2 segundos)
    setTimeout(() => {
      const misturados = [...pool];
      
      // Algoritmo de Fisher-Yates (Embaralhamento Criptográfico Seguro)
      for (let i = misturados.length - 1; i > 0; i--) {
        const randomBuffer = new Uint32Array(1);
        window.crypto.getRandomValues(randomBuffer);
        const j = randomBuffer[0] % (i + 1);
        [misturados[i], misturados[j]] = [misturados[j], misturados[i]];
      }
      
      const primeiro = misturados[0];
      // Garante que o segundo prémio não vai para o mesmo NÚMERO exato
      const segundo  = misturados.find((i) => i.numero !== primeiro.numero);
      
      setGanhadores({ primeiro, segundo });
      setSorteando(false);
    }, 2000);
  };

  // ─── ACÇÕES PÓS-SORTEIO ───────────────────────────────────────
  const parabenizarVencedor = (ganhador, lugar) => {
    const tel  = ganhador.pedido.tel.replace(/\D/g, '');
    const nome = ganhador.pedido.nome.split(' ')[0];
    const premio = lugar === 1 ? 'Cesta Ouro (1º lugar)' : 'Cesta Prata (2º lugar)';
    
    const msgs =
      "Olá *" + nome + "*!\n\n" +
      "Aqui é o Marcelo da Rifa Pratique.\n\n" +
      "Tenho uma ÓPTIMA notícia para ti:\n" +
      "O número *" + ganhador.numero + "* foi sorteado e GANHASTE a *" + premio + "*!\n\n" +
      "Por favor, confirma o teu endereço completo para combinarmos a entrega do teu prémio.\n\n" +
      "Parabéns!";
      
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msgs)}`, '_blank');
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center max-w-3xl mx-auto">
        <Gift size={56} weight="fill" className="text-purple-500 mx-auto mb-4" />
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white mb-2">Sorteio das Cestas</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-sm">
          Apenas números com PIX <strong>confirmado e aprovado</strong> entram na roda.
        </p>
        
        <button 
          onClick={executarSorteio} 
          disabled={sorteando}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-black py-4 px-8 rounded-xl shadow-lg text-xl transition-all flex justify-center items-center gap-3 mx-auto w-full md:w-auto"
        >
          {sorteando ? (
            <><SpinnerGap size={28} className="animate-spin" /> Misturando...</>
          ) : (
            <><Ticket size={28} weight="fill" /> Realizar Sorteio Agora</>
          )}
        </button>

        {ganhadores && !sorteando && (
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 text-left animate-fade-in">

            {/* 1º LUGAR */}
            <div className="bg-gradient-to-br from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-900/10 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-white font-black text-xs px-3 py-1 rounded-bl-lg">
                1º LUGAR
              </div>
              <h3 className="text-2xl font-black text-yellow-600 dark:text-yellow-500 mb-4 mt-2 flex items-center gap-2">
                <Trophy weight="fill" /> Cesta Ouro
              </h3>
              <p className="text-5xl font-black text-zinc-900 dark:text-white mb-4">{ganhadores.primeiro.numero}</p>
              <p className="text-zinc-900 dark:text-white font-bold text-lg">{ganhadores.primeiro.pedido.nome}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1"><strong>WhatsApp:</strong> {ganhadores.primeiro.pedido.tel}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4"><strong>Vendedor:</strong> {ganhadores.primeiro.pedido.vendedor || 'Venda Direta'}</p>
              <button
                onClick={() => parabenizarVencedor(ganhadores.primeiro, 1)}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold py-2.5 rounded-lg transition-colors text-sm shadow-sm"
              >
                <WhatsappLogo size={18} weight="fill" /> Parabenizar Vencedor
              </button>
            </div>

            {/* 2º LUGAR */}
            <div className="bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800/50 dark:to-zinc-900/50 border-2 border-zinc-300 dark:border-zinc-600 rounded-xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 bg-zinc-300 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 font-black text-xs px-3 py-1 rounded-bl-lg">
                2º LUGAR
              </div>
              <h3 className="text-2xl font-black text-zinc-600 dark:text-zinc-400 mb-4 mt-2 flex items-center gap-2">
                <Gift weight="fill" /> Cesta Prata
              </h3>
              <p className="text-5xl font-black text-zinc-900 dark:text-white mb-4">{ganhadores.segundo.numero}</p>
              <p className="text-zinc-900 dark:text-white font-bold text-lg">{ganhadores.segundo.pedido.nome}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1"><strong>WhatsApp:</strong> {ganhadores.segundo.pedido.tel}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4"><strong>Vendedor:</strong> {ganhadores.segundo.pedido.vendedor || 'Venda Direta'}</p>
              <button
                onClick={() => parabenizarVencedor(ganhadores.segundo, 2)}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold py-2.5 rounded-lg transition-colors text-sm shadow-sm"
              >
                <WhatsappLogo size={18} weight="fill" /> Parabenizar Vencedor
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}