#!/bin/bash

echo "🔧 === CORRIGINDO CONFIGURAÇÃO DO KAFKA ==="

# Fazer backup da configuração atual
sudo cp /opt/kafka/config/server.properties /opt/kafka/config/server.properties.backup

# Criar nova configuração
sudo tee /opt/kafka/config/server.properties > /dev/null <<EOF
# Configuração do Kafka Server corrigida para conexões locais

# ID único do broker
broker.id=0

# Listeners - onde o Kafka vai escutar
listeners=PLAINTEXT://0.0.0.0:9092

# Advertised listeners - endereços que os clientes usarão para conectar
advertised.listeners=PLAINTEXT://127.0.0.1:9092

# Configurações de rede
num.network.threads=3
num.io.threads=8
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# Configurações de log
log.dirs=/opt/kafka/kafka-logs
num.partitions=3
num.recovery.threads.per.data.dir=1

# Configurações de replicação (para broker único)
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1

# Configurações de retenção
log.retention.hours=168
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000

# Configuração do Zookeeper
zookeeper.connect=localhost:2181
zookeeper.connection.timeout.ms=18000

# Configurações de grupo
group.initial.rebalance.delay.ms=0

# Configurações adicionais para evitar problemas
auto.create.topics.enable=true
delete.topic.enable=true
EOF

echo "✅ Configuração do Kafka atualizada"
echo "🔄 Reiniciando Kafka..."

sudo systemctl restart kafka

echo "⏳ Aguardando Kafka inicializar..."
sleep 10

echo "📊 Verificando status:"
sudo systemctl status kafka --no-pager

echo ""
echo "🔍 Verificando portas:"
sudo netstat -tulpn | grep 9092
