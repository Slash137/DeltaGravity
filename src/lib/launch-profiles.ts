export type CodexReasoningEffort = 'low' | 'medium' | 'high';

export interface LaunchProfileDefinition {
  key: string;
  label: string;
  description: string;
  backend: 'router' | 'ollama';
  codexModel?: string;
  codexReasoningEffort?: CodexReasoningEffort;
}

export const launchProfiles: LaunchProfileDefinition[] = [
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'Perfil general para desarrollo diario sobre Ollama local.',
    backend: 'ollama',
    codexModel: 'qwen2.5-coder:14b',
  },
  {
    key: 'fast',
    label: 'Fast',
    description: 'Prioriza velocidad y latencia baja sobre Ollama local.',
    backend: 'ollama',
    codexModel: 'qwen2.5-coder:7b',
  },
  {
    key: 'deep',
    label: 'Deep',
    description: 'Prioriza más calidad sobre Ollama local para cambios complejos.',
    backend: 'ollama',
    codexModel: 'qwen2.5-coder:14b',
  },
  {
    key: 'router',
    label: 'Router',
    description: 'Usa el backend alternativo con SmartRouter.',
    backend: 'router',
  },
  {
    key: 'ollama',
    label: 'Ollama',
    description: 'Usa Ollama local como backend principal.',
    backend: 'ollama',
    codexModel: 'qwen2.5-coder:14b',
  },
];

export const getLaunchProfile = (key?: string): LaunchProfileDefinition | undefined =>
  launchProfiles.find((profile) => profile.key === key);
