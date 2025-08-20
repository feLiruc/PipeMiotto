#!/bin/bash

# Script de gerenciamento completo do sistema webhook com Kafka

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

show_help() {
    echo "📖 Sistema de Webhook com Kafka - Gerenciamento"
    echo ""
    echo "🚀 CONTROLE DE PROCESSOS:"
    echo "  $0 start     - Inicia todos os processos"
    echo "  $0 stop      - Para todos os processos"
    echo "  $0 restart   - Reinicia todos os processos"
    echo "  $0 status    - Mostra status dos processos"
    echo "  $0 logs      - Mostra logs em tempo real"
    echo "  $0 startup   - Configura inicialização automática"
    echo ""
    echo "📊 MONITORAMENTO:"
    echo "  $0 health    - Verificar saúde do sistema"
    echo "  $0 stats     - Dashboard de estatísticas"
    echo "  $0 monitor   - Monitor em tempo real"
    echo ""
    echo "🔧 MANUTENÇÃO:"
    echo "  $0 reprocess - Reprocessar mensagens fallback"
    echo "  $0 reset     - Resetar consumer group"
    echo "  $0 cleanup   - Limpar arquivos antigos"
    echo ""
    echo "🆘 EMERGÊNCIA:"
    echo "  $0 emergency - Modo emergência (só fallback files)"
    echo "  $0 recover   - Recuperar de emergência"
    echo ""
}

case "$1" in
    start)
        echo "🚀 Iniciando sistema de webhooks com PM2..."
        
        # Verificar se Kafka está rodando
        if ! pgrep -f "kafka.Kafka" > /dev/null; then
            echo "⚠️  Kafka não está rodando. Iniciando..."
            sudo systemctl start zookeeper
            sleep 3
            sudo systemctl start kafka
            sleep 5
        fi
        
        # Iniciar Kafka UI se estiver configurado
        if systemctl is-enabled kafka-ui &>/dev/null; then
            echo "🎨 Iniciando Kafka UI..."
            sudo systemctl start kafka-ui
        elif [ -f ~/kafdrop/docker-compose.yml ]; then
            echo "🎨 Iniciando Kafdrop..."
            cd ~/kafdrop && docker-compose up -d
            cd - > /dev/null
        fi
        
        # Instalar dependências se necessário
        if [ ! -d "node_modules" ]; then
            echo "📦 Instalando dependências..."
            npm install
        fi
        
        # Criar diretório de logs se não existir
        mkdir -p logs
        
        # Iniciar aplicações com PM2
        echo "🌐 Iniciando API e Consumer com PM2..."
        pm2 start ecosystem.config.json
        pm2 save
        
        echo "✅ Sistema iniciado com sucesso!"
        echo "� Use './manage.sh health' para verificar a saúde"
        ;;
        
    stop)
        echo "🛑 Parando sistema de webhooks..."
        pm2 stop all
        echo "✅ Sistema parado com sucesso!"
        ;;
        
    restart)
        echo "🔄 Reiniciando sistema..."
        pm2 restart all
        echo "✅ Sistema reiniciado!"
        ;;
        
    status)
        echo "📊 Status do sistema:"
        
        # Status Kafka
        if pgrep -f "kafka.Kafka" > /dev/null; then
            echo "✅ Kafka: Rodando"
        else
            echo "❌ Kafka: Parado"
        fi
        
        # Status Kafka UI
        if systemctl is-active kafka-ui &>/dev/null; then
            if systemctl is-active nginx &>/dev/null && [ -f /etc/nginx/sites-enabled/kafka-ui ]; then
                echo "✅ Kafka UI: Rodando (http://localhost:8081) - PROTEGIDO"
                echo "   👤 Usuário: admin | 🔑 Senha: [configurada no htpasswd]"
            else
                echo "✅ Kafka UI: Rodando (http://localhost:8080) - PROTEGIDO"
                echo "   👤 Usuário: root | 🔑 Senha: [configurada no application.yml]"
            fi
        elif docker ps | grep -q kafdrop; then
            echo "✅ Kafdrop: Rodando (http://localhost:9000) - SEM PROTEÇÃO"
        else
            echo "❌ Interface Kafka: Parada"
        fi
        
        # Status PM2 Applications
        echo ""
        echo "📱 Status das aplicações PM2:"
        pm2 status
        echo ""
        echo "🔗 Para diagnóstico completo use: './manage.sh health'"
        ;;
        
    logs)
        echo "📋 Logs em tempo real (Ctrl+C para sair):"
        pm2 logs
        ;;

    health)
        echo "🏥 Verificando saúde do sistema..."
        node health-monitor.js
        ;;

    stats)
        echo "📊 Gerando dashboard de estatísticas..."
        node stats-dashboard.js
        ;;

    monitor)
        echo "📈 Monitor em tempo real (Ctrl+C para sair)..."
        while true; do
            clear
            echo "� Atualizando... $(date)"
            echo ""
            node health-monitor.js
            echo ""
            echo "⏰ Próxima atualização em 30 segundos..."
            sleep 30
        done
        ;;

    reprocess)
        echo "� Reprocessando mensagens fallback..."
        node fallback-processor.js
        echo "✅ Reprocessamento concluído!"
        ;;

    reset)
        echo "⚠️  Resetando consumer group..."
        echo "   Isso fará o consumer reprocessar todas as mensagens desde o início"
        read -p "   Confirma? (y/N): " confirm
        if [[ $confirm == [yY] ]]; then
            ./reset-consumer.sh
            echo "✅ Consumer group resetado!"
        else
            echo "❌ Operação cancelada"
        fi
        ;;

    cleanup)
        echo "🧹 Limpando arquivos antigos..."
        
        # Limpar logs antigos (mais de 7 dias)
        find ~/.pm2/logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
        echo "   📄 Logs antigos removidos"
        
        # Limpar fallbacks processados com sucesso (mais de 3 dias)
        if [ -d "fallback-webhooks" ]; then
            find fallback-webhooks -name "webhook-*.json" -mtime +3 -delete 2>/dev/null || true
            echo "   📁 Fallbacks antigos removidos"
        fi
        
        # Rotacionar logs do sistema
        pm2 flush
        echo "   🔄 Logs do PM2 rotacionados"
        
        echo "✅ Limpeza concluída!"
        ;;

    emergency)
        echo "🆘 MODO EMERGÊNCIA ATIVADO"
        echo "   Parando Kafka e banco, mantendo apenas webhook endpoint"
        echo "   Todos os webhooks serão salvos em arquivos"
        
        pm2 stop webhook-consumer
        pm2 restart webhook-api --update-env -- --emergency-mode
        
        echo "⚠️  Sistema em modo emergência!"
        echo "   Webhooks sendo salvos em: fallback-webhooks/"
        echo "   Use './manage.sh recover' para voltar ao normal"
        ;;

    recover)
        echo "🔧 Recuperando do modo emergência..."
        
        pm2 restart webhook-api
        pm2 start webhook-consumer
        
        echo "🔄 Reprocessando mensagens acumuladas..."
        node fallback-processor.js
        
        echo "✅ Sistema recuperado!"
        echo "💡 Execute './manage.sh health' para verificar"
        ;;
        
    startup)
        echo "🔧 Configurando PM2 para iniciar automaticamente no boot..."
        pm2 startup
        echo ""
        echo "⚠️  Execute o comando mostrado acima como root para configurar o startup automático"
        echo "Depois execute: ./manage.sh save"
        ;;
        
    save)
        echo "💾 Salvando configuração atual do PM2..."
        pm2 save
        echo "✅ Configuração salva! O sistema agora iniciará automaticamente após reboot."
        ;;

    help|--help|-h)
        show_help
        ;;
        
    *)
        show_help
        exit 1
        ;;
esac
