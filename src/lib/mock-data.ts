export interface WhatsAppGroup {
  id: string;
  name: string;
  photoUrl?: string;
  participantCount: number;
  newMessages: number;
  lastAnalysisDate: string | null;
  pendingQuestions: number;
  isUserMember: boolean;
  status: "active" | "paused";
}

export interface ContextBlock {
  id: string;
  title: string;
  summary: string;
  messageCount: number;
  isAnswered: boolean;
  answeredBy?: string;
  answerSummary?: string;
  messages: OriginalMessage[];
  timestamp: string;
}

export interface OriginalMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  isAnswer?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export const mockGroups: WhatsAppGroup[] = [
  {
    id: "1",
    name: "Mentoria Avançada — Devs",
    participantCount: 128,
    newMessages: 47,
    lastAnalysisDate: "2026-02-23T14:30:00",
    pendingQuestions: 5,
    isUserMember: true,
    status: "active",
  },
  {
    id: "2",
    name: "Comunidade Product Managers",
    participantCount: 256,
    newMessages: 112,
    lastAnalysisDate: "2026-02-22T09:15:00",
    pendingQuestions: 12,
    isUserMember: true,
    status: "active",
  },
  {
    id: "3",
    name: "Mastermind — Founders Q1",
    participantCount: 32,
    newMessages: 8,
    lastAnalysisDate: "2026-02-24T08:00:00",
    pendingQuestions: 1,
    isUserMember: false,
    status: "active",
  },
  {
    id: "4",
    name: "Design System Guild",
    participantCount: 64,
    newMessages: 23,
    lastAnalysisDate: null,
    pendingQuestions: 0,
    isUserMember: true,
    status: "active",
  },
];

export const mockContextBlocks: ContextBlock[] = [
  {
    id: "c1",
    title: "Deploy em produção com Docker Compose",
    summary: "Três membros tiveram dificuldade com configuração de volumes e networking no Docker Compose para deploy. Discussão sobre boas práticas e alternativas.",
    messageCount: 12,
    isAnswered: true,
    answeredBy: "Carlos Silva",
    answerSummary: "Recomendou usar docker network create antes do compose up e montar volumes nomeados em vez de bind mounts para persistência.",
    timestamp: "2026-02-23T10:15:00",
    messages: [
      { id: "m1", sender: "Ana Costa", content: "Pessoal, alguém conseguiu fazer o Docker Compose funcionar com múltiplos serviços? Meu container do banco não conecta no da API.", timestamp: "2026-02-23T10:15:00" },
      { id: "m2", sender: "Pedro Mendes", content: "Tô com o mesmo problema! O networking do compose tá me dando dor de cabeça.", timestamp: "2026-02-23T10:18:00" },
      { id: "m3", sender: "Lucas Rocha", content: "Também travei nisso ontem. Tentei usar links mas parece que tá deprecated.", timestamp: "2026-02-23T10:22:00" },
      { id: "m4", sender: "Carlos Silva", content: "Galera, o truque é criar a network antes: docker network create minha-rede. Depois no compose, referencia ela como external. E pra volumes, usem volumes nomeados em vez de bind mounts.", timestamp: "2026-02-23T10:30:00", isAnswer: true },
      { id: "m5", sender: "Ana Costa", content: "Carlos, funcionou perfeitamente! Obrigada! 🎉", timestamp: "2026-02-23T10:45:00" },
    ],
  },
  {
    id: "c2",
    title: "Autenticação JWT vs Session-based",
    summary: "Debate sobre qual abordagem de autenticação usar para uma aplicação SaaS. Prós e contras de cada abordagem foram discutidos.",
    messageCount: 8,
    isAnswered: false,
    timestamp: "2026-02-23T14:00:00",
    messages: [
      { id: "m6", sender: "Marina Souza", content: "Para o meu SaaS, vocês recomendam JWT ou autenticação baseada em sessão? Estou na dúvida.", timestamp: "2026-02-23T14:00:00" },
      { id: "m7", sender: "Rafael Lima", content: "JWT é bom para micro-serviços, mas session é mais seguro e simples para monolitos.", timestamp: "2026-02-23T14:10:00" },
      { id: "m8", sender: "Juliana Ferreira", content: "Depende muito da arquitetura. JWT facilita escalabilidade horizontal mas token revocation é complexo.", timestamp: "2026-02-23T14:20:00" },
    ],
  },
  {
    id: "c3",
    title: "Performance de queries no PostgreSQL",
    summary: "Membro reportou queries lentas em tabelas com milhões de registros. Comunidade sugeriu índices e particionamento.",
    messageCount: 15,
    isAnswered: true,
    answeredBy: "Fernanda Alves",
    answerSummary: "Sugeriu criar índices compostos para as queries mais frequentes e implementar particionamento por data para tabelas de logs.",
    timestamp: "2026-02-23T16:30:00",
    messages: [
      { id: "m9", sender: "Thiago Ribeiro", content: "Minhas queries estão demorando 30+ segundos em uma tabela com 50M de linhas. EXPLAIN mostra sequential scan.", timestamp: "2026-02-23T16:30:00" },
      { id: "m10", sender: "Fernanda Alves", content: "Thiago, roda EXPLAIN ANALYZE e manda aqui. Provavelmente falta índice composto. E se for tabela de logs, particiona por mês.", timestamp: "2026-02-23T16:35:00", isAnswer: true },
    ],
  },
];
