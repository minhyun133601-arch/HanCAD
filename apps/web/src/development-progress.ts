import type { Locale } from '@hancad/ui';
import progress from '../../../docs/development-progress.json';

type LocalizedProgressText = Readonly<Record<Locale, string>>;
export type ProgressStatus = 'in-progress' | 'planned' | 'complete';

interface DevelopmentProgressSource {
  updated: string;
  currentApp: {
    features: readonly LocalizedProgressText[];
    limitations: readonly LocalizedProgressText[];
  };
  phases: readonly {
    id: number;
    name: LocalizedProgressText;
    status: string;
    detail: LocalizedProgressText;
  }[];
}

// Both supported locales are mandatory for every visible progress entry.
const source: DevelopmentProgressSource = progress;

function readStatus(status: string): ProgressStatus {
  if (status === 'in-progress' || status === 'planned' || status === 'complete') return status;
  throw new Error(`Unknown development progress status: ${status}`);
}

export function getDevelopmentProgress(locale: Locale) {
  return {
    updated: source.updated,
    currentApp: {
      features: source.currentApp.features.map((feature) => feature[locale]),
      limitations: source.currentApp.limitations.map((limitation) => limitation[locale]),
    },
    phases: source.phases.map((phase) => ({
      id: phase.id,
      name: phase.name[locale],
      status: readStatus(phase.status),
      detail: phase.detail[locale],
    })),
  };
}
