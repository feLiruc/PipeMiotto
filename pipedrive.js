require('dotenv').config();

const API_TOKEN = "550ec0d8590d9a9c78c084699f4ca74ef8fc87c6";
const SUBSCRIPTION_URL = "http://85.209.93.70:3847/webhook";

const objetos = ["deal", "activity", "person", "organization"];

async function criarWebhook(objeto) {
  const response = await fetch(`https://api.pipedrive.com/v1/webhooks?api_token=${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription_url: SUBSCRIPTION_URL,
      event_action: "*",
      event_object: objeto
    })
  });

  const data = await response.json();
  if (data.success) {
    console.log(`✅ Webhook para '${objeto}' criado com sucesso!`);
  } else {
    console.error(`❌ Erro ao criar webhook para '${objeto}':`, data);
  }
}

(async () => {
  for (const objeto of objetos) {
    await criarWebhook(objeto);
  }
})();