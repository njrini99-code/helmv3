'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ResetForm, ResetSent } from './ForgotPassword';
import { GateFrame, useGateView } from './GateFrame';

type Stage = 'form' | 'sent';

/**
 * /golf/forgot-password for a visitor who is already signed in (CH-15920). A signed-out visitor never sees this: the
 * page's layout sends them to the sign-in panel's own reset form (`/golf/login?view=forgot`), which would bounce a
 * signed-in one to their dashboard. So the signed-in visitor gets the same reset form and check-your-email in the same
 * room (`GateFrame`), with their own address filled in, and the way back is their Settings, not sign in.
 */
export function SignedInReset({ email: initialEmail, requestReset }: { email: string; requestReset?: Parameters<typeof ResetForm>[0]['requestReset'] }) {
  const router = useRouter();
  const { view, dir, moved, go, stageRef } = useGateView<Stage>('form');
  const [email, setEmail] = useState(initialEmail);
  const back = () => router.push('/golf/dashboard/settings');
  return (
    <GateFrame
      label="Reset your password"
      say={{ title: 'Back on the course in a minute.', line: 'A link to choose a new password' }}
      back={{ href: '/golf/dashboard/settings', label: 'Settings' }}
      viewKey={view}
      dir={dir}
      stageRef={stageRef}
    >
      {view === 'form' ? (
        <ResetForm
          initialEmail={email}
          focusOnMount={moved}
          stageRef={stageRef}
          requestReset={requestReset}
          onSent={(sentTo) => {
            setEmail(sentTo);
            go('sent');
          }}
          onBack={back}
        />
      ) : (
        <ResetSent email={email} focusOnMount={moved} onBack={back} />
      )}
    </GateFrame>
  );
}
