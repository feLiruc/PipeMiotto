#!/bin/bash

echo "🌐 === ENDEREÇOS PARA ACESSAR KAFKA UI ==="
echo ""

# Verificar IP externo
echo "📍 IP Externo do servidor:"
curl -s ifconfig.me
echo ""

# Verificar IPs locais
echo ""
echo "📍 IPs locais do servidor:"
hostname -I

echo ""
echo "🔗 URLs para acessar Kafka UI:"
echo ""

# IP externo
EXTERNAL_IP=$(curl -s ifconfig.me)
echo "   🌍 Acesso externo: http://$EXTERNAL_IP:8080"

# IPs locais
for ip in $(hostname -I); do
    echo "   🏠 Acesso local:   http://$ip:8080"
done

echo ""
echo "🔐 Credenciais de acesso:"
echo "   👤 Usuário: admin"
echo "   🔑 Senha: (veja no arquivo abaixo)"
echo ""

# Mostrar senha se o arquivo existir
if [ -f "/opt/kafka-ui/senha-kafka-ui.txt" ]; then
    echo "🔑 Senha do Kafka UI:"
    cat /opt/kafka-ui/senha-kafka-ui.txt
else
    echo "⚠️  Arquivo de senha não encontrado em /opt/kafka-ui/senha-kafka-ui.txt"
    echo "   Verificar configuração em /opt/kafka-ui/application.yml"
fi

echo ""
echo "✅ Status do Kafka UI:"
systemctl is-active kafka-ui && echo "   🟢 Rodando" || echo "   🔴 Parado"

echo ""
echo "🔍 Verificando se a porta está acessível:"
if netstat -tulpn | grep -q ":8080 "; then
    echo "   ✅ Porta 8080 está ativa"
else
    echo "   ❌ Porta 8080 não está ativa"
fi
