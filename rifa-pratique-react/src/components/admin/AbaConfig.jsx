import { Broom, Warning } from '@phosphor-icons/react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function AbaConfig({ pedidos, setAbaAtiva }) {
  
  const zerarBancoDeDados = async () => {
    if (!window.confirm('🚨 ATENÇÃO EXTREMA: Isso apaga TODOS os pedidos e libera a grelha. Tem certeza absoluta?')) return;
    if (window.prompt('Digite ZERAR para confirmar:') !== 'ZERAR') {
      alert('Operação cancelada.'); return;
    }
    
    try {
      // 1. Gera o Backup
      const backupData = JSON.stringify(pedidos, null, 2);
      const blob = new Blob([backupData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_rifa_pratique_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      // Dá um tempo para o download iniciar
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 2. Apaga do Firebase
      const batch = writeBatch(db);
      pedidos.forEach((p) => { batch.delete(doc(db, 'pedidos', p.id)); });
      await batch.commit();
      
      alert('✅ Backup iniciado e Banco zerado com segurança!');
      setAbaAtiva('pedidos'); // Volta para a tela inicial
    } catch (error) {
      console.error("Erro na limpeza:", error);
      alert('Erro ao limpar banco de dados. Operação abortada.');
    }
  };

  return (
    <div className="animate-fade-in bg-red-50 dark:bg-red-950/20 p-6 rounded-xl border border-red-200 dark:border-red-900/50">
      <h3 className="font-bold text-lg mb-2 text-red-600 flex items-center gap-2">
        <Warning size={24} weight="fill" /> Zona de Perigo
      </h3>
      <p className="text-zinc-700 dark:text-zinc-300 text-sm mb-6 max-w-2xl">
        Apaga <strong>TODOS os pedidos</strong> e libera todas as cotas para uma nova rifa.
        Um <strong>backup em JSON será baixado automaticamente</strong> no seu computador antes de deletar.
        Os vendedores não serão apagados.
      </p>
      <button onClick={zerarBancoDeDados} className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition-colors">
        <Broom size={20} /> Limpar Banco de Dados
      </button>
    </div>
  );
}