#!/bin/bash

# Script para resetar consumer group e reprocessar mensagens antigas

echo "🔄 Resetando Consumer Group para reprocessar mensagens antigas..."

# Parar consumer se estiver rodando
if [ -f consumer.pid ]; then
    echo "🛑 Parando consumer atual..."
    kill $(cat consumer.pid) 2>/dev/null
    rm consumer.pid
    sleep 2
fi

# Resetar offset do consumer group
echo "⏪ Resetando offset do consumer group..."
cd /opt/kafka
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
    --group webhook-processor \
    --reset-offsets \
    --to-earliest \
    --topic webhook-events \
    --execute

# Voltar para diretório do projeto
cd /var/www/html/PipeMiotto

# Iniciar consumer do início
echo "🚀 Iniciando consumer para processar mensagens antigas..."
nohup npm run consumer:old > consumer.log 2>&1 &
echo $! > consumer.pid

echo "✅ Consumer resetado e iniciado!"
echo "📋 Para monitorar: tail -f consumer.log"
