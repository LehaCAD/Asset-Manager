pza_ej4E19plxdaggqItuvzxmJfqE7tojRJc - ключ 
Надо делать openai driven 
openai/gpt-4.1-mini
https://polza.ai/dashboard/models/openai/gpt-4.1-mini

import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://polza.ai/api/v1',
  apiKey: '<POLZA_AI_API_KEY>'
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'openai/gpt-4.1-mini',
    messages: [{
      role: 'user',
      content: 'Что думаешь об этой жизни?',
    }],
  });
  console.log(completion.choices[0].message);
}

main();

from openai import OpenAI

client = OpenAI(
  base_url="https://polza.ai/api/v1",
  api_key="<POLZA_AI_API_KEY>",
)

completion = client.chat.completions.create(
  model="openai/gpt-4.1-mini",
  messages=[{
    "role": "user",
    "content": "Что думаешь об этой жизни?"
  }]
)

print(completion.choices[0].message.content)

curl -X POST "https://polza.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer <POLZA_AI_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4.1-mini",
    "messages": [{"role": "user", "content": "Привет!"}]
  }'