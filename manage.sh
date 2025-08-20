#!/bin/bash

# Script para gerenciar o sistema de webhooks com Kafka
# Usage: ./manage.sh [start|stop|restart|status|logs]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

case "$1" in
    start)
        echo "🚀 Iniciando sistema de webhooks..."
        
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
        
        # Iniciar API (webhook receiver)
        echo "🌐 Iniciando API..."
        nohup npm start > api.log 2>&1 &
        echo $! > api.pid
        
        # Iniciar Consumer
        echo "🔄 Iniciando Consumer..."
        nohup npm run consumer > consumer.log 2>&1 &
        echo $! > consumer.pid
        
        echo "✅ Sistema iniciado com sucesso!"
        echo "📋 Para ver logs: ./manage.sh logs"
        ;;
        
    stop)
        echo "🛑 Parando sistema de webhooks..."
        
        # Parar API
        if [ -f api.pid ]; then
            kill $(cat api.pid) 2>/dev/null
            rm api.pid
            echo "🌐 API parada"
        fi
        
        # Parar Consumer
        if [ -f consumer.pid ]; then
            kill $(cat consumer.pid) 2>/dev/null
            rm consumer.pid
            echo "🔄 Consumer parado"
        fi
        
        echo "✅ Sistema parado com sucesso!"
        ;;
        
    restart)
        echo "🔄 Reiniciando sistema..."
        $0 stop
        sleep 3
        $0 start
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
            echo "✅ Kafka UI: Rodando (http://localhost:8080)"
        elif docker ps | grep -q kafdrop; then
            echo "✅ Kafdrop: Rodando (http://localhost:9000)"
        else
            echo "❌ Interface Kafka: Parada"
        fi
        
        # Status API
        if [ -f api.pid ] && kill -0 $(cat api.pid) 2>/dev/null; then
            echo "✅ API: Rodando (PID: $(cat api.pid))"
        else
            echo "❌ API: Parada"
        fi
        
        # Status Consumer
        if [ -f consumer.pid ] && kill -0 $(cat consumer.pid) 2>/dev/null; then
            echo "✅ Consumer: Rodando (PID: $(cat consumer.pid))"
        else
            echo "❌ Consumer: Parado"
        fi
        ;;
        
    logs)
        echo "📋 Logs do sistema:"
        echo "=== API LOGS ==="
        tail -f api.log &
        API_TAIL_PID=$!
        
        echo "=== CONSUMER LOGS ==="
        tail -f consumer.log &
        CONSUMER_TAIL_PID=$!
        
        # Parar tail quando Ctrl+C
        trap "kill $API_TAIL_PID $CONSUMER_TAIL_PID 2>/dev/null; exit" INT
        wait
        ;;
        
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Comandos disponíveis:"
        echo "  start   - Inicia API e Consumer"
        echo "  stop    - Para API e Consumer"
        echo "  restart - Reinicia o sistema"
        echo "  status  - Mostra status dos serviços"
        echo "  logs    - Mostra logs em tempo real"
        echo ""
        echo "Interfaces Web disponíveis:"
        echo "  Kafka UI: http://SEU_IP:8080 (se instalado)"
        echo "  Kafdrop:  http://SEU_IP:9000 (se instalado via Docker)"
        exit 1
        ;;
esac
