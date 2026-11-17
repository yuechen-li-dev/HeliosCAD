import type { Diagnostic } from '@aetheris/cad';

export function labelRefusal(diagnostics: readonly Diagnostic[]): string {
  const errors = diagnostics.filter(item => item.severity === 'error');
  const problem = errors.find(item => item.code.includes('-pmi-')) ?? errors[0];
  if (problem?.code.includes('pmi-unknown-datum'))
    return 'One of the datum references is missing. Use a datum already listed in Label, or add the datum before editing this record.';
  if (!problem) return 'The label could not be checked. Retry or rebuild the part first.';
  return `The label could not be checked. ${problem.message}`;
}
