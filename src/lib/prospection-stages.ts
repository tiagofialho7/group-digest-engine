export const PROSPECTION_STAGES = [
  { key: "pre_qualification", label: "Pré-Qualificação", shortLabel: "Pré-Qual", color: "var(--stage-pre-qual)" },
  { key: "contact_made", label: "Contato Realizado", shortLabel: "Contato", color: "var(--stage-contact)" },
  { key: "visit_done", label: "Visita Realizada", shortLabel: "Visita", color: "var(--stage-visit)" },
  { key: "project_elaborated", label: "Projeto Elaborado", shortLabel: "Projeto", color: "var(--stage-project)" },
  { key: "project_presented", label: "Projeto Apresentado", shortLabel: "Apresentado", color: "var(--stage-presented)" },
  { key: "deal_won", label: "Negócio Fechado", shortLabel: "Fechado", color: "var(--stage-won)" },
  { key: "deal_lost", label: "Negócio Perdido", shortLabel: "Perdido", color: "var(--stage-lost)" },
] as const;

export type ProspectionStageKey = (typeof PROSPECTION_STAGES)[number]["key"];

export function getStageInfo(key: string) {
  return PROSPECTION_STAGES.find(s => s.key === key) || PROSPECTION_STAGES[0];
}

export function getActiveStages() {
  return PROSPECTION_STAGES.filter(s => s.key !== "deal_won" && s.key !== "deal_lost");
}
