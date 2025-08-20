# PipeMiotto - Sistema de Webhooks com Kafka

Sistema robusto de processamento de webhooks usando Apache Kafka para garantir entrega e processamento confiável.

## 📁 Estrutura do Projeto

```
PipeMiotto/
├── index.js          # API principal (webhook receiver)
├── consumer.js       # Consumer Kafka (processa mensagens)
├── kafka.js          # Serviço Kafka (producer/consumer)
├── db.js             # Conexão e operações do banco
├── manage.sh         # Script de gerenciamento
├── config.json       # Configurações das tabelas
├── package.json      # Dependências Node.js
└── .env              # Variáveis de ambiente
```

## 🚀 Instalação e Configuração

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
# Editar .env com suas configurações
```

### 3. Inicializar banco de dados
```bash
npm start -- --clean  # Primeira vez (limpa tabelas)
```

## 🔧 Como Usar

### Usando o script de gerenciamento (Recomendado)
```bash
# Dar permissão de execução
chmod +x manage.sh

# Iniciar sistema completo
./manage.sh start

# Ver status
./manage.sh status

# Ver logs em tempo real
./manage.sh logs

# Parar sistema
./manage.sh stop

# Reiniciar
./manage.sh restart
```

### Comandos manuais
```bash
# Iniciar apenas a API
npm start

# Iniciar apenas o Consumer
npm run consumer
```

## 📊 Fluxo de Funcionamento

1. **Webhook recebido** → API (index.js)
2. **Dados enviados** → Kafka Topic (webhook-events)
3. **Consumer processa** → Salva no banco (consumer.js)
4. **Em caso de erro** → Retry automático ou DLQ

## 🔍 Monitoramento

### Verificar tópicos Kafka
```bash
cd /opt/kafka
bin/kafka-topics.sh --list --bootstrap-server localhost:9092
```

### Ver mensagens em um tópico
```bash
bin/kafka-console-consumer.sh --topic webhook-events --bootstrap-server localhost:9092 --from-beginning
```

### Verificar Dead Letter Queue
```bash
bin/kafka-console-consumer.sh --topic webhook-events-dlq --bootstrap-server localhost:9092 --from-beginning
```

## 🛠️ Configurações Avançadas

### Configurar retenção de mensagens
```bash
bin/kafka-configs.sh --bootstrap-server localhost:9092 --entity-type topics --entity-name webhook-events --alter --add-config retention.ms=604800000
```

### Aumentar partições
```bash
bin/kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic webhook-events --partitions 6
```

## 🚨 Troubleshooting

### Kafka não inicia
```bash
sudo systemctl status kafka
sudo journalctl -u kafka -f
```

### Consumer não processa mensagens
1. Verificar se o tópico existe
2. Verificar conexão com banco
3. Ver logs: `tail -f consumer.log`

### API retorna erro 500
1. Verificar conexão com Kafka
2. Verificar variáveis de ambiente
3. Ver logs: `tail -f api.log`

## 📈 Benefícios da Implementação

- ✅ **Garantia de entrega**: Kafka persiste mensagens
- ✅ **Processamento assíncrono**: Webhook responde rapidamente
- ✅ **Retry automático**: Falhas são processadas novamente
- ✅ **Dead Letter Queue**: Mensagens problemáticas são isoladas
- ✅ **Escalabilidade**: Fácil adicionar mais consumers
- ✅ **Monitoramento**: Logs detalhados de todo o processo