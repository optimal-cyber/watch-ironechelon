export type EntityType =
  | 'DEFENSE_PRIME'
  | 'CYBER_INTEL'
  | 'SURVEILLANCE'
  | 'AI_ML'
  | 'INVESTOR'
  | 'GOVERNMENT'
  | 'CLOUD_INFRA'
  | 'STARTUP'
  | 'CONSULTANCY'

export type ConnectionType =
  | 'CONTRACTS'
  | 'INVESTED_IN'
  | 'ACQUIRED'
  | 'SUBSIDIARY'
  | 'PARTNERSHIP'
  | 'SUPPLIES_TO'
  | 'FUNDED_BY'
  | 'LOBBIES'
  | 'PERSONNEL_OVERLAP'

export type Confidence = 'confirmed' | 'reported' | 'inferred'

export interface Source {
  url: string
  title: string
  domain: string
  date?: string
}

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  DEFENSE_PRIME: 'Defense Prime',
  CYBER_INTEL: 'Cyber Intelligence',
  SURVEILLANCE: 'Surveillance',
  AI_ML: 'AI / ML',
  INVESTOR: 'Investor',
  GOVERNMENT: 'Government',
  CLOUD_INFRA: 'Cloud Infrastructure',
  STARTUP: 'Startup',
  CONSULTANCY: 'Consultancy',
}

export const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  DEFENSE_PRIME: '#C8102E',
  CYBER_INTEL: '#4A7C9B',
  SURVEILLANCE: '#B8953E',
  AI_ML: '#8B5CF6',
  INVESTOR: '#2ECC71',
  GOVERNMENT: '#6B7280',
  CLOUD_INFRA: '#3B82F6',
  STARTUP: '#F59E0B',
  CONSULTANCY: '#EC4899',
}

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  CONTRACTS: 'Contracts',
  INVESTED_IN: 'Invested In',
  ACQUIRED: 'Acquired',
  SUBSIDIARY: 'Subsidiary',
  PARTNERSHIP: 'Partnership',
  SUPPLIES_TO: 'Supplies To',
  FUNDED_BY: 'Funded By',
  LOBBIES: 'Lobbies',
  PERSONNEL_OVERLAP: 'Personnel Overlap',
}
