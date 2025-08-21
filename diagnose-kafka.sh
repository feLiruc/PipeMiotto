#!/bin/bash

echo "🔍 === DIAGNÓSTICO DO KAFKA ==="
echo ""

echo "1. Verificando se Kafka está rodando:"
sudo systemctl status kafka --no-pager -l

echo ""
echo "2. Verificando portas em uso:"
sudo netstat -tulpn | grep -E "(2181|9092)"

echo ""
echo "3. Verificando conectividade local:"
telnet 127.0.0.1 9092 < /dev/null
telnet localhost 9092 < /dev/null

echo ""
echo "4. Testando listagem de tópicos:"
cd /opt/kafka
./bin/kafka-topics.sh --list --bootstrap-server 127.0.0.1:9092

echo ""
echo "5. Verificando logs do Kafka:"
sudo tail -20 /opt/kafka/kafka-logs/server.log

echo ""
echo "6. Verificando configuração do Kafka:"
grep -E "listeners|advertised.listeners" /opt/kafka/config/server.properties
