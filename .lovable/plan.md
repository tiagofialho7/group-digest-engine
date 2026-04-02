

## Sentimento Interativo — Drill-down nas Mensagens

### Problema
Atualmente o sentimento mostra apenas barras de percentual (positivo/neutro/negativo) sem contexto. O usuário quer clicar e ver **quais mensagens** correspondem a cada categoria.

### Abordagem

A IA já classifica o sentimento em percentuais. Vamos expandir o JSON gerado para incluir **exemplos de mensagens por categoria de sentimento**, e tornar as barras clicáveis para abrir um painel com essas mensagens.

### Implementação

**1. Atualizar o prompt da Edge Function (`generate-daily-summary`)**

Expandir o campo `sentiment` no schema JSON para incluir exemplos:

```json
"sentiment": {
  "positive": 60,
  "neutral": 30, 
  "negative": 10,
  "examples": {
    "positive": [
      { "sender": "João", "content": "Muito obrigado, resolveu meu problema!", "time": "10:32" }
    ],
    "neutral": [
      { "sender": "Maria", "content": "Entendi, vou verificar aqui", "time": "11:15" }
    ],
    "negative": [
      { "sender": "Pedro", "content": "Isso não funciona, já tentei 3 vezes", "time": "14:20" }
    ]
  }
}
```

A IA selecionará até 5 mensagens representativas por categoria.

**2. Atualizar `SummaryReport.tsx` — Barras clicáveis**

- Cada `SentimentBar` se torna clicável (cursor pointer, hover effect)
- Ao clicar, abre um painel/sheet abaixo da barra com as mensagens daquela categoria
- Cada mensagem mostra: hora, nome do remetente, conteúdo da mensagem
- Visual de "chat bubble" leve para as mensagens

**3. Atualizar tipos (`SummaryContent`)**

Adicionar ao tipo `sentiment`:
```ts
sentiment: {
  positive: number;
  neutral: number;
  negative: number;
  examples?: {
    positive: { sender: string; content: string; time: string }[];
    neutral: { sender: string; content: string; time: string }[];
    negative: { sender: string; content: string; time: string }[];
  };
};
```

### Detalhes de UI

- Barras ganham hover com `bg-muted/50` e `cursor-pointer`
- Ao clicar, expande um Collapsible abaixo mostrando as mensagens como mini cards
- Cada mensagem: `[HH:mm] Nome: "conteúdo..."` com borda lateral colorida (verde/cinza/vermelho)
- Apenas uma categoria aberta por vez (accordion behavior)
- Resumos já existentes sem `examples` continuam funcionando (campo opcional)

