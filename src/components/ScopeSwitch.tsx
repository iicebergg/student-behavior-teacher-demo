/** Individual student or whole classroom. */
import type { ReactNode } from 'react';
import { Segmented } from './ui';

export type Scope = 'individual' | 'classroom';

export function ScopeSwitch({
  scope,
  onChange,
}: {
  scope: Scope;
  onChange: (scope: Scope) => void;
}): ReactNode {
  return (
    <Segmented<Scope>
      label="Scope"
      value={scope}
      options={[
        { value: 'individual', label: 'Individual student' },
        { value: 'classroom', label: 'Classroom' },
      ]}
      onChange={onChange}
    />
  );
}
