import React, { useState } from 'react';
import { Info, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Conteúdo de ajuda para cada secção
const helpContent = {
  ot_geral: {
    title: '📋 Como funcionam as OTs',
    content: `
      <div class="space-y-4">
        <p><strong>FS (Folha de Serviço)</strong> é o documento principal que regista toda a informação de uma assistência técnica.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Processo típico:</h4>
          <ol class="list-decimal list-inside space-y-1 text-sm">
            <li>Criar nova FS com dados do cliente e equipamento</li>
            <li>Adicionar técnicos responsáveis</li>
            <li>Registar intervenções realizadas</li>
            <li>Adicionar fotografias (antes/depois)</li>
            <li>Registar materiais utilizados</li>
            <li>Obter assinatura do cliente</li>
            <li>Gerar PDF e Folha de Horas</li>
          </ol>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Dica:</h4>
          <p class="text-sm">O estado da FS (Pendente, Em Curso, Concluída, Faturada) ajuda a organizar o trabalho e acompanhar o progresso.</p>
        </div>
      </div>
    `
  },
  
  tecnicos: {
    title: '👥 Técnicos',
    content: `
      <div class="space-y-4">
        <p>Esta secção regista os técnicos que trabalharam nesta FS.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Como adicionar:</h4>
          <ol class="list-decimal list-inside space-y-1 text-sm">
            <li>Clique em "Adicionar Técnico"</li>
            <li>Selecione o técnico da lista</li>
            <li>O técnico ficará associado à FS</li>
          </ol>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Para que serve:</h4>
          <p class="text-sm">Os técnicos adicionados aparecem no PDF da FS e podem ser selecionados na Folha de Horas para cálculo de custos.</p>
        </div>
      </div>
    `
  },
  
  intervencoes: {
    title: '🔧 Intervenções',
    content: `
      <div class="space-y-4">
        <p>Registe aqui todas as intervenções/trabalhos realizados na assistência.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Como preencher:</h4>
          <ol class="list-decimal list-inside space-y-1 text-sm">
            <li>Clique em "Adicionar Intervenção"</li>
            <li>Descreva o trabalho realizado</li>
            <li>Seja específico e detalhado</li>
          </ol>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Exemplo:</h4>
          <p class="text-sm italic">"Substituição do rolamento principal. Lubrificação geral do sistema. Teste de funcionamento OK."</p>
        </div>
      </div>
    `
  },
  
  fotografias: {
    title: '📷 Fotografias',
    content: `
      <div class="space-y-4">
        <p>Adicione fotografias para documentar o estado do equipamento ou trabalho realizado.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Tipos de fotos recomendadas:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Antes:</strong> Estado inicial do equipamento</li>
            <li><strong>Durante:</strong> Processo de reparação</li>
            <li><strong>Depois:</strong> Resultado final</li>
            <li><strong>Detalhes:</strong> Peças danificadas, números de série</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Dica:</h4>
          <p class="text-sm">Adicione uma descrição a cada foto para facilitar a identificação no PDF.</p>
        </div>
      </div>
    `
  },
  
  equipamentos: {
    title: '⚙️ Equipamentos',
    content: `
      <div class="space-y-4">
        <p>Registe os equipamentos intervencionados nesta FS.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Informação a incluir:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Tipologia:</strong> Tipo de equipamento (ex: Empilhador, Compressor)</li>
            <li><strong>Marca:</strong> Fabricante</li>
            <li><strong>Modelo:</strong> Referência do modelo</li>
            <li><strong>Nº Série:</strong> Número de série único</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Importante:</h4>
          <p class="text-sm">Esta informação aparece no cabeçalho do PDF da FS.</p>
        </div>
      </div>
    `
  },
  
  materiais: {
    title: '📦 Materiais',
    content: `
      <div class="space-y-4">
        <p>Registe os materiais e peças utilizados na intervenção.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Campos:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Descrição:</strong> Nome/referência do material</li>
            <li><strong>Quantidade:</strong> Unidades utilizadas</li>
            <li><strong>Fornecido por:</strong> Cliente, HWI ou Cotação</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Cotação (PC):</h4>
          <p class="text-sm">Se selecionar "Cotação", será criado um Pedido de Cotação automático para aprovação.</p>
        </div>
      </div>
    `
  },
  
  despesas: {
    title: '💰 Despesas',
    content: `
      <div class="space-y-4">
        <p>Registe despesas associadas a esta FS (combustível, portagens, refeições, etc.).</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Tipos de despesa:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Outras:</strong> Despesas gerais → coluna "Despesas"</li>
            <li><strong>Combustível:</strong> Gasóleo/Gasolina → coluna "Despesas"</li>
            <li><strong>Ferramentas:</strong> Material de trabalho → coluna "Despesas"</li>
            <li><strong>Portagens:</strong> Via Verde/Portagens → coluna "Portagens"</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Integração:</h4>
          <p class="text-sm">Os valores são automaticamente preenchidos na Folha de Horas, separando Portagens das outras Despesas.</p>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Factura:</h4>
          <p class="text-sm">Pode anexar a factura/recibo em PDF ou imagem para comprovativo.</p>
        </div>
      </div>
    `
  },
  
  pedidos_cotacao: {
    title: '📋 Pedidos de Cotação (PC)',
    content: `
      <div class="space-y-4">
        <p>Os Pedidos de Cotação são criados quando é necessário aprovar materiais ou serviços antes da execução.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Estados do PC:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Pendente:</strong> Aguarda aprovação</li>
            <li><strong>Aprovado:</strong> Pode prosseguir com o trabalho</li>
            <li><strong>Rejeitado:</strong> Não aprovado pelo cliente</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Como funciona:</h4>
          <p class="text-sm">Ao adicionar material com "Fornecido por: Cotação", é criado automaticamente um PC que deve ser aprovado antes de faturar.</p>
        </div>
      </div>
    `
  },
  
  assinaturas: {
    title: '✍️ Assinaturas',
    content: `
      <div class="space-y-4">
        <p>Obtenha a assinatura do cliente para validar o trabalho realizado.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Como obter assinatura:</h4>
          <ol class="list-decimal list-inside space-y-1 text-sm">
            <li>Clique em "Nova Assinatura"</li>
            <li>Preencha o nome do signatário</li>
            <li>O cliente assina no ecrã táctil</li>
            <li>Clique em "Guardar Assinatura"</li>
          </ol>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Importante:</h4>
          <p class="text-sm">A assinatura aparece no PDF da FS como comprovativo de aceitação do trabalho.</p>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Botão Refresh:</h4>
          <p class="text-sm">Se a assinatura não aparecer no PDF, use o botão 🔄 para sincronizar.</p>
        </div>
      </div>
    `
  },
  
  cronometros: {
    title: '⏱️ Cronómetros',
    content: `
      <div class="space-y-4">
        <p>Registe o tempo de trabalho de cada técnico nesta FS.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Tipos de registo:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Cronómetro:</strong> Iniciar/Parar tempo em tempo real</li>
            <li><strong>Manual:</strong> Inserir horas manualmente</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Integração:</h4>
          <p class="text-sm">Os tempos registados são usados para calcular a Folha de Horas e custos de mão-de-obra.</p>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Códigos horários:</h4>
          <p class="text-sm">1=Dias úteis (07h-19h), 2=Noturno, S=Sábado, D=Domingo/Feriado</p>
        </div>
      </div>
    `
  },
  
  folha_horas: {
    title: '📊 Folha de Horas',
    content: `
      <div class="space-y-4">
        <p>Gere o documento com o resumo de horas, tarifas e custos da FS.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Passos:</h4>
          <ol class="list-decimal list-inside space-y-1 text-sm">
            <li>Clique em "Gerar Folha de Horas"</li>
            <li>Selecione os técnicos a incluir</li>
            <li>Defina tarifas por técnico (opcional)</li>
            <li>Preencha dietas, portagens e despesas</li>
            <li>Clique em "Gerar PDF"</li>
          </ol>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Auto-preenchimento:</h4>
          <p class="text-sm">Portagens e Despesas são automaticamente preenchidas com os valores registados no card "Despesas".</p>
        </div>
      </div>
    `
  },

  // ============ CALENDÁRIO ============
  calendario_geral: {
    title: '📅 Como funciona o Calendário',
    content: `
      <div class="space-y-4">
        <p>O <strong>Calendário</strong> permite gerir serviços agendados e visualizar disponibilidade da equipa.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Funcionalidades:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Vista Mensal:</strong> Veja todos os serviços e férias do mês</li>
            <li><strong>Vista Lista:</strong> Visualize serviços em formato de lista</li>
            <li><strong>Criar Serviço:</strong> Agende novos serviços (apenas admins)</li>
            <li><strong>Detalhe do Dia:</strong> Clique num dia para ver detalhes</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">🎨 Legenda de Cores:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><span class="text-sky-400">■</span> <strong>Azul:</strong> Serviços agendados</li>
            <li><span class="text-purple-400">■</span> <strong>Roxo:</strong> Férias de colaboradores</li>
            <li><span class="text-amber-400">■</span> <strong>Âmbar:</strong> Feriados nacionais</li>
            <li><span class="text-emerald-400">●</span> <strong>Verde:</strong> Dia atual</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">💡 Dica:</h4>
          <p class="text-sm">Os técnicos recebem notificações push quando são atribuídos a um novo serviço.</p>
        </div>
      </div>
    `
  },

  calendario_servicos: {
    title: '🔧 Serviços Agendados',
    content: `
      <div class="space-y-4">
        <p>Os serviços representam trabalhos agendados com clientes.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Criar Serviço:</h4>
          <ol class="list-decimal list-inside space-y-1 text-sm">
            <li>Clique em "Novo Serviço"</li>
            <li>Preencha cliente, localização e motivo</li>
            <li>Selecione data e técnicos responsáveis</li>
            <li>Adicione observações se necessário</li>
          </ol>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">📊 Estados:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Agendado:</strong> Serviço marcado, aguarda execução</li>
            <li><strong>Em Progresso:</strong> Técnicos a trabalhar</li>
            <li><strong>Concluído:</strong> Trabalho finalizado</li>
            <li><strong>Cancelado:</strong> Serviço anulado</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Notificações:</h4>
          <p class="text-sm">Ao criar/editar um serviço, os técnicos selecionados recebem notificação automática.</p>
        </div>
      </div>
    `
  },

  // ============ ADMIN DASHBOARD ============
  admin_ferias: {
    title: '🏖️ Gestão de Férias',
    content: `
      <div class="space-y-4">
        <p>Nesta secção gere os pedidos de férias dos colaboradores.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Tipos de Pedidos:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Pedidos Pendentes:</strong> Aguardam aprovação</li>
            <li><strong>Trabalho em Férias:</strong> Colaborador iniciou ponto durante férias</li>
          </ul>
        </div>

        <div class="bg-orange-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-orange-400 mb-2">⚠️ Trabalho em Férias:</h4>
          <p class="text-sm">Se autorizar trabalho em dia de férias:</p>
          <ul class="list-disc list-inside space-y-1 text-sm mt-2">
            <li><strong>Autorizar:</strong> Devolve 1 dia ao saldo de férias</li>
            <li><strong>Rejeitar:</strong> Elimina a entrada de ponto</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Saldo de Férias:</h4>
          <p class="text-sm">Cada colaborador tem direito a 22 dias úteis por ano. O saldo é automaticamente calculado.</p>
        </div>
      </div>
    `
  },

  admin_faltas: {
    title: '📋 Gestão de Faltas',
    content: `
      <div class="space-y-4">
        <p>Visualize e aprove faltas justificadas e injustificadas.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Tipos de Faltas:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Justificadas:</strong> Com motivo e/ou documento comprovativo</li>
            <li><strong>Injustificadas:</strong> Sem justificação apresentada</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">📎 Documentos:</h4>
          <p class="text-sm">Os colaboradores podem anexar documentos (atestados, etc.) que podem ser visualizados clicando em "Ver Justificação".</p>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Aprovar/Rejeitar:</h4>
          <p class="text-sm">A decisão fica registada com o nome do admin que a tomou.</p>
        </div>
      </div>
    `
  },

  admin_utilizadores: {
    title: '👥 Gestão de Utilizadores',
    content: `
      <div class="space-y-4">
        <p>Crie, edite e gerencie os colaboradores do sistema.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Ações Disponíveis:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Criar Utilizador:</strong> Novo colaborador no sistema</li>
            <li><strong>Editar:</strong> Alterar dados, password ou privilégios</li>
            <li><strong>Eliminar:</strong> Remove utilizador (irreversível)</li>
            <li><strong>Verificar Horas:</strong> Recalcula horas de um período</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">⏱️ Entrada Manual:</h4>
          <p class="text-sm">Use "Adicionar Entrada" para registar manualmente horas de trabalho (útil para correções ou trabalho offline).</p>
        </div>

        <div class="bg-purple-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-purple-400 mb-2">🔒 Privilégios Admin:</h4>
          <p class="text-sm">Utilizadores com privilégios admin têm acesso a este painel e podem gerir outros utilizadores.</p>
        </div>
      </div>
    `
  },

  admin_notificacoes: {
    title: '🔔 Sistema de Notificações',
    content: `
      <div class="space-y-4">
        <p>Gerencie notificações automáticas e pedidos de autorização de horas extra.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Verificações Automáticas:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>09:30:</strong> Notifica quem não iniciou ponto</li>
            <li><strong>18:15:</strong> Notifica quem não parou ponto (solicita autorização)</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">⏰ Horas Extra:</h4>
          <p class="text-sm">Quando um colaborador trabalha após as 18:00, o sistema envia pedido de autorização aos admins:</p>
          <ul class="list-disc list-inside space-y-1 text-sm mt-2">
            <li><strong>Autorizar:</strong> As horas extra são registadas</li>
            <li><strong>Rejeitar:</strong> Ponto fechado às 18:00</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">🧪 Testes:</h4>
          <p class="text-sm">Use os botões de teste para verificar se as notificações push estão a funcionar no seu dispositivo.</p>
        </div>
      </div>
    `
  },

  admin_tarifas: {
    title: '💰 Tarifário',
    content: `
      <div class="space-y-4">
        <p>Configure as tarifas horárias para cálculo nas Folhas de Horas.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Códigos Horários:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>1:</strong> Dias úteis (07:00-19:00)</li>
            <li><strong>2:</strong> Noturno (19:00-07:00)</li>
            <li><strong>S:</strong> Sábados</li>
            <li><strong>D:</strong> Domingos e Feriados</li>
            <li><strong>Todos:</strong> Aplica-se a qualquer código</li>
            <li><strong>Manual:</strong> Apenas seleção manual na folha de horas</li>
          </ul>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">💡 Apenas Selecionar (Manual):</h4>
          <p class="text-sm">Tarifas com código "Manual" não são automaticamente aplicadas. O utilizador deve selecioná-las manualmente ao gerar a folha de horas.</p>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">✅ Auto-Aplicação:</h4>
          <p class="text-sm">Ao gerar folha de horas, as tarifas são automaticamente sugeridas com base no código horário do trabalho realizado.</p>
        </div>
      </div>
    `
  },

  admin_relatorios: {
    title: '📊 Relatórios Consolidados',
    content: `
      <div class="space-y-4">
        <p>Visualize estatísticas e resumos de horas de todos os colaboradores.</p>
        
        <div class="bg-blue-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">📌 Período de Faturação:</h4>
          <p class="text-sm">O período vai do dia <strong>26 do mês anterior</strong> até ao dia <strong>25 do mês selecionado</strong>.</p>
          <p class="text-sm mt-2">Exemplo: Janeiro 2025 = 26/Dez/2024 a 25/Jan/2025</p>
        </div>

        <div class="bg-amber-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-amber-400 mb-2">📈 Dados Incluídos:</h4>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li><strong>Total de Horas:</strong> Soma de todas as horas do período</li>
            <li><strong>Horas Normais:</strong> Trabalho em horário regular</li>
            <li><strong>Horas Extras:</strong> Trabalho fora do horário (autorizadas)</li>
            <li><strong>Dias Trabalhados:</strong> Número de dias com registo</li>
          </ul>
        </div>

        <div class="bg-green-900/30 p-3 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-2">📥 Exportar:</h4>
          <p class="text-sm">Pode exportar os dados para Excel/CSV para análise externa ou processamento de salários.</p>
        </div>
      </div>
    `
  }
};

const HelpTooltip = ({ section, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const help = helpContent[section];
  
  if (!help) return null;
  
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 transition-colors ${className}`}
        title="Ajuda"
      >
        <Info className="w-3 h-3" />
      </button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">
              {help.title}
            </DialogTitle>
          </DialogHeader>
          <div 
            className="text-gray-300 text-sm mt-2"
            dangerouslySetInnerHTML={{ __html: help.content }}
          />
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
            >
              Entendi
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HelpTooltip;
