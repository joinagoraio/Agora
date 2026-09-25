import { DEFAULT_SPACE_AGENTS } from "@/lib/programme/domain"

type Translate = (key: string, fallback?: string) => string

function defaultSpec(agent: { name: string; stage?: string | null }) {
  return DEFAULT_SPACE_AGENTS.find((spec) => spec.name === agent.name && (!agent.stage || spec.stage === agent.stage)) ?? null
}

/** A default specialist in the screen language; a specialist the authority named itself keeps its name. */
export function agentDisplayName(agent: { name: string; stage?: string | null }, t: Translate) {
  const spec = defaultSpec(agent)
  return spec ? t(`space.agents.defaults.${spec.stage}.name`, agent.name) : agent.name
}

export function agentDisplayRole(agent: { name: string; stage?: string | null; role?: string | null }, t: Translate) {
  const spec = defaultSpec(agent)
  if (spec && agent.role === spec.role) return t(`space.agents.defaults.${spec.stage}.role`, spec.role)
  return agent.role ?? ""
}
